import { useState } from 'react';
import { CheckCircle2, Headset, KeyRound, Link2, MessageCircle, Send, ShieldCheck, Unlink, WifiOff } from 'lucide-react';
import { Alert, Button, Campo, Card, Chip, EmptyState, ErrorCarga, PageHeader, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useCargar } from '@/lib/useCargar';
import { useSesion } from '@/store/sesion';
import { useCaja } from '@/store/caja';
import { avisar } from '@/store/avisos';
import { usePlan } from '@/store/plan';

interface Estado {
  enlazada: boolean;
  central: string | null;
  ultimoReporte: string | null;
  error: string | null;
  telefono: string | null;
  acceso: { vence: string; usos: number } | null;
}
export interface Mensaje { id: string; de: 'FARMACIA' | 'SOPORTE'; autor: string; texto: string; creadoEn: string }
export interface Caso { id: string; asunto: string; estado: 'ABIERTO' | 'RESPONDIDO' | 'CERRADO'; creadoEn: string; actualizado: string; mensajes: Mensaje[] }

export const ESTADO_CASO: Record<Caso['estado'], { texto: string; tono: 'warn' | 'info' | 'neutral' }> = {
  ABIERTO: { texto: 'Esperando a soporte', tono: 'warn' },
  RESPONDIDO: { texto: 'Soporte respondió', tono: 'info' },
  CERRADO: { texto: 'Resuelto', tono: 'neutral' },
};

