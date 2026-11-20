import { BarChart3, Settings, ClipboardList, Receipt, Tags, BookLock, Building2, MessageCircle, PieChart, Truck, Camera, Clock, Package, ShieldCheck, ShoppingCart, UserCog, Users, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Rol } from '@farmacia/shared';

export interface NavItem { to: string; label: string; short: string; icon: LucideIcon; roles: Rol[]; grupo: Grupo }

export const GRUPOS = ['Vender', 'Clientes', 'Inventario', 'Farmacéutico', 'Negocio', 'Administración'] as const;
export type Grupo = (typeof GRUPOS)[number];

// El cajero ve solo 5 opciones. El dueño las ve agrupadas (Vender, Clientes, Inventario…); los grupos se pliegan.
export const NAV: NavItem[] = [
  { to: '/vender', label: 'Vender', short: 'Vender', icon: ShoppingCart, roles: ['CAJERO', 'REGENTE', 'ADMIN'], grupo: 'Vender' },
  { to: '/caja', label: 'Caja', short: 'Caja', icon: Wallet, roles: ['CAJERO', 'REGENTE', 'ADMIN'], grupo: 'Vender' },
  { to: '/ventas', label: 'Ventas', short: 'Ventas', icon: Receipt, roles: ['CAJERO', 'REGENTE', 'ADMIN'], grupo: 'Vender' },
  { to: '/recipe', label: 'Récipe', short: 'Récipe', icon: Camera, roles: ['CAJERO', 'REGENTE', 'ADMIN'], grupo: 'Vender' },
  { to: '/clientes', label: 'Clientes', short: 'Clientes', icon: Users, roles: ['CAJERO', 'REGENTE', 'ADMIN'], grupo: 'Clientes' },
  { to: '/encargos', label: 'Encargos', short: 'Encargos', icon: Clock, roles: ['REGENTE', 'ADMIN'], grupo: 'Clientes' },
  { to: '/mayor', label: 'Al mayor', short: 'Mayor', icon: Building2, roles: ['ADMIN'], grupo: 'Clientes' },
  { to: '/whatsapp', label: 'WhatsApp', short: 'WhatsApp', icon: MessageCircle, roles: ['REGENTE', 'ADMIN'], grupo: 'Clientes' },
  { to: '/inventario', label: 'Inventario', short: 'Inventario', icon: Package, roles: ['REGENTE', 'ADMIN'], grupo: 'Inventario' },
  { to: '/catalogo', label: 'Catálogo', short: 'Catálogo', icon: Tags, roles: ['REGENTE', 'ADMIN'], grupo: 'Inventario' },
  { to: '/compras', label: 'Compras', short: 'Compras', icon: Truck, roles: ['ADMIN'], grupo: 'Inventario' },
  { to: '/revisar', label: 'Por revisar', short: 'Revisar', icon: ShieldCheck, roles: ['REGENTE', 'ADMIN'], grupo: 'Farmacéutico' },
  { to: '/controlados', label: 'Controlados', short: 'Libro', icon: BookLock, roles: ['REGENTE', 'ADMIN'], grupo: 'Farmacéutico' },
  { to: '/resumen', label: 'Resumen', short: 'Resumen', icon: BarChart3, roles: ['ADMIN'], grupo: 'Negocio' },
  { to: '/reportes', label: 'Reportes', short: 'Reportes', icon: PieChart, roles: ['ADMIN'], grupo: 'Negocio' },
  { to: '/auditoria', label: 'Auditoría', short: 'Auditoría', icon: ClipboardList, roles: ['ADMIN'], grupo: 'Administración' },
  { to: '/configuracion', label: 'Configuración', short: 'Ajustes', icon: Settings, roles: ['ADMIN'], grupo: 'Administración' },
  { to: '/usuarios', label: 'Usuarios', short: 'Usuarios', icon: UserCog, roles: ['ADMIN'], grupo: 'Administración' },
];

export const ROLE_LABEL: Record<Rol, string> = { CAJERO: 'Cajero', REGENTE: 'Farmacéutico', ADMIN: 'Dueño' };
export const INICIO: Record<Rol, string> = { CAJERO: '/vender', REGENTE: '/revisar', ADMIN: '/resumen' };
