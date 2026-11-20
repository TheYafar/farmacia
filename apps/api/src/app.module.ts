import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CONFIG, cargarConfig, type Config } from './config';
import { PrismaModule } from './prisma/prisma.service';
import { GuardiaAcceso } from './common/seguridad';
import { FiltroErrores } from './common/errores';
import { AuditoriaModule } from './auditoria/auditoria';
import { NotificacionesModule } from './notificaciones/notificador';
import { AuthModule } from './auth/auth';
import { UsuariosModule } from './usuarios/usuarios';
import { CatalogoModule } from './catalogo/catalogo';
import { TasaModule } from './tasa/tasa';
import { PacientesModule } from './pacientes/pacientes';
import { AutorizacionesModule } from './autorizaciones/autorizaciones';
import { VentasModule } from './ventas/ventas';
import { EsperaModule } from './espera/espera';
import { InventarioModule } from './inventario/inventario';
import { RecipesModule } from './recipes/recipes';
import { ReportesModule } from './reportes/reportes';
import { SaludModule } from './salud/salud';
import { Global } from '@nestjs/common';

export function crearModulo(config: Config) {
  @Global()
  @Module({ providers: [{ provide: CONFIG, useValue: config }], exports: [CONFIG] })
  class ConfigModule {}

  @Module({
    imports: [
      ConfigModule,
      PrismaModule,
      JwtModule.register({ global: true, secret: config.JWT_SECRET, signOptions: { algorithm: 'HS256' } }),
      // 120 peticiones por minuto por dirección; el login tiene su propio límite más estricto.
      ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: config.NODE_ENV === 'test' ? 10_000 : 120 }]),
      ScheduleModule.forRoot(),
      AuditoriaModule, NotificacionesModule,
      AuthModule, UsuariosModule, CatalogoModule, TasaModule, PacientesModule, AutorizacionesModule,
      VentasModule, EsperaModule, InventarioModule, RecipesModule, ReportesModule, SaludModule,
    ],
    providers: [
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: APP_GUARD, useClass: GuardiaAcceso },
      { provide: APP_FILTER, useClass: FiltroErrores },
    ],
  })
  class AppModule {}
  return AppModule;
}

export { cargarConfig };
