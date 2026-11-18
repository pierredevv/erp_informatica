import { useEffect, useState } from 'react';
import { api } from '../api';

interface ShiftRow {
  id?: string;
  weekday: number;
  startTime: string;
  endTime: string;
  active?: boolean;
}

interface CoverageDay {
  weekday: number;
  shifts: Array<{ user: string; startTime: string; endTime: string }>;
}

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function Shifts() {
  const [users, setUsers] = useState<any[]>([]);
  const [userId, setUserId] = useState('');
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [coverage, setCoverage] = useState<CoverageDay[]>([]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const loadCoverage = () => api<CoverageDay[]>('/shifts/coverage').then(setCoverage);

  useEffect(() => {
    void (async () => {
      const [list, cov] = await Promise.all([api<any[]>('/users'), api<CoverageDay[]>('/shifts/coverage')]);
      const encargados = list.filter((item) => item.role === 'ENCARGADO' && !item.deletedAt);
      setUsers(encargados);
      setCoverage(cov);
      if (encargados.length > 0) setUserId(encargados[0].id);
    })().catch((e) => setMessage({ text: e.message, error: true }));
  }, []);

  useEffect(() => {
    if (!userId) return;
    void api<ShiftRow[]>(`/users/${userId}/shifts`)
      .then((list) => setRows(list.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime }))))
      .catch((e) => setMessage({ text: e.message, error: true }));
  }, [userId]);

  const changeRow = (index: number, patch: Partial<ShiftRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = async () => {
    setMessage(null);
    try {
      await api('/shifts/weekly', {
        method: 'POST',
        body: {
          userId,
          shifts: rows.map((row) => ({ weekday: Number(row.weekday), startTime: row.startTime, endTime: row.endTime })),
        },
      });
      setMessage({ text: 'Horario semanal guardado.' });
      void loadCoverage();
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    }
  };

  const removeRow = (index: number) => setRows((current) => current.filter((_, i) => i !== index));

  return (
    <div className="stack">
      {message && <div className={`alert ${message.error ? 'error' : 'success'}`}>{message.text}</div>}

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Horarios semanales</h2>
            <p className="muted">Turnos recurrentes por día de semana en America/La_Paz</p>
          </div>
          <label className="inline-label">
            Encargado
            <select value={userId} onChange={(e) => setUserId(e.target.value)}>
              {users.map((item) => (
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
              <th>Día</th>
              <th>Inicio</th>
              <th>Fin</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td>
                  <select value={row.weekday} onChange={(e) => changeRow(index, { weekday: Number(e.target.value) })}>
                    {DAYS.map((day, i) => (
                      <option key={day} value={i + 1}>
                        {day}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="time" value={row.startTime} onChange={(e) => changeRow(index, { startTime: e.target.value })} />
                </td>
                <td>
                  <input type="time" value={row.endTime} onChange={(e) => changeRow(index, { endTime: e.target.value })} />
                </td>
                <td>
                  <button className="icon-button danger" onClick={() => removeRow(index)}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="row spread">
          <button
            className="button"
            onClick={() => setRows((current) => [...current, { weekday: 1, startTime: '08:00', endTime: '13:00' }])}
          >
            + Agregar turno
          </button>
          <button className="button primary" disabled={!userId} onClick={() => void save()}>
            Guardar horario
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Cobertura de la semana</h2>
          <span className="muted">El último turno de cada día queda a cargo del cierre</span>
        </div>
        <div className="coverage-grid">
          {coverage.map((day) => (
            <div className="coverage-day" key={day.weekday}>
              <h3>{DAYS[day.weekday - 1]}</h3>
              {day.shifts.length === 0 ? (
                <p className="muted">Sin cobertura</p>
              ) : (
                day.shifts.map((shift, index) => (
                  <div className="coverage-shift" key={index}>
                    <strong>{shift.user}</strong>
                    <span>
                      {shift.startTime}–{shift.endTime}
                    </span>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
