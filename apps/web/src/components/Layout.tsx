import type { ReactNode } from 'react';
import { useAuth } from '../auth';
import { api } from '../api';

export type Page =
  | 'dashboard'
  | 'ventas'
  | 'compras'
  | 'inventario'
  | 'caja'
  | 'usuarios'
  | 'turnos'
  | 'reportes'
  | 'notificaciones'
  | 'config';

const adminPages: Array<{ id: Page; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Panel', icon: '◧' },
  { id: 'ventas', label: 'Ventas (POS)', icon: '🛒' },
  { id: 'compras', label: 'Compras', icon: '📦' },
  { id: 'inventario', label: 'Inventario', icon: '📋' },
  { id: 'caja', label: 'Caja y cierre', icon: '💰' },
  { id: 'reportes', label: 'Reportes', icon: '📊' },
  { id: 'notificaciones', label: 'Avisos', icon: '🔔' },
  { id: 'usuarios', label: 'Usuarios', icon: '👥' },
  { id: 'turnos', label: 'Turnos', icon: '🕒' },
  { id: 'config', label: 'Configuración', icon: '⚙️' },
];

const encargadoPages = adminPages.filter((p) =>
  ['dashboard', 'ventas', 'inventario', 'caja', 'reportes', 'notificaciones'].includes(p.id),
);

interface Props {
  page: Page;
  setPage: (page: Page) => void;
  children: ReactNode;
  unread: number;
}

export default function Layout({ page, setPage, children, unread }: Props) {
  const { user, logout } = useAuth();
  const pages = user?.role === 'ADMIN' ? adminPages : encargadoPages;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">CI</span>
          <div>
            <strong>Centro Interno</strong>
            <small>Control de caja e inventario</small>
          </div>
        </div>
        <nav>
          {pages.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span>{item.icon}</span>
              {item.label}
              {item.id === 'notificaciones' && unread > 0 && <em className="badge">{unread}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{user?.name.slice(0, 2).toUpperCase()}</div>
          <div className="grow">
            <strong>{user?.name}</strong>
            <small>{user?.role === 'ADMIN' ? 'Administrador' : 'Encargado'}</small>
          </div>
          <button className="icon-button" title="Cerrar sesión" onClick={() => void logout()}>
            ⏻
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <h1>{pages.find((p) => p.id === page)?.label}</h1>
            <p>Santa Cruz de la Sierra · BOB</p>
          </div>
          <div className="topbar-right">
            {user?.shift && (
              <span className={`pill ${user.shift.inShift || user.role === 'ADMIN' ? 'ok' : 'warn'}`}>
                {user.role === 'ADMIN'
                  ? 'Acceso total'
                  : user.shift.inShift
                    ? `Turno activo · ${user.shift.localTime}`
                    : `Fuera de turno · ${user.shift.localTime}`}
              </span>
            )}
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

export async function fetchUnread(): Promise<number> {
  try {
    const result = await api<{ unread: number }>('/notifications');
    return result.unread;
  } catch {
    return 0;
  }
}
