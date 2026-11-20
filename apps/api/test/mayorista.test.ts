import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CLAVE, ORIGEN, como, entrar, escenario, levantar, prisma } from './ayuda';

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

describe('Descuentos, devoluciones y ajustes', () => {
  let app: INestApplication;
  let d: Awaited<ReturnType<typeof escenario>>;
  let admin: ReturnType<typeof como>;
  let cajero: ReturnType<typeof como>;
  before(async () => { app = await levantar(); });
  after(async () => { await app.close(); await prisma.$disconnect(); });
  beforeEach(async () => {
    d = await escenario();
    admin = como(app, (await entrar(app, 'admin')).token);
    cajero = como(app, (await entrar(app, 'cajero')).token);
  });

  it('el cajero da hasta 10 % de descuento; más, no', async () => {
    const mal = await cajero.post('/ventas', { lineas: [{ productoId: d.generico.id, cantidad: 2 }], metodoPago: 'EFECTIVO_USD', descuentoPct: 20, descuentoMotivo: 'Tercera edad' });
    assert.equal(mal.status, 403);
    const ok = await cajero.post('/ventas', { lineas: [{ productoId: d.generico.id, cantidad: 2 }], metodoPago: 'EFECTIVO_USD', descuentoPct: 10, descuentoMotivo: 'Tercera edad' });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.totalUsd, '1.53'); // 1,70 − 10 %
  });

  it('devolución parcial: vuelve el stock, se descuenta de la caja y no deja devolver de más', async () => {
    const v = await admin.post('/ventas', { lineas: [{ productoId: d.generico.id, cantidad: 3 }], metodoPago: 'EFECTIVO_USD' });
    const linea = v.body.lineas[0];
    assert.equal((await cajero.post(`/ventas/${v.body.id}/devoluciones`, { lineas: [{ lineaId: linea.id, cantidad: 1 }], motivo: 'x', metodo: 'EFECTIVO_USD' })).status, 403);
    const r = await admin.post(`/ventas/${v.body.id}/devoluciones`, { lineas: [{ lineaId: linea.id, cantidad: 1 }], motivo: 'Cambió de opinión', metodo: 'EFECTIVO_USD' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.montoUsd, '0.85');
    assert.equal((await admin.post(`/ventas/${v.body.id}/devoluciones`, { lineas: [{ lineaId: linea.id, cantidad: linea.cantidad }], motivo: 'x', metodo: 'EFECTIVO_USD' })).status, 409);
    const caja = (await admin.get('/caja/actual')).body;
    assert.equal(caja.esperado.EFECTIVO_USD, 1.7); // 2,55 cobrado − 0,85 devuelto
  });

  it('ajuste de inventario con motivo, sin dejar el lote en negativo', async () => {
    const lote = await prisma.lote.findFirstOrThrow({ where: { productoId: d.generico.id, numero: 'TARDE' } });
    assert.equal((await admin.post('/inventario/ajustes', { loteId: lote.id, cantidad: -11, motivo: 'ROTO' })).status, 409);
    assert.equal((await admin.post('/inventario/ajustes', { loteId: lote.id, cantidad: -2, motivo: 'ROTO' })).status, 201);
    assert.equal((await prisma.lote.findUniqueOrThrow({ where: { id: lote.id } })).stockLibre, 8);
  });

  it('marcar un principio como psicotrópico y anotar el médico', async () => {
    const p = await admin.post('/catalogo/principios', { nombre: 'Clonazepam', riesgo: 'PSICOTROPICO' });
    assert.equal(p.status, 201);
    assert.equal((await admin.patch(`/catalogo/principios/${p.body.id}`, { familia: 'benzodiacepinas' })).body.familia, 'benzodiacepinas');
    const lista = (await admin.get('/catalogo/productos?q=acetamin')).body;
    assert.ok(lista.length >= 1 && typeof lista[0].stock === 'number');
  });
});

