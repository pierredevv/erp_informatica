import { describe, expect, it } from 'vitest';
import { isPasswordResetPath } from '../apps/web/src/reset-route';

describe('ruta pública de cambio de contraseña', () => {
  it('reconoce la ruta con la ñ literal y codificada por el navegador', () => {
    expect(isPasswordResetPath('/cambiar-contraseña')).toBe(true);
    expect(isPasswordResetPath('/cambiar-contrase%C3%B1a')).toBe(true);
    expect(isPasswordResetPath('/cambiar-contrasena')).toBe(true);
  });

  it('ignora barras finales y rutas ajenas', () => {
    expect(isPasswordResetPath('/cambiar-contraseña/')).toBe(true);
    expect(isPasswordResetPath('/')).toBe(false);
    expect(isPasswordResetPath('/usuarios')).toBe(false);
    expect(isPasswordResetPath('/%E0%A4%A')).toBe(false);
  });
});
