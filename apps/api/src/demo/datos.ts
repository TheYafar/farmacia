import { Prisma, type PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { cifrarClave } from '../auth/auth';

/**
 * Datos de ejemplo de la demo: una farmacia ficticia con catálogo, inventario, clientes,
 * un mes de ventas, cierres de caja, encargos, permisos por revisar y compras.
 * Todo es inventado (dos meses de ventas). Se vuelve a cargar cada noche.
 */
export const DEMO_FARMACIA = { nombre: 'Farmacia Demo Los Próceres', rif: 'J-00000000-0', direccion: 'Av. Principal, local 3. Ciudad Demo', telefono: '0212-0000000' };
export const USUARIOS_DEMO = {
  ADMIN: { usuario: 'demo.duena', nombre: 'María Pérez' },
  REGENTE: { usuario: 'demo.farmaceutico', nombre: 'Carlos Rivas' },
  CAJERO: { usuario: 'demo.cajera', nombre: 'Ana Torres' },
} as const;

/** Números al azar pero siempre los mismos (la demo se ve igual cada día). */
function azar(semilla: number) {
  let s = semilla;
  const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  return { r, entre: (a: number, b: number) => a + Math.floor(r() * (b - a + 1)), uno: <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]! };
}

const DIA = 86_400_000;
/** Días de ventas de ejemplo (dos meses: así los reportes pueden comparar con el mes anterior). */
const DIAS = 60;
const D = (v: number) => new Prisma.Decimal(v.toFixed(2));

const PRINCIPIOS = [
  ['Acetaminofén', null, 'NORMAL', 'Dolor y fiebre'], ['Ibuprofeno', 'aines', 'NORMAL', 'Dolor e inflamación'],
  ['Losartán potásico', null, 'NORMAL', 'Tensión alta'], ['Amlodipino', null, 'NORMAL', 'Tensión alta'],
  ['Metformina', null, 'NORMAL', 'Diabetes tipo 2'], ['Omeprazol', null, 'NORMAL', 'Acidez y gastritis'],
  ['Loratadina', null, 'NORMAL', 'Alergias'], ['Atorvastatina', null, 'NORMAL', 'Colesterol alto'],
  ['Amoxicilina', 'penicilinas', 'ANTIBIOTICO', 'Infecciones bacterianas'], ['Azitromicina', 'macrólidos', 'ANTIBIOTICO', 'Infecciones respiratorias'],
  ['Ciprofloxacina', 'quinolonas', 'ANTIBIOTICO', 'Infecciones urinarias'], ['Clonazepam', null, 'PSICOTROPICO', 'Ansiedad y convulsiones'],
  ['Alprazolam', null, 'PSICOTROPICO', 'Ansiedad'], ['Salbutamol', null, 'NORMAL', 'Asma'],
  ['Diclofenac', 'aines', 'NORMAL', 'Dolor e inflamación'], ['Vitamina C', null, 'NORMAL', 'Suplemento'],
  ['Complejo B', null, 'NORMAL', 'Suplemento'], ['Sales de rehidratación', null, 'NORMAL', 'Diarrea y deshidratación'],
  ['Óxido de zinc', null, 'NORMAL', 'Pañalitis'], ['Glibenclamida', null, 'NORMAL', 'Diabetes tipo 2'],
] as const;

