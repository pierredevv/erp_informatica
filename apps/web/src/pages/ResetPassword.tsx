import { useState, type FormEvent } from 'react';
import { api } from '../api';

export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const mode = token ? 'reset' : 'request';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (mode === 'reset' && newPassword !== confirm) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'reset') {
        await api('/auth/reset-password', { method: 'POST', body: { token, newPassword } });
        setDone('Tu contraseña fue actualizada. Ya podés ingresar con la nueva clave.');
      } else {
        await api('/auth/forgot-password', { method: 'POST', body: { email } });
        setDone('Si el correo está registrado, enviamos un enlace para cambiar la contraseña.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la solicitud');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">CI</div>
        <h1>{mode === 'reset' ? 'Nueva contraseña' : 'Recuperar contraseña'}</h1>
        <p className="muted">
          {mode === 'reset'
            ? 'Elegí una contraseña nueva de al menos 8 caracteres.'
            : 'Ingresá tu correo y te enviaremos un enlace para elegir una contraseña nueva.'}
        </p>

        {done ? (
          <div className="alert success">{done}</div>
        ) : (
          <form onSubmit={submit}>
            {mode === 'request' && (
              <label>
                Correo
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  required
                />
              </label>
            )}
            {mode === 'reset' && (
              <>
                <label>
                  Contraseña nueva (mínimo 8 caracteres)
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </label>
                <label>
                  Confirmar contraseña
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    minLength={8}
                    required
                  />
                </label>
              </>
            )}
            {error && <div className="alert error">{error}</div>}
            <button className="button primary full" disabled={busy} type="submit">
              {busy ? 'Guardando…' : mode === 'reset' ? 'Guardar contraseña' : 'Enviar enlace'}
            </button>
          </form>
        )}

        <p className="muted" style={{ marginTop: 18 }}>
          <a className="link" href="/">
            Volver al ingreso
          </a>
        </p>
      </div>
    </div>
  );
}
