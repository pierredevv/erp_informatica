import { useEffect, useState } from 'react';
import { api } from '../api';
import SupabaseStatus from '../components/SupabaseStatus';

export default function Config() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    void api<Record<string, any>>('/settings').then(setSettings).catch((e) => setMessage({ text: e.message, error: true }));
  }, []);

  const set = (key: string, value: unknown) => setSettings((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setMessage(null);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(settings.closeTime))) {
      setMessage({ text: 'La hora de cierre debe tener formato HH:mm.', error: true });
      return;
    }
    if (!/^\d+(\.\d{1,3})?$/.test(String(settings.openingAmountDefault))) {
      setMessage({ text: 'El monto inicial debe ser un decimal válido.', error: true });
      return;
    }
    try {
      const saved = await api<Record<string, any>>('/settings', {
        method: 'PATCH',
        body: {
          qrImageUrl: String(settings.qrImageUrl ?? ''),
          qrLabel: String(settings.qrLabel ?? ''),
          closeTime: String(settings.closeTime),
          closeGraceMinutes: Number(settings.closeGraceMinutes),
          openingAmountDefault: String(settings.openingAmountDefault),
          adminEmail: String(settings.adminEmail),
        },
      });
      setSettings(saved);
      setMessage({ text: 'Configuración guardada.' });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    }
  };

  return (
    <div className="stack">
      {message && <div className={`alert ${message.error ? 'error' : 'success'}`}>{message.text}</div>}
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Configuración general</h2>
            <p className="muted">Solo administradores · moneda BOB · zona America/La_Paz</p>
          </div>
          <button className="button primary" onClick={() => void save()}>
            Guardar cambios
          </button>
        </div>
        <div className="form-grid two">
          <label>
            Etiqueta del QR fijo
            <input value={String(settings.qrLabel ?? '')} onChange={(e) => set('qrLabel', e.target.value)} />
          </label>
          <label>
            URL/imagen del QR fijo
            <input value={String(settings.qrImageUrl ?? '')} onChange={(e) => set('qrImageUrl', e.target.value)} placeholder="https://… o /qr.png" />
          </label>
          <label>
            Hora de cierre automático
            <input type="time" value={String(settings.closeTime ?? '22:30')} onChange={(e) => set('closeTime', e.target.value)} />
          </label>
          <label>
            Gracia de cierre (minutos)
            <input type="number" min="0" step="1" value={Number(settings.closeGraceMinutes ?? 60)} onChange={(e) => set('closeGraceMinutes', e.target.value)} />
          </label>
          <label>
            Monto inicial por defecto (Bs)
            <input value={String(settings.openingAmountDefault ?? '0')} onChange={(e) => set('openingAmountDefault', e.target.value)} />
          </label>
          <label>
            Correo del administrador
            <input type="email" value={String(settings.adminEmail ?? '')} onChange={(e) => set('adminEmail', e.target.value)} />
          </label>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Conexión Supabase</h2>
            <p className="muted">Cliente SDK del frontend · la autenticación y las reglas de negocio siguen en el backend</p>
          </div>
        </div>
        <SupabaseStatus />
      </section>

      <section className="card">
        <div className="card-head"><h2>Vista previa del QR</h2></div>
        <div className="qr-panel">
          {settings.qrImageUrl ? (
            <img src={String(settings.qrImageUrl)} alt="QR fijo" />
          ) : (
            <div className="qr-placeholder">QR</div>
          )}
          <div>
            <strong>{String(settings.qrLabel ?? 'QR fijo del centro')}</strong>
            <p className="muted">Este código se muestra en el módulo de ventas. El sistema no genera ni valida pagos QR.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
