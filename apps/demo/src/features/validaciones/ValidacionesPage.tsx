import { clsx } from 'clsx';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Card, Chip, EmptyState, PageHeader } from '@/components/ui';
import { pacientes } from '@/data/mock';
import { semaforo, useApp } from '@/store/useApp';
import RecipePhoto from '@/features/recipes/RecipePhoto';
import RecipeReview from '@/features/recipes/RecipeReview';

export default function ValidacionesPage() {
  const recipes = useApp((s) => s.recipes);
  const pend = recipes.filter((r) => r.items.some((i) => i.confianza < 90 && i.resueltoCon === undefined));
  const [selId, setSelId] = useState<string | undefined>(pend[0]?.id);
  const sel = recipes.find((r) => r.id === selId) ?? pend[0];

  // Casos que no vienen de un récipe con IA (ejemplo)
  const otros = [
    { t: 'Antibiótico: Azitromicina 500 mg', p: 'P. León · V-26.003.118', who: 'Luis T. (caja 2) · hace 6 min' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Por revisar" subtitle="Casos que los cajeros te enviaron porque necesitan tu permiso" />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="self-start">
          <div className="flex items-center justify-between"><h2 className="text-base font-bold">Esperando tu respuesta</h2><Chip tone="bad">{pend.length + otros.length}</Chip></div>
          <ul className="flex flex-col gap-2">
            {pend.map((r) => {
              const pac = pacientes.find((p) => p.cedula === r.cedula);
              const peor = Math.min(...r.items.filter((i) => i.resueltoCon === undefined).map((i) => i.confianza));
              return (
                <li key={r.id}>
                  <button onClick={() => setSelId(r.id)} className={clsx('w-full rounded-lg border border-l-[5px] p-3 text-left', semaforo(peor) === 'rojo' ? 'border-l-bad' : 'border-l-warn', sel?.id === r.id ? 'border-accent bg-accent-soft/40' : 'border-line')}>
                    <div className="font-semibold">Récipe con letra dudosa</div>
                    <div className="text-xs text-muted">{pac?.nombre} · enviado por {r.enviadoPor} · {r.hace}</div>
                  </button>
                </li>
              );
            })}
            {otros.map((o) => (
              <li key={o.t} className="rounded-lg border border-l-[5px] border-line border-l-warn p-3">
                <div className="font-semibold">{o.t}</div>
                <div className="text-xs text-muted">{o.p} · {o.who}</div>
              </li>
            ))}
          </ul>
        </Card>
        {sel && pend.length ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)]">
            <Card className="self-start"><RecipePhoto medico={sel.medico} especialidad={sel.especialidad} /></Card>
            <RecipeReview rx={sel} />
          </div>
        ) : (
          <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title="Todo está al día">Cuando un cajero necesite tu permiso, aparecerá aquí y te llegará un aviso.</EmptyState>
        )}
      </div>
    </div>
  );
}
