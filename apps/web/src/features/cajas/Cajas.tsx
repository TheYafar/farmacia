import { useEffect, useState } from 'react';
import { ArrowRightLeft, Laptop, MonitorSmartphone, Pencil, Plus, Smartphone, Tablet, X } from 'lucide-react';
import { Alert, Button, Card, Chip, EmptyState, ErrorCarga, PageHeader, Sheet, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useCargar } from '@/lib/useCargar';
import { usd } from '@/lib/format';
import { avisar } from '@/store/avisos';
import { useCajaEquipo, type CajaEquipo } from '@/store/cajaEquipo';
import { haceCuanto } from '@/features/soporte/SoportePage';

/** Convierte este equipo en una caja que ya existe, con el código de 6 letras. */
export function VincularConCodigo({ listo }: { listo?: () => void }) {
  const guardar = useCajaEquipo((s) => s.guardar);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  return (
    <form className="flex flex-col gap-2" onSubmit={async (e) => {
      e.preventDefault(); setEnviando(true); setError(null);
      try {
        const r = await api<{ caja: CajaEquipo; token: string }>('/cajas/vincular', { body: { codigo } });
        guardar(r.caja, r.token); avisar(`Este equipo ahora es ${r.caja.nombre}`, 'ok'); listo?.();
      } catch (err) { setError(err instanceof ApiError ? err.message : 'No se pudo'); } finally { setEnviando(false); }
    }}>
      <div className="flex gap-2">
        <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="ABC-123" maxLength={7} autoCapitalize="characters" required
          className={claseInput + ' min-w-0 flex-1 text-center font-mono text-lg tracking-[0.3em]'} aria-label="Código de la caja" />
        <Button type="submit" variant="primary" disabled={enviando || codigo.replace(/[^A-Z0-9]/g, '').length !== 6}>Usar</Button>
      </div>
      {error && <Alert tone="bad">{error}</Alert>}
    </form>
  );
}

function CrearCaja({ listo }: { listo?: () => void }) {
  const guardar = useCajaEquipo((s) => s.guardar);
  const [nombre, setNombre] = useState('');
  const [enviando, setEnviando] = useState(false);
  return (
    <form className="flex gap-2" onSubmit={async (e) => {
      e.preventDefault(); setEnviando(true);
      try {
        const r = await api<{ caja: CajaEquipo; token: string }>('/cajas', { body: { nombre, enEsteEquipo: true } });
        guardar(r.caja, r.token); avisar(`Listo. Este equipo es ${r.caja.nombre}`, 'ok'); listo?.();
      } catch (err) { avisar(err instanceof ApiError ? err.message : 'No se pudo crear', 'bad'); } finally { setEnviando(false); }
    }}>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Caja 1, Tablet del mostrador" maxLength={40} required autoFocus className={claseInput + ' min-w-0 flex-1'} aria-label="Nombre de la caja" />
      <Button type="submit" variant="primary" disabled={enviando}>Crear</Button>
    </form>
  );
}

/** Código para pasar la caja a otro equipo (vale 30 minutos y una sola vez). */
export function PasarCaja({ caja }: { caja: CajaEquipo }) {
  const [codigo, setCodigo] = useState<{ codigo: string; vence: string } | null>(null);
  if (codigo) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-xl bg-accent-soft p-4 text-center">
        <span className="text-sm text-muted">En el otro equipo, en la pantalla de entrada o al abrir caja, toca «Tengo un código» y escribe:</span>
        <span className="font-mono text-3xl font-bold tracking-[0.2em] text-accent">{codigo.codigo}</span>
        <span className="text-xs text-muted">Vale hasta las {new Date(codigo.vence).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })} y sirve una sola vez.</span>
      </div>
    );
  }
  return (
    <Button size="sm" icon={<ArrowRightLeft className="h-4 w-4" />} onClick={async () => {
      try { setCodigo(await api(`/cajas/${caja.id}/codigo`, { method: 'POST' })); } catch (e) { avisar(e instanceof ApiError ? e.message : 'No se pudo', 'bad'); }
    }}>Pasar a otro equipo</Button>
  );
}

