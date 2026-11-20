import { AlertTriangle, Check, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, Avatar, Button, Card, Cargando, Chip, EmptyState, ErrorCarga, PageHeader, claseInput } from '@/components/ui';
import { api, ApiError, imagen } from '@/lib/api';
import { cedula, hora, initials } from '@/lib/format';
import type { Autorizacion, Recipe } from '@/lib/tipos';
import { useCargar } from '@/lib/useCargar';
import { avisar } from '@/store/avisos';

function FotoProtegida({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    imagen(`/recipes/${id}/foto`).then((u) => { url = u; setSrc(u); }).catch(() => setSrc(''));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id]);
  if (src === null) return <div className="h-64 animate-pulse rounded-lg bg-surface2" />;
  if (!src) return <Alert tone="bad">No se pudo cargar la foto</Alert>;
  return <a href={src} target="_blank" rel="noreferrer"><img src={src} alt="Foto del récipe" className="max-h-[380px] w-full rounded-lg bg-surface2 object-contain" /></a>;
}

function PermisoPendiente({ a, onListo }: { a: Autorizacion; onListo: () => void }) {
  const [motivo, setMotivo] = useState('');
  const responder = async (accion: 'aprobar' | 'rechazar') => {
    try {
      await api(`/autorizaciones/${a.id}/${accion}`, { body: { motivo: motivo || undefined } });
      avisar(accion === 'aprobar' ? 'Aprobado: el cajero ya puede cobrar' : 'Rechazado', accion === 'aprobar' ? 'ok' : 'info');
      onListo();
    } catch (e) { avisar(e instanceof ApiError ? e.message : 'No se pudo responder', 'bad'); }
  };
  const pa = a.producto.principioActivo;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-l-[6px] border-line border-l-bad bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-lg font-semibold">{a.producto.nombreComercial} {a.producto.concentracion}</div>
          <div className="text-sm text-muted">{pa.nombre}{pa.uso ? ` · ${pa.uso}` : ''}</div>
        </div>
        <Chip tone="bad" icon={<AlertTriangle className="h-3.5 w-3.5" />}>{a.razon === 'ALERGIA' ? 'Choca con una alergia' : pa.riesgo === 'PSICOTROPICO' ? 'Psicotrópico' : 'Antibiótico'}</Chip>
      </div>
      <div className="flex items-center gap-2.5 rounded-lg bg-surface2 p-2.5">
        <Avatar text={initials(a.paciente.nombre)} />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold">{a.paciente.nombre}</div>
          <div className="font-mono text-xs text-muted">{cedula(a.paciente.cedula)}</div>
        </div>
        {a.paciente.alergias.map((x) => <Chip key={x} tone="bad">Alérgico a {x}</Chip>)}
      </div>
      <p className="text-xs text-muted">Pedido por {a.solicitadaPor?.nombre ?? '—'} a las {hora(a.creadaEn)}</p>
      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Nota (opcional): por qué lo apruebas o rechazas" className={claseInput} aria-label="Nota" />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => responder('aprobar')}>Lo apruebo</Button>
        <Button icon={<X className="h-4 w-4" />} onClick={() => responder('rechazar')}>No lo apruebo</Button>
      </div>
    </div>
  );
}

function RecipePendiente({ r, onListo }: { r: Recipe; onListo: () => void }) {
  const responder = async (aprobado: boolean) => {
    try {
      await api(`/recipes/${r.id}/validar`, { body: { aprobado } });
      avisar(aprobado ? 'Récipe aprobado' : 'Récipe rechazado', aprobado ? 'ok' : 'info');
      onListo();
    } catch (e) { avisar(e instanceof ApiError ? e.message : 'No se pudo responder', 'bad'); }
  };
  return (
    <div className="grid gap-3 rounded-xl border border-l-[6px] border-line border-l-warn bg-surface p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <FotoProtegida id={r.id} />
      <div className="flex flex-col gap-3">
        <div>
          <div className="text-lg font-semibold">{r.paciente?.nombre ?? 'Cliente sin cédula'}</div>
          <div className="text-sm text-muted">{r.cedula ? cedula(r.cedula) : '—'} · enviado por {r.creadoPor?.nombre} a las {hora(r.creadoEn)}</div>
        </div>
        {r.paciente?.alergias.length ? <div className="flex flex-wrap gap-1.5">{r.paciente.alergias.map((x) => <Chip key={x} tone="bad">Alérgico a {x}</Chip>)}</div> : null}
        <p className="text-sm text-muted">Revisa que la foto se lea bien y que el récipe sea válido.</p>
        <div className="mt-auto flex flex-wrap gap-2">
          <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => responder(true)}>Récipe válido</Button>
          <Button icon={<X className="h-4 w-4" />} onClick={() => responder(false)}>Rechazar</Button>
        </div>
      </div>
    </div>
  );
}

/** Bandeja del farmacéutico: permisos pedidos desde la caja y récipes por revisar. Se actualiza sola. */
export default function ValidacionesPage() {
  const permisos = useCargar(() => api<Autorizacion[]>('/autorizaciones'), [], 10_000);
  const recipes = useCargar(() => api<Recipe[]>('/recipes/pendientes'), [], 15_000);
  const total = (permisos.datos?.length ?? 0) + (recipes.datos?.length ?? 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Por revisar" subtitle="Lo que la caja te envió y necesita tu permiso. Se actualiza solo." />
      {permisos.error && <ErrorCarga mensaje={permisos.error} reintentar={permisos.recargar} />}
      {permisos.cargando || recipes.cargando ? <Cargando /> : total === 0 ? (
        <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title="Todo está al día">Cuando un cajero necesite tu permiso, aparecerá aquí.</EmptyState>
      ) : (
        <>
          {!!permisos.datos?.length && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-bold">Permisos para vender ({permisos.datos.length})</h2>
              {permisos.datos.map((a) => <PermisoPendiente key={a.id} a={a} onListo={permisos.recargar} />)}
            </section>
          )}
          {!!recipes.datos?.length && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-bold">Récipes ({recipes.datos.length})</h2>
              {recipes.datos.map((r) => <RecipePendiente key={r.id} r={r} onListo={recipes.recargar} />)}
            </section>
          )}
        </>
      )}
      <Card className="text-sm text-muted">También puedes aprobar directamente desde «Vender» cuando atiendes tú.</Card>
    </div>
  );
}
