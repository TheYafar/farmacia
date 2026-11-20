# Especificación por módulo: qué falta para tenerlo listo

Este documento acompaña a la [hoja de ruta](PLAN.md). Para cada módulo dice:

- **Datos:** qué hay que agregar en la base de datos (`apps/api/prisma/schema.prisma`).
- **Servidor:** qué rutas de la API hay que crear (`apps/api/src`).
- **Pantalla:** qué cambia en la app (`apps/web/src/features`).
- **Pruebas:** qué deben comprobar las pruebas automáticas.
- **Del cliente:** qué tiene que decidir o entregar el cliente.
- **Listo cuando:** la prueba que se hace en la farmacia para darlo por terminado.

Toda acción que toca dinero o inventario queda en la **auditoría** y respeta los **roles**: Cajero, Farmacéutico y Dueño.

---

## 1B · Caja: devoluciones, descuentos y escáner

**Datos**
- Nueva tabla `Devolucion`: venta, quién la pidió, quién la autorizó, motivo, total y forma de reintegro.
- Nueva tabla `DevolucionLinea`: línea de venta, cantidad y lote.
- En `EstadoVenta` se agregan dos estados: `DEVUELTA_PARCIAL` y `DEVUELTA`.
- En `VentaLinea` se agregan `descuentoPct`, `descuentoMotivo` y `descuentoAutorizadoPor`.
- En `Venta` se agrega `descuentoUsd`.
- Nueva tabla `TipoDescuento`: nombre, porcentaje y si necesita permiso (por ejemplo, tercera edad o convenio).

**Servidor**
- `POST /ventas/:id/devoluciones`
  - Valida que no se devuelva más de lo que se vendió.
  - Devuelve el stock a su lote y registra la salida en la caja.
- La devolución y los descuentos por encima del límite usan el **permiso en vivo** que ya existe en `Autorizacion`.
- El cierre de caja descuenta lo devuelto en efectivo.

**Pantalla**
- En la venta: botón «Devolver», selección de líneas y cantidades, motivo y espera del permiso.
- En el carrito: descuento por línea y por venta.
- En el ticket: se ven los descuentos, y la devolución tiene su propio comprobante.
- Botón de cámara para leer el código de barras con `BarcodeDetector`. Si el navegador no lo soporta, se usa la librería `zxing`.

**Pruebas**
- Una devolución parcial y una total.
- Intentar devolver de más y que falle.
- El stock vuelve exacto a su lote.
- El cierre cuadra con una devolución en efectivo.
- Un descuento sin permiso es rechazado.

**Del cliente:** qué descuentos da hoy y quién puede autorizarlos. El modelo de su impresora de tickets.

**Listo cuando:** se abre la caja, se vende, se devuelve un producto, se aplica un descuento, se cierra la caja y la diferencia es 0.

---

## 2 · Productos, precios y ganancia

**Datos**
- Nueva tabla `Categoria`.
- En `Producto` se agregan: `categoriaId`, `ivaPct` (0 o 16), `costoUsd`, `stockMinimo` y `ubicacion` (estante o gaveta).
- En `CompraLinea` se agrega `costoUnitarioUsd`. Con eso se calcula el costo promedio.
- Nueva tabla `AjusteInventario`: lote, cantidad (en positivo o negativo), motivo (`MERMA`, `ROTO`, `VENCIDO` o `CONTEO`) y usuario.
- Nueva tabla `Configuracion`: IGTF en % y si aplica a los pagos en divisas.

**Servidor**
- CRUD de productos (`/catalogo/productos`) y de categorías. Solo el Dueño puede usarlo.
- `POST /catalogo/precios/masivo`:
  - Filtra por laboratorio, categoría o una lista de productos, y aplica un porcentaje o un monto fijo.
  - Con `?vistaPrevia=1` muestra el resultado sin guardar nada.
- `POST /inventario/ajustes`. El conteo físico calcula la diferencia contra el stock del sistema.
- La venta calcula el IVA por línea y el IGTF por pago, y guarda los montos (no los recalcula después).

**Pantalla**
- Formulario de producto.
- Columnas de costo, precio y margen % en Inventario.
- Asistente de cambio de precios con vista previa.
- Ajustes de inventario.
- Alerta de «stock bajo» en el Resumen.

**Pruebas**
- El IVA y el IGTF dan bien en el ticket.
- El margen se calcula bien con el costo promedio.
- Subir los precios de un laboratorio cambia solo a ese laboratorio y queda en la auditoría.
- Un ajuste sin motivo es rechazado.

