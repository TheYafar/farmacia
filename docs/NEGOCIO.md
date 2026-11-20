# Modelo de negocio

Propuesta: **no vender el programa, sino el servicio**. La farmacia paga una suscripción mensual; tú alojas el sistema, lo mantienes y lo mejoras, y el mismo producto se lo ofreces a más farmacias.

> Los montos de este documento son **estimaciones o ejemplos**. Antes de presentar precios, confirma los costos reales: la prueba con récipes reales (PLAN.md, fase 3) da el costo exacto de la IA, y Contabo y Meta publican sus tarifas.

## 1. Cuánto cuesta la IA

Estimación con Claude Opus 5.5: **entre 0,03 $ y 0,06 $ por récipe** (3 a 6 centavos de dólar).

| Récipes al día | Por día | Por mes (30 días) | Por año (360 días) |
|---|---|---|---|
| 10 | 0,30 – 0,60 $ | 9 – 18 $ | 108 – 216 $ |
| 30 | 0,90 – 1,80 $ | 27 – 54 $ | **324 – 648 $** |
| 50 | 1,50 – 3,00 $ | 45 – 90 $ | 540 – 1.080 $ |

Es el costo **más grande por farmacia** y crece con el uso. Dos formas de controlarlo:

1. **Probar un modelo más barato con los mismos récipes reales.** Claude Haiku 5.5 cuesta alrededor de 40 veces menos por lectura. Si en la prueba lee igual de bien, la IA pasa a costar unos pocos dólares al año por farmacia. Si no lee igual, se queda Opus: en récipes, un error de lectura es un riesgo para el paciente.
2. **Incluir un cupo de lecturas en el plan** y cobrar aparte las adicionales (ver la sección 3).

## 2. Otros costos por farmacia

| Costo | Cómo se comporta |
|---|---|
| Servidor (VPS Contabo) | Un VPS pequeño puede atender a varias farmacias: el costo se reparte |
| Dominio | Uno para todo el servicio (ej. `farmacia.tudominio.com`), no uno por farmacia |
| Respaldos fuera del VPS | Pocos dólares al mes para todas las farmacias juntas |
| WhatsApp Business | Meta cobra por mensaje enviado; depende de cuántos encargos haya |
| Tu tiempo de soporte | El costo que más se olvida: llamadas, capacitación, «no me abre» |

## 3. Cómo cobrar

### Recomendado: suscripción mensual + instalación

| Concepto | Qué cubre | Ejemplo de estructura |
|---|---|---|
| **Instalación** (una vez) | Cargar el catálogo e inventario, crear usuarios, capacitar al personal | [$__] |
| **Plan Mostrador** (mensual) | Vender, inventario, clientes, encargos, resumen, respaldos y soporte | [$__/mes] |
| **Plan Completo** (mensual) | Lo anterior más lectura de récipes con IA (con un cupo, ej. 300 lecturas al mes) y avisos por WhatsApp | [$__/mes] |
| **Lecturas extra** | Por encima del cupo | [$__ por récipe] |

Regla práctica para poner los precios: **que los costos directos (IA, servidor, WhatsApp) no pasen del 20 al 30 % de lo que cobras**. Lo demás paga tu tiempo, el soporte y la ganancia.

Ejemplo de cálculo, **solo ilustrativo**: si el Plan Completo incluye 300 lecturas al mes con Opus, la IA te cuesta entre 9 y 18 $ al mes por farmacia. Para que eso sea como máximo el 30 %, el plan tendría que costar al menos entre 30 y 60 $ al mes, sin contar servidor ni WhatsApp. Con un modelo más barato que pase la prueba, ese mínimo baja mucho.

### Por qué suscripción y no venta única

- **Ingreso que se repite** cada mes, en vez de un solo pago.
- **Los costos de la IA y del servidor son mensuales**: con una venta única los pagarías tú para siempre.
- **El mismo sistema se vende a muchas farmacias**: cada cliente nuevo cuesta poco más que la instalación.
- **La farmacia no necesita saber de servidores**: tú te encargas de respaldos, seguridad y actualizaciones.

## 3b. Propuesta concreta de precios

Punto de partida para empezar a vender. Revísalo cuando la prueba con récipes reales dé el costo exacto de la IA, y compáralo con lo que la farmacia paga hoy por su sistema.

### Lo que te cuesta cada farmacia al mes (estimado)

| Concepto | Plan Mostrador | Plan Completo |
|---|---|---|
| Parte del VPS, dominio y respaldos | 5 $ | 5 $ |
| IA: 300 lecturas al mes con Opus (0,03–0,06 $ c/u) | — | 9 – 18 $ |
| WhatsApp (depende de los encargos; confirmar tarifa de Meta) | — | 2 – 5 $ |
| **Total** | **≈ 5 $** | **≈ 16 – 28 $** |

Si el modelo barato (Haiku) pasa la prueba de récipes, la IA baja a menos de 1 $ y el Plan Completo te cuesta unos 8 $.

### Precios

