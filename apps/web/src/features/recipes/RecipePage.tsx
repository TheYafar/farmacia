import { Camera, CheckCircle2, Info, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Alert, Button, Campo, Card, Chip, PageHeader, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fecha, hora } from '@/lib/format';
import type { Recipe } from '@/lib/tipos';
import { avisar } from '@/store/avisos';

/** El cajero toma la foto del récipe; queda en «Por revisar» para el farmacéutico. */
export default function RecipePage() {
  const [cedula, setCedula] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviados, setEnviados] = useState<Recipe[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const elegir = (f: File | undefined) => {
    if (!f) return;
    setFoto(f);
    setVista(URL.createObjectURL(f));
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title="Récipe" subtitle="Toma la foto del récipe. El farmacéutico lo revisa antes de vender." />
      <Alert tone="info" icon={<Info className="mt-0.5 h-4 w-4 shrink-0" />}>
        Cómo funciona: 1) toma la foto, 2) escribe la cédula del cliente, 3) el farmacéutico la ve en «Por revisar» y la aprueba. Después ya se puede vender lo del récipe.
      </Alert>
      <Card>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => elegir(e.target.files?.[0])} />
        {vista ? (
          <img src={vista} alt="Foto del récipe" className="max-h-[420px] w-full rounded-lg bg-surface2 object-contain" />
        ) : (
          <button onClick={() => input.current?.click()} className="flex h-56 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line text-muted hover:border-accent hover:text-accent">
            <Camera className="h-10 w-10" />
            <span className="font-semibold">Tomar o elegir foto</span>
            <span className="text-xs">JPG, PNG o WEBP, hasta 5 MB</span>
          </button>
        )}
        <Campo etiqueta="Cédula del cliente" ayuda="Así el récipe queda en su ficha y sirve para la venta">
          <input id="rx-cedula" value={cedula} onChange={(e) => setCedula(e.target.value)} inputMode="numeric" placeholder="V-14582307" className={claseInput} />
        </Campo>
        <div className="flex flex-wrap gap-2">
          {vista && <Button icon={<Upload className="h-4 w-4" />} onClick={() => input.current?.click()}>Otra foto</Button>}
          <Button variant="primary" size="lg" disabled={!foto || enviando} onClick={async () => {
            const form = new FormData();
            form.append('foto', foto!);
            if (cedula.trim()) form.append('cedula', cedula.trim());
            setEnviando(true);
            try {
              const r = await api<Recipe>('/recipes', { form });
              setEnviados((x) => [r, ...x]);
              setFoto(null); setVista(null); setCedula('');
              avisar('Récipe enviado al farmacéutico', 'ok');
            } catch (e) {
              avisar(e instanceof ApiError ? e.message : 'No se pudo enviar', 'bad');
            } finally {
              setEnviando(false);
            }
          }}>{enviando ? 'Enviando…' : 'Enviar al farmacéutico'}</Button>
        </div>
      </Card>
      {enviados.length > 0 && (
        <Card>
          <h2 className="text-base font-bold">Enviados en esta sesión</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {enviados.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span>{r.cedula ?? 'Sin cédula'} · {fecha(r.creadoEn)} {hora(r.creadoEn)}</span>
                <Chip tone="ok" icon={<CheckCircle2 className="h-3 w-3" />}>Enviado</Chip>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