/** La caja de este equipo: se muestra al abrir la caja. Si no hay, se crea aquí o se usa un código. */
export function CajaDelEquipo() {
  const { caja, cargada, cargar, olvidar } = useCajaEquipo();
  const [modo, setModo] = useState<'ver' | 'crear' | 'codigo'>('ver');
  useEffect(() => { if (!cargada) void cargar(); }, [cargada, cargar]);
  if (!cargada) return null;
  if (caja) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface2/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm"><MonitorSmartphone className="h-4 w-4 text-accent" aria-hidden />Este equipo es <b>{caja.nombre}</b></span>
          <button className="text-xs text-muted underline" onClick={async () => { if (confirm(`¿Quitar ${caja.nombre} de este equipo? La caja sigue existiendo y la puedes usar en otro equipo.`)) await olvidar(); }}>Quitar</button>
        </div>
        <PasarCaja caja={caja} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-line p-3">
      <span className="flex items-center gap-2 text-sm font-semibold"><MonitorSmartphone className="h-4 w-4 text-muted" aria-hidden />Este equipo todavía no es una caja</span>
      {modo === 'crear' ? <CrearCaja listo={() => setModo('ver')} /> : modo === 'codigo' ? <VincularConCodigo listo={() => setModo('ver')} /> : (
        <>
          <p className="text-xs text-muted">Conviértelo en una caja para saber en qué equipo se cobró cada venta. Puedes abrir sin caja si prefieres.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setModo('crear')}>Crear caja aquí</Button>
            <Button size="sm" icon={<ArrowRightLeft className="h-4 w-4" />} onClick={() => setModo('codigo')}>Tengo un código</Button>
          </div>
        </>
      )}
      {modo !== 'ver' && <button className="self-start text-xs text-muted underline" onClick={() => setModo('ver')}>Cancelar</button>}
    </div>
  );
}

interface CajaDueno {
  id: string; nombre: string; activa: boolean; creadaEn: string; codigoActivo: boolean;
  equipos: { id: string; agente: string | null; creadoEn: string; ultimoUso: string }[];
  abierta: { cajero: string; desde: string } | null; ventasHoy: number; ventasHoyUsd: string;
}

/** «Chrome en Android», «Safari en iPad»… a partir del navegador. */
function equipo(agente: string | null) {
  const a = agente ?? '';
  const so = /iPad|Tablet/i.test(a) ? 'tablet' : /Android|iPhone/i.test(a) ? 'teléfono' : 'computadora';
  const nav = /Edg\//.test(a) ? 'Edge' : /Chrome\//.test(a) ? 'Chrome' : /Firefox\//.test(a) ? 'Firefox' : /Safari\//.test(a) ? 'Safari' : 'Navegador';
  const sis = /Android/.test(a) ? 'Android' : /iPhone|iPad/.test(a) ? 'iOS' : /Windows/.test(a) ? 'Windows' : /Mac OS/.test(a) ? 'Mac' : /Linux/.test(a) ? 'Linux' : '';
  return { texto: `${nav}${sis ? ` en ${sis}` : ''}`, Icono: so === 'tablet' ? Tablet : so === 'teléfono' ? Smartphone : Laptop };
}

