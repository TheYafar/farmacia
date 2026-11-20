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

## 4. Qué hacer con el primer cliente (los 1.000 $)

Trátalo como **«Farmacia fundadora»**:

- Los 1.000 $ cubren la **implementación y la adaptación** a su farmacia, pagados por fases (ej. 30 % / 40 % / 30 %).
- Después paga la **suscripción mensual**, con un descuento de fundador (por ejemplo, los primeros meses a mitad de precio o un precio fijo por un año).
- A cambio: te deja usar su farmacia como **referencia** con otros clientes y te da sus comentarios para mejorar el sistema.

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
