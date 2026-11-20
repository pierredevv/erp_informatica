const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

const URL_PATTERN = /https?:\/\/[^\s<]+/gi;

/**
 * Convierte el cuerpo de texto del outbox en HTML con enlaces reales.
 * Se escapa primero para que nombres o emails con `<`, `&` o comillas no rompan el HTML.
 */
export function emailHtmlFromText(text: string): string {
  const escaped = escapeHtml(text);

  const withLinks = escaped.replace(URL_PATTERN, (raw) => {
    const trailing = raw.match(/[.,;:!?\]]+$/)?.[0] ?? '';
    const url = raw.slice(0, raw.length - trailing.length);
    const anchor = `<a href="${url}" style="color:#1d4ed8;text-decoration:underline;">${url}</a>`;
    return `${anchor}${trailing}`;
  });

  const body = withLinks
    .split('\n')
    .map((line) => (line.length === 0 ? '&nbsp;' : line))
    .join('<br>');

  return [
    '<!doctype html>',
    '<html>',
    '<body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:15px;line-height:1.6;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;">',
    '<tr><td style="padding:28px;">',
    body,
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('');
}
