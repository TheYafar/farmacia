import { BarChart3, BookLock, Building2, MessageCircle, PieChart, Truck, Camera, Clock, Package, ShieldCheck, ShoppingCart, UserCog, Users, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Rol } from '@farmacia/shared';

export interface NavItem { to: string; label: string; short: string; icon: LucideIcon; roles: Rol[] }

// El cajero ve solo 4 opciones. Lo demás aparece cuando hace falta.
export const NAV: NavItem[] = [
  { to: '/vender', label: 'Vender', short: 'Vender', icon: ShoppingCart, roles: ['CAJERO', 'REGENTE', 'ADMIN'] },
  { to: '/caja', label: 'Caja', short: 'Caja', icon: Wallet, roles: ['CAJERO', 'REGENTE', 'ADMIN'] },
  { to: '/recipe', label: 'Récipe', short: 'Récipe', icon: Camera, roles: ['CAJERO', 'REGENTE', 'ADMIN'] },
  { to: '/clientes', label: 'Clientes', short: 'Clientes', icon: Users, roles: ['CAJERO', 'REGENTE', 'ADMIN'] },
  { to: '/revisar', label: 'Por revisar', short: 'Revisar', icon: ShieldCheck, roles: ['REGENTE', 'ADMIN'] },
  { to: '/encargos', label: 'Encargos', short: 'Encargos', icon: Clock, roles: ['REGENTE', 'ADMIN'] },
  { to: '/inventario', label: 'Inventario', short: 'Inventario', icon: Package, roles: ['REGENTE', 'ADMIN'] },
  { to: '/compras', label: 'Compras', short: 'Compras', icon: Truck, roles: ['ADMIN'] },
  { to: '/mayor', label: 'Al mayor', short: 'Mayor', icon: Building2, roles: ['ADMIN'] },
  { to: '/whatsapp', label: 'WhatsApp', short: 'WhatsApp', icon: MessageCircle, roles: ['REGENTE', 'ADMIN'] },
  { to: '/controlados', label: 'Controlados', short: 'Libro', icon: BookLock, roles: ['REGENTE', 'ADMIN'] },
  { to: '/reportes', label: 'Reportes', short: 'Reportes', icon: PieChart, roles: ['ADMIN'] },
  { to: '/resumen', label: 'Resumen', short: 'Resumen', icon: BarChart3, roles: ['ADMIN'] },
  { to: '/usuarios', label: 'Usuarios', short: 'Usuarios', icon: UserCog, roles: ['ADMIN'] },
];

export const ROLE_LABEL: Record<Rol, string> = { CAJERO: 'Cajero', REGENTE: 'Farmacéutico', ADMIN: 'Dueño' };
export const INICIO: Record<Rol, string> = { CAJERO: '/vender', REGENTE: '/revisar', ADMIN: '/resumen' };
