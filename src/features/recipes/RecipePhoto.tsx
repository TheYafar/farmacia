/** Ilustración de un récipe manuscrito con los recuadros que detectó la IA. */
export default function RecipePhoto({ src, medico, especialidad }: { src?: string; medico: string; especialidad: string }) {
  return (
    <div className="paper relative aspect-[3/4] w-full max-w-full overflow-hidden rounded-lg text-[#2b3a8f]">
      {src ? (
        <img src={src} alt="Foto del récipe" className="h-full w-full object-cover" />
      ) : (
        <svg viewBox="0 0 300 400" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-label="Récipe manuscrito (ilustración)">
          <text x="20" y="34" fill="currentColor" stroke="none" fontSize="13" fontFamily="Georgia,serif">{medico} · {especialidad}</text>
          <text x="20" y="52" fill="currentColor" stroke="none" fontSize="10" fontFamily="Georgia,serif">MPPS 54.210 · CM 8.877</text>
          <path d="M20 66h260" strokeWidth="1" />
          <text x="22" y="98" fill="currentColor" stroke="none" fontSize="20" fontFamily="Georgia,serif" fontStyle="italic">Rp/</text>
          <path d="M40 130c10-14 18 8 26-4s12-10 20 0 10-8 18 2 14-6 22 2M150 128c8-6 14 4 22-2s10 6 20 0" />
          <path d="M40 196c6-10 14 6 22-4s10 8 18-2 12 4 20-4 10 6 18 0M160 194c10-8 14 6 24-2" />
          <path d="M40 262c8-12 16 6 22-2s14 6 20-4 10 8 18-2M150 260c6-4 12 4 18-2 6 4 10-2 16 2" />
          <path d="M170 350c20-30 40 20 60-10s20 10 40-6" strokeWidth="1.6" />
        </svg>
      )}
      <span className="absolute left-[10%] top-[27%] h-[10%] w-[66%] rounded-md border-2 border-ok" />
      <span className="absolute left-[10%] top-[44%] h-[10%] w-[56%] rounded-md border-2 border-bad" />
      <span className="absolute left-[10%] top-[60%] h-[10%] w-[56%] rounded-md border-2 border-warn" />
    </div>
  );
}
