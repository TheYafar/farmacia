import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { CLAVE, ORIGEN, como, entrar, escenario, levantar, prisma } from './ayuda';

describe('Seguridad y acceso', () => {
  let app: INestApplication;
  let datos: Awaited<ReturnType<typeof escenario>>;
  before(async () => { app = await levantar(); });
  after(async () => { await app.close(); await prisma.$disconnect(); });
  beforeEach(async () => { datos = await escenario(); });

  const http = () => request(app.getHttpServer());

  it('entra con la clave correcta y guarda la sesión en una cookie protegida', async () => {
    const r = await http().post('/api/v1/auth/login').send({ usuario: 'cajero', clave: CLAVE });
    assert.equal(r.status, 200);
    assert.ok(r.body.accessToken);
    assert.equal(r.body.usuario.rol, 'CAJERO');
    assert.equal(r.body.usuario.claveHash, undefined, 'nunca devuelve la clave');
    const cookie = String(r.headers['set-cookie']);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\/api\/v1\/auth/);
  });

  it('da el mismo mensaje si el usuario no existe o si la clave es incorrecta', async () => {
    const a = await http().post('/api/v1/auth/login').send({ usuario: 'cajero', clave: 'clave-equivocada' });
    const b = await http().post('/api/v1/auth/login').send({ usuario: 'no-existe', clave: 'clave-equivocada' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.mensaje, b.body.mensaje);
  });

  it('bloquea al usuario tras 5 claves incorrectas, aunque luego ponga la correcta', async () => {
    for (let i = 0; i < 5; i++) await http().post('/api/v1/auth/login').send({ usuario: 'cajero', clave: 'mala-clave-xx' });
    const r = await http().post('/api/v1/auth/login').send({ usuario: 'cajero', clave: CLAVE });
    assert.equal(r.status, 403);
    assert.ok(await prisma.auditoria.findFirst({ where: { accion: 'USUARIO_BLOQUEADO' } }));
  });

  it('limita los intentos de inicio de sesión por minuto desde una misma dirección', async () => {
    const antes = process.env.LIMITE_LOGIN_POR_MINUTO;
    process.env.LIMITE_LOGIN_POR_MINUTO = '5';
    try {
      const estados: number[] = [];
      for (let i = 0; i < 7; i++) estados.push((await http().post('/api/v1/auth/login').set('X-Forwarded-For', '203.0.113.9').send({ usuario: 'x', clave: 'clave-mala-1' })).status);
      assert.deepEqual(estados.slice(-2), [429, 429]);
    } finally {
      process.env.LIMITE_LOGIN_POR_MINUTO = antes;
    }
  });

  it('sin token no deja pasar a ninguna ruta privada', async () => {
    for (const ruta of ['/api/v1/auth/yo', '/api/v1/catalogo/buscar?q=a', '/api/v1/ventas', '/api/v1/pacientes/V-14582307']) {
      assert.equal((await http().get(ruta)).status, 401, ruta);
    }
    assert.equal((await http().get('/api/v1/auth/yo').set('Authorization', 'Bearer token.falso.xx')).status, 401);
  });

  it('cada rol solo usa lo que le corresponde', async () => {
    const cajero = como(app, (await entrar(app, 'cajero')).token);
    assert.equal((await cajero.post('/tasa', { valor: 1 })).status, 403);
    assert.equal((await cajero.get('/usuarios')).status, 403);
    assert.equal((await cajero.get('/reportes/resumen')).status, 403);
    assert.equal((await cajero.post('/autorizaciones', { cedula: 'V-14582307', productoId: datos.amoxil.id, motivo: 'x' })).status, 403);
    const admin = como(app, (await entrar(app, 'admin')).token);
    assert.equal((await admin.post('/tasa', { valor: 240 })).status, 201);
    assert.equal((await admin.get('/reportes/resumen')).status, 200);
  });

  it('desactivar a un usuario corta su acceso al instante', async () => {
    const { token } = await entrar(app, 'cajero');
    const cajero = como(app, token);
    assert.equal((await cajero.get('/auth/yo')).status, 200);
    const admin = como(app, (await entrar(app, 'admin')).token);
    assert.equal((await admin.post(`/usuarios/${datos.cajero.id}/desactivar`)).status, 204);
    assert.equal((await cajero.get('/auth/yo')).status, 401);
  });

  it('renueva la sesión cambiando el token, y si alguien reusa el viejo cierra todas las sesiones', async () => {
    const { cookie } = await entrar(app, 'cajero');
    const r1 = await http().post('/api/v1/auth/renovar').set('Cookie', cookie).set('Origin', ORIGEN);
    assert.equal(r1.status, 200);
    const nueva = r1.headers['set-cookie'] as unknown as string[];
    assert.notEqual(String(nueva), String(cookie));

    // El token viejo (ya rotado) vuelve a aparecer: posible robo.
    assert.equal((await http().post('/api/v1/auth/renovar').set('Cookie', cookie).set('Origin', ORIGEN)).status, 401);
    // La sesión legítima también queda cerrada por seguridad.
    assert.equal((await http().post('/api/v1/auth/renovar').set('Cookie', nueva).set('Origin', ORIGEN)).status, 401);
  });

  it('la renovación rechaza peticiones desde otra página web', async () => {
    const { cookie } = await entrar(app, 'cajero');
    assert.equal((await http().post('/api/v1/auth/renovar').set('Cookie', cookie).set('Origin', 'https://malicioso.example')).status, 403);
  });

  it('cerrar sesión invalida el token de inmediato', async () => {
    const { token } = await entrar(app, 'cajero');
    const c = como(app, token);
    assert.equal((await c.post('/auth/salir')).status, 204);
    assert.equal((await c.get('/auth/yo')).status, 401);
  });

  it('rechaza datos inválidos con un mensaje claro', async () => {
    const c = como(app, (await entrar(app, 'cajero')).token);
    const r = await c.post('/pacientes', { cedula: 'ABC', nombre: 'X', telefono: '123' });
    assert.equal(r.status, 400);
    assert.ok(r.body.errores.some((e: { campo: string }) => e.campo === 'cedula'));
  });

  it('la auditoría no se puede modificar ni borrar', async () => {
    await entrar(app, 'cajero');
    const a = await prisma.auditoria.findFirstOrThrow();
    await assert.rejects(prisma.auditoria.update({ where: { id: a.id }, data: { accion: 'X' } }));
    await assert.rejects(prisma.auditoria.delete({ where: { id: a.id } }));
  });

  it('el servidor responde a la verificación de salud sin sesión', async () => {
    assert.deepEqual((await http().get('/api/v1/salud')).body, { ok: true });
  });
});
