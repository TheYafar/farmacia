import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { Ban, Check, ChevronLeft, ChevronRight, Lightbulb, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useSesion } from '@/store/sesion';

/** Mini guía al entrar: lo que cada rol puede hacer, lo que no (y por qué) y unos consejos. Sale una vez; se vuelve a abrir con «Guía». */
export const useGuia = create<{ abierta: boolean; abrir: () => void; cerrar: () => void }>((set) => ({
  abierta: false,
  abrir: () => set({ abierta: true }),
  cerrar: () => set({ abierta: false }),
}));

type Contenido = { titulo: string; si: string[]; no: string[]; consejos: string[] };

const CAJERO: Contenido = {
  titulo: 'Tu trabajo es vender y cobrar',
  si: [
    'Buscar por nombre, por principio activo o con el lector de código de barras.',
    'Cobrar en dólares y bolívares: pago móvil, punto, efectivo o varios a la vez. El vuelto se calcula solo.',
    'Abrir tu caja al empezar y cerrarla contando lo que tienes.',
    'Ver tus ventas, reimprimir el ticket o enviarlo por WhatsApp.',
    'Registrar clientes y tomar la foto del récipe.',
    'Dar hasta 10 % de descuento, escribiendo el motivo.',
  ],
  no: [
    'Vender antibióticos o controlados sin la cédula del cliente y el récipe: el farmacéutico lo revisa.',
    'Vender algo a un cliente alérgico sin el permiso del farmacéutico.',
    'Dar más de 10 % de descuento, devolver o anular ventas.',
    'Cambiar precios o inventario.',
    'Ver cuánto debería haber en la caja al cerrar: cuentas sin saberlo, así el cierre es honesto.',
  ],
  consejos: [
    'Si se va el internet, puedes seguir vendiendo productos sin récipe: se guardan y se envían solos al volver.',
    'Si no hay un producto, avísale al farmacéutico para anotarlo en Encargos: al cliente le avisan cuando llegue.',
    'Si algo falla, ve a Soporte y cuéntalo: te responden ahí mismo.',
  ],
};

const REGENTE: Contenido = {
  titulo: 'Cuidas que todo se venda bien',
  si: [
    'Todo lo que hace el cajero.',
    'Revisar récipes y dar o negar permisos en «Por revisar» (el número rojo te avisa).',
    'Llevar el libro de controlados.',
    'Manejar inventario, catálogo y encargos de clientes.',
    'Devolver ventas y dar descuentos mayores.',
  ],
  no: [
    'Anular ventas (solo el dueño).',
    'Ver reportes, ganancias y compras.',
    'Crear usuarios ni cambiar la configuración.',
  ],
  consejos: [
    'Revisa «Por revisar» seguido: el cajero espera tu permiso con el cliente al frente.',
    'En Catálogo te avisamos si un psicotrópico o antibiótico está cargado como «Normal».',
  ],
};

const ADMIN: Contenido = {
  titulo: 'Tienes el control de todo',
  si: [
    'Ver el resumen del día, reportes, ganancias y valor del inventario.',
    'Cargar productos con Excel, hacer compras y manejar el inventario.',
    'Crear usuarios (cajeros y farmacéutico) y decidir qué puede hacer cada uno.',
    'Ver tus cajas: en qué equipo está cada una, quién la tiene abierta y cuánto vendió.',
    'Configurar la tasa (BCV automática o a mano), el ticket y el redondeo en bolívares.',
    'Dejar entrar a soporte por unas horas si algo falla.',
  ],
  no: [
    'El sistema todavía no imprime factura fiscal: para eso sigue usando tu máquina fiscal.',
    'Nadie, ni tú, puede borrar ventas: se anulan y queda el registro en la auditoría.',
  ],
  consejos: [
    'Empieza por la lista «Primeros pasos» del Resumen.',
    'Para usar una tablet como caja: Cajas → Pasar a otro equipo, y escribe el código en la tablet.',
    'Activa la clave de dos pasos en Usuarios: así nadie entra con tu clave.',
  ],
};

