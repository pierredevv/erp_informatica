import { useEffect, useState } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import type { Page } from '../components/Layout';

interface DashboardData {
  businessDate: string;
  session: any;
  expected: any;
  salesCount: number;
  salesTotal: number;
  purchasesTotal: number;
  lowStockCount: number;
  lowStock: any[];
  todayShifts: Array<{ user: string; startTime: string; endTime: string }>;
}

export default function Dashboard({ go }: { go: (page: Page) => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  const load = () => api<DashboardData>('/reports/dashboard').then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <div className="loading">Cargando…</div>;

  const cards = [
    { label: 'Ventas de hoy', value: money(data.salesTotal), foot: `${data.salesCount} tickets`, tone: 'green' },
    { label: 'Compras de hoy', value: money(data.purchasesTotal), foot: 'Egresos registrados', tone: 'red' },
    { label: 'Productos en alerta', value: String(data.lowStockCount), foot: 'Stock bajo o agotado', tone: 'amber' },
    {
      label: 'Caja',
      value: data.session?.status === 'ABIERTA' ? 'Abierta' : data.session ? 'Cerrada' : 'Sin abrir',
      foot: data.expected ? `Esperado ${money(data.expected.expectedCash)}` : 'Aún sin movimientos',
      tone: data.session?.status === 'ABIERTA' ? 'blue' : 'gray',
    },
  ];

  return (
    <div className="stack">
      <div className="grid cards">
        {cards.filter((card) => user?.role === 'ADMIN' || card.label !== 'Compras de hoy').map((card) => (
          <div className={`card stat ${card.tone}`} key={card.label}>
            <span className="stat-label">{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.foot}</small>
          </div>
        ))}
      </div>

      <div className="grid two">
        <section className="card">
          <div className="card-head">
            <h2>Accesos rápidos</h2>
            <span className="muted">{data.businessDate}</span>
          </div>
          <div className="quick-actions">
            <button className="button primary" onClick={() => go('ventas')}>
              Registrar venta
            </button>
            {user?.role === 'ADMIN' && (
              <button className="button" onClick={() => go('compras')}>
                Registrar compra
              </button>
            )}
            <button className="button" onClick={() => go('caja')}>
              Ver caja
            </button>
            <button className="button" onClick={() => go('inventario')}>
              Revisar inventario
            </button>
          </div>
          <div className="divider" />
          <h3>Turnos de hoy</h3>
          {data.todayShifts.length === 0 ? (
            <p className="muted">No hay turnos asignados para hoy.</p>
          ) : (
            <div className="chips">
              {data.todayShifts.map((shift, index) => (
                <span className="chip" key={index}>
                  {shift.user} · {shift.startTime}–{shift.endTime}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Stock por reponer</h2>
            <button className="link" onClick={() => go('inventario')}>
              Ver todo
            </button>
          </div>
          {data.lowStock.length === 0 ? (
            <p className="muted">Todo el inventario está por encima del mínimo.</p>
          ) : (
            <table className="table compact">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Stock</th>
                  <th>Mínimo</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStock.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td className="danger-text">{String(item.stock)}</td>
                    <td>{String(item.minStock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
