import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { api, money } from '../api';

interface CashDetail {
  session: any;
  expected: {
    cashIn: number;
    cashOut: number;
    qrIn: number;
    qrOut: number;
    expectedCash: number;
    expectedQr: number;
  };
  movements: any[];
}

const todayLocal = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts;
};

export default function Cash() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [date, setDate] = useState(todayLocal());
  const [detail, setDetail] = useState<CashDetail | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [countedCash, setCountedCash] = useState('');
  const [countedQr, setCountedQr] = useState('');
  const [qrManual, setQrManual] = useState(false);
  const [note, setNote] = useState('');
  const [reopenReason, setReopenReason] = useState('');

  const load = async (target = date) => {
    const data = await api<CashDetail>(`/cash/by-date/${target}`);
    setDetail(data);
    const expected = data.expected?.expectedCash;
    setCountedCash(expected === undefined ? '' : String(expected));
    setCountedQr(data.expected?.expectedQr === undefined ? '' : String(data.expected.expectedQr));
  };

  useEffect(() => {
    void load().catch((e) => setMessage({ text: e.message, error: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const act = async (fn: () => Promise<unknown>, success: string) => {
    setMessage(null);
    try {
      await fn();
      setMessage({ text: success });
      setNote('');
      setReopenReason('');
      void load();
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    }
  };

  const close = () =>
    act(async () => {
      await api('/cash/close', {
        method: 'POST',
        body: {
          countedCash,
          countedQr: qrManual && countedQr.trim() !== '' ? countedQr : null,
          note: note || null,
        },
      });
    }, 'Caja cerrada y auditada correctamente.');

  return (
    <div className="stack">
      {message && <div className={`alert ${message.error ? 'error' : 'success'}`}>{message.text}</div>}

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Sesión de caja</h2>
            <p className="muted">Arqueo diario en BOB · zona America/La_Paz</p>
          </div>
          <div className="row">
            <label className="inline-label">
              Fecha
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
        </div>

        {!detail?.session ? (
          <div className="alert warn">
            No hay caja registrada para la fecha seleccionada. Abrí la caja del día desde <strong>Ventas (POS)</strong> para
            comenzar a operar.
          </div>
        ) : (
          <>
            <div className="session-strip">
              <div>
                <span>Estado</span>
                <strong className={detail.session.status === 'ABIERTA' ? 'ok-text' : 'danger-text'}>
                  {detail.session.status}
                </strong>
              </div>
              <div>
                <span>Apertura</span>
                <strong>{money(detail.session.openingAmount)}</strong>
              </div>
              <div>
                <span>Abierta por</span>
                <strong>{detail.session.openedBy?.name ?? '—'}</strong>
              </div>
              <div>
                <span>Cerrada por</span>
                <strong>{detail.session.closedBy?.name ?? '—'}</strong>
              </div>
              <div>
                <span>Nota</span>
                <strong className="wrap">{detail.session.note || '—'}</strong>
              </div>
            </div>

            <div className="grid four">
              <div className="card mini">
                <span>Ingresos efectivo</span>
                <strong className="ok-text">{money(detail.expected?.cashIn)}</strong>
              </div>
              <div className="card mini">
                <span>Egresos efectivo</span>
                <strong className="danger-text">{money(detail.expected?.cashOut)}</strong>
              </div>
              <div className="card mini">
                <span>QR neto</span>
                <strong>{money((detail.expected?.qrIn ?? 0) - (detail.expected?.qrOut ?? 0))}</strong>
              </div>
              <div className="card mini highlight">
                <span>Efectivo esperado</span>
                <strong>{money(detail.expected?.expectedCash)}</strong>
              </div>
            </div>

            {detail.session.status === 'ABIERTA' && (
              <div className="close-panel">
                <div className="card-head">
                  <h3>Arqueo y cierre</h3>
                  {isAdmin && (
                    <button
                      className="button small"
                      onClick={() => void act(() => api('/cash/prepare-close', { method: 'POST' }), 'Propuesta de cierre actualizada y avisos enviados.')}
                    >
                      Actualizar propuesta y avisar
                    </button>
                  )}
                </div>
                <p className="muted">
                  El monto esperado se calcula automáticamente con las ventas y compras de la sesión. Si no informás el QR real,
                  se asume el esperado y quedará registrado en la auditoría.
                </p>
                <div className="form-grid three">
                  <label>
                    Efectivo contado (Bs)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={countedCash}
                      onChange={(e) => setCountedCash(e.target.value)}
                    />
                  </label>
                  <label className="checkbox-label">
                    <span>
                      <input type="checkbox" checked={qrManual} onChange={(e) => setQrManual(e.target.checked)} />
                      Informar QR real
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={countedQr}
                      disabled={!qrManual}
                      onChange={(e) => setCountedQr(e.target.value)}
                    />
                  </label>
                  <label>
                    Nota / diferencia
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Obligatoria si hay diferencia" />
                  </label>
                </div>
                <button className="button primary" disabled={!countedCash} onClick={() => void close()}>
                  Confirmar cierre del día
                </button>
              </div>
            )}

            {detail.session.status === 'CERRADA' && isAdmin && (
              <div className="close-panel warn-card">
                <div className="card-head">
                  <h3>Reabrir caja</h3>
                  <span className="muted">Solo administrador · queda auditado</span>
                </div>
                <div className="row">
                  <input
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="Motivo de la reapertura (mínimo 5 caracteres)"
                    className="grow"
                  />
                  <button
                    className="button"
                    disabled={reopenReason.trim().length < 5}
                    onClick={() => void act(() => api('/cash/reopen', { method: 'POST', body: { reason: reopenReason } }), 'Caja reabierta.')}
                  >
                    Reabrir
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {detail && (detail.movements?.length ?? 0) > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Movimientos de la sesión</h2>
            <span className="muted">{detail.movements?.length ?? 0} registros</span>
          </div>
          <table className="table compact">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Tipo</th>
                <th>Medio</th>
                <th>Monto</th>
                <th>Usuario</th>
                <th>Referencia</th>
              </tr>
            </thead>
            <tbody>
              {(detail.movements ?? []).map((movement) => (
                <tr key={movement.id}>
                  <td>{new Date(movement.createdAt).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{movement.type}</td>
                  <td>{movement.method}</td>
                  <td className={movement.direction === 'IN' ? 'ok-text' : 'danger-text'}>
                    {movement.direction === 'IN' ? '+' : '−'}
                    {money(movement.amount)}
                  </td>
                  <td>{movement.createdBy?.name ?? '—'}</td>
                  <td className="muted">{movement.referenceId ? String(movement.referenceId).slice(0, 8) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
