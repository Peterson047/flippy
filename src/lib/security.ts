// Limites globais
export const LIMITS = {
  ARTICLE_TEXT_MAX: 8_000,   // chars enviados ao Gemini
  FEED_URL_MAX: 2_048,
  FEEDS_PER_BATCH: 10,
  DISCOVER_QUERY_MAX: 200,
} as const;

// Padrões de IPs/hosts privados bloqueados (proteção SSRF)
const PRIVATE_IP_RE =
  /^(127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1$|fc00:|fe80:)/i;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal', // GCP metadata server
  '169.254.169.254',          // AWS/Azure metadata
]);

export interface UrlValidation {
  ok: boolean;
  reason?: string;
}

export function validateExternalUrl(raw: string): UrlValidation {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'URL malformada' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, reason: 'Protocolo não permitido' };
  }

  const host = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: 'Host não permitido' };
  }

  if (PRIVATE_IP_RE.test(host)) {
    return { ok: false, reason: 'Endereço IP privado não permitido' };
  }

  if (parsed.href.length > LIMITS.FEED_URL_MAX) {
    return { ok: false, reason: 'URL muito longa' };
  }

  return { ok: true };
}

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}
