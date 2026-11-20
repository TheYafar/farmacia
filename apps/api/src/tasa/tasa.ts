import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Injectable, Logger, Module, Post, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { configuracionGeneralSchema, tasaSchema, type ConfiguracionGeneralInput, type TasaInput } from '@farmacia/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { CONFIG, type Config } from '../config';
import { Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const num = (v: Prisma.Decimal | number) => Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface LecturaBcv { usd: number; eur: number; fecha: Date | null; origen: string }

/** Convierte «918,76620000» en 918.7662. */
const numeroVe = (s: string) => Number(s.trim().replace(/\./g, '').replace(',', '.'));

/**
 * Lee la tasa oficial del BCV. El BCV no tiene una API pública: se lee su página (bcv.org.ve, cuadros «dolar» y «euro»).
 * Si la página falla (es frecuente: certificado incompleto o caída), se usa ve.dolarapi.com, que publica la misma tasa oficial del BCV.
 */
export async function leerBcv(f: typeof fetch = fetch): Promise<LecturaBcv> {
  const errores: string[] = [];
  try {
    const r = await f('https://www.bcv.org.ve/', { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'Mozilla/5.0 (farmacia)' } });
    const html = await r.text();
    const cuadro = (id: string) => html.match(new RegExp(`id="${id}"[\\s\\S]*?<strong>\\s*([\\d.,]+)\\s*</strong>`))?.[1];
    const usd = cuadro('dolar'), eur = cuadro('euro');
    const fecha = html.match(/content="(\d{4}-\d{2}-\d{2})T/)?.[1];
    if (usd && eur && numeroVe(usd) > 0) return { usd: numeroVe(usd), eur: numeroVe(eur), fecha: fecha ? new Date(`${fecha}T00:00:00-04:00`) : null, origen: 'bcv.org.ve' };
    errores.push('bcv.org.ve: no se encontró la tasa en la página');
  } catch (e) {
    errores.push(`bcv.org.ve: ${(e as Error).message}`);
  }
  try {
    const [u, e] = await Promise.all(['dolares', 'euros'].map(async (m) => {
      const r = await f(`https://ve.dolarapi.com/v1/${m}/oficial`, { signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as { promedio: number; fechaActualizacion?: string };
    }));
    if (u!.promedio > 0 && e!.promedio > 0) return { usd: u!.promedio, eur: e!.promedio, fecha: u!.fechaActualizacion ? new Date(u!.fechaActualizacion) : null, origen: 'BCV vía ve.dolarapi.com' };
    errores.push('dolarapi: respuesta sin tasa');
  } catch (e) {
    errores.push(`dolarapi: ${(e as Error).message}`);
  }
  throw new ServiceUnavailableException(`No se pudo leer la tasa del BCV (${errores.join(' · ')}). Escríbela a mano mientras tanto.`);
}

@Injectable()
export class TasaService {
  private readonly log = new Logger('Tasa');
  constructor(private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService, @Inject(CONFIG) private readonly config: Config) {}

  async actual(cliente: Prisma.TransactionClient | PrismaService = this.prisma) {
    const t = await cliente.tasaCambio.findFirst({ where: { creadaEn: { lte: new Date() } }, orderBy: { creadaEn: 'desc' } });
    if (!t) throw new ServiceUnavailableException('Falta cargar la tasa del dólar de hoy');
    return t;
  }

  configuracion() {
    return this.prisma.configuracion.upsert({ where: { id: 1 }, create: {}, update: {} });
  }

  /** Aplica el ajuste de la farmacia (+ Bs o + %) a la tasa del BCV. */
  static calcular(c: { tasaModo: string; tasaAjusteTipo: string; tasaAjusteValor: Prisma.Decimal; bcvUsd: Prisma.Decimal | null; bcvEur: Prisma.Decimal | null }) {
    const base = c.tasaModo === 'BCV_EUR' ? c.bcvEur : c.bcvUsd;
    if (!base) return null;
    const ajuste = D(c.tasaAjusteValor);
    const valor = c.tasaAjusteTipo === 'BS' ? D(base).add(ajuste) : c.tasaAjusteTipo === 'PCT' ? D(base).mul(D(100).add(ajuste)).div(100) : D(base);
    const extra = c.tasaAjusteTipo === 'BS' && !ajuste.isZero() ? ` + ${num(ajuste)} Bs` : c.tasaAjusteTipo === 'PCT' && !ajuste.isZero() ? ` + ${num(ajuste)} %` : '';
    return { valor: valor.toDecimalPlaces(4), fuente: `BCV ${c.tasaModo === 'BCV_EUR' ? 'euro' : 'dólar'} ${num(base)}${extra}` };
  }

  /** Lee el BCV, lo guarda y, si la farmacia usa la tasa automática, registra la tasa nueva cuando cambia. */
  async sincronizar(usuarioId?: string, leer: () => Promise<LecturaBcv> = () => leerBcv()) {
    const l = await leer();
    let c = await this.prisma.configuracion.upsert({
      where: { id: 1 }, create: { bcvUsd: l.usd, bcvEur: l.eur, bcvFecha: l.fecha, bcvConsultado: new Date(), bcvOrigen: l.origen },
      update: { bcvUsd: l.usd, bcvEur: l.eur, bcvFecha: l.fecha, bcvConsultado: new Date(), bcvOrigen: l.origen },
    });
    const nueva = c.tasaModo === 'MANUAL' ? null : await this.aplicar(c, usuarioId);
    c = await this.configuracion();
    return { bcvUsd: l.usd, bcvEur: l.eur, fecha: l.fecha, origen: l.origen, tasa: nueva };
  }

  /** Registra la tasa calculada si es distinta de la vigente. */
  async aplicar(c: Awaited<ReturnType<TasaService['configuracion']>>, usuarioId?: string) {
    const r = TasaService.calcular(c);
    if (!r) return null;
    const vigente = await this.prisma.tasaCambio.findFirst({ where: { creadaEn: { lte: new Date() } }, orderBy: { creadaEn: 'desc' } });
    if (vigente && vigente.valor.equals(r.valor) && vigente.fuente === r.fuente) return { valor: r.valor.toFixed(4), fuente: r.fuente, cambio: false };
    // El BCV publica en la tarde la tasa del día siguiente: se aplica a las 12 de la noche, no a mitad de la jornada
    // (así los precios en bolívares no cambian mientras la farmacia está abierta). Si no hay ninguna tasa, se usa ya.
    if (vigente && c.bcvFecha && c.bcvFecha.getTime() > Date.now()) return { valor: r.valor.toFixed(4), fuente: r.fuente, cambio: false, desde: c.bcvFecha };
    const quien = usuarioId ?? (await this.prisma.usuario.findFirst({ where: { rol: 'ADMIN', activo: true }, orderBy: { creadoEn: 'asc' } }))?.id;
    if (!quien) return null;
    const t = await this.prisma.tasaCambio.create({ data: { valor: r.valor, fuente: r.fuente, creadaPorId: quien } });
    await this.auditoria.registrar({ usuarioId: quien, accion: 'TASA_AUTOMATICA', entidad: 'TasaCambio', entidadId: t.id, datos: { valor: r.valor.toFixed(4), fuente: r.fuente } });
    return { valor: r.valor.toFixed(4), fuente: r.fuente, cambio: true };
  }

  /** Cada 30 minutos revisa el BCV (publica la tasa del día siguiente por la tarde). */
  @Cron('*/30 * * * *')
  async revisar() {
    if (this.config.NODE_ENV === 'test') return;
    const c = await this.configuracion();
    if (c.tasaModo === 'MANUAL') return;
    try { await this.sincronizar(); } catch (e) { this.log.warn((e as Error).message); }
  }
}

@Controller('tasa')
export class TasaController {
  constructor(private readonly tasa: TasaService, private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService) {}

  @Get()
  async actual() {
    const t = await this.tasa.actual();
    return { valor: t.valor.toFixed(4), fuente: t.fuente, creadaEn: t.creadaEn };
  }

  /** Tasa escrita a mano: deja la farmacia en modo manual para que la automática no la reemplace. */
  @Post()
  @Roles('ADMIN')
  async fijar(@Body(new Validar(tasaSchema)) b: TasaInput, @Usuario() yo: UsuarioActual) {
    // Una tasa 3 veces mayor o menor que la actual casi siempre es un error al escribir (un punto o un cero de más).
    const actual = await this.prisma.tasaCambio.findFirst({ where: { creadaEn: { lte: new Date() } }, orderBy: { creadaEn: 'desc' } });
    if (actual && !b.confirmar) {
      const razon = b.valor / actual.valor.toNumber();
      if (razon > 3 || razon < 1 / 3) throw new BadRequestException({ mensaje: `La tasa nueva (${b.valor}) es muy distinta de la actual (${actual.valor.toNumber()}). Revisa que esté bien escrita`, codigo: 'TASA_RARA' });
    }
    const t = await this.prisma.tasaCambio.create({ data: { valor: b.valor, fuente: b.fuente === 'BCV' ? 'Manual' : b.fuente, creadaPorId: yo.id } });
    await this.prisma.configuracion.upsert({ where: { id: 1 }, create: { tasaModo: 'MANUAL' }, update: { tasaModo: 'MANUAL' } });
    await this.auditoria.registrar({ usuarioId: yo.id, accion: 'TASA_CAMBIADA', entidad: 'TasaCambio', entidadId: t.id, datos: { valor: b.valor } });
    return { valor: t.valor.toFixed(4), fuente: t.fuente, creadaEn: t.creadaEn };
  }

  /** Lee el BCV ahora mismo. */
  @Post('bcv')
  @Roles('ADMIN')
  @HttpCode(200)
  bcv(@Usuario() yo: UsuarioActual) {
    return this.tasa.sincronizar(yo.id);
  }
}

/** Configuración de la farmacia: tasa, IGTF, datos del ticket e impresora. */
@Controller('configuracion')
export class ConfiguracionController {
  constructor(private readonly tasa: TasaService, private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService, @Inject(CONFIG) private readonly config: Config) {}

  /** Todos la leen (el cajero la necesita para imprimir); solo el dueño la cambia. */
  @Get()
  async ver() {
    const c = await this.tasa.configuracion();
    const vista = TasaService.calcular(c);
    return {
      ...c,
      igtfPct: c.igtfPct.toNumber(), tasaAjusteValor: c.tasaAjusteValor.toNumber(),
      bcvUsd: c.bcvUsd?.toNumber() ?? null, bcvEur: c.bcvEur?.toNumber() ?? null,
      tasaCalculada: vista ? { valor: vista.valor.toFixed(4), fuente: vista.fuente } : null,
      farmacia: {
        nombre: c.farmaciaNombre || this.config.FARMACIA_NOMBRE, rif: c.farmaciaRif || this.config.FARMACIA_RIF,
        direccion: c.farmaciaDireccion || this.config.FARMACIA_DIRECCION, telefono: c.farmaciaTelefono || this.config.FARMACIA_TELEFONO,
      },
    };
  }

  /** Lista de primeros pasos para una farmacia nueva (el panel la muestra hasta completarla). */
  @Get('primeros-pasos')
  @Roles('ADMIN')
  async primerosPasos() {
    const [c, tasa, productos, conStock, usuarios, turnos, ventas] = await Promise.all([
      this.tasa.configuracion(), this.prisma.tasaCambio.count(), this.prisma.producto.count({ where: { activo: true } }),
      this.prisma.lote.count({ where: { stockLibre: { gt: 0 } } }), this.prisma.usuario.count({ where: { activo: true } }),
      this.prisma.turno.count(), this.prisma.venta.count(),
    ]);
    return {
      datosFarmacia: !!(c.farmaciaNombre && c.farmaciaRif),
      tasa: tasa > 0,
      productos: productos > 0 && conStock > 0,
      usuarios: usuarios > 1,
      caja: turnos > 0,
      venta: ventas > 0,
    };
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(200)
  async guardar(@Body(new Validar(configuracionGeneralSchema)) b: ConfiguracionGeneralInput, @Usuario() yo: UsuarioActual) {
    if (b.tasaModo && b.tasaModo !== 'MANUAL' && b.tasaAjusteTipo === 'PCT' && (b.tasaAjusteValor ?? 0) > 50) throw new BadRequestException('El ajuste no puede pasar de 50 %');
    const c = await this.prisma.configuracion.upsert({ where: { id: 1 }, create: b, update: b });
    await this.auditoria.registrar({ usuarioId: yo.id, accion: 'CONFIGURACION', entidad: 'Configuracion', datos: b as Prisma.InputJsonValue });
    // Al pasar a automática o cambiar el ajuste, se aplica de una vez con la última lectura del BCV.
    let tasa = null;
    if (c.tasaModo !== 'MANUAL') {
      if (!c.bcvUsd) { try { await this.tasa.sincronizar(yo.id); } catch { /* sin conexión: se intentará en 30 min */ } }
      tasa = await this.tasa.aplicar(await this.tasa.configuracion(), yo.id);
    }
    return { ...(await this.ver()), tasaAplicada: tasa };
  }
}

@Module({ providers: [TasaService], controllers: [TasaController, ConfiguracionController], exports: [TasaService] })
export class TasaModule {}
