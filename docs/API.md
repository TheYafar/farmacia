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

Motivos de bloqueo: `FALTA_CEDULA`, `FALTA_RECIPE`, `ALERGIA`, `CONTROLADO`. Otros errores de cobro: `CAJA_CERRADA` (409), `PAGO_INCOMPLETO` y `VUELTO_INVALIDO` (422).

**Pagos:** `pagos: [{ metodo, monto, referencia? }]`, con el monto en la moneda del método (dólares para `EFECTIVO_USD`, bolívares para los demás). Si la suma pasa del total, la diferencia es vuelto, solo si hubo efectivo, en `vueltoMoneda` (`BS` o `USD`). La forma corta `metodoPago` + `referenciaPago` cobra el monto exacto con un solo método.

## Caja

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| POST | `/caja/abrir` | Todos | `{ fondoUsd, fondoBs }`. Una caja abierta por usuario; sin caja abierta no se vende |
| GET | `/caja/actual` | Todos | Mi caja abierta, ventas y total. Lo esperado solo lo ven Regente y dueño (cierre a ciegas) |
| POST | `/caja/cerrar` | Todos | `{ contado: { EFECTIVO_USD, EFECTIVO_BS, PAGO_MOVIL, PUNTO_DE_VENTA }, nota? }` → esperado, contado y diferencia |
| GET | `/caja/turnos` | R, A | Turnos de los últimos 14 días con sus diferencias |
| POST | `/caja/turnos/:id/revisar` | A | Marcar un cierre como revisado |
| GET | `/farmacia` | Público | Nombre, RIF, dirección y teléfono (para el ticket) |

Ejemplo de venta con récipe y permiso:

