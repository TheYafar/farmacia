import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Headset, KeyRound, Pencil, Plus, RefreshCw, Store, UserPlus, Wifi, WifiOff, X } from 'lucide-react';
import { Alert, Button, Campo, Card, Chip, EmptyState, ErrorCarga, PageHeader, SearchInput, Sheet, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useCargar } from '@/lib/useCargar';
import { normalizar, usd } from '@/lib/format';
import { useRol } from '@/store/sesion';
import { avisar } from '@/store/avisos';
import { esUrlWeb, MODULOS_PLAN, NOMBRE_MODULO, type ModuloPlan } from '@farmacia/shared';
import { Conversacion, ESTADO_CASO, haceCuanto, type Caso } from '@/features/soporte/SoportePage';

interface EstadoFarmacia {
  nombre?: string; horaServidor?: string; encendidoHoras?: number; ventasHoy?: number; ventasHoyUsd?: string; ultimaVenta?: string | null;
  cajasAbiertas?: number; tasa?: { valor: number; fecha: string; fuente: string; modo: string } | null; usuariosActivos?: number; productos?: number;
  bajoMinimo?: number; lotesPorVencer30?: number; recipesPendientes?: number; permisosPendientes?: number; baseDatosMb?: number | null;
  discoLibreGb?: number | null; memoriaMb?: number; errores?: { fecha: string; ruta: string; mensaje: string }[];
}
interface Farmacia {
  id: string; nombre: string; rif: string | null; contacto: string | null; telefono: string | null; url: string | null; notas: string | null;
  activa: boolean; ultimoReporte: string | null; version: string | null; estado: EstadoFarmacia | null; creadaEn: string;
  conexion: 'EN_LINEA' | 'SIN_CONEXION' | 'NUNCA'; acceso: string | null; ticketsAbiertos?: number; tickets?: Caso[];
  planId: string | null; plan: { id: string; nombre: string; precioUsd: string } | null;
}
export interface Plan { id: string; clave: string; nombre: string; precioUsd: string; modulos: ModuloPlan[]; maxCajas: number; maxUsuarios: number; farmacias: number }
type CasoCentral = Caso & { farmacia: { id: string; nombre: string }; diagnostico?: EstadoFarmacia & { version?: string } | null };

const CONEXION = {
  EN_LINEA: { texto: 'En línea', tono: 'ok' as const, icon: Wifi },
  SIN_CONEXION: { texto: 'Sin conexión', tono: 'bad' as const, icon: WifiOff },
  NUNCA: { texto: 'Sin enlazar', tono: 'neutral' as const, icon: WifiOff },
};
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' });