// [nombre, laboratorio, principio, concentración, forma, unidades, precio $, nivel, stock, categoría, iva, recipe, días para vencer]
const PRODUCTOS: [string, string, string, string, string, number, number, 'GENERICO' | 'NACIONAL' | 'MARCA', number, string, number, boolean, number][] = [
  ['Acetaminofén', 'Lab. Ávila', 'Acetaminofén', '500 mg', 'Tabletas', 10, 0.85, 'GENERICO', 60, 'Medicamentos', 0, false, 400],
  ['Acetamín', 'Lab. Llanos', 'Acetaminofén', '500 mg', 'Tabletas', 20, 2.3, 'NACIONAL', 35, 'Medicamentos', 0, false, 300],
  ['Dolofin', 'Importado', 'Acetaminofén', '500 mg', 'Tabletas', 24, 4.8, 'MARCA', 12, 'Medicamentos', 0, false, 500],
  ['Acetaminofén jarabe', 'Lab. Ávila', 'Acetaminofén', '120 mg/5 ml', 'Jarabe', 1, 2.1, 'GENERICO', 18, 'Medicamentos', 0, false, 25],
  ['Ibuprofeno', 'Lab. Ávila', 'Ibuprofeno', '400 mg', 'Tabletas', 10, 1.05, 'GENERICO', 70, 'Medicamentos', 0, false, 380],
  ['Ibuflam', 'Lab. Llanos', 'Ibuprofeno', '400 mg', 'Tabletas', 20, 2.9, 'NACIONAL', 4, 'Medicamentos', 0, false, 200],
  ['Losartán potásico', 'Lab. Ávila', 'Losartán potásico', '50 mg', 'Tabletas', 30, 3.2, 'GENERICO', 40, 'Medicamentos', 0, false, 420],
  ['Tensilán', 'Importado', 'Losartán potásico', '50 mg', 'Tabletas', 30, 11.8, 'MARCA', 6, 'Medicamentos', 0, false, 600],
  ['Amlodipino', 'Lab. Llanos', 'Amlodipino', '5 mg', 'Tabletas', 30, 2.7, 'GENERICO', 28, 'Medicamentos', 0, false, 350],
  ['Metformina', 'Lab. Ávila', 'Metformina', '850 mg', 'Tabletas', 30, 2.4, 'GENERICO', 45, 'Medicamentos', 0, false, 330],
  ['Glucoforte', 'Importado', 'Metformina', '850 mg', 'Tabletas', 30, 7.5, 'MARCA', 3, 'Medicamentos', 0, false, 500],
  ['Glibenclamida', 'Lab. Llanos', 'Glibenclamida', '5 mg', 'Tabletas', 30, 1.9, 'GENERICO', 0, 'Medicamentos', 0, false, 300],
  ['Omeprazol', 'Lab. Ávila', 'Omeprazol', '20 mg', 'Cápsulas', 14, 1.6, 'GENERICO', 55, 'Medicamentos', 0, false, 18],
  ['Gastrosec', 'Importado', 'Omeprazol', '20 mg', 'Cápsulas', 28, 8.9, 'MARCA', 7, 'Medicamentos', 0, false, 450],
  ['Loratadina', 'Lab. Llanos', 'Loratadina', '10 mg', 'Tabletas', 10, 1.2, 'GENERICO', 38, 'Medicamentos', 0, false, 270],
  ['Atorvastatina', 'Lab. Ávila', 'Atorvastatina', '20 mg', 'Tabletas', 30, 4.1, 'GENERICO', 20, 'Medicamentos', 0, false, 390],
  ['Amoxicilina', 'Lab. Ávila', 'Amoxicilina', '500 mg', 'Cápsulas', 21, 2.2, 'GENERICO', 30, 'Medicamentos', 0, true, 310],
  ['Amoxil', 'Importado', 'Amoxicilina', '500 mg', 'Cápsulas', 21, 6.5, 'MARCA', 8, 'Medicamentos', 0, true, 420],
  ['Azitromicina', 'Lab. Llanos', 'Azitromicina', '500 mg', 'Tabletas', 3, 3.4, 'GENERICO', 16, 'Medicamentos', 0, true, 280],
  ['Ciprofloxacina', 'Lab. Ávila', 'Ciprofloxacina', '500 mg', 'Tabletas', 10, 2.8, 'GENERICO', 12, 'Medicamentos', 0, true, -10],
  ['Clonazepam', 'Lab. Llanos', 'Clonazepam', '0,5 mg', 'Tabletas', 30, 3.6, 'NACIONAL', 10, 'Medicamentos', 0, true, 500],
  ['Alprazolam', 'Lab. Ávila', 'Alprazolam', '0,5 mg', 'Tabletas', 30, 4.2, 'GENERICO', 9, 'Medicamentos', 0, true, 410],
  ['Salbutamol inhalador', 'Importado', 'Salbutamol', '100 mcg', 'Inhalador', 1, 5.5, 'MARCA', 11, 'Medicamentos', 0, false, 230],
  ['Diclofenac', 'Lab. Llanos', 'Diclofenac', '50 mg', 'Tabletas', 20, 1.4, 'GENERICO', 42, 'Medicamentos', 0, false, 360],
  ['Vitamina C', 'Naturales Demo', 'Vitamina C', '500 mg', 'Tabletas', 30, 3.9, 'NACIONAL', 25, 'Vitaminas', 0, false, 540],
  ['Complejo B', 'Naturales Demo', 'Complejo B', 'Forte', 'Tabletas', 30, 4.5, 'NACIONAL', 15, 'Vitaminas', 0, false, 520],
  ['Suero oral', 'Lab. Ávila', 'Sales de rehidratación', 'Sobre', 'Polvo', 1, 0.7, 'GENERICO', 80, 'Medicamentos', 0, false, 600],
  ['Crema para pañalitis', 'Bebé Demo', 'Óxido de zinc', '40 %', 'Crema', 1, 4.3, 'NACIONAL', 14, 'Bebés', 16, false, 700],
  ['Champú de bebé', 'Bebé Demo', 'Óxido de zinc', '200 ml', 'Líquido', 1, 3.6, 'NACIONAL', 9, 'Bebés', 16, false, 700],
  ['Protector solar FPS 50', 'Piel Demo', 'Óxido de zinc', '120 ml', 'Crema', 1, 12.5, 'MARCA', 5, 'Cuidado personal', 16, false, 640],
];

