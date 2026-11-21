import { clsx } from 'clsx';
import {
  ArrowLeft, CalendarX2, Camera, ChevronDown, ClipboardList, FileSpreadsheet, FlaskConical, Hammer, PackagePlus,
  PackageSearch, Pencil, Plus, Printer, SearchX, Tags, Truck, type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CATEGORIAS } from '@farmacia/shared';
import { Alert, Button, Campo, Card, Cargando, Chip, EmptyState, ErrorCarga, PageHeader, SearchInput, Sheet, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { bs, daysUntil, fecha, normalizar, usd } from '@/lib/format';
import type { Principio } from '@/lib/tipos';
import { useCargar } from '@/lib/useCargar';
import { avisar } from '@/store/avisos';
import { useRol, useSesion } from '@/store/sesion';
import { RevisarControlados } from '@/features/panel/PanelPage';
import ImportarExcel from './ImportarExcel';
import { CargarCompra } from './InventarioPage';
import { FotoProducto, subirFoto } from '@/lib/fotos';

/* ───────── Datos ───────── */

export interface ProductoInv {
  id: string; nombreComercial: string; laboratorio: string; concentracion: string; forma: string; unidadesPorCaja: number;
  precioUsd: string; nivel: string; requiereRecipe: boolean; stockMinimo: number; activo: boolean; ivaPct: number; categoria: string;
  codigoBarras: string | null; costoUsd: string | null; margenPct: number | null; stock: number; bajo: boolean; foto?: string | null;
  vencidas?: number; proximoVence?: string | null;
  principioActivo: { id: string; nombre: string; riesgo: string };
}
interface LoteInv { id: string; numero: string; vence: string; stockLibre: number; stockReservado: number }
interface Ajuste { id: string; creadoEn: string; producto: string; lote: string; cantidad: number; motivo: string; nota: string | null; usuario: string }

const msg = (e: unknown) => (e instanceof ApiError ? [e.message, ...e.errores.map((x) => x.mensaje)].join('. ') : 'No se pudo guardar');
const RIESGO: Record<string, [string, 'neutral' | 'warn' | 'bad']> = { NORMAL: ['Normal', 'neutral'], ANTIBIOTICO: ['Antibiótico', 'warn'], PSICOTROPICO: ['Psicotrópico', 'bad'] };
const fechaLarga = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const hoyMas = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

/** Cómo decir el vencimiento en palabras, con su color. */
function venceTexto(iso: string): { tone: 'bad' | 'warn' | 'ok' | 'neutral'; txt: string } {
  const d = daysUntil(iso);
  if (d < 0) return { tone: 'bad', txt: 'Vencido: retirar' };
  if (d === 0) return { tone: 'bad', txt: 'Vence hoy' };
  if (d <= 30) return { tone: 'bad', txt: `Vence en ${d} ${d === 1 ? 'día' : 'días'}` };
  if (d <= 90) return { tone: 'warn', txt: `Vence en ${Math.round(d / 30)} ${Math.round(d / 30) === 1 ? 'mes' : 'meses'}` };
  return { tone: 'neutral', txt: `Vence ${new Date(iso).toLocaleDateString('es-VE', { month: 'short', year: 'numeric', timeZone: 'UTC' })}` };
}

type Filtro = 'todos' | 'pocos' | 'agotados' | 'vencen' | 'vencidos';
const FILTROS: [Filtro, string][] = [['todos', 'Todos'], ['pocos', 'Quedan pocos'], ['agotados', 'Agotados'], ['vencen', 'Vencen pronto'], ['vencidos', 'Vencidos']];
const cumple = (p: ProductoInv, f: Filtro) =>
  f === 'todos' ? true
  : f === 'pocos' ? p.activo && p.stock > 0 && p.bajo
  : f === 'agotados' ? p.activo && p.stock === 0
  : f === 'vencidos' ? (p.vencidas ?? 0) > 0
  : !!p.proximoVence && daysUntil(p.proximoVence) <= 90;

/* ───────── Pantalla ───────── */

export default function InventarioPage() {
  const rol = useRol();
  const admin = rol === 'ADMIN';
  const tasa = useSesion((s) => s.tasa);
  const [params, setParams] = useSearchParams();
  const filtro = (FILTROS.some(([k]) => k === params.get('ver')) ? params.get('ver') : 'todos') as Filtro;
  const setFiltro = (f: Filtro) => setParams(f === 'todos' ? {} : { ver: f }, { replace: true });
  const [q, setQ] = useState('');
  const prods = useCargar(() => api<ProductoInv[]>('/catalogo/productos'), []);
  const princ = useCargar(() => api<Principio[]>('/catalogo/principios'), []);
  const [ficha, setFicha] = useState<ProductoInv | null>(null);
  const [editar, setEditar] = useState<ProductoInv | 'nuevo' | null>(null);
  const [corregir, setCorregir] = useState<ProductoInv | 'elegir' | null>(null);
  const [compra, setCompra] = useState(false);
  const [precios, setPrecios] = useState(false);
  const [excel, setExcel] = useState(false);
  const [vista, setVista] = useState<'principios' | 'historial' | null>(null);
  const recargar = () => { prods.recargar(); princ.recargar(); };

  const todos = prods.datos ?? [];
  const palabras = normalizar(q).split(/\s+/).filter(Boolean);
  const buscados = useMemo(() => todos.filter((p) => {
    const t = normalizar(`${p.nombreComercial} ${p.concentracion} ${p.laboratorio} ${p.principioActivo.nombre} ${p.codigoBarras ?? ''}`);
    return palabras.every((w) => t.includes(w));
  }), [todos, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const lista = buscados.filter((p) => cumple(p, filtro));
  // La ficha abierta se refresca cuando cambian los datos (después de corregir o editar).
  const fichaActual = ficha ? todos.find((p) => p.id === ficha.id) ?? ficha : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Inventario" subtitle="Lo que tienes para vender: cuánto hay, a cuánto lo vendes y cuándo vence." />
      <RevisarControlados />

      {/* Lo que se hace casi todos los días, en botones grandes. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {admin && <Accion icono={Truck} titulo="Llegó mercancía" detalle="Carga la factura de la droguería" principal onClick={() => setCompra(true)} />}
        {admin && <Accion icono={PackagePlus} titulo="Producto nuevo" detalle="Algo que nunca has vendido" onClick={() => setEditar('nuevo')} />}
        <Accion icono={Hammer} titulo="Corregir cantidad" detalle="Se rompió, se venció o contaste otra cosa" onClick={() => setCorregir('elegir')} />
        {admin && <Accion icono={Tags} titulo="Cambiar precios" detalle="Subir o bajar a varios a la vez" onClick={() => setPrecios(true)} />}
      </div>

      <SearchInput value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Buscar: nombre, laboratorio, componente o código" aria-label="Buscar producto" />
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist">
        {FILTROS.map(([k, t]) => {
          const n = buscados.filter((p) => cumple(p, k)).length;
          const alerta = (k === 'vencidos' || k === 'agotados') && n > 0;
          return (
            <button key={k} role="tab" aria-selected={filtro === k} onClick={() => setFiltro(k)}
              className={clsx('flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold', filtro === k ? 'border-accent bg-accent text-white' : 'border-line bg-surface hover:bg-surface2')}>
              {t}<span className={clsx('rounded-full px-1.5 font-mono text-xs', filtro === k ? 'bg-white/20' : alerta ? 'bg-bad text-white' : 'bg-surface2 text-muted')}>{n}</span>
            </button>
          );
        })}
      </div>
      {filtro === 'vencidos' && lista.length > 0 && <Alert tone="bad">Lo vencido no se vende. Sácalo del estante y regístralo: toca el producto → «Corregir cantidad» → «Se venció».</Alert>}

      {prods.error && <ErrorCarga mensaje={prods.error} reintentar={prods.recargar} />}
      {prods.cargando && !prods.datos ? <Cargando /> : !lista.length ? (
        <EmptyState icon={<SearchX className="h-8 w-8" />} title={q ? `Nada con «${q}»` : 'Nada por aquí'}>
          {q && admin ? <Button className="mt-2" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditar('nuevo')}>Crear «{q}» como producto nuevo</Button> : filtro !== 'todos' ? '¡Bien! No hay productos en esta lista.' : null}
        </EmptyState>
      ) : (
        <Card className="gap-0 p-0">
          <ul className="flex flex-col divide-y divide-line">
            {lista.map((p) => <FilaProducto key={p.id} p={p} tasa={tasa} abrir={() => setFicha(p)} />)}
          </ul>
        </Card>
      )}

      {/* Lo que se usa poco va abajo, sin estorbar. */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
        {admin && <Enlace icono={FileSpreadsheet} onClick={() => setExcel(true)}>Cargar todo desde Excel</Enlace>}
        <Enlace icono={Printer} onClick={() => { if (!lista.length) { avisar('No hay productos en la lista', 'bad'); return; } imprimirEtiquetas(lista, tasa); }}>Imprimir etiquetas de precio ({lista.length})</Enlace>
        <Enlace icono={ClipboardList} onClick={() => setVista('historial')}>Historial de correcciones</Enlace>
        <Enlace icono={FlaskConical} onClick={() => setVista('principios')}>Componentes (principios activos)</Enlace>
      </div>

      <FichaProducto p={fichaActual} tasa={tasa} admin={admin} onCerrar={() => setFicha(null)} onCambio={recargar}
        corregir={() => setCorregir(fichaActual)} editar={() => setEditar(fichaActual)} />
      <FormProducto p={editar} principios={princ.datos ?? []} onCerrar={() => setEditar(null)} onListo={recargar} />
      <CorregirCantidad producto={corregir} productos={todos} onCerrar={() => setCorregir(null)} onListo={recargar} />
      <CargarCompra abierto={compra} onCerrar={() => setCompra(false)} onListo={() => { setCompra(false); recargar(); }} />
      <CambiarPrecios abierto={precios} onCerrar={() => setPrecios(false)} onListo={recargar} />
      <ImportarExcel abierto={excel} onCerrar={() => setExcel(false)} onListo={recargar} />
      <Sheet grande open={vista === 'principios'} onClose={() => setVista(null)} title="Componentes (principios activos)">
        <Principios lista={princ.datos ?? []} onCambio={recargar} />
      </Sheet>
      <Sheet grande open={vista === 'historial'} onClose={() => setVista(null)} title="Historial de correcciones">
        {vista === 'historial' && <Historial />}
      </Sheet>
    </div>
  );
}

function Accion({ icono: Icono, titulo, detalle, onClick, principal }: { icono: LucideIcon; titulo: string; detalle: string; onClick: () => void; principal?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={clsx('flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition hover:shadow-sm sm:items-start sm:gap-3 sm:p-3 md:p-4', principal ? 'border-accent bg-accent text-white' : 'border-line bg-surface hover:bg-surface2')}>
      <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-lg sm:h-10 sm:w-10', principal ? 'bg-white/20' : 'bg-accent-soft text-accent')}><Icono className="h-5 w-5" aria-hidden /></span>
      <span className="min-w-0"><span className="block font-bold leading-tight">{titulo}</span><span className={clsx('mt-0.5 hidden text-xs leading-snug sm:block', principal ? 'text-white/85' : 'text-muted')}>{detalle}</span></span>
    </button>
  );
}

function Enlace({ icono: Icono, onClick, children }: { icono: LucideIcon; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className="flex items-center gap-1.5 font-semibold text-muted hover:text-fg"><Icono className="h-4 w-4" aria-hidden />{children}</button>;
}

function Hay({ p, grande }: { p: ProductoInv; grande?: boolean }) {
  const clase = grande ? 'text-3xl' : 'text-lg';
  if (!p.activo) return <span className="text-sm font-semibold text-muted">No se vende</span>;
  if (p.stock === 0) return <span className={clsx('font-bold text-bad', grande ? 'text-2xl' : 'text-sm')}>Agotado</span>;
  return <span className={clsx('font-mono font-bold', clase, p.bajo ? 'text-warn' : 'text-fg')}>{p.stock}</span>;
}

function FilaProducto({ p, tasa, abrir }: { p: ProductoInv; tasa: number | null; abrir: () => void }) {
  const v = p.proximoVence ? venceTexto(p.proximoVence) : null;
  return (
    <li>
      <button type="button" onClick={abrir} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-surface2 md:grid-cols-[1fr_90px_110px_170px]">
        <span className="flex min-w-0 items-center gap-3">
          <FotoProducto foto={p.foto} nombre={p.nombreComercial} />
          <span className="min-w-0">
            <span className="block font-semibold leading-snug">{p.nombreComercial} <span className="font-normal text-muted">{p.concentracion}</span></span>
            <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              {p.laboratorio} · {p.forma}
              {p.principioActivo.riesgo !== 'NORMAL' && <Chip tone={RIESGO[p.principioActivo.riesgo]![1]}>{RIESGO[p.principioActivo.riesgo]![0]}</Chip>}
            </span>
          </span>
        </span>
        <span className="text-right md:text-center"><Hay p={p} />{p.stock > 0 && p.activo && <span className="block text-[11px] text-muted">{p.bajo ? 'quedan pocos' : 'hay'}</span>}</span>
        <span className="font-mono text-sm md:text-right">{usd(p.precioUsd)}<span className="ml-2 text-xs text-muted md:ml-0 md:block">{bs(p.precioUsd, tasa)}</span></span>
        <span className="flex justify-end md:justify-start">
          {(p.vencidas ?? 0) > 0 ? <Chip tone="bad" icon={<CalendarX2 className="h-3 w-3" />}>{p.vencidas} vencidas</Chip> : v ? <Chip tone={v.tone}>{v.txt}</Chip> : null}
        </span>
      </button>
    </li>
  );
}

/* ───────── Ficha de un producto ───────── */

function FichaProducto({ p, tasa, admin, onCerrar, onCambio, corregir, editar }: { p: ProductoInv | null; tasa: number | null; admin: boolean; onCerrar: () => void; onCambio: () => void; corregir: () => void; editar: () => void }) {
  const lotes = useCargar(() => (p ? api<LoteInv[]>(`/inventario/lotes?productoId=${p.id}`) : Promise.resolve([])), [p?.id, p?.stock, p?.vencidas]);
  if (!p) return null;
  const riesgo = RIESGO[p.principioActivo.riesgo]!;
  return (
    <Sheet grande open onClose={onCerrar} title={`${p.nombreComercial} ${p.concentracion}`}>
      <div className="flex flex-col gap-4">
        <FotoDeProducto p={p} onCambio={onCambio} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Card className="gap-0.5 p-3"><span className="text-xs text-muted">Hay</span><Hay p={p} grande />{p.stockMinimo > 0 && <span className="text-xs text-muted">Te aviso si quedan {p.stockMinimo} o menos</span>}</Card>
          <Card className="gap-0.5 p-3"><span className="text-xs text-muted">Lo vendes a</span><span className="font-mono text-2xl font-bold">{usd(p.precioUsd)}</span><span className="text-xs text-muted">{bs(p.precioUsd, tasa)}</span></Card>
          <Card className="col-span-2 gap-0.5 p-3 sm:col-span-1"><span className="text-xs text-muted">Te cuesta</span>
            {p.costoUsd ? <><span className="font-mono text-2xl font-bold">{usd(p.costoUsd)}</span><span className={clsx('text-xs font-semibold', (p.margenPct ?? 0) < 15 ? 'text-bad' : 'text-ok')}>Ganas {p.margenPct} % en cada una</span></> : <span className="text-sm text-muted">Se sabe al cargar una factura</span>}
          </Card>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<Hammer className="h-4 w-4" />} onClick={corregir}>Corregir cantidad</Button>
          {admin && <Button icon={<Pencil className="h-4 w-4" />} onClick={editar}>Cambiar datos o precio</Button>}
          <Button icon={<Printer className="h-4 w-4" />} onClick={() => imprimirEtiquetas([p], tasa)}>Etiqueta</Button>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="font-bold">Lotes en el estante</h3>
          <p className="-mt-1 text-xs text-muted">Cada caja que llega trae un número de lote y una fecha de vencimiento. Al vender, sale primero la que vence antes.</p>
          {lotes.cargando && !lotes.datos ? <Cargando /> : !lotes.datos?.length ? (
            <Alert tone="warn">No hay unidades de este producto. Cuando llegue, usa «Llegó mercancía»; si ya lo tienes en el estante, usa «Corregir cantidad» → «Apareció mercancía».</Alert>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
              {lotes.datos.map((l) => {
                const v = venceTexto(l.vence);
                return (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <span><span className="font-semibold">Vence {fechaLarga(l.vence)}</span> {v.tone !== 'neutral' && <Chip tone={v.tone}>{v.txt}</Chip>}<span className="block font-mono text-xs text-muted">Lote {l.numero}</span></span>
                    <span className="text-right"><span className="font-mono text-lg font-bold">{l.stockLibre}</span>{l.stockReservado > 0 && <span className="block text-xs text-muted">+ {l.stockReservado} apartadas para encargos</span>}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-surface2 p-3 text-sm">
          <span className="text-muted">Componente</span><span>{p.principioActivo.nombre} {p.principioActivo.riesgo !== 'NORMAL' && <Chip tone={riesgo[1]}>{riesgo[0]}</Chip>}</span>
          <span className="text-muted">Laboratorio</span><span>{p.laboratorio}</span>
          <span className="text-muted">Presentación</span><span>{p.forma} · caja de {p.unidadesPorCaja}</span>
          <span className="text-muted">Categoría</span><span>{p.categoria}{p.ivaPct ? ` · IVA ${p.ivaPct} %` : ' · sin IVA'}</span>
          {p.codigoBarras && <><span className="text-muted">Código</span><span className="font-mono">{p.codigoBarras}</span></>}
          <span className="text-muted">Récipe</span><span>{p.principioActivo.riesgo !== 'NORMAL' ? 'Sí, y permiso del farmacéutico' : p.requiereRecipe ? 'Sí' : 'No'}</span>
          {!p.activo && <><span className="text-muted">Estado</span><span className="font-semibold text-bad">No se vende (desactivado)</span></>}
        </section>
      </div>
    </Sheet>
  );
}

/** La foto en la ficha: tomarla con la cámara (en el teléfono) o elegirla, cambiarla o quitarla. */
function FotoDeProducto({ p, onCambio }: { p: ProductoInv; onCambio: () => void }) {
  const [subiendo, setSubiendo] = useState(false);
  const elegir = async (archivo?: File) => {
    if (!archivo) return;
    setSubiendo(true);
    try { await subirFoto(p.id, archivo); avisar('Foto guardada', 'ok'); onCambio(); }
    catch (e) { avisar(e instanceof ApiError ? e.message : 'No se pudo subir la foto', 'bad'); }
    finally { setSubiendo(false); }
  };
  return (
    <div className="flex items-center gap-4">
      <FotoProducto foto={p.foto} nombre={p.nombreComercial} tamano="lg" />
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">{p.foto ? 'Así se ve al vender. Ayuda a no confundir productos parecidos.' : 'Ponle una foto de la caja: así se reconoce rápido al vender.'}</p>
        <label className={clsx('inline-flex h-10 cursor-pointer items-center gap-1.5 self-start rounded-lg px-3.5 text-sm font-semibold', p.foto ? 'border border-line bg-surface hover:bg-surface2' : 'bg-accent text-white')}>
          <Camera className="h-4 w-4" aria-hidden />{subiendo ? 'Subiendo…' : p.foto ? 'Cambiar foto' : 'Tomar o elegir foto'}
          <input type="file" accept="image/*" className="sr-only" disabled={subiendo} onChange={(e) => { void elegir(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {p.foto && <button type="button" className="self-start text-xs font-semibold text-muted underline" onClick={async () => {
          try { await api(`/catalogo/productos/${p.id}/foto`, { method: 'DELETE' }); avisar('Foto quitada', 'ok'); onCambio(); } catch (e) { avisar(e instanceof ApiError ? e.message : 'No se pudo', 'bad'); }
        }}>Quitar foto</button>}
      </div>
    </div>
  );
}

/* ───────── Producto nuevo / cambiar datos ───────── */

const FORMAS = ['Tabletas', 'Cápsulas', 'Jarabe', 'Suspensión', 'Gotas', 'Crema', 'Inyectable', 'Sobres', 'Inhalador', 'Otro'];

function FormProducto({ p, principios, onCerrar, onListo }: { p: ProductoInv | 'nuevo' | null; principios: Principio[]; onCerrar: () => void; onListo: () => void }) {
  const base = p && p !== 'nuevo' ? p : null;
  const tasa = useSesion((s) => s.tasa);
  const labs = useCargar(() => (p ? api<string[]>('/catalogo/laboratorios') : Promise.resolve([])), [!!p]);
  const ini = () => ({
    nombre: base?.nombreComercial ?? '', medicamento: base ? base.categoria === 'Medicamentos' : true,
    principio: base?.principioActivo.nombre ?? '', riesgoNuevo: 'NORMAL', usoNuevo: '',
    concentracion: base?.concentracion ?? '', forma: base?.forma ?? 'Tabletas', otraForma: '', laboratorio: base?.laboratorio ?? '',
    precio: base ? base.precioUsd.replace('.', ',') : '', cantidad: '', vence: '',
    unidades: String(base?.unidadesPorCaja ?? 1), codigo: base?.codigoBarras ?? '', minimo: String(base?.stockMinimo ?? 0),
    categoria: base?.categoria ?? 'Medicamentos', iva: String(base?.ivaPct ?? 0), nivel: base?.nivel ?? 'GENERICO',
    recipe: base?.requiereRecipe ?? false, activo: base?.activo ?? true,
  });
  const [f, setF] = useState(ini);
  const [mas, setMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [foto, setFoto] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  useEffect(() => { setF(ini()); setError(null); setMas(false); setFoto(null); }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!foto) { setVista(null); return; } const u = URL.createObjectURL(foto); setVista(u); return () => URL.revokeObjectURL(u); }, [foto]);
  const c = (x: Partial<typeof f>) => setF((v) => ({ ...v, ...x }));
  const existente = principios.find((x) => normalizar(x.nombre) === normalizar(f.principio));
  const sugeridos = f.principio.trim() && !existente ? principios.filter((x) => normalizar(x.nombre).includes(normalizar(f.principio))).slice(0, 5) : [];
  const precio = Number(f.precio.replace(/\./g, '').replace(',', '.'));

  const guardar = async () => {
    setError(null);
    if (!f.nombre.trim()) { setError('Escribe el nombre del producto'); return; }
    if (f.medicamento && !f.principio.trim()) { setError('Escribe el componente (principio activo). Ej.: Acetaminofén'); return; }
    if (f.medicamento && !f.concentracion.trim()) { setError('Escribe la concentración. Ej.: 500 mg'); return; }
    if (!(precio > 0)) { setError('Escribe el precio de venta en dólares'); return; }
    const cant = Number(f.cantidad) || 0;
    if (!base && cant > 0 && !f.vence) { setError('Escribe cuándo vence lo que tienes'); return; }
    setGuardando(true);
    try {
      // El componente: el que ya existe, o se crea. Si no es medicamento, el componente es el mismo producto.
      const nombrePa = f.medicamento ? f.principio.trim() : f.nombre.trim();
      let pa = principios.find((x) => normalizar(x.nombre) === normalizar(nombrePa));
      if (!pa) {
        try { pa = await api<Principio>('/catalogo/principios', { body: { nombre: nombrePa, riesgo: f.medicamento ? f.riesgoNuevo : 'NORMAL', uso: f.usoNuevo.trim() || undefined } }); }
        catch (e) { if (e instanceof ApiError && e.status === 409) pa = (await api<Principio[]>('/catalogo/principios')).find((x) => normalizar(x.nombre) === normalizar(nombrePa)); else throw e; }
      }
      if (!pa) throw new Error('No se pudo crear el componente');
      const body = {
        nombreComercial: f.nombre.trim(), principioActivoId: pa.id, laboratorio: f.laboratorio.trim() || 'Sin laboratorio',
        concentracion: f.concentracion.trim() || 'Unidad', forma: (f.forma === 'Otro' ? f.otraForma.trim() : f.forma) || 'Unidad',
        unidadesPorCaja: Math.max(1, Number(f.unidades) || 1), precioUsd: precio, nivel: f.nivel,
        codigoBarras: f.codigo.trim() || undefined, requiereRecipe: f.recipe, stockMinimo: Number(f.minimo) || 0, activo: f.activo,
        ivaPct: Number(f.iva), categoria: f.medicamento ? 'Medicamentos' : f.categoria === 'Medicamentos' ? 'Misceláneos' : f.categoria,
      };
      const r = await api<{ id: string }>(base ? `/catalogo/productos/${base.id}` : '/catalogo/productos', { method: base ? 'PATCH' : 'POST', body });
      // La foto va después de crear el producto; si falla, el producto igual queda creado.
      if (!base && foto) await subirFoto(r.id, foto).catch(() => avisar('El producto se creó, pero la foto no se pudo subir. Pruébala desde su ficha', 'bad'));
      if (!base && cant > 0) await api('/inventario/existencia', { body: { productoId: r.id, cantidad: cant, vence: f.vence, motivo: 'CONTEO', nota: 'Existencia inicial' } });
      avisar(base ? 'Cambios guardados' : cant > 0 ? `Listo: ${f.nombre} ya se puede vender (hay ${cant})` : `Producto creado. Para venderlo, carga la mercancía con «Llegó mercancía»`, 'ok');
      onListo(); onCerrar();
    } catch (e) { setError(e instanceof ApiError ? msg(e) : e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  return (
    <Sheet open={!!p} onClose={onCerrar} title={base ? `Cambiar datos de ${base.nombreComercial}` : 'Producto nuevo'}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
        {!base && (
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line p-2 hover:bg-surface2">
            {vista ? <img src={vista} alt="" className="h-14 w-14 rounded-lg border border-line bg-white object-contain" /> : <span className="grid h-14 w-14 place-items-center rounded-lg bg-surface2 text-muted"><Camera className="h-6 w-6" aria-hidden /></span>}
            <span className="text-sm"><span className="block font-semibold">{vista ? 'Cambiar la foto' : 'Foto de la caja (opcional)'}</span><span className="text-xs text-muted">Para reconocerlo rápido al vender</span></span>
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => { setFoto(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          </label>
        )}
        <Campo etiqueta="¿Cómo se llama?"><input autoFocus value={f.nombre} onChange={(e) => c({ nombre: e.target.value })} placeholder="Ej.: Atamel" className={claseInput} /></Campo>
        <div className="flex flex-col gap-1 text-sm font-semibold">¿Es un medicamento?
          <div className="grid grid-cols-2 gap-2">
            <Opcion activa={f.medicamento} onClick={() => c({ medicamento: true })}>Sí, es medicina</Opcion>
            <Opcion activa={!f.medicamento} onClick={() => c({ medicamento: false, forma: f.forma === 'Tabletas' ? 'Unidad' : f.forma })}>No (champú, pañales…)</Opcion>
          </div>
        </div>
        {f.medicamento ? (
          <>
            <Campo etiqueta="Componente (principio activo)" ayuda="Lo que dice la caja debajo del nombre. Así el sistema ofrece genéricos y revisa alergias.">
              <input value={f.principio} onChange={(e) => c({ principio: e.target.value })} placeholder="Ej.: Acetaminofén" className={claseInput} list="lista-principios" />
              <datalist id="lista-principios">{principios.map((x) => <option key={x.id} value={x.nombre} />)}</datalist>
            </Campo>
            {existente && existente.riesgo !== 'NORMAL' && <Alert tone="warn">{existente.nombre} es {RIESGO[existente.riesgo]![0].toLowerCase()}: se vende con récipe y permiso del farmacéutico.</Alert>}
            {f.principio.trim() && !existente && (
              <div className="flex flex-col gap-2 rounded-xl border border-dashed border-accent/50 bg-accent-soft/30 p-3 text-sm">
                {sugeridos.length > 0 && <div className="flex flex-wrap items-center gap-1.5">¿Quisiste decir? {sugeridos.map((s) => <button key={s.id} type="button" onClick={() => c({ principio: s.nombre })} className="rounded-full border border-line bg-surface px-2.5 py-0.5 font-semibold">{s.nombre}</button>)}</div>}
                <span><b>«{f.principio.trim()}»</b> es un componente nuevo. ¿Qué tipo es?</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['NORMAL', 'ANTIBIOTICO', 'PSICOTROPICO'] as const).map((k) => <Opcion key={k} activa={f.riesgoNuevo === k} onClick={() => c({ riesgoNuevo: k })}>{k === 'NORMAL' ? 'Normal' : RIESGO[k]![0]}</Opcion>)}
                </div>
                <input value={f.usoNuevo} onChange={(e) => c({ usoNuevo: e.target.value })} placeholder="¿Para qué sirve? (opcional). Ej.: Dolor y fiebre" className={claseInput} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Campo etiqueta="Concentración"><input value={f.concentracion} onChange={(e) => c({ concentracion: e.target.value })} placeholder="Ej.: 500 mg" className={claseInput} /></Campo>
              <Campo etiqueta="Laboratorio"><input value={f.laboratorio} onChange={(e) => c({ laboratorio: e.target.value })} list="lista-labs" placeholder="Ej.: Genven" className={claseInput} /></Campo>
            </div>
            <div className="flex flex-col gap-1 text-sm font-semibold">¿Cómo viene?
              <div className="flex flex-wrap gap-1.5">{FORMAS.map((x) => <Opcion key={x} activa={f.forma === x} onClick={() => c({ forma: x })} chica>{x}</Opcion>)}</div>
              {f.forma === 'Otro' && <input value={f.otraForma} onChange={(e) => c({ otraForma: e.target.value })} placeholder="Ej.: Óvulos" className={claseInput} />}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Campo etiqueta="Tamaño (opcional)"><input value={f.concentracion} onChange={(e) => c({ concentracion: e.target.value })} placeholder="Ej.: 200 ml" className={claseInput} /></Campo>
            <Campo etiqueta="Tipo"><select value={f.categoria === 'Medicamentos' ? 'Cuidado personal' : f.categoria} onChange={(e) => c({ categoria: e.target.value })} className={claseInput}>{CATEGORIAS.filter((x) => x !== 'Medicamentos').map((x) => <option key={x}>{x}</option>)}</select></Campo>
            <Campo etiqueta="Marca (opcional)"><input value={f.laboratorio} onChange={(e) => c({ laboratorio: e.target.value })} list="lista-labs" className={claseInput} /></Campo>
          </div>
        )}
        <datalist id="lista-labs">{(labs.datos ?? []).map((x) => <option key={x} value={x} />)}</datalist>
        <Campo etiqueta="¿A cuánto lo vendes? (en dólares)"><input inputMode="decimal" value={f.precio} onChange={(e) => c({ precio: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="Ej.: 2,50" className={claseInput + ' font-mono'} /></Campo>
        {precio > 0 && tasa ? <p className="-mt-2 text-xs text-muted">Hoy son {bs(precio, tasa)}</p> : null}
        {!base && (
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface2 p-3">
            <Campo etiqueta="¿Cuántas tienes ahora?" ayuda="Déjalo vacío si todavía no llega"><input inputMode="numeric" value={f.cantidad} onChange={(e) => c({ cantidad: e.target.value.replace(/\D/g, '') })} placeholder="0" className={claseInput + ' font-mono'} /></Campo>
            <Campo etiqueta="¿Cuándo vencen?"><input type="date" min={hoyMas(0)} value={f.vence} onChange={(e) => c({ vence: e.target.value })} disabled={!Number(f.cantidad)} className={claseInput} /></Campo>
          </div>
        )}

        <button type="button" onClick={() => setMas(!mas)} className="flex items-center gap-1 self-start text-sm font-semibold text-accent" aria-expanded={mas}>
          <ChevronDown className={clsx('h-4 w-4 transition-transform', !mas && '-rotate-90')} aria-hidden />Más datos (opcional)
        </button>
        {mas && (
          <div className="grid grid-cols-2 gap-2">
            <Campo etiqueta="Unidades por caja" ayuda="Ej.: 10 si la caja trae 10 pastillas"><input inputMode="numeric" value={f.unidades} onChange={(e) => c({ unidades: e.target.value.replace(/\D/g, '') })} className={claseInput} /></Campo>
            <Campo etiqueta="Avísame cuando queden" ayuda="0 = no avisar"><input inputMode="numeric" value={f.minimo} onChange={(e) => c({ minimo: e.target.value.replace(/\D/g, '') })} className={claseInput} /></Campo>
            <Campo etiqueta="Código de barras"><input inputMode="numeric" value={f.codigo} onChange={(e) => c({ codigo: e.target.value.replace(/\D/g, '') })} className={claseInput} /></Campo>
            <Campo etiqueta="IVA" ayuda="Las medicinas casi siempre son exentas"><select value={f.iva} onChange={(e) => c({ iva: e.target.value })} className={claseInput}><option value="0">Exento</option><option value="8">8 %</option><option value="16">16 %</option></select></Campo>
            {f.medicamento && <Campo etiqueta="Tipo de precio"><select value={f.nivel} onChange={(e) => c({ nivel: e.target.value })} className={claseInput}><option value="GENERICO">Genérico (económico)</option><option value="MEDIO">Medio</option><option value="MARCA">De marca</option></select></Campo>}
            <div className="col-span-2 flex flex-col gap-2 text-sm">
              {f.medicamento && <label className="flex items-center gap-2"><input type="checkbox" checked={f.recipe} onChange={(e) => c({ recipe: e.target.checked })} className="h-4 w-4" /> Pide récipe para venderlo</label>}
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.activo} onChange={(e) => c({ activo: e.target.checked })} className="h-4 w-4" /> Se puede vender (quítalo para dejar de venderlo sin borrarlo)</label>
            </div>
          </div>
        )}
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg" disabled={guardando}>{guardando ? 'Guardando…' : base ? 'Guardar cambios' : 'Crear producto'}</Button>
      </form>
    </Sheet>
  );
}

function Opcion({ activa, onClick, children, chica }: { activa: boolean; onClick: () => void; children: ReactNode; chica?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa}
      className={clsx('rounded-lg border font-semibold', chica ? 'px-2.5 py-1 text-sm' : 'px-3 py-2.5 text-sm', activa ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface hover:bg-surface2')}>
      {children}
    </button>
  );
}

/* ───────── Corregir cantidad ───────── */

type Motivo = 'ROTO' | 'VENCIDO' | 'MERMA' | 'CONTEO' | 'OTRO';
const MOTIVOS: { k: Motivo; titulo: string; detalle: string; signo: -1 | 0 | 1 }[] = [
  { k: 'ROTO', titulo: 'Se rompió o se dañó', detalle: 'Se resta del inventario', signo: -1 },
  { k: 'VENCIDO', titulo: 'Se venció', detalle: 'Lo sacas del estante', signo: -1 },
  { k: 'MERMA', titulo: 'Se perdió o falta', detalle: 'Se resta del inventario', signo: -1 },
  { k: 'CONTEO', titulo: 'Conté y hay otra cantidad', detalle: 'Escribes lo que contaste', signo: 0 },
  { k: 'OTRO', titulo: 'Apareció mercancía', detalle: 'Sin factura: se suma', signo: 1 },
];

function CorregirCantidad({ producto, productos, onCerrar, onListo }: { producto: ProductoInv | 'elegir' | null; productos: ProductoInv[]; onCerrar: () => void; onListo: () => void }) {
  const [p, setP] = useState<ProductoInv | null>(null);
  const [q, setQ] = useState('');
  const [motivo, setMotivo] = useState<Motivo | null>(null);
  const [loteId, setLoteId] = useState('');
  const [n, setN] = useState('');
  const [conteo, setConteo] = useState<Record<string, string>>({});
  const [vence, setVence] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setP(producto && producto !== 'elegir' ? producto : null); setQ(''); setMotivo(null); setN(''); setNota(''); setVence(''); setError(null); }, [producto]);
  const lotes = useCargar(() => (p ? api<LoteInv[]>(`/inventario/lotes?productoId=${p.id}`) : Promise.resolve([])), [p?.id]);
  const ls = lotes.datos ?? [];
  // Al elegir el motivo se propone el lote: el vencido si «se venció»; si no, el que vence primero.
  useEffect(() => {
    if (!motivo || !ls.length) return;
    const vencido = ls.find((l) => daysUntil(l.vence) < 0);
    setLoteId((motivo === 'VENCIDO' && vencido ? vencido : ls[0]!).id);
    // «Se venció» con un lote vencido: se propone sacarlo todo.
    if (motivo === 'VENCIDO' && vencido) setN(String(vencido.stockLibre));
    setConteo(Object.fromEntries(ls.map((l) => [l.id, String(l.stockLibre)])));
  }, [motivo, lotes.datos]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = MOTIVOS.find((x) => x.k === motivo);
  const lote = ls.find((l) => l.id === loteId);
  const sinLotes = !!p && !lotes.cargando && !ls.length;
  const palabras = normalizar(q).split(/\s+/).filter(Boolean);
  const candidatos = productos.filter((x) => palabras.every((w) => normalizar(`${x.nombreComercial} ${x.concentracion} ${x.laboratorio}`).includes(w))).slice(0, 8);

  const guardar = async () => {
    if (!p || !m) return;
    setError(null); setGuardando(true);
    try {
      if (m.signo === 1 || (m.k === 'CONTEO' && sinLotes)) {
        const cant = Number(n);
        if (!(cant > 0)) throw new Error('Escribe cuántas unidades hay');
        if (!vence) throw new Error('Escribe cuándo vencen');
        await api('/inventario/existencia', { body: { productoId: p.id, cantidad: cant, vence, motivo: m.k === 'CONTEO' ? 'CONTEO' : 'OTRO', nota: nota || undefined } });
        avisar(`Listo: se sumaron ${cant}`, 'ok');
      } else if (m.k === 'CONTEO') {
        const cambios = ls.map((l) => ({ l, dif: (Number(conteo[l.id] ?? l.stockLibre) || 0) - l.stockLibre })).filter((x) => x.dif !== 0);
        if (!cambios.length) throw new Error('Lo que contaste es igual a lo que dice el sistema: no hay nada que corregir');
        for (const { l, dif } of cambios) await api('/inventario/ajustes', { body: { loteId: l.id, cantidad: dif, motivo: 'CONTEO', nota: nota || undefined } });
        const total = cambios.reduce((a, x) => a + x.dif, 0);
        avisar(`Listo: ${total > 0 ? `sobraban ${total}` : `faltaban ${-total}`}. Ya quedó corregido`, 'ok');
      } else {
        const cant = Number(n);
        if (!lote) throw new Error('Elige de cuál fecha de vencimiento');
        if (!(cant > 0)) throw new Error('Escribe cuántas unidades');
        if (cant > lote.stockLibre) throw new Error(`De ese lote solo hay ${lote.stockLibre}`);
        await api('/inventario/ajustes', { body: { loteId: lote.id, cantidad: -cant, motivo: m.k, nota: nota || undefined } });
        avisar(`Listo: se restaron ${cant}`, 'ok');
      }
      onListo(); onCerrar();
    } catch (e) { setError(e instanceof ApiError ? msg(e) : e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  return (
    <Sheet open={!!producto} onClose={onCerrar} title="Corregir cantidad">
      <div className="flex flex-col gap-4">
        {/* Paso 1: qué producto */}
        {!p ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">1. ¿Qué producto?</span>
            <SearchInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Escribe el nombre" />
            <ul className="flex flex-col gap-1">
              {candidatos.map((x) => (
                <li key={x.id}><button type="button" onClick={() => setP(x)} className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-surface2">
                  <span className="font-semibold">{x.nombreComercial} <span className="font-normal text-muted">{x.concentracion} · {x.laboratorio}</span></span><span className="font-mono text-muted">hay {x.stock}</span>
                </button></li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-surface2 px-3 py-2">
            <span className="min-w-0"><span className="block truncate font-semibold">{p.nombreComercial} {p.concentracion}</span><span className="text-xs text-muted">El sistema dice que hay {p.stock}{(p.vencidas ?? 0) > 0 ? ` (+ ${p.vencidas} vencidas)` : ''}</span></span>
            {producto === 'elegir' && <Button size="sm" variant="ghost" onClick={() => { setP(null); setMotivo(null); }}>Cambiar</Button>}
          </div>
        )}

        {/* Paso 2: qué pasó */}
        {p && !m && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">2. ¿Qué pasó?</span>
            {MOTIVOS.map((x) => (
              <button key={x.k} type="button" onClick={() => setMotivo(x.k)} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left hover:bg-surface2">
                <span><span className="block font-semibold">{x.titulo}</span><span className="text-xs text-muted">{x.detalle}</span></span>
                <span className={clsx('font-mono text-lg font-bold', x.signo < 0 ? 'text-bad' : x.signo > 0 ? 'text-ok' : 'text-muted')}>{x.signo < 0 ? '−' : x.signo > 0 ? '+' : '='}</span>
              </button>
            ))}
          </div>
        )}

        {/* Paso 3: cuánto */}
        {p && m && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold">3. {m.titulo}</span><button type="button" onClick={() => setMotivo(null)} className="flex items-center gap-1 text-xs font-semibold text-accent"><ArrowLeft className="h-3.5 w-3.5" />Otro motivo</button></div>
            {lotes.cargando && !lotes.datos ? <Cargando /> : m.signo === 1 || (m.k === 'CONTEO' && sinLotes) ? (
              <div className="grid grid-cols-2 gap-2">
                <Campo etiqueta={m.k === 'CONTEO' ? '¿Cuántas contaste?' : '¿Cuántas aparecieron?'}><input autoFocus inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ''))} className={claseInput + ' font-mono'} /></Campo>
                <Campo etiqueta="¿Cuándo vencen?"><input type="date" value={vence} onChange={(e) => setVence(e.target.value)} className={claseInput} /></Campo>
              </div>
            ) : m.k === 'CONTEO' ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted">Cuenta cada fecha de vencimiento por separado (viene impresa en la caja). No cuentes lo apartado para encargos.</p>
                {ls.map((l) => (
                  <label key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                    <span><span className="font-semibold">Vence {fechaLarga(l.vence)}</span><span className="block text-xs text-muted">El sistema dice {l.stockLibre}</span></span>
                    <input inputMode="numeric" value={conteo[l.id] ?? ''} onChange={(e) => setConteo({ ...conteo, [l.id]: e.target.value.replace(/\D/g, '') })} className={claseInput + ' w-24 text-center font-mono'} aria-label={`Contadas del lote que vence ${fechaLarga(l.vence)}`} />
                  </label>
                ))}
              </div>
            ) : (
              <>
                {ls.length > 1 && (
                  <div className="flex flex-col gap-1.5 text-sm font-semibold">¿De cuál fecha de vencimiento?
                    {ls.map((l) => {
                      const v = venceTexto(l.vence);
                      return (
                        <label key={l.id} className={clsx('flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 font-normal', loteId === l.id ? 'border-accent bg-accent-soft/40' : 'border-line')}>
                          <span className="flex items-center gap-2"><input type="radio" name="lote" checked={loteId === l.id} onChange={() => setLoteId(l.id)} />Vence {fechaLarga(l.vence)} {v.tone !== 'neutral' && <Chip tone={v.tone}>{v.txt}</Chip>}</span><span className="font-mono">hay {l.stockLibre}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <Campo etiqueta="¿Cuántas sacas?"><input autoFocus inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ''))} className={claseInput + ' font-mono'} /></Campo>
                {lote && Number(n) > 0 && <p className="-mt-2 text-xs text-muted">{Number(n) > lote.stockLibre ? `De esa fecha solo hay ${lote.stockLibre}` : `Quedarán ${daysUntil(lote.vence) < 0 ? p.stock : p.stock - Number(n)} para vender`}</p>}
              </>
            )}
            <Campo etiqueta="Nota (opcional)"><input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: se cayó del estante" className={claseInput} /></Campo>
            {error && <Alert tone="bad">{error}</Alert>}
            <Button variant="primary" size="lg" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ───────── Cambiar precios a varios ───────── */

function CambiarPrecios({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: () => void }) {
  const labs = useCargar(() => (abierto ? api<string[]>('/catalogo/laboratorios') : Promise.resolve([])), [abierto]);
  const [por, setPor] = useState<'laboratorio' | 'categoria'>('laboratorio');
  const [valor, setValor] = useState('');
  const [sube, setSube] = useState(true);
  const [pct, setPct] = useState('5');
  const [prev, setPrev] = useState<{ nombre: string; antes: string; despues: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setPrev(null); setError(null); }, [por, valor, pct, sube, abierto]);
  const enviar = async (vistaPrevia: boolean) => {
    setError(null);
    const n = Math.abs(Number(pct.replace(',', '.'))) * (sube ? 1 : -1);
    try {
      const r = await api<{ cambios: { nombre: string; antes: string; despues: string }[] }>('/catalogo/precios/masivo', { body: { [por]: valor, pct: n, vistaPrevia } });
      if (vistaPrevia) setPrev(r.cambios);
      else { avisar(`${r.cambios.length} precios actualizados`, 'ok'); onListo(); onCerrar(); }
    } catch (e) { setError(msg(e)); }
  };
  return (
    <Sheet open={abierto} onClose={onCerrar} title="Cambiar precios a varios">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 text-sm font-semibold">¿A cuáles?
          <div className="grid grid-cols-2 gap-2"><Opcion activa={por === 'laboratorio'} onClick={() => { setPor('laboratorio'); setValor(''); }}>Los de un laboratorio</Opcion><Opcion activa={por === 'categoria'} onClick={() => { setPor('categoria'); setValor(''); }}>Los de un tipo</Opcion></div>
          <select value={valor} onChange={(e) => setValor(e.target.value)} className={claseInput}>
            <option value="">Elige…</option>{(por === 'laboratorio' ? labs.datos ?? [] : [...CATEGORIAS]).map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 text-sm font-semibold">¿Subir o bajar?
          <div className="grid grid-cols-2 gap-2"><Opcion activa={sube} onClick={() => setSube(true)}>Subir</Opcion><Opcion activa={!sube} onClick={() => setSube(false)}>Bajar</Opcion></div>
        </div>
        <Campo etiqueta="¿Cuánto por ciento?" ayuda="Se redondea a 0,05 $"><input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.,]/g, ''))} className={claseInput + ' font-mono'} /></Campo>
        {error && <Alert tone="bad">{error}</Alert>}
        {!prev ? <Button variant="primary" size="lg" disabled={!valor || !Number(pct.replace(',', '.'))} onClick={() => enviar(true)}>Ver cómo quedan</Button> : (
          <>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-line text-sm">
              {prev.map((x) => <div key={x.nombre} className="flex justify-between gap-2 border-b border-line px-3 py-1.5 last:border-0"><span className="truncate">{x.nombre}</span><span className="shrink-0 font-mono">{usd(x.antes)} → <b>{usd(x.despues)}</b></span></div>)}
              {!prev.length && <div className="p-3 text-muted">No hay productos que se vendan ahí.</div>}
            </div>
            <Button variant="primary" size="lg" disabled={!prev.length} onClick={() => enviar(false)}>Sí, cambiar {prev.length} precios</Button>
          </>
        )}
      </div>
    </Sheet>
  );
}

/* ───────── Componentes e historial ───────── */

function Principios({ lista, onCambio }: { lista: Principio[]; onCambio: () => void }) {
  const [edit, setEdit] = useState<Principio | null>(null);
  const [f, setF] = useState({ riesgo: 'NORMAL', familia: '', uso: '' });
  useEffect(() => { if (edit) setF({ riesgo: edit.riesgo, familia: edit.familia ?? '', uso: edit.uso ?? '' }); }, [edit]);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">El componente es lo que hace efecto (ej. Acetaminofén). Productos con el mismo componente se ofrecen como alternativa. Se crean solos al crear un producto.</p>
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
        {lista.map((x) => (
          <li key={x.id} className="flex flex-col gap-2 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span><b>{x.nombre}</b> {x.riesgo !== 'NORMAL' && <Chip tone={RIESGO[x.riesgo]![1]}>{RIESGO[x.riesgo]![0]}</Chip>}<span className="block text-xs text-muted">{x.uso ?? 'Sin «para qué sirve»'}{x.familia ? ` · familia ${x.familia}` : ''}</span></span>
              <Button size="sm" variant="ghost" onClick={() => setEdit(edit?.id === x.id ? null : x)}>{edit?.id === x.id ? 'Cerrar' : 'Cambiar'}</Button>
            </div>
            {edit?.id === x.id && (
              <form className="flex flex-col gap-2 rounded-lg bg-surface2 p-2" onSubmit={async (e) => {
                e.preventDefault();
                try { await api(`/catalogo/principios/${x.id}`, { method: 'PATCH', body: { riesgo: f.riesgo, familia: f.familia || undefined, uso: f.uso || undefined } }); avisar('Guardado', 'ok'); setEdit(null); onCambio(); }
                catch (err) { avisar(msg(err), 'bad'); }
              }}>
                <div className="grid grid-cols-3 gap-1.5">{(['NORMAL', 'ANTIBIOTICO', 'PSICOTROPICO'] as const).map((k) => <Opcion key={k} activa={f.riesgo === k} onClick={() => setF({ ...f, riesgo: k })} chica>{RIESGO[k]![0]}</Opcion>)}</div>
                <input value={f.uso} onChange={(e) => setF({ ...f, uso: e.target.value })} placeholder="Para qué sirve. Ej.: Dolor y fiebre" className={claseInput} />
                <input value={f.familia} onChange={(e) => setF({ ...f, familia: e.target.value })} placeholder="Familia para alergias (ej. penicilinas)" className={claseInput} />
                <Button type="submit" size="sm" variant="primary">Guardar</Button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const MOTIVO_TXT: Record<string, string> = { ROTO: 'Se rompió', VENCIDO: 'Se venció', MERMA: 'Se perdió', CONTEO: 'Conteo', OTRO: 'Apareció' };

function Historial() {
  const aj = useCargar(() => api<Ajuste[]>('/inventario/ajustes'), []);
  if (aj.error) return <ErrorCarga mensaje={aj.error} reintentar={aj.recargar} />;
  if (!aj.datos) return <Cargando />;
  if (!aj.datos.length) return <EmptyState icon={<PackageSearch className="h-8 w-8" />} title="Todavía no hay correcciones" />;
  return (
    <ul className="flex flex-col divide-y divide-line rounded-xl border border-line text-sm">
      {aj.datos.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="min-w-0"><span className="block font-semibold">{a.producto}</span><span className="text-xs text-muted">{fecha(a.creadoEn)} · {MOTIVO_TXT[a.motivo] ?? a.motivo}{a.nota ? ` · ${a.nota}` : ''} · {a.usuario}</span></span>
          <Chip tone={a.cantidad < 0 ? 'bad' : 'ok'}>{a.cantidad > 0 ? '+' : ''}{a.cantidad}</Chip>
        </li>
      ))}
    </ul>
  );
}

/* ───────── Etiquetas de precio ───────── */

/** Etiquetas de precio para los estantes (hoja A4, 3 por fila). El precio en Bs usa la tasa y el redondeo de hoy. */
export function imprimirEtiquetas(lista: ProductoInv[], tasa: number | null) {
  const esc = (t: string) => t.replace(/[&<>"]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]!));
  const hoy = new Date().toLocaleDateString('es-VE');
  const celdas = lista.map((p) => `<div class="e"><div class="n">${esc(p.nombreComercial)} ${esc(p.concentracion)}</div>
    <div class="s">${esc(p.principioActivo.nombre)} · ${esc(p.laboratorio)}</div>
    <div class="p">${usd(p.precioUsd)}</div><div class="b">${tasa ? esc(bs(p.precioUsd, tasa)) : ''}</div>
    <div class="f">${p.codigoBarras ? esc(p.codigoBarras) + ' · ' : ''}${hoy}</div></div>`).join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas de precio</title><style>
    @page{size:A4;margin:8mm}body{font-family:system-ui,sans-serif;margin:0;color:#111}
    .g{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}.e{border:1px dashed #999;padding:3mm;height:34mm;box-sizing:border-box;display:flex;flex-direction:column;break-inside:avoid}
    .n{font-weight:700;font-size:13px;line-height:1.15;max-height:30px;overflow:hidden}.s{font-size:10px;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .p{font-size:24px;font-weight:800;margin-top:auto}.b{font-size:14px;font-weight:600}.f{font-size:9px;color:#666}</style></head><body>
    <div class="g">${celdas}</div><script>window.onload=()=>window.print()</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { avisar('Permite las ventanas emergentes para imprimir', 'bad'); return; }
  w.document.write(html); w.document.close();
}

