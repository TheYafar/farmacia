# Plan de trabajo

Alcance acordado: **todo lo del documento de planificación** (venta, inventario FEFO, bioequivalentes, ficha por cédula, lista de espera con WhatsApp y Pago Móvil, lectura de récipes con IA, roles y despliegue en Contabo).

## Fases

### Fase 1 · Base del sistema ✅ hecha

- Monorepo: `apps/web`, `apps/api`, `packages/shared`, `infra`, `docs`.
- API completa del negocio: sesión, usuarios, catálogo y búsqueda de bioequivalentes, inventario FEFO, compras, ventas con reglas clínicas, autorizaciones del Regente, lista de espera con reservas y vencimiento, récipes (subida y validación), pacientes, tasa, resumen y auditoría.
- Seguridad (ver [SEGURIDAD.md](SEGURIDAD.md)).
- 30 pruebas automáticas contra PostgreSQL real, que corren en GitHub en cada cambio.
- Despliegue con Docker + Caddy (HTTPS) probado de punta a punta, respaldos cifrados probados.

### Fase 2 · Conectar la app a la API ✅ casi completa

Hecho:
- Inicio de sesión real, la sesión se mantiene al recargar y se renueva sola.
- Vender: búsqueda en el servidor, cliente por cédula (y registro rápido), foto del récipe desde la cuenta, **permiso al farmacéutico en vivo** (la caja ve la aprobación sin recargar), cobro y «avisar cuando llegue».
- Récipe, Por revisar (permisos y récipes), Clientes, Encargos, Inventario con carga de facturas, Resumen con tasa del dólar y Usuarios.
- Probado de punta a punta en el navegador con cajero (PC), farmacéutico (teléfono) y dueño a la vez.
- La demo de ejemplo quedó aparte en `apps/demo` y sigue publicada en GitHub Pages.

Falta:
- Productos y precios desde la app (hoy se cargan por la API o la carga inicial).
- Carga inicial del inventario desde Excel/CSV.
- Escáner de código de barras con la cámara del teléfono (el lector USB ya funciona).
- Ticket de custodia para imprimir y aviso claro cuando se va el internet.

### Fase 3 · Integraciones

- **Lectura de récipes con IA**: implementar `LectorRecipes` con un modelo de visión; cruce con el catálogo y pares LASA; semáforo.
- **WhatsApp Business** (API oficial de Meta): número verificado, plantillas aprobadas para «llegó su medicamento», implementar el `Notificador`.
- **Pago Móvil**: confirmación asistida (el Regente o el dueño marca la referencia). La conciliación automática depende de si el banco del cliente ofrece una API.

### Fase 4 · Puesta en marcha

- Despliegue en el VPS del cliente ([DESPLIEGUE.md](DESPLIEGUE.md)) y copia de respaldos fuera del servidor.
- Carga del catálogo e inventario real.
- Segundo factor (2FA) para el dueño y monitoreo de disponibilidad.
- Capacitación del personal y período de acompañamiento.

## Lo que hay que definir con el cliente

| Tema | Por qué importa |
|---|---|
| **Facturación fiscal (SENIAT / impresora fiscal)** | El documento no lo menciona. Si las ventas deben salir por impresora fiscal, cambia el flujo de cobro y es trabajo adicional |
| **De dónde sale el inventario inicial** | Si viene de otro sistema (Valery, Saint, A2, Excel), hay que importar los datos |
| **Número de WhatsApp Business** | Lo registra el cliente a su nombre en Meta; la aprobación puede tardar días |
| **Banco del Pago Móvil** | Define si la conciliación puede ser automática |
| **Cuánto tiempo guardar las fotos de récipes** | Son datos de salud |
| **Soporte después de la entrega** | Quién atiende fallas y actualizaciones, y si tiene un costo mensual |

## Costos mensuales

Son servicios de terceros, aparte del desarrollo. Si el sistema se vende como servicio ([NEGOCIO.md](NEGOCIO.md)), los pagas tú y van incluidos en la suscripción; si se instala para un solo cliente, los paga él desde sus cuentas. Los montos son aproximados: confirma los precios actuales antes de presentarlos.

| Servicio | Para qué |
|---|---|
| VPS Contabo | Servidor (el plan más pequeño alcanza) |
| Dominio | Dirección web, pago anual |
| Almacenamiento externo para respaldos | Copia fuera del VPS (ej. Backblaze B2) |
| WhatsApp Business (Meta) | Cobro por mensaje enviado, según la tarifa para Venezuela |
| IA con visión | Cobro por récipe leído (centavos por lectura) |

## Sobre el presupuesto

1.000 $ por **todo** el alcance es un monto ajustado para un sistema con datos clínicos, dinero e integraciones externas. Recomendaciones:

- **Pagos por fase**, no al final. Por ejemplo: 30 % al empezar, 40 % al entregar la fase 2 funcionando, 30 % al dejarlo en marcha en la farmacia.
- **Alcance por escrito**: lo que está en este plan, y que cualquier cosa nueva (por ejemplo la impresora fiscal) se cotiza aparte.
- **Mejor como servicio que como venta única**: suscripción mensual que incluye servidor, IA, respaldos y soporte. Detalle en [NEGOCIO.md](NEGOCIO.md).
- **El código sigue siendo tuyo**: los 1.000 $ pagan la implementación y el uso, no la propiedad del software.
