import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { api, money } from '../api';

type Tab = 'reconciliation' | 'inventory' | 'audit' | 'prices';

const todayLocal = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

export default function Reports() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [tab, setTab] = useState<Tab>('reconciliation');
  const [date, setDate] = useState(todayLocal());
  const [reconciliation, setReconciliation] = useState<any>(null);
  const [inventory, setInventory] = useState<any[]>([]);
  const [audit, setAudit] = useState<{ entries: any[]; integrity: any } | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [itemId, setItemId] = useState('');
  const [prices, setPrices] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void api<any[]>('/items').then((list) => {
      setItems(list);
      if (list.length > 0) setItemId(list[0].id);
    }).catch((e) => setMessage(e.message));
  }, []);

  useEffect(() => {
    setMessage('');
    if (tab === 'reconciliation') {
      void api<any>(`/reports/reconciliation?date=${date}`).then(setReconciliation).catch((e) => setMessage(e.message));
    } else if (tab === 'inventory') {
      void api<any[]>('/reports/inventory').then(setInventory).catch((e) => setMessage(e.message));
    } else if (tab === 'audit' && isAdmin) {
      void api<{ entries: any[]; integrity: any }>('/reports/audit').then(setAudit).catch((e) => setMessage(e.message));
    } else if (tab === 'prices' && itemId) {
      void api<any[]>(`/reports/price-history/${itemId}`).then(setPrices).catch((e) => setMessage(e.message));
    }
  }, [tab, date, itemId, isAdmin]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'reconciliation', label: 'Conciliación diaria' },
    { id: 'inventory', label: 'Valor de inventario' },
    ...(isAdmin ? [{ id: 'audit' as Tab, label: 'Auditoría' }] : []),
    { id: 'prices', label: 'Historial de precios' },
  ];

  return (
    <div className="stack">
      {message && <div className="alert error">{message}</div>}
      <div className="tabs">
        {tabs.map((item) => (
          <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'reconciliation' && (
        <section className="card">
          <div className="card-head">
            <h2>Conciliación del día</h2>
            <label className="inline-label">
              Fecha
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          {!reconciliation?.session ? (
            <p className="muted">{reconciliation?.message ?? 'Cargando…'}</p>
          ) : (
            <>
              <div className="grid four">
                <div className="card mini"><span>Ventas</span><strong>{reconciliation.sales.length}</strong></div>
                <div className="card mini"><span>Compras</span><strong>{reconciliation.purchases.length}</strong></div>
                <div className="card mini"><span>Esperado efectivo</span><strong>{money(reconciliation.expected.expectedCash)}</strong></div>
                <div className="card mini"><span>Contado efectivo</span><strong>{money(reconciliation.session.countedCash ?? 0)}</strong></div>
              </div>
              <div className="grid two">
                <div>
                  <h3>Ventas por encargado</h3>
                  <table className="table compact">
                    <thead><tr><th>Encargado</th><th>Tickets</th><th>Total</th></tr></thead>
                    <tbody>
                      {reconciliation.byUser.map((row: any) => (
                        <tr key={row.name}>
                          <td>{row.name}</td>
                          <td>{row.count}</td>
                          <td>{money(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3>Resumen de caja</h3>
                  <table className="table compact">
                    <tbody>
                      <tr><td>Diferencia efectivo</td><td className={Number(reconciliation.diffCash || 0) === 0 ? 'ok-text' : 'danger-text'}>{money(reconciliation.diffCash ?? 0)}</td></tr>
                      <tr><td>Diferencia QR</td><td className={Number(reconciliation.diffQr || 0) === 0 ? 'ok-text' : 'danger-text'}>{money(reconciliation.diffQr ?? 0)}</td></tr>
                      <tr><td>QR contado manualmente</td><td>{reconciliation.session.qrCountedManually ? 'Sí' : 'No (asumido)'}</td></tr>
                      <tr><td>Cerrada por</td><td>{reconciliation.session.closedById ? 'Registrado' : '—'}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="divider" />
              <h3>Movimientos</h3>
              <table className="table compact">
                <thead><tr><th>Hora</th><th>Tipo</th><th>Medio</th><th>Monto</th><th>Usuario</th></tr></thead>
                <tbody>
                  {reconciliation.movements.map((movement: any) => (
                    <tr key={movement.id}>
                      <td>{new Date(movement.createdAt).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{movement.type}</td>
                      <td>{movement.method}</td>
                      <td>{money(movement.amount)}</td>
                      <td>{movement.createdBy?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {tab === 'inventory' && (
        <section className="card">
          <div className="card-head"><h2>Valorización de inventario</h2></div>
          <table className="table">
            <thead><tr><th>Producto</th><th>Tipo</th><th>Stock</th><th>Último costo</th><th>Valor</th><th>Estado</th></tr></thead>
            <tbody>
              {inventory.map((row) => (
                <tr key={row.id} className={row.low ? 'row-warn' : ''}>
                  <td>{row.name}</td>
                  <td>{row.type}</td>
                  <td>{row.stock ?? '—'}</td>
                  <td>{row.lastCost === null ? '—' : money(row.lastCost)}</td>
                  <td>{money(row.value)}</td>
                  <td>{row.low ? <span className="chip small warn">Reponer</span> : <span className="chip small ok">OK</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'audit' && isAdmin && (
        <section className="card">
          <div className="card-head">
            <h2>Registro de auditoría inmutable</h2>
            {audit && (
              <span className={`pill ${audit.integrity.valid ? 'ok' : 'warn'}`}>
                {audit.integrity.valid ? `Cadena válida · ${audit.integrity.count} eventos` : 'Cadena alterada'}
              </span>
            )}
          </div>
          <table className="table compact">
            <thead><tr><th>#</th><th>Fecha</th><th>Acción</th><th>Entidad</th><th>Actor</th><th>Hash</th></tr></thead>
            <tbody>
              {(audit?.entries ?? []).map((entry) => (
                <tr key={entry.id}>
                  <td>{String(entry.sequence)}</td>
                  <td>{new Date(entry.createdAt).toLocaleString('es-BO')}</td>
                  <td><strong>{entry.action}</strong></td>
                  <td>{entry.entity} {entry.entityId ? String(entry.entityId).slice(0, 8) : ''}</td>
                  <td>{entry.actorRole ?? 'SISTEMA'}</td>
                  <td className="mono">{String(entry.hash).slice(0, 12)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'prices' && (
        <section className="card">
          <div className="card-head">
            <h2>Historial de precios de compra</h2>
            <label className="inline-label">
              Producto
              <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
          </div>
          <table className="table compact">
            <thead><tr><th>Fecha</th><th>Proveedor</th><th>Cantidad</th><th>Costo unitario</th></tr></thead>
            <tbody>
              {prices.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.purchase.purchasedAt).toLocaleDateString('es-BO')}</td>
                  <td>{row.purchase.supplierName}</td>
                  <td>{String(row.quantity)}</td>
                  <td>{money(row.unitCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