/** El código que se pega en la farmacia: dirección de este panel + clave de la farmacia. */
const armarCodigo = (clave: string) => 'FT1.' + btoa(JSON.stringify({ u: location.origin, c: clave })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function Codigo({ clave }: { clave: string }) {
  const codigo = armarCodigo(clave);
  return (
    <div className="flex flex-col gap-2">
      <Alert tone="info">Copia este código y pégalo en la farmacia: <b>Soporte → Enlazar con soporte</b> (lo hace el dueño). Solo se muestra esta vez.</Alert>
      <code className="break-all rounded-lg bg-surface2 p-3 font-mono text-xs">{codigo}</code>
      <Button variant="primary" icon={<Copy className="h-4 w-4" />} onClick={async () => { try { await navigator.clipboard.writeText(codigo); avisar('Código copiado', 'ok'); } catch { avisar('Selecciónalo y cópialo a mano', 'bad'); } }}>Copiar código</Button>
    </div>
  );
}

const vacia = { nombre: '', rif: '', contacto: '', telefono: '', url: '', notas: '', planId: '' };

function FormFarmacia({ inicial, listo }: { inicial?: Farmacia; listo: (clave?: string) => void }) {
  const [f, setF] = useState(inicial ? { nombre: inicial.nombre, rif: inicial.rif ?? '', contacto: inicial.contacto ?? '', telefono: inicial.telefono ?? '', url: inicial.url ?? '', notas: inicial.notas ?? '', planId: inicial.planId ?? '' } : vacia);
  const { datos: planes } = useCargar(() => api<Plan[]>('/central/planes'), []);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campo = (k: keyof typeof vacia, etiqueta: string, extra: Record<string, unknown> = {}) => (
    <Campo etiqueta={etiqueta}><input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={claseInput} {...extra} /></Campo>
  );
  return (
    <form className="flex flex-col gap-3" onSubmit={async (e) => {
      e.preventDefault(); setEnviando(true); setError(null);
      try {
        if (inicial) { await api(`/central/farmacias/${inicial.id}`, { method: 'PATCH', body: f }); avisar('Datos guardados', 'ok'); listo(); }
        else { const r = await api<{ clave: string }>('/central/farmacias', { body: f }); listo(r.clave); }
      } catch (err) { setError(err instanceof ApiError ? err.message : 'No se pudo guardar'); } finally { setEnviando(false); }
    }}>
      {campo('nombre', 'Nombre de la farmacia', { required: true, maxLength: 80 })}
      <div className="grid grid-cols-2 gap-3">{campo('rif', 'RIF', { placeholder: 'J-12345678-9' })}{campo('telefono', 'Teléfono', { placeholder: '0414-5550192' })}</div>
      {campo('contacto', 'Persona de contacto')}
      {campo('url', 'Dirección web', { placeholder: 'https://mifarmacia.com', type: 'url' })}
      <Campo etiqueta="Plan" ayuda="Qué módulos, cajas y usuarios tiene. La farmacia lo recibe en menos de 5 minutos.">
        <select value={f.planId} onChange={(e) => setF({ ...f, planId: e.target.value })} className={claseInput}>
          <option value="">Sin plan (todo disponible)</option>
          {planes?.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {usd(p.precioUsd)}/mes</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Notas"><textarea value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} rows={2} className={claseInput + ' h-auto py-2'} /></Campo>
      {error && <Alert tone="bad">{error}</Alert>}
      <Button type="submit" variant="primary" disabled={enviando}>{inicial ? 'Guardar' : 'Registrar y generar código'}</Button>
    </form>
  );
}

const Dato = ({ k, v, mal }: { k: string; v: React.ReactNode; mal?: boolean }) => (
  <div className="flex justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0"><span className="text-muted">{k}</span><span className={mal ? 'font-semibold text-bad' : 'font-semibold'}>{v ?? '—'}</span></div>
);

export function Diagnostico({ e, version }: { e: EstadoFarmacia; version?: string | null }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Dato k="Ventas de hoy" v={`${e.ventasHoy ?? 0} · ${usd(e.ventasHoyUsd ?? 0)}`} />
        <Dato k="Última venta" v={e.ultimaVenta ? haceCuanto(e.ultimaVenta) : 'ninguna'} />
        <Dato k="Cajas abiertas" v={e.cajasAbiertas} />
        <Dato k="Tasa" v={e.tasa ? `${e.tasa.valor.toLocaleString('es-VE')} Bs · ${haceCuanto(e.tasa.fecha)}` : 'sin tasa'} mal={!e.tasa} />
        <Dato k="Usuarios activos" v={e.usuariosActivos} />
        <Dato k="Productos" v={e.productos} />
        <Dato k="Bajo el mínimo" v={e.bajoMinimo} />
        <Dato k="Récipes y permisos por revisar" v={`${e.recipesPendientes ?? 0} · ${e.permisosPendientes ?? 0}`} />
        <Dato k="Base de datos" v={e.baseDatosMb != null ? `${e.baseDatosMb} MB` : null} />
        <Dato k="Disco libre" v={e.discoLibreGb != null ? `${e.discoLibreGb} GB` : null} mal={e.discoLibreGb != null && e.discoLibreGb < 2} />
        <Dato k="Encendido" v={e.encendidoHoras != null ? `${e.encendidoHoras} h` : null} />
        <Dato k="Versión" v={<span className="font-mono text-xs">{version ?? '—'}</span>} />
      </div>
      {!!e.errores?.length && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-bold text-bad">Errores recientes</h3>
          {e.errores.map((x, i) => (
            <div key={i} className="rounded-lg bg-bad-soft p-2 text-xs"><div className="font-mono">{x.ruta}</div><div>{x.mensaje}</div><div className="text-muted">{haceCuanto(x.fecha)}</div></div>
          ))}
        </div>
      )}
    </div>
  );
}

