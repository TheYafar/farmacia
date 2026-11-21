import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import { como, entrar, escenario, levantar, prisma } from './ayuda';

// Revisión de la lógica: cada prueba corresponde a un problema encontrado y arreglado.
describe('Lógica del negocio (revisión)', () => {
  let app: INestApplication;
  let d: Awaited<ReturnType<typeof escenario>>;
  let admin: ReturnType<typeof como>;
  let cajero: ReturnType<typeof como>;
  let regente: ReturnType<typeof como>;
  const efectivo = (monto: number) => ({ pagos: [{ metodo: 'EFECTIVO_USD', monto }] });
  const dias = (n: number) => new Date(Date.now() + n * 86_400_000);
  before(async () => { app = await levantar(); });
  after(async () => { await app.close(); await prisma.$disconnect(); });
  beforeEach(async () => {
    d = await escenario();
    admin = como(app, (await entrar(app, 'admin')).token);
    cajero = como(app, (await entrar(app, 'cajero')).token);
    regente = como(app, (await entrar(app, 'regente')).token);
  });

  it('anular: no si ya tuvo devoluciones, no si su caja ya se cerró; y el stock vuelve exacto', async () => {
    const stock = async () => (await prisma.lote.findMany({ where: { productoId: d.generico.id, numero: { not: 'VENCIDO' } } })).reduce((a, l) => a + l.stockLibre, 0);
    const antes = await stock();
    const v1 = await cajero.post('/ventas', { lineas: [{ productoId: d.generico.id, cantidad: 2 }], ...efectivo(1.7) });
    assert.equal(v1.status, 201, JSON.stringify(v1.body));
    const linea = v1.body.lineas[0].id;
    assert.equal((await admin.post(`/ventas/${v1.body.id}/devoluciones`, { lineas: [{ lineaId: linea, cantidad: 1 }], motivo: 'No lo quiso', metodo: 'EFECTIVO_USD' })).status, 201);
    assert.equal((await admin.post(`/ventas/${v1.body.id}/anular`)).status, 409);
    assert.equal(await stock(), antes - 1);

    const v2 = await cajero.post('/ventas', { lineas: [{ productoId: d.generico.id, cantidad: 1 }], ...efectivo(0.85) });
    assert.equal((await admin.post(`/ventas/${v2.body.id}/anular`)).status, 204);
    assert.equal(await stock(), antes - 1);

    const v3 = await cajero.post('/ventas', { lineas: [{ productoId: d.generico.id, cantidad: 1 }], ...efectivo(0.85) });
    await cajero.post('/caja/cerrar', { contado: { EFECTIVO_USD: 0, EFECTIVO_BS: 0, PAGO_MOVIL: 0, PUNTO_DE_VENTA: 0 } });
    assert.equal((await admin.post(`/ventas/${v3.body.id}/anular`)).status, 409);
  });

  it('devolución: reintegra también el IVA', async () => {
    await prisma.producto.update({ where: { id: d.generico.id }, data: { ivaPct: 16 } });
    const v = await cajero.post('/ventas', { lineas: [{ productoId: d.generico.id, cantidad: 1 }], ...efectivo(0.99) });
    assert.equal(v.status, 201, JSON.stringify(v.body));
    assert.equal(Number(v.body.totalUsd), 0.99);
    const dv = await admin.post(`/ventas/${v.body.id}/devoluciones`, { lineas: [{ lineaId: v.body.lineas[0].id, cantidad: 1 }], motivo: 'Error', metodo: 'EFECTIVO_USD' });
    assert.equal(dv.status, 201, JSON.stringify(dv.body));
    assert.equal(dv.body.montoUsd, '0.99');
  });

  it('producto con récipe: no se vende hasta que el farmacéutico revise la foto', async () => {
    await prisma.producto.update({ where: { id: d.marca.id }, data: { requiereRecipe: true } });
    await prisma.lote.create({ data: { productoId: d.marca.id, numero: 'M1', vence: dias(200), stockLibre: 5 } });
    const rx = await prisma.recipe.create({ data: { cedula: d.paciente.cedula, archivo: 'x.jpg', tipoArchivo: 'image/jpeg', creadoPorId: d.cajero.id } });
    const venta = () => cajero.post('/ventas', { cedula: d.paciente.cedula, lineas: [{ productoId: d.marca.id, cantidad: 1 }], ...efectivo(4.9) });
    const r = await venta();
    assert.equal(r.status, 422);
    assert.equal(r.body.bloqueos[0].motivo, 'RECIPE_PENDIENTE');
    assert.equal((await regente.post(`/recipes/${rx.id}/validar`, { aprobado: true })).status, 201);
    assert.equal((await venta()).status, 201);
  });

  it('encargos: el cobro entra en la caja y un controlado pide récipe y permiso', async () => {
    const lote = await prisma.lote.findFirstOrThrow({ where: { productoId: d.amoxil.id } });
    await prisma.lote.update({ where: { id: lote.id }, data: { stockLibre: 4, stockReservado: 1 } });
    const e = await prisma.solicitudEspera.create({ data: { cedula: d.paciente.cedula, productoId: d.amoxil.id, estado: 'NOTIFICADO', loteId: lote.id, venceReserva: dias(1) } });
    const pagar = () => admin.post(`/espera/${e.id}/confirmar-pago`, { referenciaPagoMovil: '123456' });
    let r = await pagar();
    assert.equal(r.status, 409);
    assert.equal(r.body.codigo, 'NECESITA_RECIPE');
    await prisma.recipe.create({ data: { cedula: d.paciente.cedula, archivo: 'x.jpg', tipoArchivo: 'image/jpeg', creadoPorId: d.cajero.id } });
    r = await pagar();
    assert.equal(r.body.codigo, 'NECESITA_PERMISO');
    await regente.post('/autorizaciones', { cedula: d.paciente.cedula, productoId: d.amoxil.id, motivo: 'Lo indicó el médico' });
    r = await pagar();
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const venta = await prisma.venta.findUniqueOrThrow({ where: { id: r.body.ventaId }, include: { lineas: true } });
    const turno = await prisma.turno.findFirstOrThrow({ where: { cajeroId: d.admin.id, estado: 'ABIERTO' } });
    assert.equal(venta.turnoId, turno.id);
    assert.ok(venta.lineas[0]!.autorizacionId);
  });

  it('recibir una orden dos veces a la vez carga la mercancía una sola vez', async () => {
    const o = await admin.post('/proveedores/ordenes', { proveedor: 'Droguería X', lineas: [{ productoId: d.marca.id, cantidad: 3 }] });
    const orden = await prisma.ordenCompra.findUniqueOrThrow({ where: { id: o.body.id }, include: { lineas: true } });
    const cuerpo = (f: string) => ({ numeroFactura: f, lineas: [{ lineaId: orden.lineas[0]!.id, recibido: 3, numeroLote: 'R1', vence: dias(300).toISOString(), costoUsd: 2 }] });
    const [a, b] = await Promise.all([admin.post(`/inventario/ordenes/${orden.id}/recibir`, cuerpo('F1')), admin.post(`/inventario/ordenes/${orden.id}/recibir`, cuerpo('F2'))]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    assert.equal(await prisma.compra.count(), 1);
    assert.equal((await prisma.lote.findFirstOrThrow({ where: { productoId: d.marca.id, numero: 'R1' } })).stockLibre, 3);
  });

  it('despachar un pedido al mayor dos veces a la vez descuenta el stock una sola vez', async () => {
    const c = await admin.post('/mayorista/clientes', { rif: 'J-12345678-9', nombre: 'Clínica', limiteUsd: 1000 });
    const p = await admin.post('/mayorista/pedidos', { clienteId: c.body.id, lineas: [{ productoId: d.generico.id, cantidad: 2 }] });
    await admin.post(`/mayorista/pedidos/${p.body.id}/avanzar`);
    const [a, b] = await Promise.all([admin.post(`/mayorista/pedidos/${p.body.id}/avanzar`), admin.post(`/mayorista/pedidos/${p.body.id}/avanzar`)]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    const lotes = await prisma.lote.findMany({ where: { productoId: d.generico.id, numero: { in: ['PRONTO', 'TARDE'] } } });
    assert.equal(lotes.reduce((s, l) => s + l.stockLibre, 0), 10);
    const pm = await prisma.pedidoMayor.findUniqueOrThrow({ where: { id: p.body.id }, include: { lineas: true } });
    assert.ok(pm.despachadoEn);
    assert.deepEqual(pm.lineas[0]!.lotes, [{ loteId: lotes.find((l) => l.numero === 'PRONTO')!.id, cantidad: 2 }]);
  });

  it('compra de contado no queda como deuda; la de crédito sí', async () => {
    const compra = (f: string, diasCredito: number) => admin.post('/inventario/compras', { proveedor: 'Droguería Y', numeroFactura: f, diasCredito, lineas: [{ productoId: d.marca.id, numeroLote: f, vence: dias(300).toISOString(), cantidad: 2, costoUsd: 3 }] });
    assert.equal((await compra('C1', 0)).status, 201);
    assert.equal((await compra('C2', 15)).status, 201);
    const cuentas = await admin.get('/proveedores/cuentas');
    assert.deepEqual(cuentas.body.facturas.map((f: { numeroFactura: string }) => f.numeroFactura), ['C2']);
  });

  it('libro de psicotrópicos: compras (no las anuladas), ajustes, devoluciones y despachos al mayor', async () => {
    const pa = await prisma.principioActivo.create({ data: { nombre: 'Clonazepam', riesgo: 'PSICOTROPICO' } });
    const clona = await prisma.producto.create({ data: { nombreComercial: 'Rivotril', laboratorio: 'Roche', principioActivoId: pa.id, concentracion: '2 mg', forma: 'Tabletas', unidadesPorCaja: 30, precioUsd: 8, nivel: 'MARCA', requiereRecipe: true } });
    const compra = (f: string) => admin.post('/inventario/compras', { proveedor: 'Droguería Z', numeroFactura: f, lineas: [{ productoId: clona.id, numeroLote: `L${f}`, vence: dias(300).toISOString(), cantidad: 10, costoUsd: 5 }] });
    await compra('1');
    const anulada = await compra('2');
    assert.equal((await admin.post(`/inventario/compras/${anulada.body.id}/anular`)).status, 201);
    const lote = await prisma.lote.findFirstOrThrow({ where: { productoId: clona.id, numero: 'L1' } });
    await admin.post('/inventario/ajustes', { loteId: lote.id, cantidad: -1, motivo: 'ROTO' });
    const c = await admin.post('/mayorista/clientes', { rif: 'J-12345678-9', nombre: 'Clínica', limiteUsd: 1000 });
    const p = await admin.post('/mayorista/pedidos', { clienteId: c.body.id, lineas: [{ productoId: clona.id, cantidad: 2 }] });
    await admin.post(`/mayorista/pedidos/${p.body.id}/avanzar`);
    await admin.post(`/mayorista/pedidos/${p.body.id}/avanzar`);

    const libro = (await admin.get('/libro/controlados')).body as { tipo: string; cantidad: number; documento: string }[];
    const resumen = libro.map((f) => `${f.tipo} ${f.cantidad} ${f.documento.split(':')[0]!.split(' #')[0]}`).sort();
    assert.deepEqual(resumen, ['ENTRADA 10 Compra', 'SALIDA 1 Ajuste', 'SALIDA 2 Despacho al mayor']);
  });

  it('un ajuste que suma mercancía le aparta una caja a quien la esperaba', async () => {
    const lote = await prisma.lote.create({ data: { productoId: d.marca.id, numero: 'M0', vence: dias(200), stockLibre: 0 } });
    const e = await admin.post('/espera', { cedula: d.paciente.cedula, productoId: d.marca.id });
    assert.equal(e.status, 201, JSON.stringify(e.body));
    assert.equal((await admin.post('/inventario/ajustes', { loteId: lote.id, cantidad: 1, motivo: 'CONTEO' })).status, 201);
    assert.equal((await prisma.solicitudEspera.findUniqueOrThrow({ where: { id: e.body.id } })).estado, 'NOTIFICADO');
  });

  it('el dueño cierra la caja que otro dejó abierta', async () => {
    const t = await prisma.turno.findFirstOrThrow({ where: { cajeroId: d.cajero.id, estado: 'ABIERTO' } });
    const cero = { contado: { EFECTIVO_USD: 0, EFECTIVO_BS: 0, PAGO_MOVIL: 0, PUNTO_DE_VENTA: 0 } };
    assert.equal((await cajero.post(`/caja/turnos/${t.id}/cerrar`, cero)).status, 403);
    const r = await admin.post(`/caja/turnos/${t.id}/cerrar`, cero);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.match(r.body.nota, /Cerrada por Dueño/);
    assert.equal((await admin.post(`/caja/turnos/${t.id}/cerrar`, cero)).status, 409);
  });

  it('una tasa 100 veces mayor (un punto de más) pide confirmación', async () => {
    const r = await admin.post('/tasa', { valor: 23640 });
    assert.equal(r.status, 400);
    assert.equal(r.body.codigo, 'TASA_RARA');
    assert.equal((await admin.post('/tasa', { valor: 240 })).status, 201);
    assert.equal((await admin.post('/tasa', { valor: 23640, confirmar: true })).status, 201);
  });

  it('el día es el de Venezuela: una venta de las 9:30 p. m. no pasa al día siguiente', async () => {
    const { fechaVe, inicioDiaVe } = await import('@farmacia/shared');
    assert.equal(fechaVe(new Date('2026-03-10T01:30:00Z')), '2026-03-09');
    assert.equal(inicioDiaVe('2026-03-09').toISOString(), '2026-03-09T04:00:00.000Z');
    const v = await prisma.venta.create({ data: { cajeroId: d.cajero.id, totalUsd: 5, tasa: 100, totalBs: 500, metodoPago: 'EFECTIVO_USD', creadaEn: new Date('2026-03-10T01:30:00Z') } });
    const del9 = (await admin.get('/ventas?desde=2026-03-09&hasta=2026-03-09')).body as { id: string }[];
    const del10 = (await admin.get('/ventas?desde=2026-03-10&hasta=2026-03-10')).body as { id: string }[];
    assert.ok(del9.some((x) => x.id === v.id), 'sale el 9');
    assert.ok(!del10.some((x) => x.id === v.id), 'no sale el 10');
    const horas = (await admin.get('/reportes/ventas-detalle?desde=2026-03-09&hasta=2026-03-09')).body.porHora as { hora: number }[];
    assert.deepEqual(horas.map((h) => h.hora), [21]);
  });

  it('buscar por síntoma: «dolor de cabeza» encuentra lo que sirve para el dolor', async () => {
    await prisma.principioActivo.update({ where: { nombre: 'Acetaminofén' }, data: { uso: 'Dolor y fiebre' } });
    const r = (await cajero.get('/catalogo/buscar?q=' + encodeURIComponent('dolor de cabeza'))).body as { porUso?: boolean; grupos: { principio: { nombre: string } }[] };
    assert.equal(r.porUso, true);
    assert.ok(r.grupos.some((g) => g.principio.nombre === 'Acetaminofén'));
    // Por nombre sigue funcionando igual (sin «porUso»).
    const n = (await cajero.get('/catalogo/buscar?q=acetaminofen')).body as { porUso?: boolean; grupos: unknown[] };
    assert.ok(n.grupos.length && !n.porUso);
  });

  it('mercancía sin factura: crea el lote, suma, queda en el historial y la ficha lo muestra', async () => {
    const r = await admin.post('/inventario/existencia', { productoId: d.generico.id, cantidad: 7, vence: '2030-01-31', nota: 'Existencia inicial' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const lotes = (await admin.get(`/inventario/lotes?productoId=${d.generico.id}`)).body as { numero: string; stockLibre: number }[];
    assert.ok(lotes.some((l) => l.numero === 'S/L-20300131' && l.stockLibre === 7));
    // Otra vez con la misma fecha: se suma al mismo lote.
    await admin.post('/inventario/existencia', { productoId: d.generico.id, cantidad: 3, vence: '2030-01-31' });
    const otra = (await admin.get(`/inventario/lotes?productoId=${d.generico.id}`)).body as { numero: string; stockLibre: number }[];
    assert.equal(otra.find((l) => l.numero === 'S/L-20300131')!.stockLibre, 10);
    const hist = (await admin.get('/inventario/ajustes')).body as { cantidad: number }[];
    assert.ok(hist.filter((a) => a.cantidad > 0).length >= 2);
    // El cajero no puede.
    assert.equal((await cajero.post('/inventario/existencia', { productoId: d.generico.id, cantidad: 1, vence: '2030-01-31' })).status, 403);
  });
});