/** El dueño ve todas sus cajas, en qué equipos están, quién las tiene abiertas y lo vendido hoy. */
export default function CajasPage() {
  const { datos, error, recargar } = useCargar(() => api<CajaDueno[]>('/cajas'), [], 30_000);
  const [nueva, setNueva] = useState(false);
  const [nombre, setNombre] = useState('');
  const [editar, setEditar] = useState<CajaDueno | null>(null);
  const [pasar, setPasar] = useState<CajaDueno | null>(null);
  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;
  const activas = datos?.filter((c) => c.activa) ?? [];
  const total = activas.reduce((a, c) => a + Number(c.ventasHoyUsd), 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Cajas"
        subtitle={`Cada computadora o tablet donde se cobra. Hoy entre todas: ${usd(total)}`}
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setNueva(true)}>Nueva caja</Button>}
      />
      <Alert tone="info">Para usar una caja en una tablet: toca <b>Pasar a otro equipo</b>, y en la tablet escribe el código en la pantalla de entrada («Tengo un código»).</Alert>
      {datos?.length === 0 && <EmptyState icon={<MonitorSmartphone className="h-6 w-6" />} title="Todavía no hay cajas">Créalas aquí o desde el equipo donde se cobra, al abrir la caja.</EmptyState>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {datos?.map((c) => (
          <Card key={c.id} className={`flex flex-col gap-3 p-4 ${c.activa ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-bold">{c.nombre}</div>
                <div className="text-xs text-muted">{c.equipos.length} {c.equipos.length === 1 ? 'equipo' : 'equipos'}{c.equipos[0] ? ` · usada ${haceCuanto(c.equipos[0].ultimoUso)}` : ''}</div>
              </div>
              {!c.activa ? <Chip tone="bad">Desactivada</Chip> : c.abierta ? <Chip tone="ok">Abierta</Chip> : <Chip>Cerrada</Chip>}
            </div>
            {c.abierta && <div className="text-sm">La tiene <b>{c.abierta.cajero}</b> desde las {new Date(c.abierta.desde).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}</div>}
            <div className="rounded-lg bg-surface2 p-2 text-sm">Hoy: <b>{c.ventasHoy}</b> {c.ventasHoy === 1 ? 'venta' : 'ventas'} · <b>{usd(c.ventasHoyUsd)}</b></div>
            {c.equipos.length > 0 && (
              <ul className="flex flex-col gap-1">
                {c.equipos.map((e) => {
                  const { texto, Icono } = equipo(e.agente);
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2"><Icono className="h-4 w-4 shrink-0 text-muted" aria-hidden /><span className="truncate">{texto}</span></span>
                      <button className="rounded p-1 text-muted hover:bg-surface2 hover:text-bad" aria-label="Quitar este equipo" onClick={async () => {
                        if (!confirm('¿Quitar este equipo de la caja? Dejará de cobrar como esta caja.')) return;
                        await api(`/cajas/equipos/${e.id}/quitar`, { method: 'POST' }); void recargar();
                      }}><X className="h-4 w-4" /></button>
                    </li>
                  );
                })}
              </ul>
            )}
            {c.activa && (
              <div className="mt-auto flex flex-wrap gap-2">
                <Button size="sm" icon={<ArrowRightLeft className="h-4 w-4" />} onClick={() => setPasar(c)}>Pasar a otro equipo</Button>
                <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditar(c)}>Cambiar</Button>
              </div>
            )}
            {!c.activa && <Button size="sm" onClick={async () => { await api(`/cajas/${c.id}`, { method: 'PATCH', body: { activa: true } }); void recargar(); }}>Activar</Button>}
          </Card>
        ))}
      </div>

      <Sheet open={nueva} onClose={() => setNueva(false)} title="Nueva caja">
        <form className="flex flex-col gap-3" onSubmit={async (e) => {
          e.preventDefault();
          try { await api('/cajas', { body: { nombre, enEsteEquipo: false } }); avisar('Caja creada. Pásala al equipo donde se va a cobrar', 'ok'); setNombre(''); setNueva(false); void recargar(); } catch (x) { avisar(x instanceof ApiError ? x.message : 'No se pudo', 'bad'); }
        }}>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Caja 2 · Tablet" maxLength={40} required autoFocus className={claseInput} aria-label="Nombre" />
          <p className="text-xs text-muted">Se crea sin equipo. Después toca «Pasar a otro equipo» y escribe el código en la tablet o computadora donde se cobrará.</p>
          <Button type="submit" variant="primary">Crear</Button>
        </form>
      </Sheet>
      <Sheet open={!!pasar} onClose={() => { setPasar(null); void recargar(); }} title={pasar ? `Pasar ${pasar.nombre}` : ''}>
        {pasar && <PasarCaja caja={pasar} />}
      </Sheet>
      {editar && <EditarCaja caja={editar} cerrar={() => { setEditar(null); void recargar(); }} />}
    </div>
  );
}

function EditarCaja({ caja, cerrar }: { caja: CajaDueno; cerrar: () => void }) {
  const [nombre, setNombre] = useState(caja.nombre);
  return (
    <Sheet open onClose={cerrar} title="Cambiar caja">
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); await api(`/cajas/${caja.id}`, { method: 'PATCH', body: { nombre } }); avisar('Nombre cambiado', 'ok'); cerrar();
      }}>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} required className={claseInput} aria-label="Nombre" />
        <Button type="submit" variant="primary">Guardar</Button>
        <Button type="button" variant="danger" onClick={async () => {
          if (!confirm(`¿Desactivar ${caja.nombre}? Sus equipos dejan de cobrar como esta caja.`)) return;
          await api(`/cajas/${caja.id}`, { method: 'PATCH', body: { activa: false } }); cerrar();
        }}>Desactivar caja</Button>
      </form>
    </Sheet>
  );
}
