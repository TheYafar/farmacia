import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import { como, entrar, escenario, levantar, prisma } from './ayuda';
import { Notificador, NotificadorLog } from '../src/notificaciones/notificador';
import { EsperaService } from '../src/espera/espera';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4510000000049454e44ae426082', 'hex');

describe('Reglas del mostrador', () => {
  let app: INestApplication;
  let d: Awaited<ReturnType<typeof escenario>>;
  let cajero: ReturnType<typeof como>;
  let regente: ReturnType<typeof como>;
  let admin: ReturnType<typeof como>;

  before(async () => { app = await levantar(); });
  after(async () => { await app.close(); await prisma.$disconnect(); });
  beforeEach(async () => {
    d = await escenario();
    cajero = como(app, (await entrar(app, 'cajero')).token);
    regente = como(app, (await entrar(app, 'regente')).token);
    admin = como(app, (await entrar(app, 'admin')).token);
  });

  const stock = async (numero: string) => (await prisma.lote.findFirstOrThrow({ where: { numero } })).stockLibre;

  describe('Búsqueda', () => {
    it('encuentra sin acentos, agrupa marcas iguales de la más barata a la más cara y no cuenta lotes vencidos', async () => {
      const r = await cajero.get('/catalogo/buscar?q=acetaminofen 500');
      assert.equal(r.status, 200);
      assert.equal(r.body.grupos.length, 1);
      const [g] = r.body.grupos;
      assert.deepEqual(g.opciones.map((o: { nombreComercial: string }) => o.nombreComercial), ['Acetaminofén', 'Tylenol']);
      assert.equal(g.opciones[0].stockLibre, 12, 'el lote vencido (50) no cuenta');
      assert.equal(g.opciones[1].stockLibre, 0);
    });

    it('buscar por marca muestra también los genéricos equivalentes', async () => {
      const r = await cajero.get('/catalogo/buscar?q=tylenol');
      assert.equal(r.body.grupos[0].opciones.length, 2);
    });

    it('un texto con caracteres raros no rompe la búsqueda', async () => {
      const r = await cajero.get(`/catalogo/buscar?q=${encodeURIComponent("'; DROP TABLE \"Producto\"; --")}`);
      assert.equal(r.status, 200);
      assert.equal(await prisma.producto.count(), 3);
    });
  });

  describe('Ventas', () => {
    it('vende primero del lote que vence antes y nunca del vencido', async () => {
      const r = await cajero.post('/ventas', { lineas: [{ productoId: d.generico.id, cantidad: 3 }], metodoPago: 'EFECTIVO_USD' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(await stock('PRONTO'), 0);
      assert.equal(await stock('TARDE'), 9);
      assert.equal(await stock('VENCIDO'), 50);
      assert.equal(r.body.totalUsd, '2.55');
      assert.equal(r.body.totalBs, '602.82', '2,55 × 236,40');
    });

    it('no vende más de lo que hay y no toca el stock si falla', async () => {
      const r = await cajero.post('/ventas', { lineas: [{ productoId: d.generico.id, cantidad: 13 }], metodoPago: 'EFECTIVO_USD' });
      assert.equal(r.status, 409);
      assert.equal(await stock('PRONTO'), 2);
      assert.equal(await stock('TARDE'), 10);
    });

    it('dos cajas vendiendo la última unidad al mismo tiempo: solo una lo logra', async () => {
      await prisma.lote.updateMany({ where: { numero: 'TARDE' }, data: { stockLibre: 0 } });
      await prisma.lote.updateMany({ where: { numero: 'PRONTO' }, data: { stockLibre: 1 } });
      const venta = { lineas: [{ productoId: d.generico.id, cantidad: 1 }], metodoPago: 'EFECTIVO_USD' };
      const rs = await Promise.all([cajero.post('/ventas', venta), admin.post('/ventas', venta), regente.post('/ventas', venta)]);
      assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409, 409]);
      assert.equal(await stock('PRONTO'), 0);
    });

    it('el Pago Móvil exige número de referencia', async () => {
      const r = await cajero.post('/ventas', { lineas: [{ productoId: d.generico.id, cantidad: 1 }], metodoPago: 'PAGO_MOVIL' });
      assert.equal(r.status, 400);
    });

    it('el cajero solo ve sus ventas y solo el dueño anula, devolviendo el stock al lote', async () => {
      const v = (await cajero.post('/ventas', { lineas: [{ productoId: d.generico.id, cantidad: 2 }], metodoPago: 'EFECTIVO_BS' })).body;
      await admin.post('/ventas', { lineas: [{ productoId: d.generico.id, cantidad: 1 }], metodoPago: 'EFECTIVO_BS' });
      assert.equal((await cajero.get('/ventas')).body.length, 1);
      assert.equal((await cajero.post(`/ventas/${v.id}/anular`)).status, 403);
      assert.equal((await admin.post(`/ventas/${v.id}/anular`)).status, 204);
      assert.equal(await stock('PRONTO'), 2);
    });
  });

  describe('Reglas clínicas', () => {
    const venderAmoxicilina = (extra: object = {}) => cajero.post('/ventas', {
      cedula: 'V-14582307', metodoPago: 'EFECTIVO_USD', lineas: [{ productoId: d.amoxil.id, cantidad: 1, ...extra }],
    });

    it('un antibiótico sin récipe no se vende', async () => {
      const r = await venderAmoxicilina();
      assert.equal(r.status, 422);
      assert.equal(r.body.bloqueos[0].motivo, 'FALTA_RECIPE');
    });

    it('con récipe pero alérgica a la penicilina, frena la venta hasta que el Regente la autorice', async () => {
      const rx = (await cajero.subir('/recipes').field('cedula', 'V-14582307').attach('foto', PNG, 'r.png')).body;
      const sinPermiso = await venderAmoxicilina({ recipeId: rx.id });
      assert.equal(sinPermiso.status, 422);
      assert.equal(sinPermiso.body.bloqueos[0].motivo, 'ALERGIA');
      assert.match(sinPermiso.body.bloqueos[0].mensaje, /alérgico/);

      const aut = await regente.post('/autorizaciones', { cedula: 'V-14582307', productoId: d.amoxil.id, motivo: 'El médico confirmó por teléfono' });
      assert.equal(aut.status, 201);
      const ok = await venderAmoxicilina({ recipeId: rx.id, autorizacionId: aut.body.id });
      assert.equal(ok.status, 201, JSON.stringify(ok.body));

      // La misma autorización no sirve dos veces.
      const otra = await venderAmoxicilina({ recipeId: rx.id, autorizacionId: aut.body.id });
      assert.equal(otra.status, 422);
    });

    it('el cajero pide permiso, el Regente aprueba y la venta encuentra sola el récipe y el permiso', async () => {
      await cajero.subir('/recipes').field('cedula', 'V-14582307').attach('foto', PNG, 'r.png');
      const bloqueada = await venderAmoxicilina();
      assert.equal(bloqueada.body.bloqueos[0].motivo, 'ALERGIA');

      const sol = await cajero.post('/autorizaciones/solicitudes', { cedula: 'V-14582307', productoId: d.amoxil.id, razon: 'ALERGIA' });
      assert.equal(sol.status, 201);
      assert.equal(sol.body.estado, 'PENDIENTE');
      // Pedir dos veces no duplica la solicitud.
      assert.equal((await cajero.post('/autorizaciones/solicitudes', { cedula: 'V-14582307', productoId: d.amoxil.id, razon: 'ALERGIA' })).body.id, sol.body.id);

      assert.equal((await cajero.get('/autorizaciones')).status, 403, 'el cajero no ve la bandeja del Regente');
      assert.equal((await cajero.post(`/autorizaciones/${sol.body.id}/aprobar`, {})).status, 403, 'ni se aprueba a sí mismo');
      const pendientes = await regente.get('/autorizaciones');
      assert.equal(pendientes.body.length, 1);
      assert.deepEqual(pendientes.body[0].paciente.alergias, ['Penicilinas']);

      assert.equal((await venderAmoxicilina()).status, 422, 'pendiente todavía no sirve');
      assert.equal((await regente.post(`/autorizaciones/${sol.body.id}/aprobar`, { motivo: 'El médico lo confirmó' })).status, 201);
      assert.equal((await cajero.get(`/autorizaciones/${sol.body.id}`)).body.estado, 'APROBADA');

      const ok = await venderAmoxicilina();
      assert.equal(ok.status, 201, JSON.stringify(ok.body));
      assert.ok(ok.body.lineas[0].autorizacionId);
      assert.ok(ok.body.lineas[0].recipeId);
      assert.equal((await venderAmoxicilina()).status, 422, 'el permiso sirve una sola vez');
    });

    it('si el Regente rechaza, la venta sigue bloqueada', async () => {
      await cajero.subir('/recipes').field('cedula', 'V-14582307').attach('foto', PNG, 'r.png');
      const sol = (await cajero.post('/autorizaciones/solicitudes', { cedula: 'V-14582307', productoId: d.amoxil.id, razon: 'ALERGIA' })).body;
      assert.equal((await regente.post(`/autorizaciones/${sol.id}/rechazar`, { motivo: 'Riesgo de reacción' })).status, 201);
      assert.equal((await regente.post(`/autorizaciones/${sol.id}/aprobar`, {})).status, 409);
      assert.equal((await venderAmoxicilina()).status, 422);
    });

    it('una autorización para otro paciente no sirve', async () => {
      await prisma.paciente.create({ data: { cedula: 'V-9871220', nombre: 'José Peña', telefono: '0412-5550148', alergias: [], condiciones: [] } });
      const rx = (await cajero.subir('/recipes').field('cedula', 'V-14582307').attach('foto', PNG, 'r.png')).body;
      const aut = (await regente.post('/autorizaciones', { cedula: 'V-9871220', productoId: d.amoxil.id, motivo: 'x' })).body;
      assert.equal((await venderAmoxicilina({ recipeId: rx.id, autorizacionId: aut.id })).status, 422);
    });
  });

  describe('Lista de espera', () => {
    it('no anota en espera algo que sí hay', async () => {
      assert.equal((await cajero.post('/espera', { cedula: 'V-14582307', productoId: d.generico.id })).status, 409);
    });

    it('al cargar la compra separa la caja, avisa al cliente, cobra por Pago Móvil y entrega', async () => {
      const s = await cajero.post('/espera', { cedula: 'V-14582307', productoId: d.marca.id });
      assert.equal(s.status, 201);

      const notificador = app.get(Notificador) as NotificadorLog;
      notificador.enviados = [];
      const c = await admin.post('/inventario/compras', {
        proveedor: 'Droguería Central', numeroFactura: 'F-1001',
        lineas: [{ productoId: d.marca.id, numeroLote: 'TY-1', vence: new Date(Date.now() + 200 * 86_400_000).toISOString(), cantidad: 1, factorVenta: 3 }],
      });
      assert.equal(c.status, 201, JSON.stringify(c.body));
      assert.equal(c.body.clientesAvisados, 1);
      assert.equal(notificador.enviados[0]!.telefono, '0414-5550192');

      const lote = await prisma.lote.findFirstOrThrow({ where: { numero: 'TY-1' } });
      assert.deepEqual([lote.stockLibre, lote.stockReservado], [2, 1], '1 caja máster × 3 = 3 unidades, 1 apartada');

      assert.equal((await cajero.post(`/espera/${s.body.id}/confirmar-pago`, { referenciaPagoMovil: '004521' })).status, 403);
      const pago = await regente.post(`/espera/${s.body.id}/confirmar-pago`, { referenciaPagoMovil: '004521', gaveta: 'A-3' });
      assert.equal(pago.status, 201, JSON.stringify(pago.body));
      assert.equal(pago.body.estado, 'PAGADO_CUSTODIA');
      assert.equal((await prisma.lote.findFirstOrThrow({ where: { numero: 'TY-1' } })).stockReservado, 0);

      assert.equal((await cajero.post(`/espera/${s.body.id}/entregar`)).status, 204);
    });

    it('si no paga a tiempo, la caja pasa al siguiente de la fila', async () => {
      await prisma.paciente.create({ data: { cedula: 'V-9871220', nombre: 'José Peña', telefono: '0412-5550148', alergias: [], condiciones: [] } });
      const primero = (await cajero.post('/espera', { cedula: 'V-14582307', productoId: d.marca.id })).body;
      const segundo = (await cajero.post('/espera', { cedula: 'V-9871220', productoId: d.marca.id })).body;
      await admin.post('/inventario/compras', {
        proveedor: 'Droguería Central', numeroFactura: 'F-2',
        lineas: [{ productoId: d.marca.id, numeroLote: 'TY-2', vence: new Date(Date.now() + 200 * 86_400_000).toISOString(), cantidad: 1 }],
      });
      assert.equal((await prisma.solicitudEspera.findUniqueOrThrow({ where: { id: segundo.id } })).estado, 'EN_ESPERA');

      await prisma.solicitudEspera.update({ where: { id: primero.id }, data: { venceReserva: new Date(Date.now() - 1000) } });
      assert.equal(await app.get(EsperaService).expirar(), 1);

      assert.equal((await prisma.solicitudEspera.findUniqueOrThrow({ where: { id: primero.id } })).estado, 'EXPIRADO');
      assert.equal((await prisma.solicitudEspera.findUniqueOrThrow({ where: { id: segundo.id } })).estado, 'NOTIFICADO');
      const lote = await prisma.lote.findFirstOrThrow({ where: { numero: 'TY-2' } });
      assert.deepEqual([lote.stockLibre, lote.stockReservado], [0, 1]);
    });
  });

  describe('Importación desde Excel', () => {
    const fila = (extra: object = {}) => ({
      codigoBarras: '7591000000099', nombreComercial: 'Atamel', laboratorio: 'Calox', principioActivo: 'Acetaminofén',
      concentracion: '500 mg', forma: 'Tabletas', unidadesPorCaja: 20, precioUsd: 2.35, nivel: 'NACIONAL',
      lote: 'AT-1', vence: '2027-08-21', cantidad: 18, ...extra,
    });

    it('primero revisa sin guardar y marca las filas con error', async () => {
      const r = await admin.post('/inventario/importar', { filas: [fila(), { nombreComercial: 'Sin datos' }, fila({ lote: 'AT-1' })] });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.guardado, false);
      assert.ok(r.body.errores.some((e: { fila: number }) => e.fila === 3), 'fila incompleta');
      assert.ok(r.body.errores.some((e: { fila: number; campo: string }) => e.fila === 4 && e.campo === 'lote'), 'lote repetido');
      assert.equal(await prisma.producto.count({ where: { nombreComercial: 'Atamel' } }), 0, 'no guardó nada');
    });

    it('con errores no guarda nada aunque se pida confirmar', async () => {
      const r = await admin.post('/inventario/importar', { confirmar: true, filas: [fila(), { nombreComercial: 'Sin datos' }] });
      assert.equal(r.body.guardado, false);
      assert.equal(await prisma.producto.count({ where: { nombreComercial: 'Atamel' } }), 0);
    });

    it('guarda productos nuevos, actualiza precios de los existentes y crea principios activos', async () => {
      const r = await admin.post('/inventario/importar', {
        confirmar: true,
        filas: [
          fila(),
          // Ya existe (mismo código): cambia el precio y el conteo del lote.
          { codigoBarras: '7591000000011', nombreComercial: 'Acetaminofén', laboratorio: 'Lab. Orinoco', principioActivo: 'Acetaminofén', concentracion: '500 mg', forma: 'Tabletas', unidadesPorCaja: 10, precioUsd: 0.95, lote: 'TARDE', vence: '2027-01-01', cantidad: 4 },
          { nombreComercial: 'Loratadina', laboratorio: 'Genéricos Ávila', principioActivo: 'Loratadina', concentracion: '10 mg', forma: 'Tabletas', unidadesPorCaja: 10, precioUsd: 0.95 },
        ],
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.guardado, true);
      assert.deepEqual([r.body.productosNuevos, r.body.productosActualizados, r.body.preciosCambiados, r.body.principiosNuevos, r.body.lotes], [2, 1, 1, 1, 2]);
      assert.equal((await prisma.producto.findUniqueOrThrow({ where: { codigoBarras: '7591000000011' } })).precioUsd.toFixed(2), '0.95');
      assert.equal(await stock('TARDE'), 4, 'la cantidad del Excel reemplaza el conteo del lote');
      assert.equal(await stock('AT-1'), 18);
      assert.ok(await prisma.auditoria.findFirst({ where: { accion: 'INVENTARIO_IMPORTADO' } }));

      // Importar el mismo archivo otra vez no duplica nada.
      const otra = await admin.post('/inventario/importar', { confirmar: true, filas: [fila()] });
      assert.equal(otra.body.productosNuevos, 0);
      assert.equal(await prisma.producto.count({ where: { nombreComercial: 'Atamel' } }), 1);
    });

    it('solo el dueño importa', async () => {
      assert.equal((await regente.post('/inventario/importar', { filas: [fila()] })).status, 403);
    });
  });

  describe('Récipes', () => {
    it('rechaza un archivo que no es imagen aunque se llame .jpg', async () => {
      const r = await cajero.subir('/recipes').attach('foto', Buffer.from('<script>alert(1)</script>'), 'foto.jpg');
      assert.equal(r.status, 400);
    });

    it('guarda la foto y solo la entrega con sesión', async () => {
      const r = await cajero.subir('/recipes').field('cedula', '14582307').attach('foto', PNG, 'foto.png');
      assert.equal(r.status, 201);
      assert.equal(r.body.cedula, 'V-14582307');
      const foto = await cajero.get(`/recipes/${r.body.id}/foto`);
      assert.equal(foto.status, 200);
      assert.equal(foto.headers['content-type'], 'image/png');
      assert.match(foto.headers['cache-control'], /no-store/);

      assert.equal((await cajero.post(`/recipes/${r.body.id}/validar`, { aprobado: true })).status, 403);
      assert.equal((await regente.post(`/recipes/${r.body.id}/validar`, { aprobado: true })).status, 201);
      assert.equal((await regente.post(`/recipes/${r.body.id}/validar`, { aprobado: true })).status, 409);
    });
  });

  describe('Ficha del paciente', () => {
    it('muestra lo que siempre compra, con la cédula escrita de cualquier forma', async () => {
      await cajero.post('/ventas', { cedula: 'V-14582307', lineas: [{ productoId: d.generico.id, cantidad: 1 }], metodoPago: 'EFECTIVO_USD' });
      const r = await cajero.get('/pacientes/v14.582.307');
      assert.equal(r.status, 200);
      assert.equal(r.body.habituales[0].producto.nombreComercial, 'Acetaminofén');
      assert.deepEqual(r.body.alergias, ['Penicilinas']);
    });
  });
});
