# Seguridad

El sistema maneja datos clínicos (alergias, récipes), dinero y medicamentos controlados. Este documento lista qué protege cada control y dónde está en el código. Lo marcado con ✅ está implementado **y probado** en `apps/api/test/`.

## Acceso

| Control | Estado | Dónde |
|---|---|---|
| Claves cifradas con Argon2id (parámetros OWASP) | ✅ | `auth/auth.ts` |
| Mismo mensaje si el usuario no existe o la clave es incorrecta (no revela usuarios) | ✅ | `auth/auth.ts` |
| Bloqueo del usuario tras 5 claves incorrectas, durante 15 minutos | ✅ | `auth/auth.ts` |
| Límite de 5 intentos de inicio de sesión por minuto por dirección IP | ✅ | `auth/auth.ts` |
| Token de acceso corto (15 min), firmado HS256 | ✅ | `auth/auth.ts` |
| Token de renovación en cookie `HttpOnly`, `Secure`, `SameSite=Strict`, limitada a `/api/v1/auth` | ✅ | `auth/auth.ts` |
| Rotación del token de renovación; si se reusa uno viejo, se cierran **todas** las sesiones | ✅ | `auth/auth.ts` |
| La renovación solo acepta peticiones desde la app propia (protección CSRF) | ✅ | `auth/auth.ts` |
| Todo cerrado por defecto: cada ruta exige sesión salvo las marcadas `@Publico()` | ✅ | `common/seguridad.ts` |
| Permisos por rol (Cajero, Regente, Dueño) | ✅ | `@Roles()` en cada controlador |
| Desactivar un usuario o cambiar su clave corta su acceso **al instante** | ✅ | `common/seguridad.ts`, `usuarios/usuarios.ts` |
| Segundo factor (2FA) para el dueño | Pendiente | Fase 4 |

## Datos y reglas

| Control | Estado | Dónde |
|---|---|---|
| Toda entrada se valida con esquemas Zod; lo desconocido se descarta | ✅ | `packages/shared`, `common/validacion.ts` |
| Consultas parametrizadas (sin inyección SQL) | ✅ | Prisma; prueba en `negocio.test.ts` |
| Reglas clínicas aplicadas en el servidor (alergias, antibióticos, psicotrópicos, récipe) | ✅ | `ventas/ventas.ts` |
| Autorizaciones del Regente: un solo uso, vencen en 30 min, atadas a paciente y producto | ✅ | `autorizaciones/`, `ventas/` |
| No se puede vender más stock del que hay, ni de lotes vencidos, ni dos veces la última caja | ✅ | `inventario/stock.ts` + restricción en la base de datos |
| Auditoría de acciones sensibles que no se puede editar ni borrar | ✅ | `auditoria/`, disparador en la migración |
| Errores sin detalles internos (sin SQL, rutas ni trazas) | ✅ | `common/errores.ts` |
| El cajero solo ve sus propias ventas | ✅ | `ventas/ventas.ts` |

## Archivos (fotos de récipes)

| Control | Estado |
|---|---|
| Tipo de imagen comprobado por sus bytes, no por el nombre (JPG, PNG, WEBP) | ✅ |
| Máximo 5 MB, un archivo por petición | ✅ |
| Nombre generado por el servidor (el nombre original nunca se usa) | ✅ |
| Guardadas fuera de la carpeta pública, permisos `600` | ✅ |
| Solo se entregan con sesión y con `Cache-Control: no-store` | ✅ |

## Servidor y red

| Control | Estado | Dónde |
|---|---|---|
| HTTPS obligatorio con certificado automático | ✅ | `infra/Caddyfile` |
| Cabeceras: HSTS, CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy` | ✅ | Caddy + Helmet |
| PostgreSQL sin puerto expuesto a internet | ✅ | `infra/docker-compose.yml` |
| Contenedor de la API sin privilegios de root | ✅ | `infra/api.Dockerfile` |
| Cortafuegos (solo 22, 80, 443), fail2ban, actualizaciones automáticas | ✅ script | `infra/preparar-servidor.sh` |
| SSH solo con llave, sin contraseña | Manual | `docs/DESPLIEGUE.md` |
| Secretos solo en `infra/.env` (fuera de git) | ✅ | `.gitignore` |
| La API no arranca con configuración insegura | ✅ | `src/config.ts` |

## Respaldos

| Control | Estado |
|---|---|
| Respaldo diario a las 3:00 a. m. de la base de datos y las fotos | ✅ `infra/respaldo.sh` |
| Cifrado AES-256 con una frase guardada fuera del servidor | ✅ |
| Se guardan 14 días; copia opcional fuera del VPS con rclone | ✅ |
| Restauración probada | ✅ `infra/restaurar.sh` |

## Antes de entregar a la farmacia

- [ ] Cambiar la clave del dueño creada con `SEED_ADMIN_CLAVE` y borrar esa variable del `.env`.
- [ ] Guardar la frase de respaldos en un lugar seguro fuera del servidor.
- [ ] Configurar la copia de respaldos fuera del VPS (`RCLONE_DESTINO`).
- [ ] Desactivar el acceso por contraseña a SSH.
- [ ] Definir con el cliente cuánto tiempo se guardan las fotos de récipes.
- [ ] Revisar con el cliente las obligaciones legales sobre datos de salud y facturación fiscal.
