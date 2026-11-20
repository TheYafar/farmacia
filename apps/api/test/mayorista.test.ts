import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import { como, entrar, escenario, levantar, prisma } from './ayuda';

// Acetaminofén genérico: 0,85 $ al detal, 12 unidades vendibles (2 «PRONTO» + 10 «TARDE").
describe('Compras, venta al mayor y reportes', () => {
  let app: INestApplication;
  let d: Awaited<ReturnType<typeof escenario>>;
  let admin: ReturnType<typeof como>;
  before(async () => { app = await levantar(); });
  after(async () => { await app.close(); await prisma.$disconnect(); });
  beforeEach(async () => {
    d = await escenario();
    admin = como(app, (await entrar(app, 'admin')).token);
  });

  it('compra a crédito queda en cuentas por pagar y se paga por partes', async () => {
    const c = await admin.post('/inventario/compras', {
      proveedor: 'Drolanca', numeroFactura: 'F-1', diasCredito: 15,
      lineas: [{ productoId: d.generico.id, numeroLote: 'L1', vence: '2030-01-01', cantidad: 10, costoUsd: 0.5 }],
    });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    let cxp = (await admin.get('/proveedores/cuentas')).body;
    assert.equal(cxp.facturas[0].saldoUsd, '5.00');
    assert.equal((await admin.post(`/proveedores/cuentas/${c.body.id}/pagos`, { montoUsd: 6, metodo: 'Transferencia' })).status, 409);
    const p = await admin.post(`/proveedores/cuentas/${c.body.id}/pagos`, { montoUsd: 2, metodo: 'Transferencia' });
    assert.equal(p.body.saldoUsd, '3.00');
    await admin.post(`/proveedores/cuentas/${c.body.id}/pagos`, { montoUsd: 3, metodo: 'Transferencia' });
    cxp = (await admin.get('/proveedores/cuentas')).body;
    assert.equal(cxp.facturas.length, 0);
  });

  it('cotización con precio de mayor → despacho descuenta stock → abono', async () => {
    const cli = await admin.post('/mayorista/clientes', { rif: 'J305128741', nombre: 'Clínica San Rafael', limiteUsd: 100, descuentoPct: 20 });
    assert.equal(cli.status, 201, JSON.stringify(cli.body));
    assert.equal(cli.body.rif, 'J-30512874-1');
    const ped = await admin.post('/mayorista/pedidos', { clienteId: cli.body.id, lineas: [{ productoId: d.generico.id, cantidad: 10 }] });
    assert.equal(ped.body.totalUsd, '6.80'); // 0,85 − 20 % = 0,68 × 10
    assert.equal((await admin.post(`/mayorista/pedidos/${ped.body.id}/abonos`, { montoUsd: 1, metodo: 'Efectivo' })).status, 409);
    await admin.post(`/mayorista/pedidos/${ped.body.id}/avanzar`, {});
    const desp = await admin.post(`/mayorista/pedidos/${ped.body.id}/avanzar`, {});
    assert.equal(desp.body.estado, 'DESPACHADO');
    const libres = await prisma.lote.aggregate({ where: { productoId: d.generico.id, numero: { in: ['PRONTO', 'TARDE'] } }, _sum: { stockLibre: true } });
    assert.equal(libres._sum.stockLibre, 2);
    const ab = await admin.post(`/mayorista/pedidos/${ped.body.id}/abonos`, { montoUsd: 5, metodo: 'Transferencia' });
    assert.equal(ab.body.saldoUsd, '1.80');
    const clientes = (await admin.get('/mayorista/clientes')).body;
    assert.equal(clientes[0].deudaUsd, '1.80');
  });

  it('no despacha si pasa el límite de crédito', async () => {
    const cli = await admin.post('/mayorista/clientes', { rif: 'J-40123456-7', nombre: 'Farmacia El Pilar', limiteUsd: 1, descuentoPct: 0 });
    const ped = await admin.post('/mayorista/pedidos', { clienteId: cli.body.id, lineas: [{ productoId: d.generico.id, cantidad: 5 }] });
    await admin.post(`/mayorista/pedidos/${ped.body.id}/avanzar`, {});
    const r = await admin.post(`/mayorista/pedidos/${ped.body.id}/avanzar`, {});
    assert.equal(r.status, 409);
    assert.match(r.body.mensaje ?? r.body.message ?? '', /límite/);
  });

  it('el cajero no entra a compras ni al mayor', async () => {
    const cajero = como(app, (await entrar(app, 'cajero')).token);
    assert.equal((await cajero.get('/proveedores/cuentas')).status, 403);
    assert.equal((await cajero.get('/mayorista/clientes')).status, 403);
    assert.equal((await cajero.get('/libro/controlados')).status, 403);
  });

  it('reportes y recompra responden', async () => {
    for (const r of ['/reportes/ganancia', '/reportes/rotacion', '/reportes/cajeros', '/libro/controlados', '/whatsapp/recompra', '/whatsapp/estadisticas', '/proveedores/sugerido']) {
      const x = await admin.get(r);
      assert.equal(x.status, 200, `${r}: ${JSON.stringify(x.body)}`);
    }
  });
});
