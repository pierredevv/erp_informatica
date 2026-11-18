import { useEffect, useState } from 'react';
import { api, money } from '../api';

interface PurchaseLine {
  itemId: string;
  name: string;
  quantity: string;
  unitCost: string;
}

export default function Purchases() {
  const [items, setItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierName, setSupplierName] = useState('');
  const [method, setMethod] = useState<'EFECTIVO' | 'QR'>('EFECTIVO');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  const load = async () => {
    const [itemList, supplierList, purchases] = await Promise.all([
      api<any[]>('/items'),
      api<any[]>('/purchases/suppliers/list'),
      api<any[]>('/purchases'),
    ]);
    setItems(itemList.filter((i) => i.type === 'PRODUCTO'));
    setSuppliers(supplierList);
    setHistory(purchases.slice(0, 10));
  };

  useEffect(() => {
    void load().catch((e) => setMessage({ text: e.message, error: true }));
  }, []);

  const total = lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unitCost || 0), 0);

  const submit = async () => {
    setMessage(null);
    try {
      await api('/purchases', {
        method: 'POST',
        body: {
          supplierName,
          method,
          note: note || null,
          items: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitCost: l.unitCost })),
        },
      });
      setMessage({ text: 'Compra registrada: stock actualizado y egreso contabilizado.' });
      setLines([]);
      setNote('');
      void load();
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    }
  };

  return (
    <div className="stack">
      {message && <div className={`alert ${message.error ? 'error' : 'success'}`}>{message.text}</div>}
      <div className="grid two">
        <section className="card">
          <div className="card-head">
            <h2>Nueva compra</h2>
            <span className="muted">Descuenta de la caja abierta</span>
          </div>
          <div className="form-grid">
            <label>
              Proveedor
              <input
                list="suppliers"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Nombre del proveedor"
              />
              <datalist id="suppliers">
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </label>
            <label>
              Pago
              <select value={method} onChange={(e) => setMethod(e.target.value as 'EFECTIVO' | 'QR')}>
                <option value="EFECTIVO">Efectivo</option>
                <option value="QR">QR</option>
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>
              Producto
              <select
                value=""
                onChange={(e) => {
                  const item = items.find((i) => i.id === e.target.value);
                  if (!item) return;
                  setLines((current) => [
                    ...current,
                    {
                      itemId: item.id,
                      name: item.name,
                      quantity: String(item.reorderQty || 1),
                      unitCost: String(item.lastCost || '0'),
                    },
                  ]);
                }}
              >
                <option value="">Agregar producto…</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <table className="table compact">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cant.</th>
                <th>Costo unit.</th>
                <th>Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted center">
                    Sin productos cargados
                  </td>
                </tr>
              )}
              {lines.map((line, index) => (
                <tr key={index}>
                  <td>{line.name}</td>
                  <td>
                    <input
                      className="cell-input"
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={line.quantity}
                      onChange={(e) =>
                        setLines((current) => current.map((l, i) => (i === index ? { ...l, quantity: e.target.value } : l)))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitCost}
                      onChange={(e) =>
                        setLines((current) => current.map((l, i) => (i === index ? { ...l, unitCost: e.target.value } : l)))
                      }
                    />
                  </td>
                  <td>{money(Number(line.quantity) * Number(line.unitCost))}</td>
                  <td>
                    <button className="icon-button danger" onClick={() => setLines((c) => c.filter((_, i) => i !== index))}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <label>
            Nota (opcional)
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="ticket-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          <button className="button primary full" disabled={!supplierName || lines.length === 0} onClick={() => void submit()}>
            Registrar compra
          </button>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Últimas compras</h2>
          </div>
          <table className="table compact">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Total</th>
                <th>Encargado</th>
              </tr>
            </thead>
            <tbody>
              {history.map((purchase) => (
                <tr key={purchase.id}>
                  <td>{new Date(purchase.purchasedAt).toLocaleString('es-BO')}</td>
                  <td>{purchase.supplierName}</td>
                  <td>{money(purchase.total)}</td>
                  <td>{purchase.createdBy?.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
