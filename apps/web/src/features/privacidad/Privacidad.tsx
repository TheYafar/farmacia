import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Cookie } from 'lucide-react';
import { Button } from '@/components/ui';
import { useCaja } from '@/store/caja';
import { useSesion } from '@/store/sesion';

const CLAVE = 'avisoCookies';
const aceptado = () => { try { return !!localStorage.getItem(CLAVE); } catch { return true; } };

/** Aviso de cookies: sale una vez por equipo, abajo de la pantalla. */
export function AvisoCookies() {
  const [visible, setVisible] = useState(false);
  const enPrivacidad = useLocation().pathname.startsWith('/privacidad');
  useEffect(() => { setVisible(!aceptado()); }, []);
  if (!visible) return null;
  return (
    <div role="region" aria-label="Aviso de cookies" className="fixed inset-x-0 bottom-0 z-50 p-3 md:bottom-4 md:left-auto md:right-4 md:max-w-md md:p-0">
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-pop">
        <div className="flex gap-3">
          <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
          <p className="text-sm">Usamos <b>una sola cookie</b>, necesaria para mantener tu sesión abierta en este equipo. No usamos cookies de publicidad, de seguimiento ni de estadísticas.</p>
        </div>
        <div className="flex justify-end gap-2">
          {!enPrivacidad && <Link to="/privacidad"><Button size="sm" variant="ghost">Más información</Button></Link>}
          <Button size="sm" variant="primary" onClick={() => { try { localStorage.setItem(CLAVE, new Date().toISOString()); } catch { /* sin almacenamiento */ } setVisible(false); }}>Entendido</Button>
        </div>
      </div>
    </div>
  );
}

const Seccion = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2"><h2 className="text-lg font-bold">{titulo}</h2><div className="flex flex-col gap-2 text-[15px] leading-relaxed text-fg/90">{children}</div></section>
);

/** Política de privacidad y cookies. Se puede ver sin entrar (enlace en la pantalla de entrada). */
export default function PrivacidadPage() {
  const f = useCaja((s) => s.farmacia);
  const usuario = useSesion((s) => s.usuario);
  useEffect(() => { document.title = `Privacidad y cookies · ${f.nombre}`; }, [f.nombre]);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      {!usuario && <Link to="/" className="flex items-center gap-1.5 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" />Volver a la entrada</Link>}
      <div>
        <h1 className="font-display text-3xl font-bold">Privacidad y cookies</h1>
        <p className="mt-1 text-sm text-muted">{f.nombre}{f.rif ? ` · RIF ${f.rif}` : ''}{f.direccion ? ` · ${f.direccion}` : ''}</p>
      </div>

      <Seccion titulo="Cookies">
        <p>Usamos <b>una sola cookie</b>, llamada <code className="rounded bg-surface2 px-1">farm_rt</code>. Sirve para que tu sesión siga abierta en este equipo sin escribir la clave cada vez.</p>
        <ul className="list-disc pl-5">
          <li>Es <b>necesaria</b>: sin ella no se puede entrar al sistema.</li>
          <li>Está protegida: el navegador no deja que ningún programa la lea, solo viaja por conexión segura (HTTPS) y solo a este sitio.</li>
          <li>Dura 7 días, o hasta que toques «Cerrar sesión».</li>
        </ul>
        <p><b>No usamos</b> cookies de publicidad, de seguimiento, de estadísticas ni de redes sociales.</p>
      </Seccion>

      <Seccion titulo="Lo que se guarda en este equipo">
        <p>Para que el sistema funcione mejor, el navegador guarda en este equipo (no son cookies y no se envían a nadie):</p>
        <ul className="list-disc pl-5">
          <li>Si prefieres el tema claro u oscuro, y si ya viste las guías y este aviso.</li>
          <li>Tu usuario, solo si marcaste «Recordar mi usuario».</li>
          <li>Qué caja es este equipo.</li>
          <li>Una copia del catálogo y las ventas hechas sin internet, para seguir vendiendo si se cae la conexión. Se borran al enviarse.</li>
        </ul>
        <p>Puedes borrar todo esto desde la configuración de tu navegador («Borrar datos del sitio»).</p>
      </Seccion>

      <Seccion titulo="Datos de los clientes">
        <p>Con el permiso del cliente, la farmacia guarda su cédula, nombre, teléfono, alergias y condiciones (por ejemplo, hipertenso). Sirven para atenderlo, avisarle si algo choca con una alergia y cumplir con el control de medicamentos.</p>
        <ul className="list-disc pl-5">
          <li>Las fotos de récipes se guardan en privado y se borran solas pasado el plazo que fija la farmacia.</li>
          <li>Solo los empleados de la farmacia ven estos datos, cada uno según su rol. Todo queda registrado en la auditoría.</li>
          <li>Soporte técnico solo entra si el dueño lo permite, por un tiempo limitado, y queda registrado.</li>
          <li>No se venden ni se comparten con nadie.</li>
        </ul>
        <p>El cliente puede pedirle a la farmacia ver, corregir o borrar sus datos, salvo lo que la ley obliga a guardar (como el libro de psicotrópicos).</p>
      </Seccion>

      <Seccion titulo="Servicios de afuera">
        <ul className="list-disc pl-5">
          <li><b>Tipografías de Google Fonts:</b> al cargar la página, Google recibe la dirección IP del equipo.</li>
          <li><b>Tasa del BCV:</b> la consulta el servidor, no tu equipo.</li>
          <li><b>WhatsApp:</b> solo se abre cuando tú tocas un botón de WhatsApp.</li>
        </ul>
      </Seccion>

      {(f.telefono || f.direccion) && <p className="text-sm text-muted">Preguntas sobre tus datos: {[f.telefono, f.direccion].filter(Boolean).join(' · ')}</p>}
    </div>
  );
}
