import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import AppShell from '@/layout/AppShell';
import { NAV } from '@/config/nav';
import { useApp, useRole } from '@/store/useApp';
import LoginPage from '@/features/auth/LoginPage';
import MostradorPage from '@/features/mostrador/MostradorPage';
import RecipePage from '@/features/recipes/RecipePage';
import PacientesPage from '@/features/pacientes/PacientesPage';
import EsperaPage from '@/features/espera/EsperaPage';
import ValidacionesPage from '@/features/validaciones/ValidacionesPage';
import InventarioPage from '@/features/inventario/InventarioPage';
import PanelPage from '@/features/panel/PanelPage';

function RequireRole({ path, children }: { path: string; children: ReactNode }) {
  const role = useRole();
  const item = NAV.find((n) => n.to === path);
  return item && !item.roles.includes(role) ? <Navigate to="/mostrador" replace /> : <>{children}</>;
}

export default function App() {
  const user = useApp((s) => s.user);
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  const pages: [string, ReactNode][] = [
    ['/mostrador', <MostradorPage />], ['/recipe', <RecipePage />], ['/pacientes', <PacientesPage />],
    ['/espera', <EsperaPage />], ['/validaciones', <ValidacionesPage />], ['/inventario', <InventarioPage />], ['/panel', <PanelPage />],
  ];
  return (
    <Routes>
      <Route element={<AppShell />}>
        {pages.map(([p, el]) => <Route key={p} path={p} element={<RequireRole path={p}>{el}</RequireRole>} />)}
        <Route path="*" element={<Navigate to="/mostrador" replace />} />
      </Route>
    </Routes>
  );
}
