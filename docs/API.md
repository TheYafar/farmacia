# API

Base: `/api/v1`. Respuestas en JSON. Los errores tienen la forma `{ "mensaje": "…" }`, y los de validación agregan `errores: [{ campo, mensaje }]`.

**Autenticación**: `Authorization: Bearer <accessToken>`. El token dura 15 minutos; se renueva con `POST /auth/renovar` usando la cookie de sesión.

Roles: **C** = Cajero · **R** = Regente · **A** = Dueño (Administrador). «Todos» = cualquier usuario con sesión.

## Sesión

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| POST | `/auth/login` | Público | `{ usuario, clave }` → `{ accessToken, usuario }` + cookie de sesión |
| POST | `/auth/renovar` | Cookie | Nuevo `accessToken` y nueva cookie |
| POST | `/auth/salir` | Todos | Cierra esta sesión |
| GET | `/auth/yo` | Todos | Usuario actual |

## Catálogo e inventario

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| GET | `/catalogo/buscar?q=losartan 50` | Todos | Grupos de bioequivalentes, de más barato a más caro, con stock |
| GET | `/catalogo/codigo/:codigo` | Todos | Producto por código de barras |
| GET | `/catalogo/principios` | Todos | Principios activos |
| POST | `/catalogo/productos` | A | Crear producto |
| PATCH | `/catalogo/productos/:id` | A | Editar producto (el cambio de precio queda auditado) |
| GET | `/inventario/lotes?dias=30` | R, A | Lotes por vencimiento |
| POST | `/inventario/compras` | A | Cargar factura de droguería; aparta cajas para la lista de espera |

## Ventas

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| POST | `/ventas` | Todos | Vender. Si algo necesita revisión responde **422** con `bloqueos: [{ productoId, motivo, mensaje }]` |
| GET | `/ventas?desde=2026-11-01` | Todos | El cajero ve solo las suyas |
| GET | `/ventas/:id` | Todos | Detalle |
| POST | `/ventas/:id/anular` | A | Anula y devuelve el stock |
| POST | `/autorizaciones/solicitudes` | Todos | El cajero pide permiso: `{ cedula, productoId, razon: "ALERGIA" \| "CONTROLADO" }` |
| GET | `/autorizaciones/:id` | Todos | Ver si ya respondieron (la caja lo consulta cada pocos segundos) |
| GET | `/autorizaciones` | R, A | Solicitudes pendientes |
| POST | `/autorizaciones/:id/aprobar` · `/rechazar` | R, A | `{ motivo? }`. El permiso aprobado vale 30 min y una sola venta |
| POST | `/autorizaciones` | R, A | El Regente da el permiso directo: `{ cedula, productoId, motivo }` |

Si la venta no lleva `recipeId` ni `autorizacionId`, el servidor usa el récipe más reciente del cliente (30 días) y un permiso aprobado y vigente para ese cliente y producto.

Motivos de bloqueo: `FALTA_CEDULA`, `FALTA_RECIPE`, `ALERGIA`, `CONTROLADO`.

Ejemplo de venta con récipe y permiso:

```json
POST /api/v1/ventas
{
  "cedula": "V-14582307",
  "metodoPago": "PAGO_MOVIL",
  "referenciaPago": "004521",
  "lineas": [
    { "productoId": "…", "cantidad": 1, "recipeId": "…", "autorizacionId": "…" }
  ]
}
```

## Pacientes y récipes

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| GET | `/pacientes/:cedula` | Todos | Ficha: alergias, lo que siempre compra, récipes y encargos |
| POST | `/pacientes` | Todos | Registrar |
| PATCH | `/pacientes/:cedula` | Todos | Editar (auditado) |
| POST | `/recipes` | Todos | `multipart/form-data`: `foto` (JPG/PNG/WEBP, máx. 5 MB) y `cedula` opcional |
| GET | `/recipes/pendientes` | R, A | Récipes por revisar |
| GET | `/recipes/:id` | Todos | Datos y lectura de la IA |
| GET | `/recipes/:id/foto` | Todos | La imagen (sin caché) |
| POST | `/recipes/:id/validar` | R, A | `{ aprobado, confirmados, nota }` |

## Lista de espera

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| POST | `/espera` | Todos | Anotar `{ cedula, productoId }` (solo si no hay stock) |
| GET | `/espera?estado=NOTIFICADO` | Todos | Lista por estado |
| POST | `/espera/:id/confirmar-pago` | R, A | `{ referenciaPagoMovil, gaveta }` → factura y guarda en custodia |
| POST | `/espera/:id/entregar` | Todos | El cliente buscó su caja |

## Dueño

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| GET | `/tasa` | Todos | Tasa actual |
| POST | `/tasa` | A | `{ valor, fuente }` |
| GET | `/reportes/resumen` | A | Ventas de hoy y la semana, vencimientos, demanda insatisfecha |
| GET | `/usuarios` | A | Usuarios |
| POST | `/usuarios` | A | Crear `{ nombre, usuario, clave, rol }` |
| POST | `/usuarios/:id/desactivar` · `/activar` | A | Corta o devuelve el acceso |
| PATCH | `/usuarios/:id/clave` | A | Cambia la clave y cierra sus sesiones |
| GET | `/auditoria?entidad=Venta` | A | Registro de acciones |
| GET | `/salud` | Público | `{ ok: true }` si la API y la base responden |
