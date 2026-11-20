/**
 * Emergencia: quita la clave de dos pasos de un usuario (por ejemplo, si el dueño perdió el teléfono).
 * Solo se puede correr dentro del servidor:  ./infra/quitar-dos-pasos.sh usuario
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const usuario = process.argv[2]?.trim().toLowerCase();
  if (!usuario) throw new Error('Uso: quitar-2fa <usuario>');
  const prisma = new PrismaClient();
  const u = await prisma.usuario.findUnique({ where: { usuario } });
  if (!u) throw new Error(`No existe el usuario «${usuario}»`);
  await prisma.usuario.update({ where: { id: u.id }, data: { totpActivo: false, totpSecreto: null, intentosFallidos: 0, bloqueadoHasta: null } });
  await prisma.auditoria.create({ data: { usuarioId: u.id, accion: '2FA_QUITADO_EN_SERVIDOR', entidad: 'Usuario', entidadId: u.id } });
  await prisma.$disconnect();
  console.log(`Listo: ${u.nombre} (${usuario}) ya puede entrar solo con su clave. Vuelve a activar la clave de dos pasos desde Usuarios.`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
