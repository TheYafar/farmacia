import { Wallet } from 'lucide-react';
import { useState } from 'react';
import { Alert, Button, Campo, Card, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { avisar } from '@/store/avisos';
import { useCaja } from '@/store/caja';
import { CajaDelEquipo } from '@/features/cajas/Cajas';

export const leerMonto = (s: string) => (s.trim() ? Number(s.trim().replace(/\./g, '').replace(',', '.')) : 0);

/** Abrir la caja con el fondo inicial (sencillo para dar vuelto). */
export default function AbrirCaja() {
  const cargar = useCaja((s) => s.cargar);
  const [usd, setUsd] = useState('');
  const [bs, setBs] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="mx-auto w-full max-w-md gap-4 p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent"><Wallet className="h-6 w-6" /></span>
        <div>
          <h2 className="text-lg font-bold">Abre la caja para vender</h2>
          <p className="text-sm text-muted">Escribe el sencillo con el que empiezas el turno.</p>
        </div>
      </div>
      <CajaDelEquipo />
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const fondoUsd = leerMonto(usd), fondoBs = leerMonto(bs);
        if (!(fondoUsd >= 0) || !(fondoBs >= 0)) { setError('Escribe montos válidos, por ejemplo 20 o 1.500,00'); return; }
        try {
          await api('/caja/abrir', { body: { fondoUsd, fondoBs } });
          await cargar();
          avisar('Caja abierta', 'ok');
        } catch (err) { setError(err instanceof ApiError ? err.message : 'No se pudo abrir la caja'); }
      }}>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Efectivo en dólares"><input id="fondo-usd" inputMode="decimal" placeholder="0" value={usd} onChange={(e) => setUsd(e.target.value)} className={`${claseInput} font-mono`} /></Campo>
          <Campo etiqueta="Efectivo en bolívares"><input id="fondo-bs" inputMode="decimal" placeholder="0" value={bs} onChange={(e) => setBs(e.target.value)} className={`${claseInput} font-mono`} /></Campo>
        </div>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Abrir caja</Button>
      </form>
    </Card>
  );
}
