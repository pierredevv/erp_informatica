const RESET_PATHS = ['/cambiar-contraseña', '/cambiar-contrasena'];

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * `location.pathname` viene codificado por el navegador (`%C3%B1`), por lo que
 * comparar contra la ñ literal falla y la vista nunca se muestra.
 */
export function isPasswordResetPath(pathname: string): boolean {
  const normalized = safeDecode(pathname).replace(/\/+$/, '');
  return RESET_PATHS.includes(normalized);
}
