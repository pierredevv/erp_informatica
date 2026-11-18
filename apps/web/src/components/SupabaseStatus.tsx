import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

interface Status {
  kind: 'checking' | 'ok' | 'error';
  detail: string;
}

export default function SupabaseStatus() {
  const [status, setStatus] = useState<Status>({ kind: 'checking', detail: 'Verificando conexión…' });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { error } = await supabase.from('Item').select('id').limit(1);
        if (!active) return;
        setStatus(
          error
            ? { kind: 'error', detail: error.message }
            : { kind: 'ok', detail: 'Cliente listo. Las lecturas con la publishable key quedan sujetas a RLS.' },
        );
      } catch (error) {
        if (active) setStatus({ kind: 'error', detail: (error as Error).message });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const tone = status.kind === 'ok' ? 'success' : status.kind === 'error' ? 'error' : 'warn';
  const label = status.kind === 'ok' ? 'conectado' : status.kind === 'error' ? 'error' : 'verificando';

  return (
    <div className={`alert ${tone}`}>
      <strong>Supabase SDK · {label}</strong>
      <p className="muted">{status.detail}</p>
    </div>
  );
}
