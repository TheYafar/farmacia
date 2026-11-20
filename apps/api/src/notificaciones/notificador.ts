import { Global, Logger, Module } from '@nestjs/common';
import { CONFIG, type Config } from '../config';

export interface ReservaLista {
  telefono: string;
  nombre: string;
  producto: string;
  precioUsd: string;
  precioBs: string;
  venceReserva: Date;
}

/** Cómo se avisa al cliente. Se puede cambiar el canal sin tocar la lógica de la lista de espera. */
export abstract class Notificador {
  abstract reservaLista(datos: ReservaLista): Promise<void>;
}

/** Para desarrollo y pruebas: escribe el mensaje en el registro en vez de enviarlo. */
export class NotificadorLog extends Notificador {
  private readonly log = new Logger('Notificador');
  enviados: ReservaLista[] = [];
  async reservaLista(d: ReservaLista) {
    this.enviados.push(d);
    this.log.log(`WhatsApp (simulado) a ${d.telefono.slice(0, 4)}***: llegó ${d.producto}, ${d.precioUsd} $ / ${d.precioBs} Bs`);
  }
}

@Global()
@Module({
  providers: [{
    provide: Notificador,
    inject: [CONFIG],
    useFactory: (c: Config) => {
      if (c.NOTIFICADOR === 'whatsapp') throw new Error('El envío por WhatsApp Business se implementa en la fase 3 (ver docs/PLAN.md)');
      return new NotificadorLog();
    },
  }],
  exports: [Notificador],
})
export class NotificacionesModule {}
