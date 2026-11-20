import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import { como, entrar, escenario, levantar, prisma } from './ayuda';

// Tasa del escenario: 236,40 Bs por dólar. Acetaminofén genérico: 0,85 $ = Bs 200,94.
describe('Caja y cobro', () => {
  let app: INestApplication;
  let d: Awaited<ReturnType<typeof escenario>>;
  let cajero: ReturnType<typeof como>;
  let admin: ReturnType<typeof como>;
  before(async () => { app = await levantar(); });
  after(async () => { await app.close(); await prisma.$disconnect(); });
  beforeEach(async () => {
    d = await escenario();
    cajero = como(app, (await entrar(app, 'cajero')).token);
    admin = como(app, (await entrar(app, 'admin')).token);
  });

  const vender = (cantidad: number, extra: object) => cajero.post('/ventas', { lineas: [{ productoId: d.generico.id, cantidad }], ...extra });

  it('no deja vender con la caja cerrada', async () => {
    await prisma.turno.deleteMany({ where: { cajeroId: d.cajero.id } });
    const r = await vender(1, { metodoPago: 'EFECTIVO_USD' });
    assert.equal(r.status, 409);
    assert.equal(r.body.codigo, 'CAJA_CERRADA');
  });

  it('solo una caja abierta por cajero', async () => {
    assert.equal((await cajero.post('/caja/abrir', { fondoUsd: 10 })).status, 409);
  });

  it('pago mixto: 2 $ en efectivo y el resto por Pago Móvil, sin vuelto', async () => {
    // 3 × 0,85 = 2,55 $ = Bs 602,82. Pagan 2 $ (Bs 472,80) + Bs 130,02 por Pago Móvil.
    const r = await vender(3, { pagos: [{ metodo: 'EFECTIVO_USD', monto: 2 }, { metodo: 'PAGO_MOVIL', monto: 130.02, referencia: '004521' }] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.pagos.length, 2);
    assert.equal(r.body.vueltoMoneda, null);
    assert.equal(r.body.referenciaPago, '004521');
  });

  it('calcula el vuelto en bolívares o en dólares', async () => {
    // 0,85 $ pagado con un billete de 5 $: vuelto 4,15 $ = Bs 981,06
    const bs = await vender(1, { pagos: [{ metodo: 'EFECTIVO_USD', monto: 5 }], vueltoMoneda: 'BS' });
    assert.equal(bs.status, 201, JSON.stringify(bs.body));
    assert.deepEqual([bs.body.vueltoMoneda, bs.body.vueltoMonto], ['BS', '981.06']);
    const usd = await vender(1, { pagos: [{ metodo: 'EFECTIVO_USD', monto: 5 }], vueltoMoneda: 'USD' });
    assert.deepEqual([usd.body.vueltoMoneda, usd.body.vueltoMonto], ['USD', '4.15']);
  });

  it('rechaza un pago incompleto y no descuenta stock', async () => {
    const r = await vender(2, { pagos: [{ metodo: 'EFECTIVO_USD', monto: 1 }] });
    assert.equal(r.status, 422);
    assert.equal(r.body.codigo, 'PAGO_INCOMPLETO');
    assert.match(r.body.mensaje, /Falta por pagar Bs/);
    assert.equal((await prisma.lote.findFirstOrThrow({ where: { numero: 'PRONTO' } })).stockLibre, 2);
  });

  it('no da vuelto de un pago electrónico', async () => {
    const r = await vender(1, { pagos: [{ metodo: 'PUNTO_DE_VENTA', monto: 1000 }] });
    assert.equal(r.status, 422);
    assert.equal(r.body.codigo, 'VUELTO_INVALIDO');
  });

  it('cierre a ciegas: el cajero no ve lo esperado hasta cerrar, y la diferencia sale bien', async () => {
    await prisma.turno.deleteMany({ where: { cajeroId: d.cajero.id } });
    assert.equal((await cajero.post('/caja/abrir', { fondoUsd: 20, fondoBs: 500 })).status, 201);
    // Venta 1: 0,85 $ con 5 $ en efectivo, vuelto en Bs 981,06
    await vender(1, { pagos: [{ metodo: 'EFECTIVO_USD', monto: 5 }], vueltoMoneda: 'BS' });
    // Venta 2: 0,85 $ por Pago Móvil exacto (Bs 200,94)
    await vender(1, { metodoPago: 'PAGO_MOVIL', referenciaPago: '9999' });

    const actual = await cajero.get('/caja/actual');
    assert.equal(actual.body.ventas, 2);
    assert.equal(actual.body.esperado, undefined, 'el cajero no ve lo esperado');
    assert.ok((await admin.get('/caja/turnos')).body.length >= 1);

    // Esperado: USD 20 + 5 = 25 · Bs 500 − 981,06 = −481,06 (sacó vuelto de otro lado) · Pago Móvil 200,94
    const cierre = await cajero.post('/caja/cerrar', { contado: { EFECTIVO_USD: 25, EFECTIVO_BS: 0, PAGO_MOVIL: 200.94, PUNTO_DE_VENTA: 0 }, nota: 'Faltó sencillo' });
    assert.equal(cierre.status, 201, JSON.stringify(cierre.body));
    assert.equal(cierre.body.esperado.EFECTIVO_USD, 25);
    assert.equal(cierre.body.esperado.EFECTIVO_BS, -481.06);
    assert.equal(cierre.body.esperado.PAGO_MOVIL, 200.94);
    assert.equal(cierre.body.diferencia.EFECTIVO_USD, 0);
    assert.equal(cierre.body.diferencia.EFECTIVO_BS, 481.06);
    assert.equal(cierre.body.cuadra, false);
    assert.ok(await prisma.auditoria.findFirst({ where: { accion: 'CAJA_CERRADA_CON_DIFERENCIA' } }));

    // Con la caja cerrada ya no vende.
    assert.equal((await vender(1, { metodoPago: 'EFECTIVO_USD' })).status, 409);
  });

  it('una caja que cuadra, y el dueño la marca como revisada', async () => {
    await prisma.turno.deleteMany({ where: { cajeroId: d.cajero.id } });
    await cajero.post('/caja/abrir', { fondoUsd: 10 });
    await vender(2, { metodoPago: 'EFECTIVO_USD' });
    const c = await cajero.post('/caja/cerrar', { contado: { EFECTIVO_USD: 11.7, EFECTIVO_BS: 0, PAGO_MOVIL: 0, PUNTO_DE_VENTA: 0 } });
    assert.equal(c.body.cuadra, true, JSON.stringify(c.body.diferencia));
    assert.equal((await cajero.post(`/caja/turnos/${c.body.id}/revisar`)).status, 403);
    assert.equal((await admin.post(`/caja/turnos/${c.body.id}/revisar`)).status, 200);
  });

  it('una venta anulada no cuenta en el cierre', async () => {
    await prisma.turno.deleteMany({ where: { cajeroId: d.cajero.id } });
    await cajero.post('/caja/abrir', {});
    const v = (await vender(1, { metodoPago: 'EFECTIVO_USD' })).body;
    await admin.post(`/ventas/${v.id}/anular`);
    const c = await cajero.post('/caja/cerrar', { contado: { EFECTIVO_USD: 0, EFECTIVO_BS: 0, PAGO_MOVIL: 0, PUNTO_DE_VENTA: 0 } });
    assert.equal(c.body.cuadra, true);
  });
});
