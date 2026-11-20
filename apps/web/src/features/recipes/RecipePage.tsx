import { Camera, CheckCircle2, HelpCircle, PhoneCall, Smartphone } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button, Card, PageHeader, Sheet } from '@/components/ui';
import { useApp } from '@/store/useApp';
import QrCode from './QrCode';
import RecipePhoto from './RecipePhoto';
import RecipeReview from './RecipeReview';

export default function RecipePage() {
  const rx = useApp((s) => s.recipes[0]!);
  const [foto, setFoto] = useState<string | undefined>();
  const [qr, setQr] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Récipe"
        subtitle="La app lee el nombre de los medicamentos. Tú confirmas antes de vender."
        actions={
          <>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFoto(URL.createObjectURL(f)); }} />
            {/* En PC: foto con el teléfono por QR. En teléfono/tablet: cámara directa. */}
            <Button size="lg" variant="primary" className="xl:hidden" icon={<Camera className="h-5 w-5" />} onClick={() => fileRef.current?.click()}>Tomar foto</Button>
            <Button size="lg" variant="primary" className="hidden xl:inline-flex" icon={<Smartphone className="h-5 w-5" />} onClick={() => setQr(true)}>Tomar foto con el teléfono</Button>
          </>
        }
      />
      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl bg-surface p-3 text-sm">
        <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-ok" /><b>Listo:</b> se leyó bien</span>
        <span className="flex items-center gap-1.5"><HelpCircle className="h-4 w-4 text-warn" /><b>Pregúntale al cliente:</b> la letra no es clara</span>
        <span className="flex items-center gap-1.5"><PhoneCall className="h-4 w-4 text-bad" /><b>Llama al farmacéutico:</b> puede ser peligroso</span>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <Card className="self-start">
          <RecipePhoto src={foto} medico={rx.medico} especialidad={rx.especialidad} />
          <p className="text-sm text-muted">{rx.medico} · {rx.especialidad}</p>
        </Card>
        <RecipeReview rx={rx} />
      </div>

      <Sheet open={qr} onClose={() => setQr(false)} title="Toma la foto con tu teléfono">
        <div className="flex flex-col items-center gap-4 text-center">
          <QrCode size={220} />
          <ol className="flex flex-col gap-2 text-left text-base">
            <li><b>1.</b> Abre la cámara de tu teléfono.</li>
            <li><b>2.</b> Apunta a este código.</li>
            <li><b>3.</b> Toma la foto del récipe. Aparece aquí sola.</li>
          </ol>
          <p className="text-sm text-muted">Esperando la foto…</p>
        </div>
      </Sheet>
    </div>
  );
}
