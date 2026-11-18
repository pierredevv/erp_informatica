import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en .env');
}

/**
 * Cliente Supabase para el frontend.
 *
 * La autenticación del ERP sigue siendo la cookie JWT gestionada por NestJS
 * (ver `auth.tsx`), por eso se desactiva la sesión de Supabase Auth: usar el
 * publishable key con RLS no sustituye a las reglas de negocio del backend.
 */
export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export const supabaseConfigured = true;
