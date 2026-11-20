import readXlsxFile from 'read-excel-file';
import { COLUMNAS_IMPORTACION, MAX_FILAS_IMPORTACION, type FilaImportacion } from '@farmacia/shared';
import { normalizar } from '@/lib/format';

/** Título de columna → campo. Acepta los títulos de la plantilla y variantes comunes. */
const SINONIMOS: Record<string, keyof FilaImportacion> = {
  codigo: 'codigoBarras', codigodebarras: 'codigoBarras', codbarras: 'codigoBarras', barras: 'codigoBarras', ean: 'codigoBarras',
  nombre: 'nombreComercial', nombrecomercial: 'nombreComercial', marca: 'nombreComercial', producto: 'nombreComercial', descripcion: 'nombreComercial',
  laboratorio: 'laboratorio', lab: 'laboratorio',
  principioactivo: 'principioActivo', principio: 'principioActivo', molecula: 'principioActivo', generico: 'principioActivo',
  concentracion: 'concentracion', mg: 'concentracion', dosis: 'concentracion',
  forma: 'forma', presentacion: 'forma', formafarmaceutica: 'forma',
  unidadesporcaja: 'unidadesPorCaja', unidades: 'unidadesPorCaja', uxc: 'unidadesPorCaja',
  preciousd: 'precioUsd', precio: 'precioUsd', precio$: 'precioUsd', preciodolares: 'precioUsd',
  nivel: 'nivel', tipo: 'nivel',
  requiererecipe: 'requiereRecipe', recipe: 'requiereRecipe', conrecipe: 'requiereRecipe',
  riesgo: 'riesgo', categoria: 'riesgo',
  familiaalergia: 'familia', familia: 'familia', alergia: 'familia',
  lote: 'lote', numerolote: 'lote',
  vence: 'vence', vencimiento: 'vence', fechavencimiento: 'vence', expira: 'vence',
  cantidad: 'cantidad', existencia: 'cantidad', stock: 'cantidad', cajas: 'cantidad',
};
const clave = (titulo: string) => SINONIMOS[normalizar(titulo).replace(/[^a-z0-9$]/g, '')];

type Celda = string | number | boolean | Date | null | undefined;

const SI = ['si', 'sí', 'x', 'true', '1', 'yes'];
function numero(v: Celda) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return undefined;
  const s = String(v).trim().replace(/\s|\$/g, '');
  // "1.234,56" o "1,234.56" o "2,35"
  const n = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const x = Number(n);
  return Number.isFinite(x) ? x : NaN;
}
function fecha(v: Celda) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v === null || v === undefined || v === '') return undefined;
  const s = String(v).trim();
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
  return s;
}
const textoO = (v: Celda) => (v === null || v === undefined || String(v).trim() === '' ? undefined : String(v).trim());

/** Convierte una fila cruda en lo que espera la API. La validación de verdad la hace el servidor. */
function convertir(titulos: (keyof FilaImportacion | undefined)[], fila: Celda[]) {
  const o: Record<string, unknown> = {};
  titulos.forEach((k, i) => {
    if (!k) return;
    const v = fila[i];
    switch (k) {
      case 'unidadesPorCaja': case 'precioUsd': case 'cantidad': o[k] = numero(v); break;
      case 'vence': o[k] = fecha(v); break;
      case 'requiereRecipe': o[k] = v === undefined || v === null || v === '' ? undefined : SI.includes(normalizar(String(v))); break;
      case 'nivel': case 'riesgo': o[k] = textoO(v) ? normalizar(String(v)).toUpperCase() : undefined; break;
      case 'codigoBarras': o[k] = textoO(typeof v === 'number' ? v.toFixed(0) : v); break;
      default: o[k] = textoO(v);
    }
  });
  return o;
}

function leerCsv(texto: string): string[][] {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const sep = (lineas[0]?.split(';').length ?? 0) > (lineas[0]?.split(',').length ?? 0) ? ';' : ',';
  return lineas.map((l) => {
    const celdas: string[] = [];
    let actual = '', comillas = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i]!;
      if (c === '"') { if (comillas && l[i + 1] === '"') { actual += '"'; i++; } else comillas = !comillas; }
      else if (c === sep && !comillas) { celdas.push(actual); actual = ''; }
      else actual += c;
    }
    celdas.push(actual);
    return celdas;
  });
}

export interface ArchivoLeido { filas: Record<string, unknown>[]; columnasReconocidas: string[]; columnasIgnoradas: string[] }

/** Lee un .xlsx o .csv en el navegador (el archivo nunca sale tal cual hacia el servidor). */
export async function leerArchivo(archivo: File): Promise<ArchivoLeido> {
  const nombre = archivo.name.toLowerCase();
  let tabla: Celda[][];
  if (nombre.endsWith('.csv')) tabla = leerCsv(await archivo.text());
  else if (nombre.endsWith('.xlsx')) tabla = (await readXlsxFile(archivo)) as Celda[][];
  else throw new Error('El archivo debe ser .xlsx o .csv. Si es .xls (Excel viejo), guárdalo como .xlsx');

  const [cabecera = [], ...resto] = tabla;
  const titulos = cabecera.map((t) => clave(String(t ?? '')));
  if (!titulos.includes('nombreComercial')) throw new Error('No encontré la columna «Nombre comercial». Usa la plantilla');
  const filas = resto.filter((f) => f.some((c) => c !== null && c !== undefined && String(c).trim() !== ''));
  if (filas.length > MAX_FILAS_IMPORTACION) throw new Error(`El archivo tiene ${filas.length} filas. El máximo es ${MAX_FILAS_IMPORTACION}: divídelo en varios`);
  return {
    filas: filas.map((f) => convertir(titulos, f)),
    columnasReconocidas: cabecera.filter((_, i) => titulos[i]).map(String),
    columnasIgnoradas: cabecera.filter((t, i) => !titulos[i] && String(t ?? '').trim()).map(String),
  };
}

/** Descarga la plantilla de Excel con una fila de ejemplo. */
export async function descargarPlantilla() {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const datos = [
    COLUMNAS_IMPORTACION.map((c) => ({ value: c.titulo, fontWeight: 'bold' as const })),
    COLUMNAS_IMPORTACION.map((c) => ({ value: c.ejemplo, type: typeof c.ejemplo === 'number' ? Number : String })),
  ];
  const blob = await writeXlsxFile(datos as never, { columns: COLUMNAS_IMPORTACION.map((c) => ({ width: Math.max(14, c.titulo.length + 2) })) } as never).toBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'plantilla-inventario.xlsx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
