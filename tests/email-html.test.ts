import { describe, expect, it } from 'vitest';
import { emailHtmlFromText } from '../apps/api/src/common/email-html';
import {
  passwordResetLink,
  welcomeReminderEmailBody,
} from '../apps/api/src/common/password-reset';

describe('cuerpo HTML de los correos', () => {
  it('convierte el enlace de cambio de contraseña en un <a> clickeable', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.payload.signature=';
    const link = passwordResetLink(token);
    const html = emailHtmlFromText(`Ingresá aquí: ${link}`);

    expect(link).toContain('/cambiar-contrase%C3%B1a?token=');
    expect(link).toContain('%3D');
    expect(html).toContain(`<a href="${link}"`);
    expect(html).toContain(`</a>`);
  });

  it('codifica caracteres especiales del token sin romper la URL', () => {
    const link = passwordResetLink('a+b/c=');
    expect(link).toContain('%2B');
    expect(link).toContain('%2F');
    expect(link).toContain('%3D');

    const html = emailHtmlFromText(link);
    expect(html).toContain(`href="${link}"`);
  });

  it('escapa HTML inyectado en el nombre del usuario', () => {
    const html = emailHtmlFromText('Hola <script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('escapa automáticamente el texto del cuerpo', () => {
    const link = passwordResetLink('token');
    const body = welcomeReminderEmailBody('<b>Juan</b>', 'juan@gmail.com', link);
    const html = emailHtmlFromText(body);

    expect(html).toContain('&lt;b&gt;Juan&lt;/b&gt;');
    expect(html).not.toContain('<b>Juan</b>');
    expect(html).toContain('Recordatorio');
    expect(html).toContain(`href="${link}"`);
    expect(html).toContain('<br>');
  });

  it('no convierte protocolos que no sean http/https y respeta signos de puntuación', () => {
    const html = emailHtmlFromText('javascript:alert(1) https://ejemplo.com/cambiar.');

    expect(html).not.toContain('href="javascript');
    expect(html).toContain('href="https://ejemplo.com/cambiar"');
    expect(html).toContain('</a>.');
  });
});
