import { BarChart3, Camera, Clock, Package, ShieldCheck, ShoppingCart, UserCog, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Rol } from '@farmacia/shared';

export interface NavItem { to: string; label: string; short: string; icon: LucideIcon; roles: Rol[] }

// El cajero ve solo 3 opciones. Lo demás aparece cuando hace falta.
export const NAV: NavItem[] = [
  { to: '/vender', label: 'Vender', short: 'Vender', icon: ShoppingCart, roles: ['CAJERO', 'REGENTE', 'ADMIN'] },
  { to: '/recipe', label: 'Récipe', short: 'Récipe', icon: Camera, roles: ['CAJERO', 'REGENTE', 'ADMIN'] },
  { to: '/clientes', label: 'Clientes', short: 'Clientes', icon: Users, roles: ['CAJERO', 'REGENTE', 'ADMIN'] },
  { to: '/revisar', label: 'Por revisar', short: 'Revisar', icon: ShieldCheck, roles: ['REGENTE', 'ADMIN'] },
  { to: '/encargos', label: 'Encargos', short: 'Encargos', icon: Clock, roles: ['REGENTE', 'ADMIN'] },
  { to: '/inventario', label: 'Inventario', short: 'Inventario', icon: Package, roles: ['REGENTE', 'ADMIN'] },
  { to: '/resumen', label: 'Resumen', short: 'Resumen', icon: BarChart3, roles: ['ADMIN'] },
  { to: '/usuarios', label: 'Usuarios', short: 'Usuarios', icon: UserCog, roles: ['ADMIN'] },
];

export const ROLE_LABEL: Record<Rol, string> = { CAJERO: 'Cajero', REGENTE: 'Farmacéutico', ADMIN: 'Dueño' };
export const INICIO: Record<Rol, string> = { CAJERO: '/vender', REGENTE: '/revisar', ADMIN: '/resumen' };
