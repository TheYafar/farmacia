import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CLAVE, ORIGEN, como, entrar, escenario, levantar, prisma } from './ayuda';

describe('Cajas por equipo, correo y demo', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof como>;
  let cajero: ReturnType<typeof como>;
  let d: Awaited<ReturnType<typeof escenario>>;
  const api = () => request(app.getHttpServer());
  before(async () => { app = await levantar(); });
  after(async () => { await app.close(); await prisma.$disconnect(); });
  beforeEach(async () => {
    d = await escenario();
    admin = como(app, (await entrar(app, 'admin')).token);
    cajero = como(app, (await entrar(app, 'cajero')).token);
  });

  it('crear una caja en el equipo, pasarla a otro con código y abrir turno en ella', async () => {
    const c = await cajero.post('/cajas', { nombre: 'Caja 1' });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    const t1 = c.body.token as string;
    assert.equal((await api().get('/api/v1/cajas/este-equipo').set('x-caja', t1)).body.caja.nombre, 'Caja 1');
    assert.equal((await api().get('/api/v1/cajas/este-equipo')).body.caja, null);

    // Otro cajero (sin ser de esa caja) no puede sacar código; desde el equipo de la caja sí.
    const tok = (await entrar(app, 'cajero')).token;
    assert.equal((await api().post(`/api/v1/cajas/${c.body.caja.id}/codigo`).set('Authorization', `Bearer ${tok}`)).status, 403);
    const cod = await api().post(`/api/v1/cajas/${c.body.caja.id}/codigo`).set('Authorization', `Bearer ${tok}`).set('x-caja', t1);
    assert.equal(cod.status, 200, JSON.stringify(cod.body));
    assert.match(cod.body.codigo, /^[A-Z0-9]{3}-[A-Z0-9]{3}$/);

    const v = await api().post('/api/v1/cajas/vincular').send({ codigo: cod.body.codigo.toLowerCase() });
    assert.equal(v.status, 200, JSON.stringify(v.body));
    assert.equal(v.body.caja.id, c.body.caja.id);
    // Un solo uso.
    assert.equal((await api().post('/api/v1/cajas/vincular').send({ codigo: cod.body.codigo })).status, 400);

    // El turno queda en la caja; otra persona no puede abrir la misma caja a la vez.
    await prisma.turno.deleteMany({});
    const ab = await api().post('/api/v1/caja/abrir').set('Authorization', `Bearer ${tok}`).set('x-caja', v.body.token).send({ fondoUsd: 0, fondoBs: 0 });
    assert.equal(ab.status, 201, JSON.stringify(ab.body));
    assert.equal(ab.body.cajaId, c.body.caja.id);
    const otro = await api().post('/api/v1/caja/abrir').set('Authorization', `Bearer ${(await entrar(app, 'regente')).token}`).set('x-caja', t1).send({ fondoUsd: 0, fondoBs: 0 });
    assert.equal(otro.status, 409);

    const lista = await admin.get('/cajas');
    assert.equal(lista.body[0].equipos.length, 2);
    assert.equal(lista.body[0].abierta.cajero, 'Ana');
    assert.equal(lista.body[0].codigoHash, undefined);

    // El dueño la desactiva: los equipos dejan de ser esa caja.
    await admin.patch(`/cajas/${c.body.caja.id}`, { activa: false });
    assert.equal((await api().get('/api/v1/cajas/este-equipo').set('x-caja', t1)).body.caja, null);
  });

  it('entrar con el correo', async () => {
    assert.equal((await admin.patch(`/usuarios/${d.admin.id}`, { correo: 'Duena@Farmacia.com' })).status, 200);
    const r = await api().post('/api/v1/auth/login').send({ usuario: 'duena@farmacia.com', clave: CLAVE });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.usuario.rol, 'ADMIN');
  });

  it('la demo usa sus propios datos y no toca la farmacia real', async () => {
    const r = await api().post('/api/v1/auth/demo').send({ rol: 'ADMIN' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.usuario.demo, true);
    const demo = como(app, r.body.accessToken);
    const yo = await demo.get('/auth/yo');
    assert.equal(yo.body.nombre, 'María Pérez');
    assert.equal((await demo.get('/farmacia')).body.nombre, 'Farmacia Demo Los Próceres');
    const prods = await demo.get('/catalogo/buscar?q=losartan');
    assert.ok(prods.body.grupos.length > 0);
    assert.ok((await demo.get('/ventas')).body.length > 0 || (await demo.get('/ventas')).status === 200);
    assert.equal((await demo.get('/cajas')).body.length, 2);
    // Lo que no se puede en la demo.
    assert.equal((await demo.post('/usuarios', { nombre: 'X', usuario: 'xxx', clave: 'clave-larga-123', rol: 'CAJERO' })).status, 403);
    // La farmacia real no cambió.
    assert.equal(await prisma.usuario.count({ where: { usuario: { startsWith: 'demo.' } } }), 0);
    assert.equal((await admin.get('/auth/yo')).body.nombre, 'Dueño');

    // La sesión de la demo se renueva con su cookie.
    const cookie = (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    assert.match(cookie, /^farm_rt=d\./);
    const ren = await api().post('/api/v1/auth/renovar').set('Origin', ORIGEN).set('Cookie', cookie);
    assert.equal(ren.status, 200, JSON.stringify(ren.body));
    assert.equal(ren.body.usuario.demo, true);
  });
});
