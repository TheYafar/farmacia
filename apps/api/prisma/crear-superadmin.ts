/**
 * Crea (o reactiva) el usuario super admin del panel central, con una clave aleatoria.
 * Solo se puede correr dentro del servidor:  ./infra/crear-superadmin.sh usuario "Nombre"
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { cifrarClave } from '../src/auth/auth';

async function main() {
  const usuario = process.argv[2]?.trim().toLowerCase();
  const nombre = process.argv[3]?.trim() || 'Super admin';
  if (!usuario || !/^[a-z0-9._-]{3,40}$/.test(usuario)) throw new Error('Uso: crear-superadmin <usuario> ["Nombre"]');
  const prisma = new PrismaClient();
  const clave = randomBytes(12).toString('base64url');
  const existe = await prisma.usuario.findUnique({ where: { usuario } });
  if (existe && existe.rol !== 'SUPERADMIN') throw new Error(`«${usuario}» ya existe y es de la farmacia. Usa otro nombre de usuario`);
  const u = await prisma.usuario.upsert({
    where: { usuario },
    update: { claveHash: await cifrarClave(clave), activo: true, intentosFallidos: 0, bloqueadoHasta: null },
    create: { usuario, nombre, rol: 'SUPERADMIN', claveHash: await cifrarClave(clave) },
  });
  await prisma.sesion.updateMany({ where: { usuarioId: u.id, revocadaEn: null }, data: { revocadaEn: new Date() } });
  await prisma.auditoria.create({ data: { usuarioId: u.id, accion: 'SUPERADMIN_CREADO_EN_SERVIDOR', entidad: 'Usuario', entidadId: u.id } });
  await prisma.$disconnect();
  console.log(`Listo. Panel central:\n  Usuario: ${usuario}\n  Clave:   ${clave}\nGuárdala; no se vuelve a mostrar. Cámbiala activando la clave de dos pasos al entrar.`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
