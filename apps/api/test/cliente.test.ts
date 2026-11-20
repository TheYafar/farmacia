import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import { como, entrar, escenario, levantar, prisma } from './ayuda';

// Lo que pidió el cliente al revisar la app: redondeo en Bs, cancelar encargos, editar usuarios,
// lista de clientes, búsqueda que perdona errores, aviso de controlados, valor del inventario y comparación.
describe('Pedidos del cliente', () => {
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
  const vender = (extra: object) => cajero.post('/ventas', { lineas: [{ productoId: d.generico.id, cantidad: 1 }], ...extra });

  it('redondeo a 10 Bs: acepta el monto redondeado o el exacto, y no menos', async () => {
    await prisma.configuracion.create({ data: { redondeoBs: 10 } });
    // 0,85 $ × 236,40 = 200,94 Bs → 200 Bs
    const r = await vender({ pagos: [{ metodo: 'EFECTIVO_BS', monto: 200 }] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.totalBs), 200);
    assert.equal(r.body.vueltoMoneda, null);
    const exacto = await vender({ pagos: [{ metodo: 'PAGO_MOVIL', monto: 200.94, referencia: '1234' }] });
    assert.equal(exacto.status, 201, JSON.stringify(exacto.body));
    assert.equal((await vender({ pagos: [{ metodo: 'EFECTIVO_BS', monto: 199 }] })).status, 422);
    const usd = await vender({ pagos: [{ metodo: 'EFECTIVO_USD', monto: 0.85 }] });
    assert.equal(usd.status, 201, JSON.stringify(usd.body));
  });

  it('cancelar un encargo; si tenía caja apartada, se libera', async () => {
    const e = await admin.post('/espera', { cedula: d.paciente.cedula, productoId: d.marca.id });
    assert.equal(e.status, 201, JSON.stringify(e.body));
    assert.equal((await admin.post(`/espera/${e.body.id}/cancelar`)).status, 204);
    assert.equal((await prisma.solicitudEspera.findUnique({ where: { id: e.body.id } }))!.estado, 'CANCELADO');
    assert.equal((await admin.post(`/espera/${e.body.id}/cancelar`)).status, 409);

    const e2 = await admin.post('/espera', { cedula: d.paciente.cedula, productoId: d.marca.id });
    const lote = await prisma.lote.create({ data: { productoId: d.marca.id, numero: 'M1', vence: new Date(Date.now() + 300 * 86_400_000), stockLibre: 0, stockReservado: 1 } });
    await prisma.solicitudEspera.update({ where: { id: e2.body.id }, data: { estado: 'NOTIFICADO', loteId: lote.id, venceReserva: new Date(Date.now() + 3_600_000) } });
    assert.equal((await admin.post(`/espera/${e2.body.id}/cancelar`)).status, 204);
    const l = await prisma.lote.findUnique({ where: { id: lote.id } });
    assert.equal(l!.stockLibre, 1);
    assert.equal(l!.stockReservado, 0);
  });

  it('el dueño cambia nombre y rol; no puede quitarse a sí mismo el rol de dueño', async () => {
    const r = await admin.patch(`/usuarios/${d.cajero.id}`, { nombre: 'Ana Pérez', rol: 'REGENTE' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.rol, 'REGENTE');
    assert.equal(r.body.nombre, 'Ana Pérez');
    // Al cambiar el rol se cierran sus sesiones.
    assert.equal((await cajero.get('/auth/yo')).status, 401);
    assert.equal((await admin.patch(`/usuarios/${d.admin.id}`, { rol: 'CAJERO' })).status, 400);
  });

  it('lista de clientes por nombre o teléfono', async () => {
    const r = await cajero.get('/pacientes?q=maria rojas');
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 1);
    assert.equal((await cajero.get('/pacientes?q=04145550192')).body.length, 1);
    assert.equal((await cajero.get('/pacientes?q=pedro')).body.length, 0);
    assert.equal((await cajero.get('/pacientes')).body.length, 1);
  });

  it('la búsqueda corrige errores de escritura', async () => {
    const r = await cajero.get('/catalogo/buscar?q=acetaminofem');
    assert.equal(r.body.corregido, 'acetaminofen');
    assert.ok(r.body.grupos.length > 0);
    assert.equal((await cajero.get('/catalogo/buscar?q=zzzzzzzz')).body.grupos.length, 0);
  });

  it('avisa de psicotrópicos cargados como «Normal» y el Excel los marca solo', async () => {
    const pa = await prisma.principioActivo.create({ data: { nombre: 'Clonazepam' } });
    await prisma.producto.create({ data: { nombreComercial: 'Rivotril', laboratorio: 'Roche', principioActivoId: pa.id, concentracion: '2 mg', forma: 'Tabletas', unidadesPorCaja: 30, precioUsd: 8, nivel: 'MARCA' } });
    const r = await admin.get('/catalogo/principios/revisar-riesgo');
    assert.deepEqual(r.body.map((x: { nombre: string; sugerido: string }) => [x.nombre, x.sugerido]), [['Clonazepam', 'PSICOTROPICO']]);

    const imp = await admin.post('/inventario/importar', { confirmar: true, filas: [{ nombreComercial: 'Tramal', laboratorio: 'Grünenthal', principioActivo: 'Tramadol', concentracion: '50 mg', forma: 'Cápsulas', unidadesPorCaja: 10, precioUsd: 5, ivaPct: 16, categoria: 'Medicamentos', costoUsd: 3, stockMinimo: 4 }] });
    assert.equal(imp.status, 200, JSON.stringify(imp.body));
    assert.deepEqual(imp.body.controladosDeducidos, ['Tramadol (psicotrópico)']);
    const p = await prisma.producto.findFirst({ where: { nombreComercial: 'Tramal' }, include: { principioActivo: true } });
    assert.equal(p!.principioActivo.riesgo, 'PSICOTROPICO');
    assert.equal(p!.ivaPct.toNumber(), 16);
    assert.equal(p!.stockMinimo, 4);
    assert.equal(p!.costoRefUsd!.toNumber(), 3);
  });

  it('valor del inventario a costo y a precio de venta', async () => {
    await prisma.producto.update({ where: { id: d.generico.id }, data: { costoRefUsd: 0.5 } });
    const r = await admin.get('/reportes/inventario');
    assert.equal(r.status, 200);
    // Acetaminofén: 12 sin vencer (50 vencidas aparte). Amoxicilina: 5 sin costo.
    assert.equal(r.body.costoUsd, '6.00');
    assert.equal(r.body.ventaUsd, (12 * 0.85 + 5 * 2.2).toFixed(2));
    assert.equal(r.body.vencidoCostoUsd, '25.00');
    assert.equal(r.body.sinCosto, 1);
  });

  it('compara con el período anterior', async () => {
    await vender({ pagos: [{ metodo: 'EFECTIVO_USD', monto: 0.85 }] });
    const r = await admin.get('/reportes/comparar');
    assert.equal(r.status, 200);
    assert.equal(r.body.actual.ventas, 1);
    assert.equal(r.body.anterior.ventas, 0);
  });

  it('recompra por WhatsApp desde la primera compra (estimada)', async () => {
    const v = await cajero.post('/ventas', { cedula: d.paciente.cedula, lineas: [{ productoId: d.generico.id, cantidad: 1 }], pagos: [{ metodo: 'EFECTIVO_USD', monto: 0.85 }] });
    assert.equal(v.status, 201, JSON.stringify(v.body));
    await prisma.venta.update({ where: { id: v.body.id }, data: { creadaEn: new Date(Date.now() - 7 * 86_400_000) } });
    const r = await admin.get('/whatsapp/recompra');
    assert.equal(r.body.length, 1);
    assert.equal(r.body[0].estimado, true);
    assert.equal(r.body[0].dias, 3);
  });

  it('primeros pasos', async () => {
    const r = await admin.get('/configuracion/primeros-pasos');
    assert.equal(r.status, 200);
    assert.equal(r.body.tasa, true);
    assert.equal(r.body.datosFarmacia, false);
  });
});
