import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { api } from '../api';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'ENCARGADO';
  active: boolean;
  mustChangePassword: boolean;
  deletedAt: string | null;
  createdAt: string;
}

interface ShiftRow {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  active: boolean;
}

const DAYS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function Users() {
  const { user: current } = useAuth();
  const isAdmin = current?.role === 'ADMIN';
  const [users, setUsers] = useState<UserRow[]>([]);
  const [shifts, setShifts] = useState<Record<string, ShiftRow[]>>({});
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [temporary, setTemporary] = useState<{ email: string; password: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'ENCARGADO',
    sendWelcomeEmail: false,
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'ENCARGADO', active: true });

  const load = async () => {
    const list = await api<UserRow[]>('/users');
    setUsers(list);
    const entries = await Promise.all(
      list.map(async (item) => {
        try {
          const rows = await api<ShiftRow[]>(`/users/${item.id}/shifts`);
          return [item.id, rows] as const;
        } catch {
          return [item.id, []] as const;
        }
      }),
    );
    setShifts(Object.fromEntries(entries));
  };

  useEffect(() => {
    void load().catch((e) => setMessage({ text: e.message, error: true }));
  }, []);

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setMessage(null);
    try {
      await fn();
      if (success) setMessage({ text: success });
      await load();
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    }
  };

  const create = () =>
    run(async () => {
      await api('/users', {
        method: 'POST',
        body: {
          name: form.name,
          email: form.email,
          ...(form.password ? { password: form.password } : {}),
          role: form.role,
          active: true,
          sendWelcomeEmail: form.sendWelcomeEmail,
        },
      });
      setForm({ name: '', email: '', password: '', role: 'ENCARGADO', sendWelcomeEmail: false });
      setCreating(false);
    }, 'Usuario creado.');

  const saveEdit = (id: string) =>
    run(async () => {
      await api(`/users/${id}`, { method: 'PATCH', body: editForm });
      setEditing(null);
    }, 'Usuario actualizado.');

  return (
    <div className="stack">
      {message && <div className={`alert ${message.error ? 'error' : 'success'}`}>{message.text}</div>}
      {temporary && (
        <div className="alert warn">
          Contraseña temporal de <strong>{temporary.email}</strong>: <code>{temporary.password}</code>. Entréguela al usuario
          y pídale cambiarla al ingresar.
          <button className="link" onClick={() => setTemporary(null)}>
            Entendido
          </button>
        </div>
      )}

      {isAdmin && (
        <section className="card">
          <div className="card-head">
            <h2>{creating ? 'Nuevo usuario' : 'Usuarios del sistema'}</h2>
            <button className="button primary small" onClick={() => setCreating(!creating)}>
              {creating ? 'Cancelar' : '+ Nuevo usuario'}
            </button>
          </div>
          {creating && (
            <div className="form-grid five">
              <label>
                Nombre
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label>
                Correo
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label>
                Contraseña (opcional)
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </label>
              <label>
                Rol
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="ENCARGADO">Encargado</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </label>
              <label className="checkbox-label">
                <span>
                  <input
                    type="checkbox"
                    checked={form.sendWelcomeEmail}
                    onChange={(e) => setForm({ ...form, sendWelcomeEmail: e.target.checked })}
                  />
                  Enviar correo de bienvenida
                </span>
              </label>
              <button
                className="button primary"
                disabled={!form.name.trim() || !form.email.trim() || (form.password !== '' && form.password.length < 8)}
                onClick={() => void create()}
              >
                Crear usuario
              </button>
            </div>
          )}
        </section>
      )}

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Turnos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((item) => (
              <tr key={item.id} className={item.deletedAt ? 'row-muted' : ''}>
                <td>
                  {editing === item.id ? (
                    <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  ) : (
                    <strong>{item.name}</strong>
                  )}
                  {item.mustChangePassword && <span className="chip small warn">Debe cambiar clave</span>}
                </td>
                <td>
                  {editing === item.id ? (
                    <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                  ) : (
                    item.email
                  )}
                </td>
                <td>
                  {editing === item.id ? (
                    <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                      <option value="ENCARGADO">Encargado</option>
                      <option value="ADMIN">Administrador</option>
                    </select>
                  ) : (
                    item.role
                  )}
                </td>
                <td>
                  {editing === item.id ? (
                    <select value={String(editForm.active)} onChange={(e) => setEditForm({ ...editForm, active: e.target.value === 'true' })}>
                      <option value="true">Activo</option>
                      <option value="false">Inactivo</option>
                    </select>
                  ) : (
                    <span className={`pill ${item.active && !item.deletedAt ? 'ok' : 'warn'}`}>
                      {item.deletedAt ? 'Eliminado' : item.active ? 'Activo' : 'Inactivo'}
                    </span>
                  )}
                </td>
                <td>
                  <div className="chips">
                    {(shifts[item.id] ?? [])
                      .filter((shift) => shift.active)
                      .map((shift) => (
                        <span className="chip small" key={shift.id}>
                          {DAYS[shift.weekday]} {shift.startTime}–{shift.endTime}
                        </span>
                      ))}
                    {(shifts[item.id] ?? []).length === 0 && <span className="muted">Sin turnos</span>}
                  </div>
                </td>
                <td>
                  {isAdmin && !item.deletedAt && (
                    <div className="row">
                      {editing === item.id ? (
                        <>
                          <button className="button small primary" onClick={() => void saveEdit(item.id)}>
                            Guardar
                          </button>
                          <button className="button small" onClick={() => setEditing(null)}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="button small"
                            onClick={() => {
                              setEditing(item.id);
                              setEditForm({ name: item.name, email: item.email, role: item.role, active: item.active });
                            }}
                          >
                            Editar
                          </button>
                          <button
                            className="button small"
                            onClick={() =>
                              void run(async () => {
                                const result = await api<{ temporaryPassword: string }>(`/users/${item.id}/reset-password`, {
                                  method: 'POST',
                                });
                                setTemporary({ email: item.email, password: result.temporaryPassword });
                              })
                            }
                          >
                            Reset clave
                          </button>
                          <button
                            className="button small danger"
                            onClick={() => {
                              if (window.confirm(`¿Desactivar a ${item.name}?`)) {
                                void run(() => api(`/users/${item.id}/deactivate`, { method: 'POST' }), 'Usuario desactivado.');
                              }
                            }}
                          >
                            Desactivar
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
