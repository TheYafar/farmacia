import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { CLAVE, como, entrar, escenario, levantar, prisma } from './ayuda';
import { cifrarClave } from '../src/auth/auth';

// Panel central (super admin y soporte) y soporte en línea de la farmacia.
// En la prueba el mismo servidor hace de panel central y de farmacia.
describe('Panel central y soporte', () => {
  let app: INestApplication;
  let base: string;
  let admin: ReturnType<typeof como>;
  let cajero: ReturnType<typeof como>;
  let central: ReturnType<typeof como>;
  before(async () => {
    app = await levantar();
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  after(async () => { await app.close(); await prisma.$disconnect(); });
  beforeEach(async () => {
    await escenario();
    await prisma.usuario.create({ data: { nombre: 'Super', usuario: 'central', rol: 'SUPERADMIN', claveHash: await cifrarClave(CLAVE) } });
    admin = como(app, (await entrar(app, 'admin')).token);
    cajero = como(app, (await entrar(app, 'cajero')).token);
    central = como(app, (await entrar(app, 'central')).token);
  });
  const codigo = (clave: string) => 'FT1.' + Buffer.from(JSON.stringify({ u: base, c: clave })).toString('base64url');

  it('el equipo central solo usa su panel; la farmacia no ve el panel', async () => {
    assert.equal((await central.get('/central/farmacias')).status, 200);
    assert.equal((await central.get('/catalogo/buscar?q=acetaminofen')).status, 403);
    assert.equal((await central.get('/usuarios')).status, 403);
    assert.equal((await central.get('/auth/yo')).status, 200);
    assert.equal((await admin.get('/central/farmacias')).status, 403);
    // El dueño de la farmacia no ve ni toca al super admin.
    const lista = (await admin.get('/usuarios')).body as { usuario: string; id: string }[];
    assert.ok(!lista.some((u) => u.usuario === 'central'));
    const sa = await prisma.usuario.findUniqueOrThrow({ where: { usuario: 'central' } });
    assert.equal((await admin.patch(`/usuarios/${sa.id}/clave`, { clave: 'otra-clave-larga-1' })).status, 404);
    assert.equal((await admin.post('/usuarios', { nombre: 'X', usuario: 'xx.central', clave: 'clave-larga-123', rol: 'SUPERADMIN' })).status, 400);
  });

  it('registrar una farmacia, enlazarla, reportar estado y pedir ayuda', async () => {
    const r = await central.post('/central/farmacias', { nombre: 'Farmacia Los Andes', rif: 'J-12345678-9', telefono: '0414-5550192' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await central.get('/central/farmacias')).body[0].conexion, 'NUNCA');

    assert.equal((await admin.post('/soporte/enlazar', { codigo: codigo('x'.repeat(30)) })).status, 400);
    const e = await admin.post('/soporte/enlazar', { codigo: codigo(r.body.clave) });
    assert.equal(e.status, 200, JSON.stringify(e.body));
    assert.equal(e.body.enlazada, true);

    const f = (await central.get('/central/farmacias')).body[0];
    assert.equal(f.conexion, 'EN_LINEA');
    assert.equal(f.estado.usuariosActivos, 4);
    assert.ok(f.version);
    assert.equal(f.claveHash, undefined);

    // El cajero pide ayuda; soporte responde; la farmacia ve la respuesta.
    const t = await cajero.post('/soporte/tickets', { asunto: 'No imprime', texto: 'La impresora no saca el ticket' });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    const casos = (await central.get('/central/tickets')).body;
    assert.equal(casos.length, 1);
    assert.equal(casos[0].farmacia.nombre, 'Farmacia Los Andes');
    assert.equal((await central.get(`/central/tickets/${t.body.id}`)).body.diagnostico.productos, 3);
    assert.equal((await central.post(`/central/tickets/${t.body.id}/mensajes`, { texto: 'Revisa que esté encendida' })).status, 204);
    const vistos = (await cajero.get('/soporte/tickets')).body;
    assert.equal(vistos[0].estado, 'RESPONDIDO');
    assert.deepEqual(vistos[0].mensajes.map((m: { de: string }) => m.de), ['FARMACIA', 'SOPORTE']);

    // Un código nuevo deja sin efecto el anterior.
    await central.post(`/central/farmacias/${r.body.farmacia.id}/codigo`);
    assert.equal((await cajero.get('/soporte/tickets')).status, 400);
  });

  it('acceso remoto: solo con permiso del dueño, vence y se puede quitar', async () => {
    const r = await central.post('/central/farmacias', { nombre: 'Farmacia Sol' });
    await admin.post('/soporte/enlazar', { codigo: codigo(r.body.clave) });
    const id = r.body.farmacia.id;
    assert.equal((await central.post(`/central/farmacias/${id}/entrar`)).status, 400);
    assert.equal((await cajero.post('/soporte/acceso', { horas: 2 })).status, 403);

    const a = await admin.post('/soporte/acceso', { horas: 2, url: 'https://farmacia-sol.test' });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.ok(a.body.acceso);
    const ent = await central.post(`/central/farmacias/${id}/entrar`);
    assert.equal(ent.status, 200, JSON.stringify(ent.body));
    const token = new URL(ent.body.url).searchParams.get('soporte')!;
    assert.ok(ent.body.url.startsWith('https://farmacia-sol.test/?soporte='));

    const s = await request(app.getHttpServer()).post('/api/v1/auth/soporte').send({ token });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.equal(s.body.usuario.soporte, true);
    const sop = como(app, s.body.accessToken);
    assert.equal((await sop.get('/auth/yo')).body.soporte, true);
    assert.equal((await sop.get('/usuarios')).status, 200);
    assert.ok(!(await sop.get('/usuarios')).body.some((u: { usuario: string }) => u.usuario === 'soporte.remoto'));
    assert.equal((await sop.post('/soporte/acceso', { horas: 24 })).status, 403);
    // El usuario interno no entra con clave.
    assert.equal((await request(app.getHttpServer()).post('/api/v1/auth/login').send({ usuario: 'soporte.remoto', clave: CLAVE })).status, 401);

    // El dueño lo quita: soporte queda fuera al instante y el enlace ya no sirve.
    assert.equal((await admin.post('/soporte/acceso/quitar')).status, 200);
    assert.equal((await sop.get('/auth/yo')).status, 401);
    assert.equal((await request(app.getHttpServer()).post('/api/v1/auth/soporte').send({ token })).status, 401);
    assert.equal((await central.post(`/central/farmacias/${id}/entrar`)).status, 400);
    assert.ok((await prisma.auditoria.findFirst({ where: { accion: 'SOPORTE_ENTRO' } })));
  });

  it('una farmacia desactivada ya no puede reportar', async () => {
    const r = await central.post('/central/farmacias', { nombre: 'Farmacia Cerrada' });
    await admin.post('/soporte/enlazar', { codigo: codigo(r.body.clave) });
    await central.patch(`/central/farmacias/${r.body.farmacia.id}`, { activa: false });
    assert.equal((await admin.get('/soporte/tickets')).status, 400);
  });

  it('el super admin agrega gente de soporte, que no puede registrar farmacias', async () => {
    const m = await central.post('/central/equipo', { nombre: 'Luis', usuario: 'luis.soporte', clave: CLAVE, rol: 'SOPORTE' });
    assert.equal(m.status, 201, JSON.stringify(m.body));
    const luis = como(app, (await entrar(app, 'luis.soporte')).token);
    assert.equal((await luis.get('/central/farmacias')).status, 200);
    assert.equal((await luis.post('/central/farmacias', { nombre: 'X' })).status, 403);
    assert.equal((await central.post(`/central/equipo/${m.body.id}/activo`, { activo: false })).status, 204);
    assert.equal((await luis.get('/central/farmacias')).status, 401);
  });
});
