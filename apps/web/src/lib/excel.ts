import { fechaVe } from '@farmacia/shared';
/** Descarga una tabla como Excel de verdad (.xlsx), con la primera fila en negrita y columnas con ancho. */
export async function descargarExcel(nombre: string, cabecera: string[], filas: (string | number | null)[][]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const num = (v: string | number | null) => (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
  const datos = [
    cabecera.map((c) => ({ value: c, fontWeight: 'bold' as const })),
    ...filas.map((f) => f.map((v) => ({ value: num(v) ?? '' }))),
  ];
  const anchos = cabecera.map((c, i) => ({ width: Math.min(45, Math.max(c.length, ...filas.slice(0, 200).map((f) => String(f[i] ?? '').length)) + 2) }));
  const blob = await writeXlsxFile(datos as never, { columns: anchos, stickyRowsCount: 1 } as never).toBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${nombre}-${fechaVe()}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
