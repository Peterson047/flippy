// Rate limiter in-memory por chave (por instância do servidor).
// Em serverless (Vercel), cada função tem sua própria memória — é "best effort"
// mas ainda eficaz contra rajadas dentro de um cold start.

interface Bucket {
  count: number;
  windowStart: number;
}

const store = new Map<string, Bucket>();

// Limpeza periódica para não vazar memória
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 min
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const cutoff = Date.now() - CLEANUP_INTERVAL;
    for (const [key, bucket] of store) {
      if (bucket.windowStart < cutoff) store.delete(key);
    }
  }, CLEANUP_INTERVAL);
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

/**
 * Verifica se a chave está dentro do limite.
 * @param key      Identificador (ex: `gemini:${ip}`)
 * @param limit    Número máximo de chamadas na janela
 * @param windowMs Tamanho da janela em ms
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    const retryAfterMs = windowMs - (now - bucket.windowStart);
    return { allowed: false, retryAfterMs };
  }

  bucket.count++;
  return { allowed: true };
}