const PACIENTES = [
  ['V-12345678', 'José Gregorio Hernández', '0414-1110001', [], ['Hipertenso']],
  ['V-14582307', 'María Fernanda Rojas', '0414-5550192', ['penicilinas'], ['Hipertensa']],
  ['V-9876543', 'Carmen Elena Díaz', '0424-2220002', [], ['Diabética']],
  ['V-20456789', 'Luis Alberto Mendoza', '0412-3330003', [], []],
  ['V-17654321', 'Ana Karina Salazar', '0416-4440004', ['aines'], ['Asmática']],
  ['V-6543210', 'Pedro Pablo Romero', '0414-5550005', [], ['Hipertenso', 'Diabético']],
  ['V-25123456', 'Valentina Guzmán', '0424-6660006', [], []],
  ['V-11222333', 'Rosa Margarita Pérez', '0412-7770007', [], ['Colesterol alto']],
  ['V-18999888', 'Andrés Eloy Blanco', '0426-8880008', [], []],
  ['V-13444555', 'Gabriela Mistral Rivas', '0414-9990009', ['sulfas'], []],
] as const;

export async function sembrarDemo(prisma: PrismaClient) {
  const { r, entre, uno } = azar(20261121);
  const ahora = Date.now();
  const hoy = new Date(Math.floor((ahora - 4 * 3_600_000) / DIA) * DIA + 4 * 3_600_000);

  await prisma.configuracion.create({
    data: { id: 1, tasaModo: 'MANUAL', farmaciaNombre: DEMO_FARMACIA.nombre, farmaciaRif: DEMO_FARMACIA.rif, farmaciaDireccion: DEMO_FARMACIA.direccion, farmaciaTelefono: DEMO_FARMACIA.telefono, ticketPie: '¡Gracias por su compra! (ticket de demostración)', redondeoBs: 1 },
  });

  const hash = await cifrarClave(randomBytes(24).toString('hex'));
  const [duena, regente, cajera] = await Promise.all((['ADMIN', 'REGENTE', 'CAJERO'] as const).map((rol) =>
    prisma.usuario.create({ data: { ...USUARIOS_DEMO[rol], rol, claveHash: hash } })));
  const cajero2 = await prisma.usuario.create({ data: { usuario: 'demo.cajero2', nombre: 'Luis Mendoza', rol: 'CAJERO', claveHash: hash } });

  // Tasa del último mes (sube poco a poco).
  const tasas: number[] = [];
  for (let d = DIAS; d >= 0; d--) {
    const valor = Math.round((240 + (DIAS - d) * 0.4 + r() * 0.6) * 100) / 100;
    tasas.push(valor);
    await prisma.tasaCambio.create({ data: { valor, fuente: 'BCV', creadaPorId: duena.id, creadaEn: new Date(hoy.getTime() - d * DIA + 9 * 3_600_000) } });
  }

  const caja1 = await prisma.caja.create({ data: { nombre: 'Caja 1 · Mostrador', creadaPorId: duena.id } });
  const caja2 = await prisma.caja.create({ data: { nombre: 'Caja 2 · Tablet', creadaPorId: duena.id } });

  const pa: Record<string, string> = {};
  for (const [nombre, familia, riesgo, uso] of PRINCIPIOS) pa[nombre] = (await prisma.principioActivo.create({ data: { nombre, familia, riesgo, uso } })).id;
  await prisma.parLasa.create({ data: { aId: pa['Clonazepam']!, bId: pa['Alprazolam']!, nota: 'Ambos psicotrópicos; revisar bien el nombre' } });

  const productos: { id: string; precio: number; loteId: string; normal: boolean; uds: number }[] = [];
  let codigo = 7590000000001;
  for (const [nombre, lab, principio, conc, forma, uds, precio, nivel, stock, categoria, iva, recipe, vence] of PRODUCTOS) {
    const riesgo = PRINCIPIOS.find((p) => p[0] === principio)![2];
    const p = await prisma.producto.create({
      data: {
        nombreComercial: nombre, laboratorio: lab, principioActivoId: pa[principio]!, concentracion: conc, forma, unidadesPorCaja: uds, precioUsd: precio, nivel,
        requiereRecipe: recipe, categoria, ivaPct: iva, costoRefUsd: Math.round(precio * 0.62 * 100) / 100, stockMinimo: stock > 20 ? 10 : 5, codigoBarras: String(codigo++),
      },
    });
    // Un lote vigente (algunos vencen pronto o ya vencieron) y, a veces, otro lote más nuevo.
    const lote = await prisma.lote.create({ data: { productoId: p.id, numero: `L${String(codigo).slice(-5)}A`, vence: new Date(ahora + vence * DIA), stockLibre: stock } });
    if (vence < 60 && stock) await prisma.lote.create({ data: { productoId: p.id, numero: `L${String(codigo).slice(-5)}B`, vence: new Date(ahora + 400 * DIA), stockLibre: Math.ceil(stock / 2) } });
    productos.push({ id: p.id, precio, loteId: lote.id, normal: riesgo === 'NORMAL' && !recipe, uds });
  }

  for (const [cedula, nombre, telefono, alergias, condiciones] of PACIENTES) {
    await prisma.paciente.create({ data: { cedula, nombre, telefono, alergias: [...alergias], condiciones: [...condiciones], consentimientoEn: new Date(ahora - 70 * DIA) } });
  }
  await prisma.medico.createMany({ data: [
    { nombre: 'Dra. Laura Medina', especialidad: 'Medicina interna', mpps: '00001' },
    { nombre: 'Dr. Ramón Castillo', especialidad: 'Pediatría', mpps: '00002' },
    { nombre: 'Dra. Elena Vargas', especialidad: 'Psiquiatría', mpps: '00003' },
  ] });

  // Un mes de ventas: dos turnos por día (mañana y tarde), cada uno con su cierre.
  const normales = productos.filter((p) => p.normal);
  const metodos = ['PAGO_MOVIL', 'PAGO_MOVIL', 'PUNTO_DE_VENTA', 'EFECTIVO_USD', 'EFECTIVO_BS'] as const;
  for (let d = DIAS; d >= 0; d--) {
    const dia = hoy.getTime() - d * DIA;
    const tasa = tasas[DIAS - d]!;
    const turnos = d === 0 ? [{ quien: cajera, caja: caja1, desde: 8 }] : [{ quien: cajera, caja: caja1, desde: 8 }, { quien: cajero2, caja: caja2, desde: 14 }];
    for (const t of turnos) {
      const abierto = d === 0;
      const turno = await prisma.turno.create({
        data: { cajeroId: t.quien.id, cajaId: t.caja.id, fondoUsd: 20, fondoBs: 500, abiertoEn: new Date(dia + t.desde * 3_600_000), estado: abierto ? 'ABIERTO' : 'CERRADO', cerradoEn: abierto ? null : new Date(dia + (t.desde + 6) * 3_600_000) },
      });
      const n = abierto ? 9 : entre(6, 13);
      const totales: Record<string, number> = { PAGO_MOVIL: 0, PUNTO_DE_VENTA: 0, EFECTIVO_USD: 0, EFECTIVO_BS: 0 };
      for (let i = 0; i < n; i++) {
        const lineas = Array.from({ length: entre(1, 3) }, () => uno(normales)).filter((p, j, a) => a.indexOf(p) === j);
        const total = lineas.reduce((a, p) => a + p.precio, 0);
        const metodo = uno(metodos);
        const enBs = metodo !== 'EFECTIVO_USD';
        const paciente = r() < 0.45 ? uno(PACIENTES)[0] : undefined;
        totales[metodo]! += enBs ? total * tasa : total;
        await prisma.venta.create({
          data: {
            cajeroId: t.quien.id, turnoId: turno.id, cedula: paciente, totalUsd: D(total), tasa, totalBs: D(total * tasa), metodoPago: metodo, tasaFuente: 'BCV',
            referenciaPago: metodo === 'PAGO_MOVIL' ? String(entre(1000, 9999)) : null,
            creadaEn: new Date(dia + (t.desde + r() * (abierto ? Math.max(0.5, (ahora - dia) / 3_600_000 - t.desde - 0.2) : 6)) * 3_600_000),
            lineas: { create: lineas.map((p) => ({ productoId: p.id, loteId: p.loteId, cantidad: 1, precioUsd: p.precio })) },
            pagos: { create: [{ metodo, moneda: enBs ? 'BS' : 'USD', monto: D(enBs ? total * tasa : total), montoUsd: D(total), referencia: metodo === 'PAGO_MOVIL' ? String(entre(1000, 9999)) : null }] },
          },
        });
      }
      if (!abierto) {
        const esperado = { ...totales, EFECTIVO_USD: totales.EFECTIVO_USD! + 20, EFECTIVO_BS: totales.EFECTIVO_BS! + 500 };
        const faltante = d === 3 ? 5 : 0;
        const contado = { ...esperado, EFECTIVO_USD: esperado.EFECTIVO_USD - faltante };
        await prisma.turno.update({
          where: { id: turno.id },
          data: { esperado, contado, diferencia: { EFECTIVO_USD: -faltante }, nota: faltante ? 'Faltaron $5 en efectivo' : null, revisadoPorId: faltante ? null : duena.id, revisadoEn: faltante ? null : new Date(dia + 22 * 3_600_000) },
        });
      }
    }
  }
  // El dueño y el farmacéutico también tienen su caja abierta hoy, para poder vender en la demo.
  await prisma.turno.createMany({ data: [{ cajeroId: duena.id, fondoUsd: 0, fondoBs: 0 }, { cajeroId: regente.id, fondoUsd: 0, fondoBs: 0 }] });

  // Encargos: lo que pidieron y no había.
  const sinStock = await prisma.producto.findFirstOrThrow({ where: { nombreComercial: 'Glibenclamida' } });
  for (const cedula of ['V-9876543', 'V-6543210', 'V-11222333']) await prisma.solicitudEspera.create({ data: { cedula, productoId: sinStock.id, solicitadaEn: new Date(ahora - entre(1, 6) * DIA) } });

  // Permiso pendiente: antibiótico para una clienta alérgica a la penicilina.
  const amox = await prisma.producto.findFirstOrThrow({ where: { nombreComercial: 'Amoxicilina' } });
  await prisma.autorizacion.create({ data: { cedula: 'V-14582307', productoId: amox.id, solicitadaPorId: cajera.id, razon: 'Trae récipe, pero es alérgica a las penicilinas' } });

  // Compras a droguerías (una por pagar).
  for (const [i, prov] of ['Droguería Andina (demo)', 'Distribuidora Caribe (demo)', 'Droguería Andina (demo)'].entries()) {
    const lineas = Array.from({ length: 4 }, (_, j) => productos[(i * 5 + j * 3) % productos.length]!);
    const total = lineas.reduce((a, p) => a + p.precio * 0.62 * 12, 0);
    await prisma.compra.create({
      data: {
        proveedor: prov, numeroFactura: `F-00${120 + i}`, totalUsd: D(total), pagadoUsd: D(i === 2 ? 0 : total), creadaPorId: duena.id,
        creadaEn: new Date(ahora - (20 - i * 8) * DIA), venceEn: i === 2 ? new Date(ahora + 6 * DIA) : null,
        lineas: { create: lineas.map((p, j) => ({ productoId: p.id, numeroLote: `C${i}${j}`, vence: new Date(ahora + 500 * DIA), cantidad: 12, costoUsd: D(p.precio * 0.62) })) },
      },
    });
  }
  await prisma.clienteEmpresa.create({ data: { rif: 'J-00000001-0', nombre: 'Clínica Demo San Rafael', telefono: '0212-0000001', limiteUsd: 1500, diasCredito: 15, descuentoPct: 10 } });
}
