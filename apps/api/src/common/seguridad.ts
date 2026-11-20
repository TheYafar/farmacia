import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata, UnauthorizedException, ForbiddenException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Rol } from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface UsuarioActual {
  id: string;
  rol: Rol;
  sesionId: string;
  nombre: string;
}

export interface RequestConUsuario extends Request {
  usuario?: UsuarioActual;
}

const PUBLICO = 'publico';
const ROLES = 'roles';

/** La ruta no necesita sesión (login, salud). Todo lo demás está cerrado por defecto. */
export const Publico = () => SetMetadata(PUBLICO, true);

/** Solo estos roles pueden usar la ruta. Sin este decorador, cualquier usuario con sesión. */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES, roles);

export const Usuario = createParamDecorator((_: unknown, ctx: ExecutionContext): UsuarioActual => {
  const req = ctx.switchToHttp().getRequest<RequestConUsuario>();
  if (!req.usuario) throw new UnauthorizedException();
  return req.usuario;
});

/**
 * Guardia global: verifica el token, que la sesión siga activa, que el usuario siga activo
 * y que su rol pueda usar la ruta. Se revisa la base de datos en cada petición para que
 * desactivar a alguien o cerrar su sesión tenga efecto inmediato.
 */
@Injectable()
export class GuardiaAcceso implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, objetivos)) return true;

    const req = ctx.switchToHttp().getRequest<RequestConUsuario>();
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Inicia sesión');

    let datos: { sub: string; sid: string };
    try {
      datos = await this.jwt.verifyAsync(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('La sesión venció. Vuelve a entrar');
    }

    const sesion = await this.prisma.sesion.findUnique({
      where: { id: datos.sid },
      include: { usuario: { select: { id: true, rol: true, nombre: true, activo: true } } },
    });
    if (!sesion || sesion.revocadaEn || sesion.expira < new Date() || sesion.usuarioId !== datos.sub || !sesion.usuario.activo) {
      throw new UnauthorizedException('La sesión ya no es válida. Vuelve a entrar');
    }
    req.usuario = { id: sesion.usuario.id, rol: sesion.usuario.rol, nombre: sesion.usuario.nombre, sesionId: sesion.id };

    const permitidos = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES, objetivos);
    if (permitidos && !permitidos.includes(req.usuario.rol)) {
      throw new ForbiddenException('Tu usuario no tiene permiso para esto');
    }
    return true;
  }
}
