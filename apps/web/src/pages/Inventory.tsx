import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { api, money } from '../api';

export default function Inventory() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [movementsFor, setMovementsFor] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [newItem, setNewItem] = useState({
    name: '',
    type: 'PRODUCTO',
    salePrice: '0',
    stock: '0',
    minStock: '0',
    reorderQty: '0',
    unit: 'unidad',
  });
  const [adjust, setAdjust] = useState<{ id: string; stock: string; note: string } | null>(null);
  const [editPrice, setEditPrice] = useState<{ id: string; name: string; salePrice: string; lastCost: string } | null>(null);

  const load = async () => {
    setItems(await api<any[]>('/items'));
  };

  const showMovements = async (itemId: string) => {
    try {
      const list = await api<any[]>(`/items/${itemId}/stock-movements`);
      setMovementsFor(itemId);
      setMovements(list.slice(0, 30));
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    }
  };

  useEffect(() => {
    void load().catch((e) => setMessage({ text: e.message, error: true }));
  }, []);

  const createItem = async () => {
    try {
      await api('/items', {
        method: 'POST',
        body: {
          ...newItem,
          type: newItem.type as 'PRODUCTO' | 'SERVICIO',
          sku: null,
          category: null,
          lastCost: '0',
        },
      });
      setMessage({ text: 'Item creado.' });
      setNewItem({ name: '', type: 'PRODUCTO', salePrice: '0', stock: '0', minStock: '0', reorderQty: '0', unit: 'unidad' });
      void load();
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    }
  };

  const saveAdjust = async () => {
    if (!adjust) return;
    try {
      await api(`/items/${adjust.id}/adjust-stock`, {
        method: 'POST',
        body: { itemId: adjust.id, newStock: adjust.stock, note: adjust.note },
      });
      setMessage({ text: 'Stock ajustado y auditado.' });
      setAdjust(null);
      void load();
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    }
  };

  const savePrice = async () => {
    if (!editPrice) return;
    try {
      await api(`/items/${editPrice.id}`, {
        method: 'PATCH',
        body: {
          salePrice: editPrice.salePrice,
          lastCost: editPrice.lastCost || null,
        },
      });
      setMessage({ text: 'Precios actualizados y auditados.' });
      setEditPrice(null);
      void load();
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    }
  };

  return (
    <div className="stack">
      {message && <div className={`alert ${message.error ? 'error' : 'success'}`}>{message.text}</div>}
      {user?.role === 'ADMIN' && (
        <section className="card">
          <div className="card-head">
            <h2>Nuevo producto o servicio</h2>
          </div>
          <div className="form-grid five">
            <label>
              Nombre
              <input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
            </label>
            <label>
              Tipo
              <select value={newItem.type} onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}>
                <option value="PRODUCTO">Producto</option>
                <option value="SERVICIO">Servicio</option>
              </select>
            </label>
            <label>
              Precio venta
              <input type="number" min="0" step="0.01" value={newItem.salePrice} onChange={(e) => setNewItem({ ...newItem, salePrice: e.target.value })} />
            </label>
            <label>
              Stock
              <input type="number" min="0" step="0.001" value={newItem.stock} onChange={(e) => setNewItem({ ...newItem, stock: e.target.value })} />
            </label>
            <label>
              Mínimo
              <input type="number" min="0" step="0.001" value={newItem.minStock} onChange={(e) => setNewItem({ ...newItem, minStock: e.target.value })} />
            </label>
          </div>
          <button className="button primary" disabled={!newItem.name} onClick={() => void createItem()}>
            Crear item
          </button>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Inventario actual</h2>
          <span className="muted">{items.length} items</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Tipo</th>
              <th>Stock</th>
              <th>Mínimo</th>
              <th>Precio</th>
              <th>Último costo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const low = item.stock !== null && item.minStock !== null && Number(item.stock) <= Number(item.minStock);
              return (
                <tr key={item.id} className={low ? 'row-warn' : ''}>
                  <td>
                    <strong>{item.name}</strong>
                    {low && <span className="chip small warn">Reponer {item.reorderQty ?? item.minStock}</span>}
                  </td>
                  <td>{item.type}</td>
                  <td>{item.stock === null ? '—' : String(item.stock)}</td>
                  <td>{item.minStock === null ? '—' : String(item.minStock)}</td>
                  <td>{money(item.salePrice)}</td>
                  <td>{item.lastCost ? money(item.lastCost) : '—'}</td>
                  <td>
                    <div className="row">
                      <button className="button small" onClick={() => void showMovements(item.id)}>
                        Movimientos
                      </button>
                      {item.type === 'PRODUCTO' && (
                        <button
                          className="button small"
                          onClick={() => setAdjust({ id: item.id, stock: String(item.stock ?? 0), note: '' })}
                        >
                          Ajustar
                        </button>
                      )}
                      {user?.role === 'ADMIN' && (
                        <button
                          className="button small"
                          onClick={() =>
                            setEditPrice({
                              id: item.id,
                              name: item.name,
                              salePrice: String(item.salePrice),
                              lastCost: item.lastCost == null ? '' : String(item.lastCost),
                            })
                          }
                        >
                          Editar precios
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {movementsFor && (
        <section className="card">
          <div className="card-head">
            <h2>Movimientos de stock</h2>
            <button className="link" onClick={() => setMovementsFor(null)}>
              Cerrar
            </button>
          </div>
          <table className="table compact">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Variación</th>
                <th>Usuario</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted center">
                    Sin movimientos registrados
                  </td>
                </tr>
              )}
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td>{new Date(movement.createdAt).toLocaleString('es-BO')}</td>
                  <td>{movement.type}</td>
                  <td className={Number(movement.delta) >= 0 ? 'ok-text' : 'danger-text'}>
                    {Number(movement.delta) >= 0 ? '+' : ''}
                    {String(movement.delta)}
                  </td>
                  <td>{movement.createdBy?.name ?? '—'}</td>
                  <td>{movement.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {editPrice && (
        <section className="card">
          <div className="card-head">
            <h2>Editar precios · {editPrice.name}</h2>
            <button className="link" onClick={() => setEditPrice(null)}>
              Cancelar
            </button>
          </div>
          <div className="form-grid">
            <label>
              Precio de venta
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={editPrice.salePrice}
                onChange={(e) => setEditPrice({ ...editPrice, salePrice: e.target.value })}
              />
            </label>
            <label>
              Último costo (opcional)
              <input
                type="number"
                min="0"
                step="0.01"
                value={editPrice.lastCost}
                onChange={(e) => setEditPrice({ ...editPrice, lastCost: e.target.value })}
              />
            </label>
          </div>
          <button
            className="button primary"
            disabled={Number(editPrice.salePrice) <= 0}
            onClick={() => void savePrice()}
          >
            Guardar precios
          </button>
        </section>
      )}

      {adjust && (
        <section className="card">
          <div className="card-head">
            <h2>Ajustar stock</h2>
            <button className="link" onClick={() => setAdjust(null)}>
              Cancelar
            </button>
          </div>
          <div className="form-grid">
            <label>
              Nuevo stock
              <input type="number" min="0" step="0.001" value={adjust.stock} onChange={(e) => setAdjust({ ...adjust, stock: e.target.value })} />
            </label>
            <label>
              Motivo
              <input value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} placeholder="Conteo, merma, corrección…" />
            </label>
          </div>
          <button className="button primary" disabled={adjust.note.trim().length < 3} onClick={() => void saveAdjust()}>
            Guardar ajuste
          </button>
        </section>
      )}
    </div>
  );
}