**Del cliente (y su contador):** qué productos son exentos de IVA, si cobra IGTF, y cómo calcula hoy sus precios.

---

## 3 · Puesta en marcha

- **2FA (TOTP) del Dueño:**
  - Datos: campos `totpSecreto` (cifrado) y `totpActivo` en `Usuario`.
  - Servidor: `POST /auth/2fa/activar` y `POST /auth/2fa/verificar`.
  - Pantalla: un código QR para activarlo y un paso extra al iniciar sesión.
- **Sin internet:** un banner rojo «Sin conexión». Las operaciones fallidas se reintentan y **no se duplica ninguna venta**: cada venta lleva una clave única (`Idempotency-Key`).
- **Monitoreo:** un chequeo externo gratuito (UptimeRobot o similar) a `/salud`, que avisa por correo o Telegram.
- **Respaldos:** copia diaria cifrada fuera del VPS (rclone a Backblaze o Google Drive). Hay que hacer **una prueba de restauración**.
- **Carga real:**
  - El Excel del inventario real.
  - Los usuarios con su rol.
  - La tasa del día.
- **Capacitación:** 2 horas, con una guía de una página por rol.

**Listo cuando:** la farmacia vende una semana completa solo con el sistema y los cierres cuadran.

---

## 4 · Facturación fiscal (solo si hace falta)

- **Datos:** tabla `DocumentoFiscal` con venta, número de control, tipo (factura o nota de crédito) y estado.
- **Servidor:** un adaptador con dos implementaciones posibles:
  - la **máquina fiscal**, a través de un pequeño programa local que habla por puerto serial o USB;
  - un **proveedor homologado** de factura digital, por su API.
- Las devoluciones generan su nota de crédito.
- Libros de compras y ventas en Excel para el contador.

**Del cliente:** si está obligado, y qué máquina o proveedor usa. Este módulo **se cotiza aparte**.

---

## 5 · IA de récipes

**Datos**
- En `Recipe` se agregan:
  - `lecturaIa` (JSON con medicamento, dosis, cantidad y confianza por línea);
  - `modeloIa`;
  - `costoIaUsd`.

**Servidor**
- `LectorRecipes`:
  - Envía la foto a la API de Anthropic con un modelo de visión y salida estructurada (JSON).
  - Cruza el resultado con el catálogo, marca los pares LASA y asigna un semáforo: verde, amarillo o rojo.
- La IA **nunca aprueba**: solo propone, y el farmacéutico confirma.
- Hay un límite de gasto diario configurable.

**Pantalla**
- En Récipe y en Por revisar: la foto al lado de la lectura, con el color de cada línea.
- Botón «Agregar al carrito» para lo que el farmacéutico confirme.

**Pruebas**
- Un juego de 30 a 50 récipes reales (sin datos del paciente) con la respuesta correcta.
- Un script mide los aciertos y el costo por récipe.
- **Regla:** ninguna lectura equivocada puede salir en verde.

**Del cliente:** las fotos de récipes. **Necesito:** una clave de la API de Anthropic.

---

## 6 · WhatsApp y recompra

**Datos**
- Nueva tabla `Mensaje`: paciente, plantilla, estado (enviado, entregado o leído) y fecha.
- Nueva tabla `Tratamiento`: paciente, producto, unidades por día y fecha estimada en que se le acaba.
- Nueva tabla `Pedido` (domicilio): estado `NUEVO → ARMADO → COBRADO → ENVIADO`.

**Servidor**
- Integración con la **WhatsApp Cloud API** de Meta, con webhook para saber el estado de cada mensaje.
- Una tarea diaria envía:
  - el recordatorio de recompra, 3 días antes de que se acabe el tratamiento;
  - el aviso de «llegó su medicamento» cuando entra una compra que cubre la lista de espera.
- El cliente se puede dar de baja escribiendo **«BAJA»**.

**Pantalla**
- Ficha del cliente: sus tratamientos y el historial de mensajes.
- Bandeja de pedidos a domicilio.

**Del cliente**
- Un número de WhatsApp Business a su nombre. La aprobación de Meta puede tardar días.
- Las plantillas de mensajes.
- El banco del Pago Móvil.

---

## 7 · Compras a droguerías y cuentas por pagar

