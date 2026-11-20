import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

/** Carga datos de la API y los vuelve a pedir cuando cambian las dependencias o cada `cadaMs`. */
export function useCargar<T>(cargar: () => Promise<T>, deps: unknown[], cadaMs?: number) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const fn = useRef(cargar);
  fn.current = cargar;

  const recargar = useCallback(async () => {
    try {
      setDatos(await fn.current());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    setCargando(true);
    void recargar();
    if (!cadaMs) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') void recargar(); }, cadaMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { datos, error, cargando, recargar, setDatos };
}
