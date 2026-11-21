/**
 * Mini guía de cada módulo: para qué sirve, cómo se usa paso a paso, consejos y con qué se conecta.
 * Se abre con «Cómo se usa» en la barra de arriba de cada pantalla.
 */
export interface GuiaModulo { para: string; pasos: string[]; consejos?: string[]; conecta?: string }

export const GUIAS: Record<string, GuiaModulo> = {
  '/vender': {
    para: 'Atender al cliente: buscar lo que pide, agregarlo a la cuenta y cobrar en $ y Bs.',
    pasos: [
      'Al entrar ves todo tu inventario. Filtra por categoría o escribe arriba el nombre, el principio activo, los mg o el código de barras (F2 lleva al buscador).',
      'Toca «Agregar» en el producto. Si hay varias marcas, la más barata sale marcada en verde.',
      'Si es un antibiótico o un psicotrópico, o si el cliente es frecuente, escribe su cédula en «Cuenta» y toca «Buscar». Así se revisan sus alergias.',
      'Ajusta las cantidades en la cuenta y toca «Cobrar».',
      'Elige cómo paga: pago móvil, punto, efectivo en $ o en Bs, o varios a la vez. El vuelto se calcula solo.',
      'Al terminar, imprime el ticket o envíalo por WhatsApp.',
    ],
    consejos: [
      'Si no hay un producto, toca «Avisar cuando llegue» y queda en Encargos.',
      'Sin internet puedes seguir vendiendo lo que no necesita récipe: se envía solo cuando vuelve la conexión.',
      'Primero tienes que tener tu caja abierta (módulo Caja).',
    ],
    conecta: 'Descuenta del inventario, suma a tu caja, manda a «Por revisar» lo que necesita permiso y anota los controlados en el libro.',
  },
  '/caja': {
    para: 'Abrir tu turno con el sencillo y cerrarlo contando el dinero.',
    pasos: [
      'Al empezar, escribe el efectivo con el que arrancas (en $ y en Bs) y toca «Abrir caja».',
      'Si el equipo no es una caja todavía, puedes «Crear caja aquí» o, si ya existe en otro equipo, tocar «Tengo un código».',
      'Vende normalmente en Vender.',
      'Al terminar el turno, cuenta lo que tienes por cada método de pago, escríbelo y toca «Cerrar caja».',
      'El sistema te dice si tu caja cuadra o tiene diferencia. Toca «Imprimir cierre para firmar» si lo entregas en papel.',
    ],
    consejos: [
      'El cajero no ve cuánto debería haber: así se cuenta de verdad.',
      'Para usar la caja en una tablet: «Pasar a otro equipo» y escribe el código en la tablet.',
      'El farmacéutico y el dueño ven los cierres de 14 días y pueden marcarlos como revisados.',
    ],
    conecta: 'Cada venta suma a tu turno. Las devoluciones en efectivo se descuentan. Los cierres salen en Reportes.',
  },
  '/ventas': {
    para: 'Ver las ventas hechas, reimprimir tickets y hacer devoluciones o anulaciones.',
    pasos: [
      'Elige la fecha o escribe en «Buscar» el número de la venta.',
      'Toca una venta para ver el detalle.',
      'Toca «Reimprimir ticket» para imprimirlo de nuevo o enviarlo por WhatsApp.',
      'Para devolver (farmacéutico o dueño), toca «Devolver productos», elige cuáles y cuántos, el motivo y cómo se le reintegra. El producto vuelve a su lote y sale un comprobante.',
      'Para anular toda la venta (solo el dueño), toca «Anular venta». Solo se puede si la caja de esa venta sigue abierta y no tuvo devoluciones; si no, usa «Devolver productos».',
    ],
    consejos: ['El cajero solo ve sus propias ventas.', 'Nada se borra: las anulaciones quedan en la Auditoría.'],
  },
  '/recipe': {
    para: 'Mandarle al farmacéutico la foto del récipe para que lo apruebe antes de vender.',
    pasos: [
      'Escribe la cédula del cliente (si no tiene, se puede enviar sin cédula).',
      'Toca «Tomar o elegir foto» y fotografía el récipe completo, con buena luz.',
      'Toca «Enviar al farmacéutico».',
      'Le aparece en «Por revisar». Cuando lo apruebe, ya puedes venderle.',
    ],
    consejos: ['Las fotos se guardan en privado y se borran solas pasado el plazo de la Configuración.'],
  },
  '/clientes': {
    para: 'Tus clientes: sus alergias, lo que siempre compran y sus últimas compras.',
    pasos: [
      'Escribe el nombre, la cédula o el teléfono: la lista se filtra sola mientras escribes.',
      'Toca un cliente para ver su ficha. Desde ahí puedes «Venderle», «Escribirle» por WhatsApp o «Cambiar datos».',
      'Para uno nuevo, toca «Nuevo cliente». Marca sus alergias con un toque y pídele permiso para guardar sus datos.',
    ],
    consejos: ['Con las alergias anotadas, el sistema avisa si le vas a vender algo que le hace daño.'],
    conecta: 'Vender revisa sus alergias. WhatsApp usa sus compras para recordarle cuándo recomprar.',
  },
  '/encargos': {
    para: 'Llevar lo que los clientes pidieron y no había, en orden de llegada.',
    pasos: [
      'Los encargos se anotan desde Vender con «Avisar cuando llegue» (el cliente con su cédula).',
      'Cuando cargas una compra que trae ese producto, se le aparta una caja al primero de la fila por 3 horas.',
      'Si paga (por ejemplo, por pago móvil), toca «Ya pagó», escribe la referencia y la gaveta donde lo guardas.',
      'Cuando lo busca, toca «Ya lo buscó».',
      'Si ya no lo quiere, toca «Ya no lo quiere»: la caja apartada pasa al siguiente.',
    ],
    consejos: ['Si no paga a tiempo, la reserva vence sola y pasa al siguiente de la fila.'],
    conecta: 'Se llena desde Vender y se mueve sola al cargar Compras. Lo que más piden sale en el Resumen.',
  },
  '/mayor': {
    para: 'Vender a clínicas, farmacias o empresas con precio de mayor y a crédito.',
    pasos: [
      'Toca «Nuevo cliente» y anota su RIF, cuánto crédito le das, a cuántos días y su descuento.',
      'Toca «Nueva cotización», elige el cliente y los productos con sus cantidades. Mándale el PDF.',
      'Cada pedido te dice qué sigue: «El cliente aceptó», «Ya lo envié» y «Ya lo recibieron».',
      'Cuando te pague, toca «Me pagó (abono)». Arriba ves cuánto te deben y cuánto está vencido.',
    ],
    consejos: ['Al tocar «Ya lo envié» se descuenta del inventario y empieza a contar el crédito.', 'Si lo retira un empleado de la empresa, anótalo en la cotización.'],
  },
  '/whatsapp': {
    para: 'Recordarles a los clientes que se les está acabando su tratamiento.',
    pasos: [
      'La lista muestra a quién se le acaba pronto, según lo que compró y cuándo.',
      'Toca «Enviar»: se abre WhatsApp con el mensaje listo.',
      'Envíalo desde WhatsApp. Queda marcado como enviado.',
    ],
    consejos: ['Si el cliente compró una sola vez, la fecha es un estimado (una pastilla al día).', 'Para que salga aquí, el cliente tiene que tener cédula y teléfono en su ficha.'],
  },
  '/inventario': {
    para: 'Todo lo que tienes para vender: cuánto hay, a cuánto lo vendes y cuándo vence.',
    pasos: [
      'Arriba tienes 4 botones para lo de todos los días: «Llegó mercancía», «Producto nuevo», «Corregir cantidad» y «Cambiar precios».',
      'Cuando llegue la droguería, toca «Llegó mercancía»: anotas qué llegó, cuántas, cuánto costó y cuándo vencen.',
      'Si algo se rompe, se vence o cuentas y no cuadra, toca «Corregir cantidad» y elige qué pasó. El sistema te guía.',
      'Toca cualquier producto para ver su ficha: cuánto hay de cada fecha de vencimiento, cuánto te cuesta y cuánto ganas.',
      'Usa los botones de abajo del buscador para ver solo lo que se está acabando, lo agotado o lo vencido.',
    ],
    consejos: [
      'Al crear un producto puedes escribir cuántas tienes ya: así se puede vender de una vez.',
      'Al vender, siempre sale primero lo que vence antes. Lo vencido no se vende: retíralo con «Corregir cantidad» → «Se venció».',
      'Para empezar con muchos productos, abajo está «Cargar todo desde Excel».',
    ],
    conecta: 'Vender descuenta de aquí. «Llegó mercancía» suma y avisa a los clientes de Encargos.',
  },
  '/compras': {
    para: 'Todo lo de las droguerías: qué comprar, qué pediste, qué llegó y cuánto les debes.',
    pasos: [
      'En «Qué pedir» el sistema te dice qué conviene comprar según lo que vendes y lo que piden los clientes.',
      'Toca «Hacer pedido» para crear el pedido a esa droguería, o mándaselo por WhatsApp.',
      'Cuando llegue, recíbelo en «Pedidos a droguerías» anotando lo que llegó de verdad y cuándo vence.',
      'En «Lo que debo» toca «Ya pagué» cuando le pagues a una droguería.',
    ],
    consejos: ['Si la mercancía llegó sin pedido, usa Inventario → «Llegó mercancía».'],
    conecta: 'Lo que llega se suma al Inventario, se aparta para Encargos y el costo da la ganancia en Reportes.',
  },
  '/revisar': {
    para: 'La bandeja del farmacéutico: récipes y permisos que pide la caja.',
    pasos: [
      'El número rojo del menú dice cuántos hay esperando. La pantalla se actualiza sola.',
      'En un récipe, mira la foto y toca «Récipe válido» o «Rechazar».',
      'En un permiso (controlado o cliente alérgico), lee el motivo y toca «Lo apruebo» o «No lo apruebo».',
      'La caja sigue o se detiene en ese mismo momento.',
    ],
    consejos: ['Revísalo seguido: el cajero espera tu respuesta con el cliente al frente.'],
  },
  '/controlados': {
    para: 'El libro de psicotrópicos, que se llena solo.',
    pasos: [
      'No tienes que escribir nada: cada venta y compra de un controlado se anota sola, con cliente, médico y récipe.',
      'Elige las fechas para ver los movimientos.',
      'Toca «Imprimir» o «Descargar Excel» para presentarlo.',
    ],
    consejos: ['No se puede editar. Si algo está mal, se corrige con una devolución o un ajuste, que también queda anotado.'],
  },
  '/resumen': {
    para: 'Ver de un vistazo cómo va la farmacia hoy.',
    pasos: [
      'Arriba, la lista de «Primeros pasos» si la farmacia es nueva. Toca cada paso para ir.',
      'Revisa la «Tasa de hoy». Si está a mano, cámbiala ahí mismo.',
      'Mira lo vendido hoy, el dinero en gaveta, los lotes por vencer y los clientes esperando.',
      'Los avisos (stock mínimo, controlados mal marcados) llevan directo a donde se arreglan.',
    ],
  },
  '/reportes': {
    para: 'Los números del negocio en el rango de fechas que elijas.',
    pasos: [
      'Elige «Desde» y «Hasta», o usa los botones Hoy, 7 días, 30 días o Este mes.',
      'Cada cifra se compara con el período anterior (flecha verde: subió; roja: bajó).',
      'Usa las pestañas: Ganancia, Rotación (lo que se vende y lo que no), Cajeros, Horas y pagos, e Inventario (cuánto vale tu mercancía).',
      'Toca «Descargar Excel» para llevártelo.',
    ],
    consejos: ['Para ver la ganancia, los productos necesitan su costo (se toma de las compras o del Excel).'],
  },
  '/auditoria': {
    para: 'Saber quién hizo qué y cuándo.',
    pasos: ['Busca por fecha, persona o acción.', 'Cada fila dice quién, qué hizo, sobre qué y desde dónde.'],
    consejos: ['Nadie puede borrar ni cambiar la auditoría, ni el dueño.'],
  },
  '/configuracion': {
    para: 'Ajustar la tasa, los impuestos, el redondeo y el ticket.',
    pasos: [
      'Tasa: elige BCV dólar, BCV euro (automáticas) o Manual. Si quieres, súmale un ajuste en Bs o en %.',
      'IGTF: actívalo solo si tu contador te dice que lo cobres.',
      'Redondeo: elige si los Bs se redondean a 1, 5 o 10.',
      'Ticket: pon el nombre, el RIF y la dirección, el ancho del papel (58 u 80 mm) y toca «Imprimir prueba».',
    ],
    consejos: ['Una tasa nueva del BCV publicada en la tarde se aplica a medianoche.'],
  },
  '/cajas': {
    para: 'Ver y manejar todas las cajas (computadoras o tablets donde se cobra).',
    pasos: [
      'Cada tarjeta dice en qué equipos está la caja, quién la tiene abierta y cuánto vendió hoy.',
      'Para poner una caja en una tablet: toca «Pasar a otro equipo». Sale un código de 6 letras que vale 30 minutos.',
      'En la tablet, en la pantalla de entrada, toca «Tengo un código» y escríbelo.',
      'Para quitar un equipo, toca la ✕ al lado. Para retirar una caja, toca «Cambiar» → «Desactivar caja».',
    ],
  },
  '/usuarios': {
    para: 'Decidir quién entra y qué puede hacer.',
    pasos: [
      'Toca «Nuevo usuario», escribe el nombre, el usuario, el correo (opcional) y una clave de 10 caracteres o más.',
      'Elige el rol: Cajero (vende), Farmacéutico (además revisa récipes y da permisos) o Dueño (todo).',
      'Para cambiar el nombre, el correo o el rol, toca «Editar». Para una clave nueva, toca «Cambiar clave».',
      'Si alguien se va, desactívalo: se le cierra la sesión al instante.',
    ],
    consejos: ['Activa la clave de dos pasos para el dueño: nadie entra solo con tu clave.'],
  },
  '/soporte': {
    para: 'Pedir ayuda cuando algo falla.',
    pasos: [
      'La primera vez, el dueño pega el «código de enlace» que le dio quien le vendió el sistema.',
      'Escribe qué pasa y toca «Enviar a soporte». Con tu mensaje va el estado del sistema (no los datos de clientes).',
      'La respuesta aparece en «Tus casos». Puedes seguir escribiendo ahí.',
      'Si soporte necesita entrar, el dueño toca «Permitir acceso» por unas horas. Lo puede quitar cuando quiera.',
    ],
  },
  '/farmacias': {
    para: 'Ver todas las farmacias que usan el sistema y cómo están.',
    pasos: [
      'Toca «Registrar farmacia», llena sus datos y copia el código de enlace. Solo se muestra una vez.',
      'El dueño de la farmacia lo pega en su módulo Soporte. Desde ahí se reporta sola cada 5 minutos.',
      'En cada tarjeta ves si está en línea, cuánto vendió hoy, sus errores y sus casos abiertos.',
      'Si el dueño dio acceso, toca «Entrar» para revisar su sistema.',
    ],
  },
  '/casos': {
    para: 'Responder lo que piden las farmacias.',
    pasos: ['Abre un caso para ver la conversación y el estado del sistema cuando escribieron.', 'Responde. Si ya se resolvió, toca «Responder y cerrar».'],
  },
  '/planes': {
    para: 'Decidir qué trae cada plan que vendes y cuánto cuesta.',
    pasos: [
      'Cada tarjeta muestra el precio, los módulos que trae, cuántas cajas y usuarios permite y cuántas farmacias lo tienen.',
      'Toca «Cambiar» para marcar o desmarcar módulos, el precio y los límites (0 = sin límite).',
      'Para darle un plan a una farmacia: Farmacias → la farmacia → Editar → Plan.',
      'La farmacia recibe el cambio en menos de 5 minutos: los módulos que no trae desaparecen de su menú.',
    ],
    consejos: ['Vender, Caja, Récipes, Controlados y Lotes van en todos los planes: sin ellos la farmacia no puede operar.', 'En Farmacias ves cuánto cobras al mes sumando los planes.'],
  },
  '/equipo': {
    para: 'Quiénes entran al panel central.',
    pasos: ['Toca «Agregar» y elige el rol: Soporte (ve farmacias y responde casos) o Super admin (además registra farmacias).', 'Desactiva a quien ya no trabaje contigo.'],
  },
};
