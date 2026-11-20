import { Body, Controller, ForbiddenException, Get, HttpCode, Inject, Injectable, Module, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { codigo2faSchema, loginSchema, type LoginInput } from '@farmacia/shared';
import { cifrar, descifrar, nuevoSecreto, urlTotp, verificarCodigo } from '../common/totp';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { CONFIG, type Config } from '../config';
import { Publico, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';

const COOKIE = 'farm_rt';
const RUTA_COOKIE = '/api/v1/auth';

/** Parámetros de Argon2id recomendados por OWASP (19 MiB, 2 pasadas). */
export const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const cifrarClave = (clave: string) => argon2.hash(clave, ARGON);

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class AuthService {
  /** Hash falso para que un usuario inexistente tarde lo mismo que uno real (no revela qué usuarios existen). */
  private hashFalso = cifrarClave(randomBytes(16).toString('hex'));

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auditoria: AuditoriaService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  async login({ usuario, clave, codigo }: LoginInput, ip?: string, agente?: string) {
    const u = await this.prisma.usuario.findUnique({ where: { usuario } });
    const valida = await argon2.verify(u?.claveHash ?? (await this.hashFalso), clave);

    if (!u || !u.activo) throw new UnauthorizedException('Usuario o clave incorrectos');
    if (u.bloqueadoHasta && u.bloqueadoHasta > new Date()) {
      throw new ForbiddenException('Usuario bloqueado por intentos fallidos. Espera unos minutos o pide al dueño que lo desbloquee');
    }
    if (!valida) {
      const intentos = u.intentosFallidos + 1;
      const bloquear = intentos >= this.config.MAX_INTENTOS_LOGIN;
      await this.prisma.usuario.update({
        where: { id: u.id },
        data: { intentosFallidos: bloquear ? 0 : intentos, bloqueadoHasta: bloquear ? new Date(Date.now() + this.config.BLOQUEO_MINUTOS * 60_000) : undefined },
      });
      if (bloquear) await this.auditoria.registrar({ usuarioId: u.id, accion: 'USUARIO_BLOQUEADO', entidad: 'Usuario', entidadId: u.id, ip });
      throw new UnauthorizedException('Usuario o clave incorrectos');
    }

    // Clave de dos pasos: además de la clave, el código de 6 números de la app del teléfono.
    if (u.totpActivo && u.totpSecreto) {
      if (!codigo) throw new UnauthorizedException({ mensaje: 'Escribe el código de 6 números de tu app de autenticación', codigo: 'REQUIERE_2FA' });
      if (!verificarCodigo(descifrar(u.totpSecreto, this.config.JWT_SECRET), codigo)) {
        await this.prisma.usuario.update({ where: { id: u.id }, data: { intentosFallidos: { increment: 1 } } });
        throw new UnauthorizedException({ mensaje: 'Código incorrecto', codigo: 'REQUIERE_2FA' });
      }
    }

    await this.prisma.usuario.update({ where: { id: u.id }, data: { intentosFallidos: 0, bloqueadoHasta: null } });
    const refresh = randomBytes(32).toString('base64url');
    const sesion = await this.prisma.sesion.create({
      data: { usuarioId: u.id, refreshHash: sha256(refresh), expira: this.venceSesion(), ip, agente: agente?.slice(0, 200) },
    });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'LOGIN', entidad: 'Sesion', entidadId: sesion.id, ip });
    return { refresh, ...(await this.respuesta(u.id, sesion.id)) };
  }

  /**
   * Cambia el token de renovación por uno nuevo cada vez (rotación).
   * Si alguien usa un token viejo, es señal de robo: se cierran todas las sesiones del usuario.
   */
  async renovar(refresh: string | undefined) {
    if (!refresh) throw new UnauthorizedException('Inicia sesión');
    const hash = sha256(refresh);
    const sesion = await this.prisma.sesion.findFirst({ where: { refreshHash: hash } });
    if (!sesion) {
      const robada = await this.prisma.auditoria.findFirst({ where: { accion: 'TOKEN_ROTADO', datos: { equals: { hash } } } });
      if (robada?.usuarioId) {
        await this.prisma.sesion.updateMany({ where: { usuarioId: robada.usuarioId, revocadaEn: null }, data: { revocadaEn: new Date() } });
        await this.auditoria.registrar({ usuarioId: robada.usuarioId, accion: 'TOKEN_REUTILIZADO_SESIONES_CERRADAS', entidad: 'Sesion' });
      }
      throw new UnauthorizedException('La sesión ya no es válida. Vuelve a entrar');
    }
    if (sesion.revocadaEn || sesion.expira < new Date()) throw new UnauthorizedException('La sesión venció. Vuelve a entrar');

    const nuevo = randomBytes(32).toString('base64url');
    await this.prisma.sesion.update({ where: { id: sesion.id }, data: { refreshHash: sha256(nuevo), expira: this.venceSesion() } });
    await this.auditoria.registrar({ usuarioId: sesion.usuarioId, accion: 'TOKEN_ROTADO', entidad: 'Sesion', entidadId: sesion.id, datos: { hash } });
    return { refresh: nuevo, ...(await this.respuesta(sesion.usuarioId, sesion.id)) };
  }

  async cerrar(sesionId: string) {
    await this.prisma.sesion.update({ where: { id: sesionId }, data: { revocadaEn: new Date() } });
  }

  private venceSesion() {
    return new Date(Date.now() + this.config.SESION_DIAS * 86_400_000);
  }

  /** Genera un secreto nuevo (todavía inactivo) para escanear con la app. */
  async iniciar2fa(u: UsuarioActual) {
    const secreto = nuevoSecreto();
    const usr = await this.prisma.usuario.update({ where: { id: u.id }, data: { totpSecreto: cifrar(secreto, this.config.JWT_SECRET), totpActivo: false } });
    return { secreto, url: urlTotp(secreto, usr.usuario, this.config.FARMACIA_NOMBRE) };
  }

  async cambiar2fa(u: UsuarioActual, codigo: string, activo: boolean) {
    const usr = await this.prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
    if (!usr.totpSecreto || !verificarCodigo(descifrar(usr.totpSecreto, this.config.JWT_SECRET), codigo)) throw new UnauthorizedException('Código incorrecto');
    await this.prisma.usuario.update({ where: { id: u.id }, data: activo ? { totpActivo: true } : { totpActivo: false, totpSecreto: null } });
    await this.auditoria.registrar({ usuarioId: u.id, accion: activo ? '2FA_ACTIVADO' : '2FA_DESACTIVADO', entidad: 'Usuario', entidadId: u.id });
    return { activo };
  }

  async tiene2fa(id: string) {
    return (await this.prisma.usuario.findUniqueOrThrow({ where: { id }, select: { totpActivo: true } })).totpActivo;
  }

  private async respuesta(usuarioId: string, sesionId: string) {
    const u = await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: { id: true, nombre: true, usuario: true, rol: true } });
    const accessToken = await this.jwt.signAsync({ sub: u.id, sid: sesionId, rol: u.rol }, { expiresIn: `${this.config.ACCESS_TOKEN_MINUTOS}m`, algorithm: 'HS256' });
    return { accessToken, usuario: u };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, @Inject(CONFIG) private readonly config: Config) {}

  /** Máximo 5 intentos por minuto desde una misma dirección, además del bloqueo por usuario. */
  @Publico()
  @Throttle({ default: { limit: () => Number(process.env.LIMITE_LOGIN_POR_MINUTO ?? 5), ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body(new Validar(loginSchema)) body: LoginInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { refresh, ...r } = await this.auth.login(body, req.ip, req.headers['user-agent']);
    this.ponerCookie(res, refresh);
    return r;
  }

  @Publico()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('renovar')
  @HttpCode(200)
  async renovar(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.verificarOrigen(req);
    const { refresh, ...r } = await this.auth.renovar(req.cookies?.[COOKIE]);
    this.ponerCookie(res, refresh);
    return r;
  }

  @Post('salir')
  @HttpCode(204)
  async salir(@Usuario() u: UsuarioActual, @Res({ passthrough: true }) res: Response) {
    await this.auth.cerrar(u.sesionId);
    res.clearCookie(COOKIE, { path: RUTA_COOKIE });
  }

  @Get('yo')
  async yo(@Usuario() u: UsuarioActual) {
    return { id: u.id, nombre: u.nombre, rol: u.rol, dosPasos: await this.auth.tiene2fa(u.id) };
  }

  @Post('2fa/iniciar')
  @HttpCode(200)
  iniciar2fa(@Usuario() u: UsuarioActual) {
    return this.auth.iniciar2fa(u);
  }

  @Post('2fa/activar')
  @HttpCode(200)
  activar2fa(@Body(new Validar(codigo2faSchema)) b: { codigo: string }, @Usuario() u: UsuarioActual) {
    return this.auth.cambiar2fa(u, b.codigo, true);
  }

  @Post('2fa/desactivar')
  @HttpCode(200)
  desactivar2fa(@Body(new Validar(codigo2faSchema)) b: { codigo: string }, @Usuario() u: UsuarioActual) {
    return this.auth.cambiar2fa(u, b.codigo, false);
  }

  private ponerCookie(res: Response, valor: string) {
    res.cookie(COOKIE, valor, {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'strict',
      path: RUTA_COOKIE,
      maxAge: this.config.SESION_DIAS * 86_400_000,
    });
  }

  /** La renovación usa una cookie: solo se acepta desde la app propia (protección contra CSRF). */
  private verificarOrigen(req: Request) {
    const origen = req.headers.origin;
    if (origen && !this.config.corsOrigins.includes(origen)) throw new ForbiddenException('Origen no permitido');
  }
}

@Module({ providers: [AuthService], controllers: [AuthController] })
export class AuthModule {}
