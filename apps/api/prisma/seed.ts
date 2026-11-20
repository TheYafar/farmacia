/**
 * Datos iniciales.
 *   SEED_ADMIN_USUARIO / SEED_ADMIN_CLAVE  → crea el usuario del dueño si todavía no hay ninguno (obligatorio la primera vez).
 *   SEED_DEMO=true                         → carga también un catálogo de ejemplo (solo para pruebas, nunca en la farmacia real).
 */
import { PrismaClient } from '@prisma/client';
import { cifrarClave } from '../src/auth/auth';

const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.usuario.count({ where: { rol: 'ADMIN' } });
  if (!admins) {
    const usuario = process.env.SEED_ADMIN_USUARIO?.trim().toLowerCase();
    const clave = process.env.SEED_ADMIN_CLAVE;
    if (!usuario || !clave || clave.length < 10) {
      throw new Error('Define SEED_ADMIN_USUARIO y SEED_ADMIN_CLAVE (mínimo 10 caracteres) para crear el usuario del dueño');
    }
    await prisma.usuario.create({ data: { nombre: 'Dueño', usuario, rol: 'ADMIN', claveHash: await cifrarClave(clave) } });
    console.log(`Usuario del dueño creado: ${usuario}. Cambia la clave al entrar por primera vez.`);
  }

  if (process.env.SEED_DEMO !== 'true') return;
  const admin = await prisma.usuario.findFirstOrThrow({ where: { rol: 'ADMIN' } });
  if (!(await prisma.tasaCambio.count())) await prisma.tasaCambio.create({ data: { valor: 236.4, fuente: 'EJEMPLO', creadaPorId: admin.id } });

  const principios = [
    { nombre: 'Acetaminofén', uso: 'Dolor y fiebre' },
    { nombre: 'Losartán potásico', uso: 'Tensión alta' },
    { nombre: 'Amoxicilina', familia: 'penicilinas', riesgo: 'ANTIBIOTICO' as const, uso: 'Infecciones bacterianas' },
    { nombre: 'Ibuprofeno', familia: 'aines', uso: 'Dolor e inflamación' },
    { nombre: 'Clonazepam', riesgo: 'PSICOTROPICO' as const, uso: 'Ansiedad, crisis de pánico, convulsiones' },
    { nombre: 'Clobazam', riesgo: 'PSICOTROPICO' as const, uso: 'Epilepsia como tratamiento añadido' },
  ];
  const pa: Record<string, string> = {};
  for (const p of principios) pa[p.nombre] = (await prisma.principioActivo.upsert({ where: { nombre: p.nombre }, create: p, update: {} })).id;
  const clona = pa['Clonazepam']!, clob = pa['Clobazam']!;
  await prisma.parLasa.upsert({ where: { aId_bId: { aId: clona, bId: clob } }, create: { aId: clona, bId: clob, nota: 'Se parecen al escribir' }, update: {} });

  const productos = [
    ['Acetaminofén', 'Lab. Orinoco', 'Acetaminofén', '500 mg', 'Tabletas', 10, 0.85, 'GENERICO', 30],
    ['Atamel', 'Lab. nacional', 'Acetaminofén', '500 mg', 'Tabletas', 20, 2.35, 'NACIONAL', 18],
    ['Tylenol', 'Importado', 'Acetaminofén', '500 mg', 'Tabletas', 24, 4.9, 'MARCA', 0],
    ['Losartán potásico', 'Lab. Orinoco', 'Losartán potásico', '50 mg', 'Tabletas', 30, 3.2, 'GENERICO', 22],
    ['Cozaar', 'Importado', 'Losartán potásico', '50 mg', 'Tabletas', 30, 11.8, 'MARCA', 0],
    ['Amoxicilina', 'Genéricos Ávila', 'Amoxicilina', '500 mg', 'Cápsulas', 21, 2.2, 'GENERICO', 14],
    ['Ibuprofeno', 'Lab. Orinoco', 'Ibuprofeno', '400 mg', 'Tabletas', 10, 1.05, 'GENERICO', 40],
    ['Clonazepam', 'Lab. nacional', 'Clonazepam', '0,5 mg', 'Tabletas', 30, 3.6, 'NACIONAL', 10],
  ] as const;
  for (const [nombre, lab, principio, conc, forma, uds, precio, nivel, stock] of productos) {
    const existe = await prisma.producto.findFirst({ where: { nombreComercial: nombre, laboratorio: lab, concentracion: conc } });
    if (existe) continue;
    const p = await prisma.producto.create({
      data: { nombreComercial: nombre, laboratorio: lab, principioActivoId: pa[principio]!, concentracion: conc, forma, unidadesPorCaja: uds, precioUsd: precio, nivel, requiereRecipe: principio === 'Amoxicilina' || principio === 'Clonazepam' },
    });
    if (stock) await prisma.lote.create({ data: { productoId: p.id, numero: `DEMO-${p.id.slice(0, 6)}`, vence: new Date(Date.now() + 240 * 86_400_000), stockLibre: stock } });
  }
  console.log('Catálogo de ejemplo cargado.');
}

main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
