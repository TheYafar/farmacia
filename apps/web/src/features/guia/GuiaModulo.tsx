import { useEffect, useState } from 'react';
import { BookOpen, Check, Link2, Lightbulb, X } from 'lucide-react';
import { Sheet } from '@/components/ui';
import { GUIAS } from './modulos';

const clave = (ruta: string) => `guiaModulo:${ruta}`;
const vista = (ruta: string) => { try { return !!localStorage.getItem(clave(ruta)); } catch { return true; } };
const marcar = (ruta: string) => { try { localStorage.setItem(clave(ruta), '1'); } catch { /* sin almacenamiento */ } };

/** Botón «Cómo se usa» de la barra de arriba, y aviso la primera vez que se entra a cada módulo. */
export function BotonGuiaModulo({ ruta, titulo }: { ruta: string | undefined; titulo: string }) {
  const [abierta, setAbierta] = useState(false);
  if (!ruta || !GUIAS[ruta]) return null;
  return (
    <>
      <button onClick={() => { setAbierta(true); marcar(ruta); }} className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-accent hover:bg-accent-soft" aria-label={`Cómo se usa ${titulo}`}>
        <BookOpen className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Cómo se usa</span>
      </button>
      <HojaGuia ruta={ruta} titulo={titulo} abierta={abierta} cerrar={() => setAbierta(false)} />
    </>
  );
}

export function AvisoGuiaModulo({ ruta, titulo }: { ruta: string | undefined; titulo: string }) {
  const [, refrescar] = useState(0);
  const [abierta, setAbierta] = useState(false);
  useEffect(() => { setAbierta(false); }, [ruta]);
  if (!ruta || !GUIAS[ruta] || vista(ruta)) return <HojaGuia ruta={ruta ?? ''} titulo={titulo} abierta={abierta} cerrar={() => setAbierta(false)} />;
  return (
    <div className="flex items-center justify-center gap-3 border-b border-line bg-accent-soft/60 px-4 py-1.5 text-[13px]">
      <span>¿Primera vez en <b>{titulo}</b>?</span>
      <button className="font-semibold text-accent underline" onClick={() => { setAbierta(true); marcar(ruta); }}>Ver cómo se usa</button>
      <button className="rounded p-0.5 text-muted hover:text-fg" aria-label="No mostrar" onClick={() => { marcar(ruta); refrescar((n) => n + 1); }}><X className="h-4 w-4" /></button>
      <HojaGuia ruta={ruta} titulo={titulo} abierta={abierta} cerrar={() => { setAbierta(false); refrescar((n) => n + 1); }} />
    </div>
  );
}

function HojaGuia({ ruta, titulo, abierta, cerrar }: { ruta: string; titulo: string; abierta: boolean; cerrar: () => void }) {
  const g = GUIAS[ruta];
  if (!g) return null;
  return (
    <Sheet open={abierta} onClose={cerrar} title={`Cómo se usa: ${titulo}`}>
      <div className="flex flex-col gap-4 text-[15px] leading-snug">
        <p className="rounded-xl bg-accent-soft p-3 text-accent"><b>Para qué sirve:</b> {g.para}</p>
        <ol className="flex flex-col gap-2.5">
          {g.pasos.map((p, i) => (
            <li key={p} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-ink">{i + 1}</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
        {!!g.consejos?.length && (
          <div className="flex flex-col gap-1.5 rounded-xl bg-warn-soft p-3">
            <span className="flex items-center gap-1.5 font-semibold text-warn"><Lightbulb className="h-4 w-4" aria-hidden />Consejos</span>
            {g.consejos.map((c) => <span key={c} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />{c}</span>)}
          </div>
        )}
        {g.conecta && <p className="flex gap-2 text-sm text-muted"><Link2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span><b>Se conecta con:</b> {g.conecta}</span></p>}
      </div>
    </Sheet>
  );
}