export const haceCuanto = (iso: string | null) => {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });
};
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-VE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Conversación de un caso: la usan la farmacia y el panel central. */
export function Conversacion({ caso, lado, responder }: { caso: Caso; lado: 'FARMACIA' | 'SOPORTE'; responder: (texto: string, cerrar: boolean) => Promise<void> }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async (cerrar: boolean) => {
    if (!texto.trim() && !cerrar) return;
    setEnviando(true);
    try { await responder(texto.trim() || 'Caso cerrado', cerrar); setTexto(''); } catch (e) { avisar(e instanceof ApiError ? e.message : 'No se pudo enviar', 'bad'); } finally { setEnviando(false); }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {caso.mensajes.map((m) => {
          const mio = m.de === lado;
          return (
            <div key={m.id} className={`flex flex-col ${mio ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${mio ? 'rounded-br-md bg-accent text-accent-ink' : 'rounded-bl-md bg-surface2'}`}>{m.texto}</div>
              <span className="mt-0.5 px-1 text-[11px] text-muted">{m.autor} · {fechaHora(m.creadoEn)}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={4000} placeholder={caso.estado === 'CERRADO' ? 'Escribe para abrirlo de nuevo…' : 'Escribe tu respuesta…'} className={claseInput + ' h-auto py-2'} />
        <div className="flex flex-wrap justify-end gap-2">
          {lado === 'SOPORTE' && caso.estado !== 'CERRADO' && <Button size="sm" onClick={() => enviar(true)} disabled={enviando} icon={<CheckCircle2 className="h-4 w-4" />}>Responder y cerrar</Button>}
          <Button size="sm" variant="primary" onClick={() => enviar(false)} disabled={enviando || !texto.trim()} icon={<Send className="h-4 w-4" />}>Enviar</Button>
        </div>
      </div>
    </div>
  );
}

function Enlazar({ listo }: { listo: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  return (
    <form className="flex flex-col gap-3" onSubmit={async (e) => {
      e.preventDefault(); setEnviando(true); setError(null);
      try { await api('/soporte/enlazar', { body: { codigo } }); avisar('Farmacia enlazada con soporte', 'ok'); void usePlan.getState().cargar(); listo(); } catch (err) { setError(err instanceof ApiError ? err.message : 'No se pudo enlazar'); } finally { setEnviando(false); }
    }}>
      <Campo etiqueta="Código de enlace" ayuda="Te lo da quien te vendió el sistema. Empieza por FT1.">
        <textarea value={codigo} onChange={(e) => setCodigo(e.target.value)} rows={3} required className={claseInput + ' h-auto py-2 font-mono text-xs'} placeholder="FT1.eyJ1Ijoi…" />
      </Campo>
      {error && <Alert tone="bad">{error}</Alert>}
      <Button type="submit" variant="primary" disabled={enviando || codigo.trim().length < 20} icon={<Link2 className="h-4 w-4" />}>{enviando ? 'Enlazando…' : 'Enlazar con soporte'}</Button>
    </form>
  );
}

function AccesoRemoto({ estado, listo }: { estado: Estado; listo: () => void }) {
  const [horas, setHoras] = useState(2);
  const [enviando, setEnviando] = useState(false);
  const accion = async (f: () => Promise<unknown>, ok: string) => {
    setEnviando(true);
    try { await f(); avisar(ok, 'ok'); listo(); } catch (e) { avisar(e instanceof ApiError ? e.message : 'No se pudo', 'bad'); } finally { setEnviando(false); }
  };
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-accent" aria-hidden /><h2 className="font-bold">Acceso remoto</h2></div>
      <p className="text-sm text-muted">Si soporte necesita ver tu sistema por dentro, dale permiso por unas horas. Entra como «Soporte técnico», todo queda en la auditoría y se corta solo al terminar el tiempo.</p>
      {estado.acceso ? (
        <>
          <Alert tone="info">Soporte puede entrar hasta el {fechaHora(estado.acceso.vence)}{estado.acceso.usos ? ` · entró ${estado.acceso.usos} ${estado.acceso.usos === 1 ? 'vez' : 'veces'}` : ' · todavía no ha entrado'}.</Alert>
          <Button variant="danger" disabled={enviando} onClick={() => accion(() => api('/soporte/acceso/quitar', { method: 'POST' }), 'Acceso quitado. Soporte quedó fuera')}>Quitar acceso ahora</Button>
        </>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Por cuánto tiempo
            <select value={horas} onChange={(e) => setHoras(Number(e.target.value))} className={claseInput}>
              {[1, 2, 4, 8, 24].map((h) => <option key={h} value={h}>{h} {h === 1 ? 'hora' : 'horas'}</option>)}
            </select>
          </label>
          <Button variant="primary" disabled={enviando} icon={<ShieldCheck className="h-4 w-4" />} onClick={() => accion(() => api('/soporte/acceso', { body: { horas, url: location.origin } }), 'Listo. Soporte ya puede entrar')}>Permitir acceso</Button>
        </div>
      )}
    </Card>
  );
}

export default function SoportePage() {
  const usuario = useSesion((s) => s.usuario)!;
  const dueno = usuario.rol === 'ADMIN' && !usuario.soporte;
  const nombre = useCaja((s) => s.farmacia.nombre);
  const est = useCargar(() => api<Estado>('/soporte'), []);
  const enlazada = !!est.datos?.enlazada;
  const casos = useCargar(async () => (enlazada ? api<Caso[]>('/soporte/tickets') : []), [enlazada], 30_000);
  const [nuevo, setNuevo] = useState({ asunto: '', texto: '' });
  const [enviando, setEnviando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);

  if (est.error) return <ErrorCarga mensaje={est.error} reintentar={est.recargar} />;
  if (!est.datos) return null;
  const e = est.datos;
  const wa = e.telefono?.replace(/\D/g, '');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader
        title="Soporte"
        subtitle="Si algo falla, pide ayuda aquí. Soporte ve el estado del sistema y te responde en esta misma página."
        actions={wa ? <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hola, soy de ${nombre} y necesito ayuda con el sistema`)}`} target="_blank" rel="noreferrer"><Button icon={<MessageCircle className="h-4 w-4" />}>WhatsApp de soporte</Button></a> : undefined}
      />

      {!e.enlazada ? (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2"><Headset className="h-5 w-5 text-accent" aria-hidden /><h2 className="font-bold">Enlazar con soporte</h2></div>
          {dueno ? <Enlazar listo={est.recargar} /> : <p className="text-sm text-muted">Esta farmacia todavía no está enlazada con soporte. Pídele al dueño que lo haga desde esta misma página.</p>}
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {e.error ? <Chip tone="bad" icon={<WifiOff className="h-3.5 w-3.5" />}>Sin conexión con soporte</Chip> : <Chip tone="ok" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>Conectado con soporte</Chip>}
            <span className="text-muted">Último reporte {haceCuanto(e.ultimoReporte)}</span>
          </div>
          {e.error && <Alert tone="warn">{e.error}. Si es urgente, escribe por WhatsApp.</Alert>}

          <Card className="flex flex-col gap-3 p-4">
            <h2 className="font-bold">Pedir ayuda</h2>
            <form className="flex flex-col gap-3" onSubmit={async (ev) => {
              ev.preventDefault(); setEnviando(true);
              try {
                const c = await api<Caso>('/soporte/tickets', { body: nuevo });
                avisar('Listo. Soporte recibió tu mensaje', 'ok'); setNuevo({ asunto: '', texto: '' }); setAbierto(c.id); void casos.recargar();
              } catch (err) { avisar(err instanceof ApiError ? err.message : 'No se pudo enviar', 'bad'); } finally { setEnviando(false); }
            }}>
              <Campo etiqueta="¿Qué pasa?"><input value={nuevo.asunto} onChange={(ev) => setNuevo({ ...nuevo, asunto: ev.target.value })} required maxLength={120} placeholder="Ej.: No imprime el ticket" className={claseInput} /></Campo>
              <Campo etiqueta="Cuéntanos con detalle" ayuda="Con tu mensaje se envía el estado del sistema (ventas de hoy, tasa, errores). No se envían datos de clientes.">
                <textarea value={nuevo.texto} onChange={(ev) => setNuevo({ ...nuevo, texto: ev.target.value })} required rows={4} maxLength={4000} placeholder="Qué estabas haciendo, qué mensaje salió…" className={claseInput + ' h-auto py-2'} />
              </Campo>
              <Button type="submit" variant="primary" disabled={enviando} icon={<Send className="h-4 w-4" />}>{enviando ? 'Enviando…' : 'Enviar a soporte'}</Button>
            </form>
          </Card>

          <section className="flex flex-col gap-2">
            <h2 className="font-bold">Tus casos</h2>
            {casos.error && <Alert tone="warn">{casos.error}</Alert>}
            {casos.datos?.length === 0 && <EmptyState icon={<Headset className="h-6 w-6" />} title="Sin casos">Cuando pidas ayuda, aquí verás las respuestas de soporte.</EmptyState>}
            {casos.datos?.map((c) => (
              <Card key={c.id} className="overflow-hidden">
                <button className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-surface2" onClick={() => setAbierto(abierto === c.id ? null : c.id)} aria-expanded={abierto === c.id}>
                  <span className="min-w-0"><span className="block truncate font-semibold">{c.asunto}</span><span className="text-xs text-muted">{haceCuanto(c.actualizado)} · {c.mensajes.length} {c.mensajes.length === 1 ? 'mensaje' : 'mensajes'}</span></span>
                  <Chip tone={ESTADO_CASO[c.estado].tono}>{ESTADO_CASO[c.estado].texto}</Chip>
                </button>
                {abierto === c.id && (
                  <div className="border-t border-line p-3">
                    <Conversacion caso={c} lado="FARMACIA" responder={async (texto) => { await api(`/soporte/tickets/${c.id}/mensajes`, { body: { texto } }); await casos.recargar(); }} />
                  </div>
                )}
              </Card>
            ))}
          </section>

          {dueno && <AccesoRemoto estado={e} listo={est.recargar} />}
          {dueno && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" icon={<Unlink className="h-4 w-4" />} onClick={async () => {
                if (!confirm('¿Quitar el enlace con soporte? Dejarán de ver el estado de tu farmacia.')) return;
                await api('/soporte/desenlazar', { method: 'POST' }); avisar('Enlace quitado', 'ok'); void est.recargar();
              }}>Quitar enlace con soporte</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
