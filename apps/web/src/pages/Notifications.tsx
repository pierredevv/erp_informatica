import { useEffect, useState } from 'react';
import { api } from '../api';

interface Props {
  onRead: () => void;
}

const icons: Record<string, string> = {
  CIERRE_CAJA: '💰',
  CIERRE_CERRADO: '⚠️',
  STOCK_BAJO: '📦',
  USER_RESET: '🔑',
};

export default function Notifications({ onRead }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [message, setMessage] = useState('');

  const load = async () => {
    const result = await api<{ items: any[]; unread: number }>('/notifications');
    setItems(result.items);
    setUnread(result.unread);
  };

  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);

  const mark = async (id?: string) => {
    try {
      if (id) await api(`/notifications/${id}/read`, { method: 'POST' });
      else await api('/notifications/read-all', { method: 'POST' });
      await load();
      onRead();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <div className="stack">
      {message && <div className="alert error">{message}</div>}
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Avisos del sistema</h2>
            <p className="muted">{unread} sin leer</p>
          </div>
          <button className="button small" disabled={unread === 0} onClick={() => void mark()}>
            Marcar todo como leído
          </button>
        </div>
        {items.length === 0 ? (
          <p className="muted">No hay avisos registrados.</p>
        ) : (
          <div className="notification-list">
            {items.map((item) => (
              <div className={`notification ${item.read ? '' : 'unread'}`} key={item.id}>
                <div className="notification-icon">{icons[item.type] ?? '🔔'}</div>
                <div className="grow">
                  <div className="row spread">
                    <strong>{item.title}</strong>
                    <small className="muted">{new Date(item.createdAt).toLocaleString('es-BO')}</small>
                  </div>
                  <p>{item.body}</p>
                </div>
                {!item.read && (
                  <button className="button small" onClick={() => void mark(item.id)}>
                    Marcar leído
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
