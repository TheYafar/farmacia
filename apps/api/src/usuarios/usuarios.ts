import { BadRequestException, Body, Controller, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { crearUsuarioSchema, editarUsuarioSchema, type CrearUsuarioInput, type EditarUsuarioInput } from '@farmacia/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';
import { cifrarClave } from '../auth/auth';

const campos = { id: true, nombre: true, usuario: true, rol: true, activo: true, bloqueadoHasta: true, creadoEn: true } as const;
const claveSchema = z.object({ clave: crearUsuarioSchema.shape.clave });

/** Solo el dueño administra usuarios. La clave nunca sale del servidor. */
@Controller('usuarios')
@Roles('ADMIN')
export class UsuariosController {
  constructor(private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService) {}

  @Get()
  listar() {
    return this.prisma.usuario.findMany({ select: campos, orderBy: { nombre: 'asc' } });
  }

  @Post()
  async crear(@Body(new Validar(crearUsuarioSchema)) b: CrearUsuarioInput, @Usuario() yo: UsuarioActual) {
    const u = await this.prisma.usuario.create({
      data: { nombre: b.nombre, usuario: b.usuario, rol: b.rol, claveHash: await cifrarClave(b.clave) },
      select: campos,
    });
    await this.auditoria.registrar({ usuarioId: yo.id, accion: 'USUARIO_CREADO', entidad: 'Usuario', entidadId: u.id, datos: { rol: u.rol } });
    return u;
  }

  /** Cambia nombre o rol. Al cambiar el rol se cierran sus sesiones para que entre con los permisos nuevos. */
  @Patch(':id')
  async editar(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(editarUsuarioSchema)) b: EditarUsuarioInput, @Usuario() yo: UsuarioActual) {
    const antes = await this.prisma.usuario.findUnique({ where: { id } });
    if (!antes) throw new NotFoundException('El usuario no existe');
    if (b.rol && b.rol !== 'ADMIN' && antes.rol === 'ADMIN') {
      if (id === yo.id) throw new BadRequestException('No puedes quitarte el rol de dueño a ti mismo');
      const otros = await this.prisma.usuario.count({ where: { rol: 'ADMIN', activo: true, id: { not: id } } });
      if (!otros) throw new BadRequestException('Debe quedar al menos un dueño activo');
    }
    const cambiaRol = !!b.rol && b.rol !== antes.rol;
    const [u] = await this.prisma.$transaction([
      this.prisma.usuario.update({ where: { id }, data: b, select: campos }),
      ...(cambiaRol ? [this.prisma.sesion.updateMany({ where: { usuarioId: id, revocadaEn: null }, data: { revocadaEn: new Date() } })] : []),
    ]);
    await this.auditoria.registrar({ usuarioId: yo.id, accion: 'USUARIO_EDITADO', entidad: 'Usuario', entidadId: id, datos: { antes: { nombre: antes.nombre, rol: antes.rol }, cambios: b } });
    return u;
  }

  /** Desactiva y cierra todas sus sesiones al instante. */
  @Post(':id/desactivar')
  @HttpCode(204)
  async desactivar(@Param('id', ParseUUIDPipe) id: string, @Usuario() yo: UsuarioActual) {
    await this.prisma.$transaction([
      this.prisma.usuario.update({ where: { id }, data: { activo: false } }),
      this.prisma.sesion.updateMany({ where: { usuarioId: id, revocadaEn: null }, data: { revocadaEn: new Date() } }),
    ]);
    await this.auditoria.registrar({ usuarioId: yo.id, accion: 'USUARIO_DESACTIVADO', entidad: 'Usuario', entidadId: id });
  }

  @Post(':id/activar')
  @HttpCode(204)
  async activar(@Param('id', ParseUUIDPipe) id: string, @Usuario() yo: UsuarioActual) {
    await this.prisma.usuario.update({ where: { id }, data: { activo: true, bloqueadoHasta: null, intentosFallidos: 0 } });
    await this.auditoria.registrar({ usuarioId: yo.id, accion: 'USUARIO_ACTIVADO', entidad: 'Usuario', entidadId: id });
  }

  /** Cambia la clave y cierra las sesiones abiertas con la clave anterior. */
  @Patch(':id/clave')
  @HttpCode(204)
  async cambiarClave(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(claveSchema)) b: { clave: string }, @Usuario() yo: UsuarioActual) {
    await this.prisma.$transaction([
      this.prisma.usuario.update({ where: { id }, data: { claveHash: await cifrarClave(b.clave), intentosFallidos: 0, bloqueadoHasta: null } }),
      this.prisma.sesion.updateMany({ where: { usuarioId: id, revocadaEn: null }, data: { revocadaEn: new Date() } }),
    ]);
    await this.auditoria.registrar({ usuarioId: yo.id, accion: 'CLAVE_CAMBIADA', entidad: 'Usuario', entidadId: id });
  }
}

@Module({ controllers: [UsuariosController] })
export class UsuariosModule {}
