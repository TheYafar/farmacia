import { BadRequestException, Controller, Delete, Get, HttpCode, Inject, Injectable, Logger, Module, NotFoundException, Param, ParseUUIDPipe, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Cron } from '@nestjs/schedule';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { CONFIG, type Config } from '../config';
import { Publico, Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { tipoImagen } from '../recipes/recipes';

/** La app achica la foto antes de mandarla (unos 100 KB); esto es solo un tope. */
const MAX_FOTO = 3 * 1024 * 1024;
/** Nombre que genera el servidor: nunca se usa el del archivo que subió el usuario. */
const NOMBRE = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

@Injectable()
export class FotosService {
  private readonly log = new Logger('Fotos');
  constructor(private readonly prisma: PrismaService, @Inject(CONFIG) private readonly config: Config) {}

  carpeta() { return resolve(this.config.UPLOAD_DIR, 'productos'); }

  async guardar(buffer: Buffer) {
    const tipo = tipoImagen(buffer);
    if (!tipo) throw new BadRequestException('La foto debe ser JPG, PNG o WEBP');
    const nombre = `${randomUUID()}.${tipo.ext}`;
    await mkdir(this.carpeta(), { recursive: true, mode: 0o755 });
    await writeFile(resolve(this.carpeta(), nombre), buffer, { mode: 0o644 });
    return nombre;
  }

  async borrar(nombre: string | null) {
    if (nombre && NOMBRE.test(nombre)) await unlink(resolve(this.carpeta(), nombre)).catch(() => undefined);
  }

  /**
   * Cada noche se borran las fotos que ya no usa ningún producto (de la farmacia ni de las copias de la demo),
   * con más de un día, para no llenar el disco.
   */
  @Cron('30 4 * * *')
  async limpiar() {
    let archivos: string[];
    try { archivos = (await readdir(this.carpeta())).filter((a) => NOMBRE.test(a)); } catch { return; }
    if (!archivos.length) return;
    const esquemas = await this.prisma.$queryRaw<{ s: string }[]>`SELECT table_schema AS s FROM information_schema.columns WHERE table_name = 'Producto' AND column_name = 'foto'`;
    const usadas = new Set<string>();
    for (const { s } of esquemas) {
      if (!/^[a-z0-9_]+$/.test(s)) continue;
      const filas = await this.prisma.$queryRawUnsafe<{ foto: string }[]>(`SELECT foto FROM "${s}"."Producto" WHERE foto IS NOT NULL`);
      filas.forEach((f) => usadas.add(f.foto));
    }
    let n = 0;
    for (const a of archivos) {
      if (usadas.has(a)) continue;
      const st = await stat(resolve(this.carpeta(), a)).catch(() => null);
      if (st && Date.now() - st.mtimeMs > 86_400_000) { await this.borrar(a); n++; }
    }
    if (n) this.log.log(`${n} fotos sin usar borradas`);
  }
}

@Controller()
export class FotosController {
  constructor(private readonly fotos: FotosService, private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService) {}

  /** Poner o cambiar la foto de un producto. */
  @Post('catalogo/productos/:id/foto')
  @Roles('REGENTE', 'ADMIN')
  @UseInterceptors(FileInterceptor('foto', { limits: { fileSize: MAX_FOTO, files: 1 } }))
  async poner(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() archivo: Express.Multer.File | undefined, @Usuario() u: UsuarioActual) {
    if (!archivo) throw new BadRequestException('Falta la foto');
    const antes = await this.prisma.producto.findUnique({ where: { id }, select: { foto: true } });
    if (!antes) throw new NotFoundException('Producto no encontrado');
    const foto = await this.fotos.guardar(archivo.buffer);
    await this.prisma.producto.update({ where: { id }, data: { foto } });
    await this.fotos.borrar(antes.foto);
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'PRODUCTO_FOTO', entidad: 'Producto', entidadId: id });
    return { foto };
  }

  @Delete('catalogo/productos/:id/foto')
  @Roles('REGENTE', 'ADMIN')
  @HttpCode(204)
  async quitar(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    const antes = await this.prisma.producto.findUnique({ where: { id }, select: { foto: true } });
    if (!antes) throw new NotFoundException('Producto no encontrado');
    await this.prisma.producto.update({ where: { id }, data: { foto: null } });
    await this.fotos.borrar(antes.foto);
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'PRODUCTO_FOTO_QUITADA', entidad: 'Producto', entidadId: id });
  }

  /**
   * Ver la foto. Es pública (va en etiquetas <img>, que no llevan la sesión): son fotos de cajas de medicina,
   * no datos privados, y el nombre es aleatorio. Cambia con cada foto nueva, así que se puede guardar en caché.
   */
  @Publico()
  @Get('fotos/:archivo')
  async ver(@Param('archivo') archivo: string, @Res({ passthrough: true }) res: Response) {
    if (!NOMBRE.test(archivo)) throw new NotFoundException('Foto no encontrada');
    const ruta = resolve(this.fotos.carpeta(), archivo);
    if (!(await stat(ruta).catch(() => null))) throw new NotFoundException('Foto no encontrada');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(createReadStream(ruta), { type: MIME[archivo.split('.').pop()!] });
  }
}

@Module({ providers: [FotosService], controllers: [FotosController] })
export class FotosModule {}