| Concepto | Precio | Qué incluye |
|---|---|---|
| **Plan Mostrador** | **30 $/mes** | Vender, clientes, encargos, inventario y carga desde Excel, resumen, usuarios, respaldos diarios y soporte |
| **Plan Completo** | **70 $/mes** | Todo lo anterior, más 300 lecturas de récipes con IA al mes y avisos por WhatsApp |
| Lecturas de récipes extra | 0,15 $ c/u | Por encima de las 300 del mes |
| Instalación (farmacias nuevas) | 250 $ una vez | Carga del inventario, usuarios y 2 horas de capacitación |
| Cambios a la medida | Se cotizan aparte | Funciones que solo pide esa farmacia |
| Pago anual | 10 meses | Paga el año por adelantado y se lleva 2 meses gratis |

Con estos precios tus costos son como máximo el **17 % del Plan Mostrador** y el **23–40 % del Plan Completo** (menos del 15 % si Haiku pasa la prueba).

**Ejemplo con 10 farmacias en Plan Completo:** cobras 700 $/mes, te cuestan unos 160–280 $, y te quedan **420–540 $ al mes** para tu tiempo, el soporte y la ganancia. Con Haiku te quedarían unos 620 $.

### Cómo se paga

| Punto | Propuesta |
|---|---|
| Moneda | Dólares (Zelle, USDT o transferencia), o bolívares a la **tasa BCV del día del pago** |
| Fecha | El aviso de cobro sale el día 1; se paga hasta el **día 5** |
| Si no paga | Recordatorio el día 6; desde el **día 15** el sistema queda en **solo consulta** (no se puede vender) hasta que pague. **Nunca se borran sus datos** |
| Soporte incluido | Lunes a sábado, 8 a. m. a 6 p. m., por WhatsApp. Si algo impide vender, respuesta en menos de 2 horas |
| Cambio de precios | Máximo una vez al año, con 30 días de aviso |

## 4. Qué hacer con el primer cliente (los 1.000 $)

Trátalo como **«Farmacia fundadora»**:

- Los 1.000 $ cubren la **implementación y la adaptación** a su farmacia, pagados por fases (ej. 30 % / 40 % / 30 %).
- Después paga la **suscripción mensual**, con un descuento de fundador (por ejemplo, los primeros meses a mitad de precio o un precio fijo por un año).
- A cambio: te deja usar su farmacia como **referencia** con otros clientes y te da sus comentarios para mejorar el sistema.

### Cotización concreta para la farmacia fundadora

| Concepto | Monto |
|---|---|
| Desarrollo e instalación | **1.000 $**, en 3 pagos |
| · Al firmar | 300 $ |
| · Al instalarlo y probarlo en la farmacia | 400 $ |
| · A los 30 días funcionando sin problemas | 300 $ |
| Primeros 2 meses de servicio | Incluidos (0 $) |
| Mensualidad desde el mes 3 | **45 $/mes** con el Plan Completo, precio fijo por 12 meses (después pasa a precio normal) |
| Lecturas de IA extra | 0,15 $ c/u por encima de las 300 del mes |

A cambio del precio de fundador: te deja mostrar su farmacia como referencia y te da sus comentarios cada mes.

**Muy importante en el contrato:** los 1.000 $ pagan la implementación y el uso del sistema, **no la propiedad del código**. El software sigue siendo tuyo, para poder ofrecerlo a otras farmacias. Si el cliente quiere exclusividad o el código, es otro precio mucho mayor.

## 5. Qué debe decir el contrato

| Punto | Qué dejar claro |
|---|---|
| Propiedad | El software es tuyo; **los datos son de la farmacia** y se los entregas si se va |
| Qué incluye cada plan | Funciones, cupo de lecturas con IA, horario de soporte |
| Pagos | En dólares, mensual y por adelantado; qué pasa si no paga (aviso y luego suspensión, nunca borrar datos) |
| Ajustes de precio | Cada cuánto se pueden revisar (ej. una vez al año, con aviso de 30 días) |
| Disponibilidad | Qué pasa si el sistema se cae y en cuánto tiempo respondes |
| Datos de salud | Para qué se usan las fotos de récipes, cuánto tiempo se guardan y que la lectura la hace un servicio de IA externo |
| Responsabilidad | La IA sugiere; la decisión final de despachar es del farmacéutico (documento, sección 1) |
| Facturación fiscal | Si se necesita impresora fiscal (SENIAT), se cotiza aparte |

## 6. Cómo crecer

1. **Farmacia 1 (fundadora):** ponerlo en marcha, medir la IA con récipes reales y fijar los precios definitivos con costos reales.
2. **Farmacias 2 a 10:** una instalación del sistema por farmacia en el mismo VPS (ya funciona así). Contar con una referencia y la demo pública ayuda a vender.
3. **Más de 10 farmacias:** pasar a una sola instalación para todas (multi-farmacia), con un panel para ti que muestre el uso y los cobros de cada una. Es trabajo de desarrollo que conviene hacer cuando el ingreso lo justifique.