describe('IVA, IGTF, venta sin duplicar, precios masivos y clave de dos pasos', () => {
  let app: INestApplication;
  let d: Awaited<ReturnType<typeof escenario>>;
  let admin: ReturnType<typeof como>;
  before(async () => { app = await levantar(); });
  after(async () => { await app.close(); await prisma.$disconnect(); });
  beforeEach(async () => {
    d = await escenario();
    admin = como(app, (await entrar(app, 'admin')).token);
  });

  it('suma IVA del producto y el IGTF de lo pagado en divisas', async () => {
    await prisma.producto.update({ where: { id: d.generico.id }, data: { ivaPct: 16 } });
    assert.equal((await admin.post('/catalogo/configuracion', { igtfActivo: true, igtfPct: 3 })).status, 200);
    const v = await admin.post('/ventas', { lineas: [{ productoId: d.generico.id, cantidad: 10 }], metodoPago: 'EFECTIVO_USD' });
    assert.equal(v.status, 201, JSON.stringify(v.body));
    // 8,50 + 16 % IVA (1,36) = 9,86; + 3 % IGTF (0,30) = 10,16
    assert.equal(v.body.ivaUsd, '1.36');
    assert.equal(v.body.igtfUsd, '0.3');
    assert.equal(v.body.totalUsd, '10.16');
  });

  it('la misma clave no guarda la venta dos veces', async () => {
    const clave = '5b0e7a52-3f0c-4b8e-9a51-1f2d3c4b5a69';
    const cuerpo = { clave, lineas: [{ productoId: d.generico.id, cantidad: 1 }], metodoPago: 'EFECTIVO_USD' };
    const a = await admin.post('/ventas', cuerpo);
    const b = await admin.post('/ventas', cuerpo);
    assert.equal(a.body.id, b.body.id);
    assert.equal(await prisma.venta.count(), 1);
  });

  it('cambio de precios masivo: vista previa no guarda, confirmar sí', async () => {
    const prev = await admin.post('/catalogo/precios/masivo', { laboratorio: 'Lab. Orinoco', pct: 10 });
    assert.equal(prev.status, 201, JSON.stringify(prev.body));
    assert.equal(prev.body.cambios[0].despues, '0.95'); // 0,85 + 10 % = 0,935 → 0,95
    assert.equal((await prisma.producto.findUniqueOrThrow({ where: { id: d.generico.id } })).precioUsd.toFixed(2), '0.85');
    await admin.post('/catalogo/precios/masivo', { laboratorio: 'Lab. Orinoco', pct: 10, vistaPrevia: false });
    assert.equal((await prisma.producto.findUniqueOrThrow({ where: { id: d.generico.id } })).precioUsd.toFixed(2), '0.95');
  });

  it('con la clave de dos pasos activa, el login pide el código', async () => {
    const { verificarCodigo } = await import('../src/common/totp');
    const ini = await admin.post('/auth/2fa/iniciar', {});
    assert.match(ini.body.url, /^otpauth:\/\/totp\//);
    const codigoActual = calcular(ini.body.secreto);
    assert.ok(verificarCodigo(ini.body.secreto, codigoActual));
    assert.equal((await admin.post('/auth/2fa/activar', { codigo: codigoActual })).status, 200);
    const sinCodigo = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', ORIGEN).send({ usuario: 'admin', clave: CLAVE });
    assert.equal(sinCodigo.status, 401);
    assert.equal(sinCodigo.body.codigo, 'REQUIERE_2FA');
    const conCodigo = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', ORIGEN).send({ usuario: 'admin', clave: CLAVE, codigo: calcular(ini.body.secreto) });
    assert.equal(conCodigo.status, 200);
  });
});

function calcular(secreto: string) {
  // TOTP de referencia (RFC 6238) escrito aparte para no probar el código consigo mismo.
  const { createHmac } = require('node:crypto') as typeof import('node:crypto');
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secreto].map((c) => A.indexOf(c).toString(2).padStart(5, '0')).join('');
  const clave = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', clave).update(msg).digest();
  const o = h[19]! & 15;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, '0');
}