const CONTENIDO = { CAJERO, REGENTE, ADMIN } as const;

export default function Guia() {
  const usuario = useSesion((s) => s.usuario);
  const { abierta, abrir, cerrar } = useGuia();
  const [paso, setPaso] = useState(0);
  const rol = usuario?.rol;
  const clave = usuario ? `guiaVista:${usuario.demo ? 'demo:' + usuario.rol : usuario.id}` : '';

  // La primera vez que entra cada persona (y cada rol de la demo) se abre sola.
  useEffect(() => {
    if (!usuario || usuario.soporte || !(usuario.rol in CONTENIDO)) return;
    try { if (!localStorage.getItem(clave)) abrir(); } catch { /* sin almacenamiento */ }
  }, [usuario, clave, abrir]);
  useEffect(() => { if (abierta) setPaso(0); }, [abierta]);

  if (!abierta || !rol || !(rol in CONTENIDO)) return null;
  const c = CONTENIDO[rol as keyof typeof CONTENIDO];
  const terminar = () => { try { localStorage.setItem(clave, '1'); } catch { /* sin almacenamiento */ } cerrar(); };
  const pasos = [
    { icono: <Check className="h-5 w-5" />, tono: 'bg-ok-soft text-ok', titulo: 'Lo que puedes hacer', items: c.si },
    { icono: <Ban className="h-5 w-5" />, tono: 'bg-bad-soft text-bad', titulo: 'Lo que no (y por qué)', items: c.no },
    { icono: <Lightbulb className="h-5 w-5" />, tono: 'bg-warn-soft text-warn', titulo: 'Consejos', items: c.consejos },
  ];
  const p = pasos[paso]!;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 md:items-center md:p-4" role="dialog" aria-modal aria-label="Guía rápida">
      <div className="pb-safe flex max-h-[92vh] w-full flex-col overflow-auto rounded-t-2xl bg-bg md:max-w-lg md:rounded-2xl">
        <div className="relative bg-gradient-to-br from-[#0d8a67] to-[#063f30] px-5 pb-5 pt-5 text-white">
          <button onClick={terminar} className="absolute right-3 top-3 rounded-lg p-1.5 text-white/80 hover:bg-white/10" aria-label="Cerrar guía"><X className="h-5 w-5" /></button>
          <div className="text-sm text-white/75">Hola, {usuario!.nombre.split(' ')[0]} 👋{usuario!.demo ? ' · Demo' : ''}</div>
          <h2 className="mt-1 font-display text-2xl font-bold">{c.titulo}</h2>
          <div className="mt-4 flex gap-1.5" aria-hidden>{pasos.map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= paso ? 'bg-white' : 'bg-white/30'}`} />)}</div>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2.5"><span className={`grid h-9 w-9 place-items-center rounded-xl ${p.tono}`}>{p.icono}</span><h3 className="text-lg font-bold">{p.titulo}</h3></div>
          <ul className="flex flex-col gap-2.5">
            {p.items.map((t) => (
              <li key={t} className="flex gap-2.5 text-[15px] leading-snug">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${paso === 0 ? 'bg-ok' : paso === 1 ? 'bg-bad' : 'bg-warn'}`} aria-hidden />{t}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line p-4">
          {paso > 0 ? <Button variant="ghost" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setPaso(paso - 1)}>Atrás</Button> : <Button variant="ghost" onClick={terminar}>Saltar</Button>}
          <span className="text-xs text-muted">{paso + 1} de {pasos.length}</span>
          {paso < pasos.length - 1
            ? <Button variant="primary" onClick={() => setPaso(paso + 1)}>Siguiente <ChevronRight className="h-4 w-4" /></Button>
            : <Button variant="primary" onClick={terminar}>¡Empezar!</Button>}
        </div>
      </div>
    </div>
  );
}
