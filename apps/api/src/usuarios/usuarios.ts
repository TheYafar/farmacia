import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { crearUsuarioSchema, type CrearUsuarioInput } from '@farmacia/shared';
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
