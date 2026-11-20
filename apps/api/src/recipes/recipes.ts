import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Injectable, Logger, Module, NotFoundException, Param, ParseUUIDPipe, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Prisma } from '@prisma/client';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { Cron } from '@nestjs/schedule';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { medicoSchema, normalizarCedula, validarRecipeSchema, type MedicoInput, type ValidarRecipeInput } from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { CONFIG, type Config } from '../config';
import { Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';

export const MAX_BYTES = 5 * 1024 * 1024;

/** Reconoce la imagen por sus primeros bytes, no por el nombre ni por lo que dice el navegador. */
export function tipoImagen(b: Buffer): { mime: string; ext: string } | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export interface LineaLeida { texto: string; confianza: number; candidatos: string[] }

/**
 * Quién lee la letra del récipe. La IA solo identifica molécula, concentración y presentación
 * y las cruza con el catálogo; nunca calcula dosis. La implementación con IA llega en la fase 3.
 */
export abstract class LectorRecipes {
  abstract leer(imagen: Buffer, mime: string): Promise<LineaLeida[] | null>;
}
class SinLector extends LectorRecipes {
  async leer() { return null; }
}

@Injectable()
export class RecipesService {
  private readonly log = new Logger('Recipes');
  constructor(
    private readonly prisma: PrismaService,
    private readonly lector: LectorRecipes,
    private readonly auditoria: AuditoriaService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  async subir(archivo: Express.Multer.File | undefined, cedulaEntrada: string | undefined, u: UsuarioActual) {
    if (!archivo) throw new BadRequestException('Falta la foto del récipe');
    const tipo = tipoImagen(archivo.buffer);
    if (!tipo) throw new BadRequestException('La foto debe ser JPG, PNG o WEBP');
    const cedula = cedulaEntrada ? normalizarCedula(cedulaEntrada) : null;
    if (cedulaEntrada && !cedula) throw new BadRequestException('Cédula inválida');

    // Nombre generado por el servidor: el nombre original nunca se usa (evita rutas maliciosas).
    const hoy = new Date();
    const relativa = join(String(hoy.getFullYear()), String(hoy.getMonth() + 1).padStart(2, '0'), `${randomUUID()}.${tipo.ext}`);
    const absoluta = resolve(this.config.UPLOAD_DIR, relativa);
    await mkdir(resolve(absoluta, '..'), { recursive: true, mode: 0o700 });
    await writeFile(absoluta, archivo.buffer, { mode: 0o600 });

    let lectura: LineaLeida[] | null = null;
    try {
      lectura = await this.lector.leer(archivo.buffer, tipo.mime);
    } catch (e) {
      this.log.error(`La lectura automática falló: ${(e as Error).message}`);
    }
    const r = await this.prisma.recipe.create({
      data: { cedula, archivo: relativa, tipoArchivo: tipo.mime, lecturaIa: (lectura ?? undefined) as Prisma.InputJsonValue | undefined, creadoPorId: u.id },
    });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'RECIPE_SUBIDO', entidad: 'Recipe', entidadId: r.id });
    return r;
  }

  /** Privacidad: cada noche borra las fotos de récipes más viejas que el plazo de retención (los datos se conservan). */
  @Cron('30 3 * * *')
  async borrarVencidas() {
    const c = await this.prisma.configuracion.findUnique({ where: { id: 1 } });
    const dias = c?.recipeRetencionDias ?? 730;
    const limite = new Date(Date.now() - dias * 86_400_000);
    const viejas = await this.prisma.recipe.findMany({ where: { creadoEn: { lt: limite }, fotoBorradaEn: null }, select: { id: true, archivo: true }, take: 500 });
    for (const r of viejas) {
      await unlink(this.rutaArchivo(r.archivo)).catch(() => {});
      await this.prisma.recipe.update({ where: { id: r.id }, data: { fotoBorradaEn: new Date() } });
    }
    if (viejas.length) {
      this.log.log(`Privacidad: ${viejas.length} fotos de récipes borradas (más de ${dias} días)`);
      await this.auditoria.registrar({ accion: 'FOTOS_RECIPE_BORRADAS', entidad: 'Recipe', datos: { cantidad: viejas.length, dias } });
    }
    return viejas.length;
  }

  rutaArchivo(relativa: string) {
    const base = resolve(this.config.UPLOAD_DIR);
    const ruta = resolve(base, relativa);
    if (!ruta.startsWith(base)) throw new NotFoundException();
    return ruta;
  }
}