```json
POST /api/v1/ventas
{
  "cedula": "V-14582307",
  "pagos": [
    { "metodo": "EFECTIVO_USD", "monto": 5 },
    { "metodo": "PAGO_MOVIL", "monto": 1276.56, "referencia": "004521" }
  ],
  "vueltoMoneda": "BS",
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

<!-- rutas:inicio -->
## Todas las rutas

Generada del código con `python3 infra/generar-api-doc.py`. 90 rutas.

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| GET | `/auditoria` | A |  |
| POST | `/auth/2fa/activar` | Todos |  |
| POST | `/auth/2fa/desactivar` | Todos |  |
| POST | `/auth/2fa/iniciar` | Todos |  |
| POST | `/auth/login` | Todos |  |
| POST | `/auth/renovar` | Público |  |
| POST | `/auth/salir` | Todos |  |
| GET | `/auth/yo` | Todos |  |
| GET | `/autorizaciones` | R, A |  |
| POST | `/autorizaciones` | R, A | El Regente da el permiso directamente (por ejemplo, atendiendo él mismo en el mostrador). |
| GET | `/autorizaciones/:id` | Todos | El cajero consulta si ya le respondieron. |
| POST | `/autorizaciones/:id/aprobar` | R, A |  |
| POST | `/autorizaciones/:id/rechazar` | R, A |  |
| POST | `/autorizaciones/solicitudes` | Todos | Cualquier usuario pide permiso. Si ya hay una solicitud abierta igual, devuelve esa. |
| POST | `/caja/abrir` | Todos |  |
| GET | `/caja/actual` | Todos | Mi caja abierta. El cajero NO ve cuánto debería haber (cierre a ciegas): así cuenta de verdad. El Regente y el dueño sí lo ven. |
| POST | `/caja/cerrar` | Todos |  |
| GET | `/caja/turnos` | R, A |  |
| POST | `/caja/turnos/:id/revisar` | A | El dueño marca el cierre como revisado (por ejemplo, después de aclarar una diferencia). |
| GET | `/catalogo/buscar` | Todos |  |
| GET | `/catalogo/codigo/:codigo` | Todos | Lector de código de barras: devuelve el producto exacto. |
| GET | `/catalogo/configuracion` | Todos |  |
| POST | `/catalogo/configuracion` | A |  |
| GET | `/catalogo/laboratorios` | Todos |  |
| POST | `/catalogo/precios/masivo` | A | Sube o baja precios de un laboratorio, una categoría o una selección. Con vistaPrevia no guarda nada. |
| GET | `/catalogo/principios` | Todos |  |
| POST | `/catalogo/principios` | R, A |  |
| PATCH | `/catalogo/principios/:id` | R, A | Marcar un principio como psicotrópico o antibiótico cambia las reglas de venta: queda en la auditoría. |
| GET | `/catalogo/productos` | R, A | Lista para administrar el catálogo: incluye inactivos, existencia y aviso de stock bajo. |
| POST | `/catalogo/productos` | A |  |
| PATCH | `/catalogo/productos/:id` | A | Cambiar precio queda en la auditoría con el valor anterior. |
| GET | `/catalogo/sin-conexion` | Todos | Catálogo completo para vender sin internet (la app lo guarda en el equipo cada pocos minutos). |
| GET | `/configuracion` | Todos | Todos la leen (el cajero la necesita para imprimir); solo el dueño la cambia. |
| POST | `/configuracion` | A |  |
| GET | `/espera` | Todos |  |
| POST | `/espera` | Todos |  |
| POST | `/espera/:id/confirmar-pago` | R, A |  |
| POST | `/espera/:id/entregar` | Todos |  |
| GET | `/inventario/ajustes` | R, A |  |
| POST | `/inventario/ajustes` | R, A | Merma, roto, vencido o conteo físico. Nunca deja el lote en negativo. |
| GET | `/inventario/compras` | A | Compras recientes con sus líneas y lotes (para devolver a la droguería o anular). |
| POST | `/inventario/compras` | A | Carga la factura de la droguería: suma stock por lote (convirtiendo cajas máster en unidades de venta) y, en la misma operación, separa cajas para los clientes en lista de espera. |
| POST | `/inventario/compras/:id/anular` | A | Anula una compra cargada por error: saca su mercancía (si no se ha vendido) y deja de deberse. |
| POST | `/inventario/devoluciones-proveedor` | A | Devolver mercancía a la droguería: sale del lote y se descuenta de lo que se le debe. |
| POST | `/inventario/importar` | A | Carga del inventario desde Excel: con `confirmar: false` solo revisa, con `true` guarda (todo o nada). |
| GET | `/inventario/lotes` | R, A | Lotes ordenados por vencimiento. `dias=30` muestra solo lo que vence en 30 días o menos. |
| POST | `/inventario/ordenes/:id/recibir` | A | Recibe una orden de compra: compara lo pedido con lo que llegó y carga la compra (con sus lotes) en una sola operación. |
| GET | `/libro/controlados` | R, A | Entradas (compras) y salidas (ventas) de productos psicotrópicos. Se arma solo con los movimientos. |
| POST | `/mayorista/pedidos` | A | Deuda = pedidos despachados o entregados que no se han pagado completos. |
| POST | `/mayorista/pedidos/:id/abonos` | A |  |
| POST | `/mayorista/pedidos/:id/anular` | A |  |
| POST | `/mayorista/pedidos/:id/avanzar` | A | Avanza el pedido. Al despachar descuenta el stock (FEFO) y revisa el límite de crédito. |
| POST | `/pacientes` | Todos |  |
| GET | `/pacientes/:cedula` | Todos |  |
| PATCH | `/pacientes/:cedula` | Todos | Cambios en alergias quedan auditados: son datos clínicos. |
| GET | `/proveedores/cuentas` | A | Cuentas por pagar: compras con saldo, de la que vence antes a la que vence después. |
| POST | `/proveedores/cuentas/:id/pagos` | A |  |
| GET | `/proveedores/lista` | A | Droguerías a las que ya se les compró, para elegirlas al cargar una compra. |
| GET | `/proveedores/ordenes` | A | Órdenes de compra: lo que se le pidió a cada droguería y todavía no llega. |
| POST | `/proveedores/ordenes` | A |  |
| POST | `/proveedores/ordenes/:id/anular` | A |  |
| GET | `/proveedores/sugerido` | A | Qué pedir: ventas de 30 días + clientes esperando − existencia. Sugiere la última droguería que lo trajo. |
| POST | `/recipes` | Todos |  |
| GET | `/recipes/:id` | Todos |  |
| GET | `/recipes/:id/foto` | Todos | La foto solo se entrega a usuarios con sesión, nunca queda en caché ni en una dirección pública. |
| POST | `/recipes/:id/medico` | R, A | Anota el médico del récipe (va al libro de controlados). Si tiene MPPS, se reutiliza el mismo médico. |
| POST | `/recipes/:id/validar` | R, A |  |
| GET | `/recipes/medicos/lista` | R, A | Médicos ya registrados, para sugerirlos al escribir. |
| GET | `/recipes/pendientes` | R, A |  |
| GET | `/reportes/cajeros` | A | Ventas por cajero y diferencias de sus cierres de caja. |
| GET | `/reportes/ganancia` | A | Ventas, costo y ganancia por laboratorio. El costo es el último costo de compra por unidad. |
| GET | `/reportes/resumen` | A |  |
| GET | `/reportes/rotacion` | A | Rotación: lo que más se vende y lo que tiene existencia pero no se ha movido. |
| GET | `/reportes/ventas-detalle` | A | Ventas por hora del día y por método de pago (netas de devoluciones). |
| GET | `/tasa` | Todos |  |
| POST | `/tasa` | A | Tasa escrita a mano: deja la farmacia en modo manual para que la automática no la reemplace. |
| POST | `/tasa/bcv` | A | Lee el BCV ahora mismo. |
| GET | `/usuarios` | A |  |
| POST | `/usuarios` | A |  |
| POST | `/usuarios/:id/activar` | A |  |
| PATCH | `/usuarios/:id/clave` | A | Cambia la clave y cierra las sesiones abiertas con la clave anterior. |
| POST | `/usuarios/:id/desactivar` | A | Desactiva y cierra todas sus sesiones al instante. |
| GET | `/ventas` | Todos | El cajero ve solo sus ventas; Regente y dueño ven todas. |
| POST | `/ventas` | Todos |  |
| GET | `/ventas/:id` | Todos |  |
| POST | `/ventas/:id/anular` | A |  |
| POST | `/ventas/:id/devoluciones` | R, A |  |
| POST | `/whatsapp/enviado` | R, A | Registra que se envió el mensaje (se abre WhatsApp en el equipo con el texto listo). |
| GET | `/whatsapp/estadisticas` | R, A |  |
| GET | `/whatsapp/recompra` | R, A | Clientes a los que se les acaba un tratamiento: compraron el mismo producto 2 o más veces en 6 meses. Se estima la próxima compra con el intervalo promedio y se avisa 5 días antes (o si ya pasó la fecha). |
<!-- rutas:fin -->
