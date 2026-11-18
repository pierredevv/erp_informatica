import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from './auth';
import Layout, { fetchUnread, type Page } from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import Purchases from './pages/Purchases';
import Inventory from './pages/Inventory';
import Cash from './pages/Cash';
import Users from './pages/Users';
import Shifts from './pages/Shifts';
import Reports from './pages/Reports';
import Notifications from './pages/Notifications';
import Config from './pages/Config';
import ResetPassword from './pages/ResetPassword';
import { isPasswordResetPath } from './reset-route';

function PasswordModal() {
  const { changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirm) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }
    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h2>Cambiar contraseña</h2>
        <p className="muted">Por seguridad debés definir una contraseña nueva antes de operar.</p>
        <label>
          Contraseña actual
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </label>
        <label>
          Contraseña nueva (mínimo 8 caracteres)
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
        </label>
        <label>
          Confirmar contraseña
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
        </label>
        {error && <div className="alert error">{error}</div>}
        <div className="row spread">
          <button type="button" className="button" onClick={() => void logout()}>
            Cerrar sesión
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState<Page>('dashboard');
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(() => {
    void fetchUnread().then(setUnread);
  }, []);

  useEffect(() => {
    if (user) refreshUnread();
  }, [user, refreshUnread]);

  useEffect(() => {
    if (user) refreshUnread();
  }, [page, user, refreshUnread]);

  // El enlace del correo es público: se procesa antes de exigir sesión.
  if (isPasswordResetPath(window.location.pathname)) {
    return <ResetPassword />;
  }

  if (loading) return <div className="loading-screen">Cargando sistema…</div>;
  if (!user) return <Login />;

  const content = (() => {
    switch (page) {
      case 'ventas': return <Sales />;
      case 'compras': return <Purchases />;
      case 'inventario': return <Inventory />;
      case 'caja': return <Cash />;
      case 'usuarios': return <Users />;
      case 'turnos': return <Shifts />;
      case 'reportes': return <Reports />;
      case 'notificaciones': return <Notifications onRead={refreshUnread} />;
      case 'config': return <Config />;
      default: return <Dashboard go={setPage} />;
    }
  })();

  return (
    <>
      <Layout page={page} setPage={setPage} unread={unread}>
        {user.role === 'ENCARGADO' && user.shift && !user.shift.inShift && (
          <div className="alert warn">
            Estás fuera de tu horario asignado. Las operaciones están bloqueadas hasta tu próximo turno; podés consultar
            datos y cerrar la caja dentro del tiempo de gracia.
          </div>
        )}
        {content}
      </Layout>
      {user.mustChangePassword && <PasswordModal />}
    </>
  );
}