async function entrarComoSoporte(id: string) {
  try {
    const r = await api<{ url: string }>(`/central/farmacias/${id}/entrar`, { method: 'POST' });
    // Solo direcciones web normales (nunca javascript:).
    if (!esUrlWeb(r.url)) { avisar('La dirección de la farmacia no es válida', 'bad'); return; }
    window.open(r.url, '_blank', 'noopener');
  } catch (e) { avisar(e instanceof ApiError ? e.message : 'No se pudo entrar', 'bad'); }
}

function DetalleFarmacia({ id, cerrar, abrirCaso }: { id: string; cerrar: () => void; abrirCaso: (id: string) => void }) {
  const esSuper = useRol() === 'SUPERADMIN';
  const { datos: f, recargar } = useCargar(() => api<Farmacia>(`/central/farmacias/${id}`), [id]);
  const [modo, setModo] = useState<'ver' | 'editar'>('ver');
  const [clave, setClave] = useState<string | null>(null);
  if (!f) return null;
  return (
    <Sheet open onClose={cerrar} title={f.nombre}>
      {clave ? <Codigo clave={clave} /> : modo === 'editar' ? <FormFarmacia inicial={f} listo={() => { setModo('ver'); void recargar(); }} /> : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={CONEXION[f.conexion].tono}>{CONEXION[f.conexion].texto}</Chip>
            {!f.activa && <Chip tone="bad">Desactivada</Chip>}
            <span className="text-sm text-muted">Último reporte {haceCuanto(f.ultimoReporte)}</span>
          </div>
          <div className="text-sm">
            <div><b>Plan:</b> {f.plan ? `${f.plan.nombre} (${usd(f.plan.precioUsd)}/mes)` : 'sin plan (todo disponible)'}</div>
            {f.rif && <div>RIF {f.rif}</div>}
            {(f.contacto || f.telefono) && <div>{[f.contacto, f.telefono].filter(Boolean).join(' · ')}</div>}
            {f.url && (esUrlWeb(f.url) ? <a href={f.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">{f.url}</a> : <span>{f.url}</span>)}
            {f.notas && <p className="mt-1 whitespace-pre-wrap text-muted">{f.notas}</p>}
          </div>
          {f.acceso
            ? <Button variant="primary" icon={<ExternalLink className="h-4 w-4" />} onClick={() => entrarComoSoporte(f.id)}>Entrar como soporte (hasta las {hora(f.acceso)})</Button>
            : <Alert tone="info">Para entrar a su sistema, el dueño debe dar acceso desde <b>Soporte → Acceso remoto</b>.</Alert>}
          {f.estado ? <Diagnostico e={f.estado} version={f.version} /> : <p className="text-sm text-muted">Todavía no ha enviado su estado.</p>}
          {!!f.tickets?.length && (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-sm font-bold">Casos</h3>
              {f.tickets.map((t) => (
                <button key={t.id} onClick={() => abrirCaso(t.id)} className="flex items-center justify-between gap-2 rounded-lg border border-line p-2 text-left text-sm hover:bg-surface2">
                  <span className="truncate">{t.asunto}</span><Chip tone={ESTADO_CASO[t.estado].tono}>{ESTADO_CASO[t.estado].texto}</Chip>
                </button>
              ))}
            </div>
          )}
          {esSuper && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <Button size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => setModo('editar')}>Editar</Button>
              <Button size="sm" icon={<KeyRound className="h-4 w-4" />} onClick={async () => {
                if (!confirm('¿Generar un código nuevo? El anterior deja de funcionar y habrá que enlazar la farmacia otra vez.')) return;
                setClave((await api<{ clave: string }>(`/central/farmacias/${f.id}/codigo`, { method: 'POST' })).clave);
              }}>Código nuevo</Button>
              <Button size="sm" variant={f.activa ? 'ghost' : 'secondary'} onClick={async () => {
                if (f.activa && !confirm(`¿Desactivar ${f.nombre}? Dejará de reportar y no podrá pedir ayuda.`)) return;
                await api(`/central/farmacias/${f.id}`, { method: 'PATCH', body: { activa: !f.activa } }); void recargar();
              }}>{f.activa ? 'Desactivar' : 'Activar'}</Button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function DetalleCaso({ id, cerrar }: { id: string; cerrar: () => void }) {
  const { datos: c, recargar } = useCargar(() => api<CasoCentral>(`/central/tickets/${id}`), [id], 20_000);
  const [verEstado, setVerEstado] = useState(false);
  if (!c) return null;
  return (
    <Sheet open onClose={cerrar} title={c.asunto}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <b>{c.farmacia.nombre}</b><Chip tone={ESTADO_CASO[c.estado].tono}>{ESTADO_CASO[c.estado].texto}</Chip>
          {(c.farmacia as unknown as Farmacia).acceso && <Button size="sm" icon={<ExternalLink className="h-4 w-4" />} onClick={() => entrarComoSoporte(c.farmacia.id)}>Entrar</Button>}
        </div>
        {c.diagnostico && (
          <div>
            <button className="text-sm font-semibold text-accent hover:underline" onClick={() => setVerEstado((v) => !v)}>{verEstado ? 'Ocultar' : 'Ver'} el estado del sistema cuando escribió{c.diagnostico.errores?.length ? ` (${c.diagnostico.errores.length} errores)` : ''}</button>
            {verEstado && <div className="mt-2"><Diagnostico e={c.diagnostico} version={c.diagnostico.version} /></div>}
          </div>
        )}
        <Conversacion caso={c} lado="SOPORTE" responder={async (texto, cerrarCaso) => { await api(`/central/tickets/${c.id}/mensajes`, { body: { texto, cerrar: cerrarCaso } }); await recargar(); }} />
      </div>
    </Sheet>
  );
}

export function FarmaciasPage() {
  const esSuper = useRol() === 'SUPERADMIN';
  const { datos, error, recargar } = useCargar(() => api<Farmacia[]>('/central/farmacias'), [], 60_000);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<'TODAS' | Farmacia['conexion'] | 'CASOS'>('TODAS');
  const [nueva, setNueva] = useState(false);
  const [clave, setClave] = useState<string | null>(null);
  const [ver, setVer] = useState<string | null>(null);
  const [caso, setCaso] = useState<string | null>(null);

  const lista = useMemo(() => (datos ?? []).filter((f) =>
    (!q || normalizar(`${f.nombre} ${f.rif ?? ''} ${f.contacto ?? ''}`).includes(normalizar(q))) &&
    (filtro === 'TODAS' || (filtro === 'CASOS' ? !!f.ticketsAbiertos : f.conexion === filtro))), [datos, q, filtro]);

  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;
  const total = datos?.length ?? 0;
  const enLinea = datos?.filter((f) => f.conexion === 'EN_LINEA').length ?? 0;
  const caidas = datos?.filter((f) => f.conexion === 'SIN_CONEXION' && f.activa).length ?? 0;
  const casos = datos?.reduce((a, f) => a + (f.ticketsAbiertos ?? 0), 0) ?? 0;
  const ventas = datos?.reduce((a, f) => a + Number(f.estado?.ventasHoyUsd ?? 0), 0) ?? 0;
  const ingreso = datos?.filter((f) => f.activa).reduce((a, f) => a + Number(f.plan?.precioUsd ?? 0), 0) ?? 0;

  const kpis: [string, React.ReactNode, typeof filtro, string?][] = [
    ['Farmacias', total, 'TODAS'],
    ['En línea', enLinea, 'EN_LINEA', 'text-ok'],
    ['Sin conexión', caidas, 'SIN_CONEXION', caidas ? 'text-bad' : undefined],
    ['Casos abiertos', casos, 'CASOS', casos ? 'text-warn' : undefined],
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Farmacias"
        subtitle={`Todas las farmacias que usan el sistema. Cobras ${usd(ingreso)} al mes en planes. Ventas de hoy entre todas: ${usd(ventas)}`}
        actions={<>
          <Button icon={<RefreshCw className="h-4 w-4" />} onClick={recargar}>Actualizar</Button>
          {esSuper && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setNueva(true)}>Registrar farmacia</Button>}
        </>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map(([t, v, k, c]) => (
          <button key={t} onClick={() => setFiltro(filtro === k ? 'TODAS' : k)} className={`rounded-xl border bg-surface p-3 text-left transition hover:border-accent ${filtro === k && k !== 'TODAS' ? 'border-accent ring-2 ring-accent/20' : 'border-line'}`}>
            <div className="text-xs text-muted">{t}</div><div className={`font-display text-2xl font-bold ${c ?? ''}`}>{v}</div>
          </button>
        ))}
      </div>
      <SearchInput value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Buscar por nombre, RIF o contacto" />

      {datos && !lista.length && (
        <EmptyState icon={<Store className="h-6 w-6" />} title={total ? 'Ninguna coincide' : 'Todavía no hay farmacias'}>
          {total ? 'Prueba con otro nombre o quita el filtro.' : esSuper ? 'Registra la primera con «Registrar farmacia» y pásale el código de enlace.' : 'El super admin debe registrarlas.'}
        </EmptyState>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {lista.map((f) => {
          const C = CONEXION[f.conexion];
          const errores = f.estado?.errores?.length ?? 0;
          return (
            <Card key={f.id} className={`flex flex-col gap-3 p-4 ${f.activa ? '' : 'opacity-60'}`}>
              <button className="flex items-start justify-between gap-2 text-left" onClick={() => setVer(f.id)}>
                <span className="min-w-0">
                  <span className="block truncate font-bold">{f.nombre}</span>
                  <span className="text-xs text-muted">{[f.plan ? `Plan ${f.plan.nombre}` : 'Sin plan', f.rif, f.contacto].filter(Boolean).join(' · ')}</span>
                </span>
                <Chip tone={C.tono} icon={<C.icon className="h-3.5 w-3.5" />}>{C.texto}</Chip>
              </button>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-surface2 p-2"><div className="text-[11px] text-muted">Ventas hoy</div><div className="font-semibold">{f.estado ? usd(f.estado.ventasHoyUsd ?? 0) : '—'}</div></div>
                <div className="rounded-lg bg-surface2 p-2"><div className="text-[11px] text-muted">Cajas</div><div className="font-semibold">{f.estado?.cajasAbiertas ?? '—'}</div></div>
                <div className="rounded-lg bg-surface2 p-2"><div className="text-[11px] text-muted">Reporte</div><div className="truncate font-semibold">{haceCuanto(f.ultimoReporte)}</div></div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {!!f.ticketsAbiertos && <Chip tone="warn" icon={<Headset className="h-3.5 w-3.5" />}>{f.ticketsAbiertos} {f.ticketsAbiertos === 1 ? 'caso' : 'casos'}</Chip>}
                {!!errores && <Chip tone="bad" icon={<AlertTriangle className="h-3.5 w-3.5" />}>{errores} {errores === 1 ? 'error' : 'errores'}</Chip>}
                {f.estado && !f.estado.tasa && <Chip tone="warn">Sin tasa</Chip>}
                {f.acceso && <Chip tone="info" icon={<KeyRound className="h-3.5 w-3.5" />}>Acceso hasta {hora(f.acceso)}</Chip>}
                <span className="ml-auto flex gap-1.5">
                  {f.acceso && <Button size="sm" variant="primary" icon={<ExternalLink className="h-4 w-4" />} onClick={() => entrarComoSoporte(f.id)}>Entrar</Button>}
                  <Button size="sm" onClick={() => setVer(f.id)}>Ver</Button>
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      <Sheet open={nueva} onClose={() => { setNueva(false); setClave(null); void recargar(); }} title={clave ? 'Código de enlace' : 'Registrar farmacia'}>
        {clave ? <Codigo clave={clave} /> : <FormFarmacia listo={(c) => setClave(c ?? null)} />}
      </Sheet>
      {ver && <DetalleFarmacia id={ver} cerrar={() => { setVer(null); void recargar(); }} abrirCaso={(id) => { setVer(null); setCaso(id); }} />}
      {caso && <DetalleCaso id={caso} cerrar={() => { setCaso(null); void recargar(); }} />}
    </div>
  );
}

export function CasosPage() {
  const [estado, setEstado] = useState<'' | Caso['estado']>('');
  const { datos, error, recargar } = useCargar(() => api<CasoCentral[]>(`/central/tickets${estado ? `?estado=${estado}` : ''}`), [estado], 20_000);
  const [ver, setVer] = useState<string | null>(null);
  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;
  const tabs: ['' | Caso['estado'], string][] = [['', 'Pendientes'], ['ABIERTO', 'Esperando respuesta'], ['RESPONDIDO', 'Respondidos'], ['CERRADO', 'Resueltos']];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Casos de soporte" subtitle="Lo que piden las farmacias. Se actualiza solo cada 20 segundos." />
      <div className="flex flex-wrap gap-1.5">
        {tabs.map(([k, t]) => <Button key={t} size="sm" variant={estado === k ? 'primary' : 'secondary'} onClick={() => setEstado(k)}>{t}</Button>)}
      </div>
      {datos?.length === 0 && <EmptyState icon={<Headset className="h-6 w-6" />} title="Nada pendiente">Cuando una farmacia pida ayuda, aparecerá aquí.</EmptyState>}
      <div className="flex flex-col gap-2">
        {datos?.map((c) => (
          <button key={c.id} onClick={() => setVer(c.id)} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-left hover:border-accent">
            <span className="min-w-0">
              <span className="block truncate font-semibold">{c.asunto}</span>
              <span className="block truncate text-xs text-muted">{c.farmacia.nombre} · {haceCuanto(c.actualizado)}{c.mensajes[0] ? ` · ${c.mensajes[0].autor}: ${c.mensajes[0].texto}` : ''}</span>
            </span>
            <Chip tone={ESTADO_CASO[c.estado].tono}>{ESTADO_CASO[c.estado].texto}</Chip>
          </button>
        ))}
      </div>
      {ver && <DetalleCaso id={ver} cerrar={() => { setVer(null); void recargar(); }} />}
    </div>
  );
}

interface Miembro { id: string; nombre: string; usuario: string; rol: 'SUPERADMIN' | 'SOPORTE'; activo: boolean }

export function EquipoPage() {
  const { datos, error, recargar } = useCargar(() => api<Miembro[]>('/central/equipo'), []);
  const [f, setF] = useState({ nombre: '', usuario: '', clave: '', rol: 'SOPORTE' as Miembro['rol'] });
  const [abierto, setAbierto] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader title="Equipo" subtitle="Quiénes entran al panel central. Soporte ve farmacias y responde casos; el super admin además registra farmacias." actions={<Button variant="primary" icon={<UserPlus className="h-4 w-4" />} onClick={() => setAbierto(true)}>Agregar</Button>} />
      <div className="flex flex-col gap-2">
        {datos?.map((m) => (
          <Card key={m.id} className="flex items-center justify-between gap-3 p-3">
            <span className="min-w-0"><span className="block font-semibold">{m.nombre}</span><span className="text-xs text-muted">{m.usuario} · {m.rol === 'SUPERADMIN' ? 'Super admin' : 'Soporte'}</span></span>
            <span className="flex items-center gap-2">
              {!m.activo && <Chip tone="bad">Desactivado</Chip>}
              <Button size="sm" variant="ghost" onClick={async () => {
                try { await api(`/central/equipo/${m.id}/activo`, { body: { activo: !m.activo } }); void recargar(); } catch (e) { avisar(e instanceof ApiError ? e.message : 'No se pudo', 'bad'); }
              }}>{m.activo ? 'Desactivar' : 'Activar'}</Button>
            </span>
          </Card>
        ))}
      </div>
      <Sheet open={abierto} onClose={() => setAbierto(false)} title="Agregar al equipo">
        <form className="flex flex-col gap-3" onSubmit={async (e) => {
          e.preventDefault(); setErr(null);
          try { await api('/central/equipo', { body: f }); avisar('Agregado', 'ok'); setF({ nombre: '', usuario: '', clave: '', rol: 'SOPORTE' }); setAbierto(false); void recargar(); } catch (x) { setErr(x instanceof ApiError ? x.message : 'No se pudo'); }
        }}>
          <Campo etiqueta="Nombre"><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required className={claseInput} /></Campo>
          <Campo etiqueta="Usuario"><input value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} required autoCapitalize="none" className={claseInput} /></Campo>
          <Campo etiqueta="Clave" ayuda="Mínimo 10 caracteres"><input type="password" value={f.clave} onChange={(e) => setF({ ...f, clave: e.target.value })} required minLength={10} className={claseInput} /></Campo>
          <Campo etiqueta="Rol">
            <select value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value as Miembro['rol'] })} className={claseInput}>
              <option value="SOPORTE">Soporte</option><option value="SUPERADMIN">Super admin</option>
            </select>
          </Campo>
          {err && <Alert tone="bad">{err}</Alert>}
          <Button type="submit" variant="primary">Agregar</Button>
        </form>
      </Sheet>
    </div>
  );
}

/** Los planes que se venden: qué módulos, cuántas cajas y usuarios, y el precio. Solo el super admin los cambia. */
export function PlanesPage() {
  const esSuper = useRol() === 'SUPERADMIN';
  const { datos, error, recargar } = useCargar(() => api<Plan[]>('/central/planes'), []);
  const [editar, setEditar] = useState<Plan | null>(null);
  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Planes" subtitle="Lo que trae cada plan. Al cambiarlo, las farmacias con ese plan lo reciben en menos de 5 minutos." />
      <Alert tone="info">En todos los planes van: Vender, Caja, Ventas, Récipes, Por revisar, Controlados, Clientes, Inventario, Catálogo, Resumen, Cajas, Usuarios, Auditoría y Soporte. Sin ellos la farmacia no puede operar ni cumplir con los controlados.</Alert>
      <div className="grid gap-3 md:grid-cols-3">
        {datos?.map((p) => (
          <Card key={p.id} className="flex flex-col gap-3 p-5">
            <div>
              <div className="text-lg font-bold">{p.nombre}</div>
              <div className="font-display text-3xl font-bold text-accent">{usd(p.precioUsd)}<span className="text-sm font-normal text-muted"> /mes</span></div>
              <div className="text-xs text-muted">{p.farmacias} {p.farmacias === 1 ? 'farmacia' : 'farmacias'} con este plan</div>
            </div>
            <ul className="flex flex-col gap-1.5 text-sm">
              {MODULOS_PLAN.map((m) => (
                <li key={m} className={`flex gap-2 ${p.modulos.includes(m) ? '' : 'text-muted line-through'}`}>
                  {p.modulos.includes(m) ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <X className="mt-0.5 h-4 w-4 shrink-0" />}{NOMBRE_MODULO[m].split(' (')[0]}
                </li>
              ))}
              <li className="mt-1 border-t border-line pt-2">{p.maxCajas ? `Hasta ${p.maxCajas} ${p.maxCajas === 1 ? 'caja' : 'cajas'}` : 'Cajas sin límite'} · {p.maxUsuarios ? `${p.maxUsuarios} usuarios` : 'usuarios sin límite'}</li>
            </ul>
            {esSuper && <Button className="mt-auto" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditar(p)}>Cambiar</Button>}
          </Card>
        ))}
      </div>
      {editar && <EditarPlan plan={editar} cerrar={() => { setEditar(null); void recargar(); }} />}
    </div>
  );
}

function EditarPlan({ plan, cerrar }: { plan: Plan; cerrar: () => void }) {
  const [f, setF] = useState({ nombre: plan.nombre, precioUsd: plan.precioUsd, modulos: plan.modulos, maxCajas: String(plan.maxCajas), maxUsuarios: String(plan.maxUsuarios) });
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open onClose={cerrar} title={`Cambiar plan ${plan.nombre}`}>
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          await api(`/central/planes/${plan.id}`, { method: 'PATCH', body: { nombre: f.nombre, precioUsd: Number(String(f.precioUsd).replace(',', '.')), modulos: f.modulos, maxCajas: Number(f.maxCajas) || 0, maxUsuarios: Number(f.maxUsuarios) || 0 } });
          avisar('Plan guardado. Las farmacias lo reciben en menos de 5 minutos', 'ok'); cerrar();
        } catch (x) { setError(x instanceof ApiError ? x.message : 'No se pudo guardar'); }
      }}>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Nombre"><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required maxLength={40} className={claseInput} /></Campo>
          <Campo etiqueta="Precio ($/mes)"><input value={f.precioUsd} onChange={(e) => setF({ ...f, precioUsd: e.target.value })} inputMode="decimal" required className={claseInput} /></Campo>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Módulos que trae</legend>
          {MODULOS_PLAN.map((m) => (
            <label key={m} className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.modulos.includes(m)} onChange={(e) => setF({ ...f, modulos: e.target.checked ? [...f.modulos, m] : f.modulos.filter((x) => x !== m) })} />
              {NOMBRE_MODULO[m]}
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Cajas" ayuda="0 = sin límite"><input value={f.maxCajas} onChange={(e) => setF({ ...f, maxCajas: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className={claseInput} /></Campo>
          <Campo etiqueta="Usuarios activos" ayuda="0 = sin límite"><input value={f.maxUsuarios} onChange={(e) => setF({ ...f, maxUsuarios: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className={claseInput} /></Campo>
        </div>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary">Guardar plan</Button>
      </form>
    </Sheet>
  );
}
