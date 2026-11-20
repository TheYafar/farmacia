import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

/** Valida y limpia la entrada con un esquema de @farmacia/shared. Lo que no está en el esquema se descarta. */
export class Validar<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly esquema: T) {}
  transform(valor: unknown): z.infer<T> {
    const r = this.esquema.safeParse(valor);
    if (!r.success) {
      throw new BadRequestException({
        mensaje: 'Datos inválidos',
        errores: r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
      });
    }
    return r.data;
  }
}
