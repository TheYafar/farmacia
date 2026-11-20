import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/** Últimos errores inesperados del servidor: se envían a soporte en el reporte de estado. */
export const ERRORES_RECIENTES: { fecha: string; ruta: string; mensaje: string }[] = [];

/**
 * Convierte cualquier error en una respuesta clara para la app,
 * sin filtrar detalles internos (consultas SQL, rutas, trazas).
 */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly log = new Logger('Errores');

  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (error instanceof HttpException) {
      const cuerpo = error.getResponse();
      const base = typeof cuerpo === 'string' ? { mensaje: cuerpo } : (cuerpo as Record<string, unknown>);
      const mensaje = base.mensaje ?? (Array.isArray(base.message) ? base.message.join('. ') : base.message);
      res.status(error.getStatus()).json({ ...base, message: undefined, error: undefined, statusCode: undefined, mensaje });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') return void res.status(HttpStatus.CONFLICT).json({ mensaje: 'Ya existe un registro con esos datos' });
      if (error.code === 'P2025') return void res.status(HttpStatus.NOT_FOUND).json({ mensaje: 'No se encontró el registro' });
      if (error.code === 'P2003') return void res.status(HttpStatus.BAD_REQUEST).json({ mensaje: 'Hace referencia a algo que no existe' });
    }
    this.log.error(error instanceof Error ? error.stack : String(error));
    const req = host.switchToHttp().getRequest<Request>();
    ERRORES_RECIENTES.unshift({ fecha: new Date().toISOString(), ruta: `${req?.method ?? ''} ${(req?.originalUrl ?? '').split('?')[0]}`.slice(0, 120), mensaje: (error instanceof Error ? error.message : String(error)).split('\n')[0].slice(0, 300) });
    ERRORES_RECIENTES.length = Math.min(ERRORES_RECIENTES.length, 20);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ mensaje: 'Ocurrió un error. Intenta de nuevo' });
  }
}