@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipes: RecipesService, private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService) {}

  @Post()
  @UseInterceptors(FileInterceptor('foto', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  subir(@UploadedFile() foto: Express.Multer.File | undefined, @Body('cedula') cedula: string | undefined, @Usuario() u: UsuarioActual) {
    return this.recipes.subir(foto, cedula, u);
  }

  @Get('pendientes')
  @Roles('REGENTE', 'ADMIN')
  pendientes() {
    return this.prisma.recipe.findMany({
      where: { estado: 'PENDIENTE' },
      orderBy: { creadoEn: 'asc' },
      include: { paciente: { select: { nombre: true, alergias: true } }, creadoPor: { select: { nombre: true } } },
    });
  }

  @Get(':id')
  async ver(@Param('id', ParseUUIDPipe) id: string) {
    const r = await this.prisma.recipe.findUnique({ where: { id }, include: { paciente: { select: { nombre: true, alergias: true } }, medico: true } });
    if (!r) throw new NotFoundException('El récipe no existe');
    return r;
  }

  /** La foto solo se entrega a usuarios con sesión, nunca queda en caché ni en una dirección pública. */
  @Get(':id/foto')
  async foto(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const r = await this.prisma.recipe.findUnique({ where: { id }, select: { archivo: true, tipoArchivo: true, fotoBorradaEn: true } });
    if (!r) throw new NotFoundException('El récipe no existe');
    if (r.fotoBorradaEn) throw new NotFoundException('La foto se borró al cumplir el plazo de privacidad');
    res.set({ 'Content-Type': r.tipoArchivo, 'Cache-Control': 'private, no-store' });
    return new StreamableFile(createReadStream(this.recipes.rutaArchivo(r.archivo)));
  }

  @Post(':id/validar')
  @Roles('REGENTE', 'ADMIN')
  async validar(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(validarRecipeSchema)) b: ValidarRecipeInput, @Usuario() u: UsuarioActual) {
    const r = await this.prisma.recipe.updateMany({
      where: { id, estado: 'PENDIENTE' },
      data: { estado: b.aprobado ? 'VALIDADO' : 'RECHAZADO', confirmados: b.confirmados, nota: b.nota, validadoPorId: u.id, validadoEn: new Date() },
    });
    if (!r.count) throw new ConflictException('Este récipe ya fue revisado');
    await this.auditoria.registrar({ usuarioId: u.id, accion: b.aprobado ? 'RECIPE_VALIDADO' : 'RECIPE_RECHAZADO', entidad: 'Recipe', entidadId: id, datos: { confirmados: b.confirmados } });
    return this.prisma.recipe.findUnique({ where: { id } });
  }

  /** Anota el médico del récipe (va al libro de controlados). Si tiene MPPS, se reutiliza el mismo médico. */
  @Post(':id/medico')
  @Roles('REGENTE', 'ADMIN')
  async medico(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(medicoSchema)) b: MedicoInput, @Usuario() u: UsuarioActual) {
    if (!(await this.prisma.recipe.findUnique({ where: { id } }))) throw new NotFoundException('El récipe no existe');
    const m = b.mpps
      ? await this.prisma.medico.upsert({ where: { mpps: b.mpps }, create: b, update: { nombre: b.nombre, especialidad: b.especialidad } })
      : await this.prisma.medico.create({ data: b });
    await this.prisma.recipe.update({ where: { id }, data: { medicoId: m.id } });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'RECIPE_MEDICO', entidad: 'Recipe', entidadId: id, datos: { medico: m.nombre, mpps: m.mpps } });
    return m;
  }

  /** Médicos ya registrados, para sugerirlos al escribir. */
  @Get('medicos/lista')
  @Roles('REGENTE', 'ADMIN')
  medicos() {
    return this.prisma.medico.findMany({ orderBy: { nombre: 'asc' }, take: 500 });
  }
}

@Module({ providers: [RecipesService, { provide: LectorRecipes, useClass: SinLector }], controllers: [RecipesController] })
export class RecipesModule {}
