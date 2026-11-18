import { useEffect, useMemo, useState } from 'react';
import { api, money } from '../api';

interface Line {
  itemId: string;
  name: string;
  quantity: string;
  unitPrice: string;
  stock: number | null;
}

export default function Sales() {
  const [items, setItems] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [session, setSession] = useState<any>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [method, setMethod] = useState<'EFECTIVO' | 'QR'>('EFECTIVO');
  const [discount, setDiscount] = useState('0');
  const [opening, setOpening] = useState('0');
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = async () => {
    const [itemList, cash, config] = await Promise.all([
      api<any[]>('/items'),
      api<any>('/cash/current'),
      api<Record<string, any>>('/settings'),
    ]);
    setItems(itemList);
    setSession(cash.session);
    setSettings(config);
  };

  useEffect(() => {
    void load().catch((e) => setMessage({ text: e.message, error: true }));
  }, []);

  const total = useMemo(
    () =>
      lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0) -
      Number(discount || 0),
    [lines, discount],
  );

  const addLine = (item: any) => {
    setLines((current) => {
      const existing = current.find((line) => line.itemId === item.id);
      if (existing) {
        return current.map((line) =>
          line.itemId === item.id ? { ...line, quantity: String(Number(line.quantity) + 1) } : line,
        );
      }
      return [
        ...current,
        {
          itemId: item.id,
          name: item.name,
          quantity: '1',
          unitPrice: String(item.salePrice),
          stock: item.stock === null ? null : Number(item.stock),
        },
      ];
    });
  };

  const updateLine = (itemId: string, patch: Partial<Line>) => {
    setLines((current) => current.map((line) => (line.itemId === itemId ? { ...line, ...patch } : line)));
  };

  const openCash = async () => {
    try {
      const result = await api<any>('/cash/open', { method: 'POST', body: { openingAmount: opening } });
      setSession(result);
      setMessage({ text: 'Caja abierta correctamente.' });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    }
  };

  const submit = async () => {
    setMessage(null);
    try {
      const result = await api<any>('/sales', {
        method: 'POST',
        body: {
          method,
          discount,
          items: lines.map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          })),
        },
      });
      setMessage({ text: `Venta ${result.code} registrada por ${money(Number(result.total))}.` });
      setLines([]);
      setDiscount('0');
      void load();
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    }
  };

  return (
    <div className="stack">
      {message && <div className={`alert ${message.error ? 'error' : 'success'}`}>{message.text}</div>}

      {session?.status !== 'ABIERTA' && (
        <div className="card warn-card">
          <div>
            <h2>Abrir caja del día</h2>
            <p className="muted">Necesitás una caja abierta para registrar ventas.</p>
          </div>
          <div className="row">
            <input
              type="number"
              min="0"
              step="0.01"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              placeholder="Monto inicial"
            />
            <button className="button primary" onClick={() => void openCash()}>
              Abrir caja
            </button>
          </div>
        </div>
      )}

      <div className="pos-layout">
        <section className="card">
          <div className="card-head">
            <h2>Productos y servicios</h2>
            <input
              className="search"
              placeholder="Buscar…"
              onChange={(e) => setItems((current) => current.map((i) => ({ ...i, _visible: i.name.toLowerCase().includes(e.target.value.toLowerCase()) })))}
            />
          </div>
          <div className="product-grid">
            {items
              .filter((item) => item._visible !== false)
              .map((item) => (
                <button className="product" key={item.id} onClick={() => addLine(item)} disabled={session?.status !== 'ABIERTA'}>
                  <strong>{item.name}</strong>
                  <span>{money(item.salePrice)}</span>
                  <small>
                    {item.type === 'SERVICIO' ? 'Servicio' : `Stock: ${item.stock ?? 0}`}
                  </small>
                </button>
              ))}
          </div>
        </section>

        <section className="card ticket">
          <div className="card-head">
            <h2>Ticket</h2>
            <span className="muted">{lines.length} ítems</span>
          </div>
          <table className="table compact">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cant.</th>
                <th>Precio</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted center">
                    Tocá un producto para agregarlo
                  </td>
                </tr>
              )}
              {lines.map((line) => (
                <tr key={line.itemId}>
                  <td>{line.name}</td>
                  <td>
                    <input
                      className="cell-input"
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.itemId, { quantity: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.itemId, { unitPrice: e.target.value })}
                    />
                  </td>
                  <td>
                    <button className="icon-button danger" onClick={() => setLines((c) => c.filter((l) => l.itemId !== line.itemId))}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="form-grid">
            <label>
              Descuento (Bs)
              <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </label>
            <div>
              <span className="field-label">Medio de pago</span>
              <div className="segmented">
                <button className={method === 'EFECTIVO' ? 'active' : ''} onClick={() => setMethod('EFECTIVO')}>
                  Efectivo
                </button>
                <button className={method === 'QR' ? 'active' : ''} onClick={() => setMethod('QR')}>
                  Código QR
                </button>
              </div>
            </div>
          </div>

          {method === 'QR' && (
            <div className="qr-panel">
              {settings.qrImageUrl ? (
                <img src={String(settings.qrImageUrl)} alt="QR fijo" />
              ) : (
                <div className="qr-placeholder">QR</div>
              )}
              <div>
                <strong>{String(settings.qrLabel || 'QR fijo del centro')}</strong>
                <p className="muted">Mostrá este código al cliente para que pague por QR.</p>
              </div>
            </div>
          )}

          <div className="ticket-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          <button
            className="button primary full large"
            disabled={lines.length === 0 || session?.status !== 'ABIERTA'}
            onClick={() => void submit()}
          >
            Confirmar venta
          </button>
        </section>
      </div>
    </div>
  );
}
