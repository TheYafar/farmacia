import { CheckCircle2, Download, FileSpreadsheet } from 'lucide-react';
import { useRef, useState } from 'react';
import { COLUMNAS_IMPORTACION } from '@farmacia/shared';
import { Alert, Button, Sheet } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { avisar } from '@/store/avisos';
import { descargarPlantilla, leerArchivo, type ArchivoLeido } from './excel';

interface Reporte {
  filas: number; productosNuevos: number; productosActualizados: number; preciosCambiados: number;
  principiosNuevos: number; lotes: number; controladosDeducidos?: string[]; errores: { fila: number; campo?: string; mensaje: string }[];
  guardado: boolean; clientesAvisados?: number;
}

/** Importar inventario: elegir archivo → el servidor revisa → el dueño confirma. Todo o nada. */
export default function ImportarExcel({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<{ nombre: string; datos: ArchivoLeido } | null>(null);
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const reiniciar = () => { setArchivo(null); setReporte(null); setError(null); if (input.current) input.current.value = ''; };

  const enviar = async (datos: ArchivoLeido, confirmar: boolean) => {
    setTrabajando(true);
    setError(null);
    try {
      const r = await api<Reporte>('/inventario/importar', { body: { filas: datos.filas, confirmar } });
      setReporte(r);
      if (r.guardado) {
        avisar(`Inventario cargado: ${r.productosNuevos} productos nuevos, ${r.productosActualizados} actualizados`, 'ok');
        onListo();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo revisar el archivo');
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <Sheet open={abierto} onClose={() => { reiniciar(); onCerrar(); }} title="Cargar inventario desde Excel">
      <div className="flex flex-col gap-4 text-sm">
        <ol className="flex flex-col gap-1.5 text-base">
          <li><b>1.</b> Descarga la plantilla y llénala (una fila por producto y lote).</li>
          <li><b>2.</b> Súbela aquí. Primero te mostramos qué va a cambiar.</li>
          <li><b>3.</b> Si todo está bien, confirma. Si una fila tiene error, no se guarda nada.</li>
        </ol>
        <Button icon={<Download className="h-4 w-4" />} onClick={() => descargarPlantilla().catch(() => avisar('No se pudo crear la plantilla', 'bad'))}>Descargar plantilla</Button>

        <input ref={input} type="file" accept=".xlsx,.csv" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setReporte(null);
          setError(null);
          try {
            const datos = await leerArchivo(f);
            setArchivo({ nombre: f.name, datos });
            await enviar(datos, false);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo leer el archivo');
          }
        }} />
        <Button variant={archivo ? 'secondary' : 'primary'} size="lg" icon={<FileSpreadsheet className="h-5 w-5" />} disabled={trabajando} onClick={() => { reiniciar(); input.current?.click(); }}>
          {archivo ? 'Elegir otro archivo' : 'Elegir archivo .xlsx o .csv'}
        </Button>

        {archivo && <p className="text-muted">Archivo: <b className="text-fg">{archivo.nombre}</b> · {archivo.datos.filas.length} filas{archivo.datos.columnasIgnoradas.length ? ` · columnas que no se usan: ${archivo.datos.columnasIgnoradas.join(', ')}` : ''}</p>}
        {error && <Alert tone="bad">{error}</Alert>}
        {trabajando && <p className="text-muted" role="status">Revisando…</p>}

        {reporte && !reporte.guardado && (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-2 rounded-xl bg-surface2 p-3">
              <dt className="text-muted">Productos nuevos</dt><dd className="text-right font-mono">{reporte.productosNuevos}</dd>
              <dt className="text-muted">Productos que se actualizan</dt><dd className="text-right font-mono">{reporte.productosActualizados}</dd>
              <dt className="text-muted">Precios que cambian</dt><dd className="text-right font-mono">{reporte.preciosCambiados}</dd>
              <dt className="text-muted">Principios activos nuevos</dt><dd className="text-right font-mono">{reporte.principiosNuevos}</dd>
              <dt className="text-muted">Lotes con existencia</dt><dd className="text-right font-mono">{reporte.lotes}</dd>
            </dl>
            {!!reporte.controladosDeducidos?.length && (
              <Alert tone="warn">Se marcarán como controlados (la columna Riesgo venía vacía): {reporte.controladosDeducidos.join(', ')}. Pedirán récipe y permiso del farmacéutico. Si alguno no lo es, cámbialo en Inventario → «Componentes».</Alert>
            )}
            {reporte.errores.length > 0 ? (
              <Alert tone="bad">
                <div className="flex flex-col gap-1">
                  <b>Corrige estas filas en el Excel y vuelve a subirlo:</b>
                  <ul className="max-h-56 overflow-auto font-normal">
                    {reporte.errores.map((e, i) => <li key={i}>Fila {e.fila}{e.campo ? `, ${COLUMNAS_IMPORTACION.find((c) => c.clave === e.campo)?.titulo ?? e.campo}` : ''}: {e.mensaje}</li>)}
                  </ul>
                </div>
              </Alert>
            ) : (
              <>
                <Alert tone="info">La cantidad de cada lote reemplaza la existencia que hay hoy en el sistema.</Alert>
                <Button variant="primary" size="lg" disabled={trabajando} onClick={() => archivo && enviar(archivo.datos, true)}>Sí, cargar inventario</Button>
              </>
            )}
          </div>
        )}
        {reporte?.guardado && (
          <Alert tone="ok" icon={<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}>
            Listo: {reporte.productosNuevos} productos nuevos, {reporte.productosActualizados} actualizados y {reporte.lotes} lotes.
            {reporte.clientesAvisados ? ` Se avisó a ${reporte.clientesAvisados} clientes que esperaban.` : ''}
          </Alert>
        )}
      </div>
    </Sheet>
  );
}