describe('Órdenes de compra, devolución a droguería, anular compra y cotizaciones', () => {
  let app: INestApplication;
  let d: Awaited<ReturnType<typeof escenario>>;
  let admin: ReturnType<typeof como>;
  before(async () => { app = await levantar(); });
  after(async () => { await app.close(); await prisma.$disconnect(); });
  beforeEach(async () => {
    d = await escenario();
    admin = como(app, (await entrar(app, 'admin')).token);
  });

  it('orden de compra → recibir con diferencia → devolver a la droguería → baja la deuda', async () => {
    const o = await admin.post('/proveedores/ordenes', { proveedor: 'Drolanca', lineas: [{ productoId: d.generico.id, cantidad: 10 }] });
    assert.equal(o.status, 201, JSON.stringify(o.body));
    const linea = (await admin.get('/proveedores/ordenes')).body[0].lineas[0];
    const r = await admin.post(`/inventario/ordenes/${o.body.id}/recibir`, { numeroFactura: 'F-9', diasCredito: 15, lineas: [{ lineaId: linea.id, recibido: 8, numeroLote: 'OC1', vence: '2030-01-01', costoUsd: 0.5 }] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.diferencias, 1);
    const compra = (await admin.get('/inventario/compras')).body[0];
    assert.equal(compra.totalUsd, '4.00');
    const dev = await admin.post('/inventario/devoluciones-proveedor', { compraId: compra.id, compraLineaId: compra.lineas[0].id, cantidad: 2, motivo: 'Dañado' });
    assert.equal(dev.status, 201, JSON.stringify(dev.body));
    assert.equal((await admin.get('/proveedores/cuentas')).body.facturas[0].saldoUsd, '3.00');
    assert.equal((await admin.post(`/inventario/compras/${compra.id}/anular`, {})).status, 409); // ya tiene devoluciones
  });

  it('anular una compra mal cargada saca su mercancía y deja de deberse', async () => {
    const c = await admin.post('/inventario/compras', { proveedor: 'Cobeca', numeroFactura: 'X1', diasCredito: 10, lineas: [{ productoId: d.generico.id, numeroLote: 'MAL', vence: '2030-01-01', cantidad: 5, costoUsd: 1 }] });
    assert.equal((await admin.post(`/inventario/compras/${c.body.id}/anular`, {})).status, 201);
    assert.equal((await prisma.lote.findFirstOrThrow({ where: { numero: 'MAL' } })).stockLibre, 0);
    assert.equal((await admin.get('/proveedores/cuentas')).body.facturas.length, 0);
  });

  it('la cotización vencida no pasa a pedido y el stock apartado no se vende dos veces', async () => {
    const cli = await admin.post('/mayorista/clientes', { rif: 'J-30512874-1', nombre: 'Clínica', limiteUsd: 1000 });
    const a = await admin.post('/mayorista/pedidos', { clienteId: cli.body.id, lineas: [{ productoId: d.generico.id, cantidad: 10 }] });
    const b = await admin.post('/mayorista/pedidos', { clienteId: cli.body.id, lineas: [{ productoId: d.generico.id, cantidad: 5 }], empleado: 'Juan Pérez' });
    assert.equal((await admin.post(`/mayorista/pedidos/${a.body.id}/avanzar`, {})).status, 201);
    const r = await admin.post(`/mayorista/pedidos/${b.body.id}/avanzar`, {}); // quedan 12 − 10 apartadas = 2
    assert.equal(r.status, 409);
    assert.match(r.body.mensaje, /apartado/);
    await prisma.pedidoMayor.update({ where: { id: b.body.id }, data: { validaHasta: new Date(Date.now() - 1000) } });
    assert.match((await admin.post(`/mayorista/pedidos/${b.body.id}/avanzar`, {})).body.mensaje, /venció/);
  });
});
