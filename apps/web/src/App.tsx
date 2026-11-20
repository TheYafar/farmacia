import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from '@/layout/AppShell';
import { INICIO, NAV } from '@/config/nav';
import { useRol, useSesion } from '@/store/sesion';
import { Cargando } from '@/components/ui';
import LoginPage from '@/features/auth/LoginPage';
import VenderPage from '@/features/mostrador/MostradorPage';
import RecipePage from '@/features/recipes/RecipePage';
import ClientesPage from '@/features/pacientes/PacientesPage';
import RevisarPage from '@/features/validaciones/ValidacionesPage';
import EncargosPage from '@/features/espera/EsperaPage';
import InventarioPage from '@/features/inventario/InventarioPage';
import ResumenPage from '@/features/panel/PanelPage';
import UsuariosPage from '@/features/usuarios/UsuariosPage';
import { ComprasPage, LibroPage, MayoristaPage, ReportesPage, WhatsappPage } from '@/features/negocio/Negocio';
import { AuditoriaPage, CatalogoPage, VentasPage } from '@/features/gestion/Gestion';
import ConfiguracionPage from '@/features/configuracion/ConfiguracionPage';
import CajaPage from '@/features/caja/CajaPage';
import { useCaja } from '@/store/caja';
import { rutaIncluida, usePlan } from '@/store/plan';
import { NoIncluido } from '@/features/plan/Plan';
import SoportePage from '@/features/soporte/SoportePage';
import CajasPage from '@/features/cajas/Cajas';
import PrivacidadPage, { AvisoCookies } from '@/features/privacidad/Privacidad';
import { CasosPage, EquipoPage, FarmaciasPage, PlanesPage } from '@/features/central/CentralPage';

/** Esconde la ruta a quien no tiene el rol (el servidor igual lo rechazaría). */
function ConRol({ ruta, children }: { ruta: string; children: ReactNode }) {
  const rol = useRol();
  const plan = usePlan((s) => s.plan);
  const item = NAV.find((n) => n.to === ruta);
  if (item && !item.roles.includes(rol)) return <Navigate to={INICIO[rol]} replace />;
  if (!rutaIncluida(plan, ruta)) return <NoIncluido ruta={ruta} />;
  return <>{children}</>;
}

export default function App() {
  const { usuario, listo, restaurar } = useSesion();
  const cargarFarmacia = useCaja((s) => s.cargarFarmacia);
  useEffect(() => { void restaurar(); void cargarFarmacia(); }, [restaurar, cargarFarmacia]);

  if (!listo) return <Cargando texto="Abriendo…" />;
  if (!usuario) {
    return (
      <>
        <Routes>
          <Route path="/privacidad" element={<PrivacidadPage />} />
          <Route path="*" element={<LoginPage />} />
        </Routes>
        <AvisoCookies />
      </>
    );
  }
  const paginas: [string, ReactNode][] = [
    ['/vender', <VenderPage />], ['/caja', <CajaPage />], ['/recipe', <RecipePage />], ['/clientes', <ClientesPage />],
    ['/revisar', <RevisarPage />], ['/encargos', <EncargosPage />], ['/inventario', <InventarioPage />],
    ['/resumen', <ResumenPage />], ['/usuarios', <UsuariosPage />], ['/ventas', <VentasPage />], ['/catalogo', <CatalogoPage />], ['/auditoria', <AuditoriaPage />], ['/configuracion', <ConfiguracionPage />],
    ['/compras', <ComprasPage />], ['/mayor', <MayoristaPage />], ['/whatsapp', <WhatsappPage />], ['/controlados', <LibroPage />], ['/reportes', <ReportesPage />],
    ['/soporte', <SoportePage />], ['/cajas', <CajasPage />], ['/farmacias', <FarmaciasPage />], ['/casos', <CasosPage />], ['/equipo', <EquipoPage />], ['/planes', <PlanesPage />],
  ];
  return (
    <>
    <AvisoCookies />
    <Routes>
      <Route element={<AppShell />}>
        {paginas.map(([p, el]) => <Route key={p} path={p} element={<ConRol ruta={p}>{el}</ConRol>} />)}
        <Route path="/privacidad" element={<PrivacidadPage />} />
        <Route path="*" element={<Navigate to={INICIO[usuario.rol]} replace />} />
      </Route>
    </Routes>
    </>
  );
}
