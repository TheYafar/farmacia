import { BarChart3, Camera, Clock, Package, ShieldCheck, ShoppingCart, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from '@/data/types';

export interface NavItem { to: string; label: string; short: string; icon: LucideIcon; roles: Role[] }

// Cajero: solo 3 opciones. Lo demás aparece cuando hace falta.
export const NAV: NavItem[] = [
  { to: '/mostrador', label: 'Vender', short: 'Vender', icon: ShoppingCart, roles: ['cajero', 'regente', 'admin'] },
  { to: '/recipe', label: 'Récipe', short: 'Récipe', icon: Camera, roles: ['cajero', 'regente', 'admin'] },
  { to: '/pacientes', label: 'Clientes', short: 'Clientes', icon: Users, roles: ['cajero', 'regente', 'admin'] },
  { to: '/validaciones', label: 'Por revisar', short: 'Revisar', icon: ShieldCheck, roles: ['regente', 'admin'] },
  { to: '/espera', label: 'Encargos', short: 'Encargos', icon: Clock, roles: ['regente', 'admin'] },
  { to: '/inventario', label: 'Inventario', short: 'Inventario', icon: Package, roles: ['admin'] },
  { to: '/panel', label: 'Resumen', short: 'Resumen', icon: BarChart3, roles: ['admin'] },
];

export const ROLE_LABEL: Record<Role, string> = { cajero: 'Cajero', regente: 'Farmacéutico', admin: 'Dueño' };
