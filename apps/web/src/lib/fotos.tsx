import { clsx } from 'clsx';
import { Pill } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';

/** Dirección de la foto de un producto. */
export const fotoUrl = (foto: string) => `/api/v1/fotos/${foto}`;

/**
 * Achica la foto en el mismo equipo antes de subirla (lado mayor 800 px, JPG): una foto del teléfono
 * pasa de 3-5 MB a unos 100 KB, sube rápido aunque el internet esté lento y no llena el disco.
 */
export async function achicarFoto(archivo: File, lado = 800): Promise<Blob> {
  const img = await createImageBitmap(archivo);
  const escala = Math.min(1, lado / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo leer la foto'))), 'image/jpeg', 0.82));
}

/** Sube (o cambia) la foto de un producto. Devuelve el nombre nuevo. */
export async function subirFoto(productoId: string, archivo: File): Promise<string> {
  const form = new FormData();
  form.append('foto', await achicarFoto(archivo), 'foto.jpg');
  return (await api<{ foto: string }>(`/catalogo/productos/${productoId}/foto`, { form })).foto;
}

const TAMANO = { xs: 'h-8 w-8', sm: 'h-11 w-11', md: 'h-14 w-14', lg: 'h-40 w-40' } as const;

/** Foto del producto, o un dibujo de pastilla si no tiene (o si no se pudo cargar, por ejemplo sin internet). */
export function FotoProducto({ foto, nombre, tamano = 'sm', className }: { foto?: string | null; nombre: string; tamano?: keyof typeof TAMANO; className?: string }) {
  const [fallo, setFallo] = useState(false);
  const caja = clsx('shrink-0 overflow-hidden rounded-lg border border-line bg-white', TAMANO[tamano], className);
  if (!foto || fallo) {
    return <span className={clsx(caja, 'grid place-items-center bg-surface2 text-muted/60')} aria-hidden><Pill className={tamano === 'lg' ? 'h-12 w-12' : tamano === 'xs' ? 'h-4 w-4' : 'h-5 w-5'} /></span>;
  }
  return <img src={fotoUrl(foto)} alt={nombre} loading="lazy" decoding="async" onError={() => setFallo(true)} className={clsx(caja, 'object-contain')} />;
}