**Datos**
- Nueva tabla `Proveedor`: RIF, nombre, contacto, días de crédito.
- `Compra.proveedor`, que hoy es texto, pasa a ser `proveedorId`. Hace falta migrar los datos que ya existen.
- Nuevas tablas `OrdenCompra` y `OrdenCompraLinea`: pedido, recibido y diferencias.
- Nueva tabla `CuentaPorPagar`: compra, monto, vencimiento y saldo.
- Nueva tabla `PagoProveedor`: monto, método y referencia.
- Nueva tabla `DevolucionProveedor`.

**Servidor**
- **Sugerido de compra:** tiene en cuenta las ventas de los últimos 30 días, el stock actual, el mínimo y lo que pidieron en la lista de espera.
- Recepción de la orden de compra contra lo que llegó, que crea los lotes.
- Pagos parciales a cada proveedor.
- Aviso de facturas por vencer.

**Pantalla**
- Proveedores.
- Pedido sugerido, que se puede editar y enviar por WhatsApp o en PDF.
- Recepción de la mercancía.
- Cuentas por pagar con lo que se le debe a cada droguería.

**Listo cuando:** el dueño genera un pedido desde el sugerido, lo recibe con diferencias, paga una parte y el saldo cuadra.

---

## 8 · Cumplimiento

- **Datos:**
  - Un campo `controlado` en `PrincipioActivo`.
  - Nueva tabla `LibroControlados`: entrada o salida, paciente, médico, récipe y farmacéutico. **Solo se agregan registros; nunca se edita.**
- **Servidor:** cada venta o compra de un producto controlado escribe sola en el libro. El libro se exporta en PDF con el formato del regente.
- **Privacidad:**
  - Un aviso y un consentimiento al registrar a un cliente.
  - Las fotos de récipes se borran automáticamente cuando pasa el plazo de retención.

**Del regente:** el formato exacto del libro y el plazo de retención.

---

## 9 · Reportes

Todo se hace con consultas sobre los datos que ya existen. No hacen falta tablas nuevas, salvo índices.

**Reportes**
- Ganancia por producto, categoría y laboratorio. Necesita el costo de la etapa 2.
- Rotación: lo que más se vende y lo que no se mueve en 60 días o más.
- Ventas por cajero, por hora y por método de pago.
- Historial de cierres con sus diferencias.

**Servidor:** `GET /reportes/:tipo?desde&hasta`, y la misma ruta con `/excel` para descargarlo en Excel (con la librería `exceljs`).

**Pantalla:** filtros por fecha, gráficos sencillos y un botón «Descargar Excel».

---

## 10 · Mayorista

**Datos**
- Nueva tabla `ClienteEmpresa`: RIF, razón social, dirección fiscal, límite de crédito, días de crédito y vendedor.
- Nueva tabla `ListaPrecio` (detal, mayor y convenio) y `PrecioLista` (producto, lista, precio).
- Nuevas tablas `Cotizacion` y `PedidoMayor`, con el stock **apartado** mientras se aprueban.
- Nueva tabla `NotaEntrega`: preparado, despachado y entregado, con la firma de recibido.
- Nueva tabla `CuentaPorCobrar` y `Abono`.

**Servidor**
- El precio se elige según el cliente.
- El stock apartado se libera si la cotización vence.
- No se despacha si se pasa del límite de crédito, salvo con permiso del Dueño.
- Estado de cuenta en PDF.

**Pantalla**
- Clientes empresa.
- Cotización → pedido → despacho.
- Cobranza, con las facturas vencidas.

**Listo cuando:** una cotización se convierte en pedido, se despacha a crédito, se abona y el estado de cuenta cuadra.

---

## 11 · Crecimiento

- **Sucursales:**
  - Datos: tabla `Sucursal`, y un campo `sucursalId` en lotes, turnos y ventas.
  - Nueva tabla `Traslado` (envío y recepción entre sucursales).
- **Portal mayorista:** un catálogo web donde cada cliente empresa ve su precio y hace pedidos.
- **Fidelidad:** puntos por compra que se canjean como descuento.
- **Pantalla del cliente:** una segunda ventana del navegador que muestra el carrito y el total.
- **Multi-farmacia:**
  - Datos: campo `farmaciaId` en todas las tablas, con aislamiento por fila.
  - Un panel tuyo para manejar suscripciones y cobros.

---

## Orden recomendado

**1B → 2 → 3** son obligatorias para operar. Después: **5 y 6**, que son las que enamoran al cliente. Luego **7 → 9 → 8** y, por último, **10 y 11**. La etapa 4 solo se hace si el cliente la necesita.
