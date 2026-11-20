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

## Revisión del 20 de noviembre de 2026

Se revisaron la entrada, las sesiones, los permisos, el panel central, el soporte remoto, la demo, las cajas, los planes, las cabeceras del servidor y las dependencias.

**Se corrigió**

| Problema | Riesgo | Arreglo |
|---|---|---|
| La dirección web de una farmacia aceptaba `javascript:` | Un dueño malicioso podía ejecutar código en el panel del super admin al tocar «Entrar» o el enlace | Solo se aceptan `https` (o `http` en la propia máquina), en el servidor y en la pantalla. Además la CSP de Caddy lo bloquea |
| El soporte remoto podía crear usuarios o cambiar claves | Podía dejarse una cuenta para entrar después de vencido el permiso | Soporte remoto no puede crear, editar, activar, desactivar ni cambiar claves de usuarios |
| El enlace con el panel aceptaba `http://localhost` en producción | Un administrador podía hacer que el servidor llamara a servicios internos | `http` local solo fuera de producción |
| El estado que manda cada farmacia no tenía tope | Llenar memoria o disco del panel central | Máximo 50 KB |
| Las respuestas con datos se podían guardar en la caché del navegador | Datos de clientes en equipos compartidos | `Cache-Control: no-store` en la API y en Caddy |
| La app se podía indexar en buscadores | Que aparezca en Google | `robots.txt`, `X-Robots-Tag` y meta `noindex` |
| `@nestjs/throttler` 6.3 con aviso de seguridad | Moderado | Actualizado a 6.8 |

**Aviso de cookies:** la app usa una sola cookie necesaria (`farm_rt`, la sesión: httpOnly, Secure y SameSite estricto). Hay un aviso la primera vez y una página `/privacidad` que explica cookies, almacenamiento local, datos de clientes y servicios externos.

**Dependencias con aviso que quedan pendientes** (el arreglo exige cambiar de versión mayor; se hará con calma y con pruebas):

| Paquete | Riesgo para nosotros |
|---|---|
| `zod` 3 (alto): memoria con listas gigantes | Bajo. El cuerpo de cada petición está limitado a 2 MB y todas las listas tienen máximo |
| `@nestjs/*` 10 (moderado) | Bajo. Pasar a NestJS 11 o 12 en una próxima versión |
| `file-type` (moderado), vía NestJS | No nos afecta: las fotos se validan con nuestra propia revisión de bytes |
| `react-router` 6 (moderado): redirección con `\` en enlaces | No nos afecta: no armamos enlaces con texto que escriba el usuario |

**Recomendado:** activar la clave de dos pasos en todos los dueños y en el super admin.

## Antes de entregar a la farmacia

- [ ] Cambiar la clave del dueño creada con `SEED_ADMIN_CLAVE` y borrar esa variable del `.env`.
- [ ] Guardar la frase de respaldos en un lugar seguro fuera del servidor.
- [ ] Configurar la copia de respaldos fuera del VPS (`RCLONE_DESTINO`).
- [ ] Desactivar el acceso por contraseña a SSH.
- [ ] Definir con el cliente cuánto tiempo se guardan las fotos de récipes.
- [ ] Revisar con el cliente las obligaciones legales sobre datos de salud y facturación fiscal.
- [ ] Activar la clave de dos pasos del super admin del panel central.
