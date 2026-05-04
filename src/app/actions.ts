'use server';

import { after } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'genkit';
import { ai } from '@/ai/genkit';
import type { NewsArticle } from '@/types';
import {
  getArticlesFromCache,
  refreshFeeds,
  scrapeImagesForFeed,
  updateArticleSummary,
} from '@/services/feedService';
import { checkRateLimit } from '@/lib/rateLimit';
import { validateExternalUrl, truncate, LIMITS } from '@/lib/security';

async function getClientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    'unknown'
  );
}

// ─── Artigos paginados ───────────────────────────────────────────────────────

export interface ArticleBatch {
  articles: NewsArticle[];
  hasMore: boolean;
}

export async function fetchArticlesBatch(params: {
  feedUrls: string[];
  cursor?: string;
}): Promise<ArticleBatch> {
  const ip = await getClientIp();

  // Rate limit: 60 req/min por IP
  const rl = checkRateLimit(`feeds:${ip}`, 60, 60_000);
  if (!rl.allowed) return { articles: [], hasMore: false };

  // Validações de input
  const rawUrls = Array.isArray(params.feedUrls) ? params.feedUrls : [];
  const feedUrls = rawUrls
    .slice(0, LIMITS.FEEDS_PER_BATCH)
    .filter(u => typeof u === 'string' && validateExternalUrl(u).ok);

  const cursor = typeof params.cursor === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(params.cursor)
    ? params.cursor
    : undefined;

  if (feedUrls.length === 0) return { articles: [], hasMore: false };

  const { articles, hasMore, staleFeeds } = await getArticlesFromCache({
    feedUrls,
    cursor,
    limit: 20,
  });

  // Supabase tem dados frescos → retorna imediatamente e atualiza feeds stale em background
  if (articles.length > 0) {
    if (staleFeeds.length > 0) {
      try {
        after(async () => {
          await refreshFeeds(staleFeeds);
          for (const url of staleFeeds) await scrapeImagesForFeed(url);
        });
      } catch {
        // after() indisponível neste ambiente — ignora
      }
    }
    return { articles, hasMore };
  }

  // Supabase vazio (primeiro deploy, tabela inexistente ou env vars ausentes):
  // busca RSS diretamente e usa os artigos mesmo que o Supabase não consiga armazená-los
  if (staleFeeds.length > 0) {
    const fetched = await refreshFeeds(staleFeeds);

    if (fetched.length > 0) {
      // Scraping de OG em background (melhor esforço)
      try {
        after(async () => {
          for (const url of staleFeeds) await scrapeImagesForFeed(url);
        });
      } catch { /* ignora */ }

      // Deduplica e ordena por data
      const seen = new Set<string>();
      const deduped = fetched
        .filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; })
        .sort((a, b) => {
          const tA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          const tB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          return tB - tA;
        });

      const page = deduped.slice(0, 20);
      return { articles: page, hasMore: deduped.length > 20 };
    }
  }

  return { articles: [], hasMore: false };
}

// ─── Resumo por IA (fallback para artigos sem description) ───────────────────

export async function generateSummary(
  articleId: string,
  articleText: string
): Promise<{ summary: string; isAi: boolean }> {
  const ip = await getClientIp();

  // Rate limit: 15 chamadas Gemini/min por IP (API cara)
  const rl = checkRateLimit(`gemini:${ip}`, 15, 60_000);
  if (!rl.allowed) return { summary: '', isAi: false };

  // Validação e truncamento do input
  if (!articleText || typeof articleText !== 'string') return { summary: '', isAi: false };
  const safeText = truncate(articleText.trim(), LIMITS.ARTICLE_TEXT_MAX);
  if (safeText.length < 50) return { summary: '', isAi: false };

  try {
    const { output } = await ai.generate({
      model: 'googleai/gemini-2.0-flash',
      prompt: `Resuma o seguinte artigo de notícia em 5 linhas concisas, em português:\n\n${safeText}`,
      output: {
        schema: z.object({
          summary: z.string().describe('Resumo de 5 linhas em português'),
        }),
      },
    });
    const summary = output?.summary?.trim() || '';
    if (summary) {
      const safeId = typeof articleId === 'string' ? articleId.slice(0, 500) : '';
      if (safeId) await updateArticleSummary(safeId, summary);
      return { summary, isAi: true };
    }
  } catch (e) {
    console.error('[generateSummary] Gemini error:', e);
  }
  return { summary: '', isAi: false };
}

// ─── Descoberta de feeds ─────────────────────────────────────────────────────

export interface FeedSuggestion {
  name: string;
  url: string;
}

const CURATED_FEEDS = [
  { keywords: ['g1', 'globo', 'globonews'], name: 'G1 Brasil', url: 'https://g1.globo.com/rss/g1/brasil/' },
  { keywords: ['bbc brasil', 'bbc'], name: 'BBC Brasil', url: 'https://feeds.bbci.co.uk/portuguese/rss.xml' },
  { keywords: ['cnn brasil', 'cnn'], name: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/' },
  { keywords: ['uol', 'uol noticias', 'uol notícias'], name: 'UOL Notícias', url: 'https://rss.uol.com.br/feed/noticias.xml' },
  { keywords: ['tecnoblog', 'tecnologia', 'tech', 'software'], name: 'Tecnoblog', url: 'https://tecnoblog.net/feed/' },
  { keywords: ['futebol', 'esporte', 'esportes', 'ge', 'globoesporte'], name: 'GE Futebol', url: 'https://ge.globo.com/rss/globoesporte/' },
  { keywords: ['valor', 'economia', 'mercado', 'financeiro', 'bolsa'], name: 'Valor Econômico', url: 'https://valor.globo.com/rss/home/' },
  { keywords: ['folha', 'folha de são paulo', 'folha de sao paulo', 'fsp'], name: 'Folha de S.Paulo', url: 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml' },
  { keywords: ['estadao', 'estadão', 'estado de s. paulo'], name: 'Estadão', url: 'https://www.estadao.com.br/rss/ultimas.xml' },
  { keywords: ['agencia brasil', 'agência brasil', 'ebc'], name: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml' },
  { keywords: ['politica', 'política', 'governo', 'congresso'], name: 'Agência Brasil - Política', url: 'https://agenciabrasil.ebc.com.br/rss/politica/feed.xml' },
  { keywords: ['ciencia', 'ciência', 'pesquisa', 'fapesp'], name: 'Agência FAPESP', url: 'https://agencia.fapesp.br/feed/' },
  { keywords: ['mundo', 'internacional', 'world', 'exterior'], name: 'BBC Brasil - Mundo', url: 'https://feeds.bbci.co.uk/portuguese/mundo/rss.xml' },
  { keywords: ['startups', 'inovacao', 'inovação', 'negocios digitais'], name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
];

function searchCurated(query: string): FeedSuggestion[] {
  const words = query.toLowerCase().trim().split(/\s+/);
  return CURATED_FEEDS
    .filter(f =>
      f.keywords.some(kw => words.some(w => kw.includes(w) || w.includes(kw))) ||
      words.some(w => f.name.toLowerCase().includes(w))
    )
    .slice(0, 6)
    .map(({ name, url }) => ({ name, url }));
}

async function tryDirectRss(url: string): Promise<FeedSuggestion | null> {
  // Valida internamente para proteger qualquer chamador (HTML discovery, AI suggestions, etc.)
  if (!validateExternalUrl(url).ok) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { headers: { 'User-Agent': 'FlippyApp/1.0' }, cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trimStart().startsWith('<?xml') && !text.includes('<rss') && !text.includes('<feed') && !text.includes('<channel')) return null;
    const titleMatch = text.match(/<title[^>]*>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/title>/i);
    return { name: titleMatch?.[1]?.trim() || new URL(url).hostname, url };
  } catch { return null; }
}

async function discoverRssFromWebsite(websiteUrl: string): Promise<FeedSuggestion | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(websiteUrl, { headers: { 'User-Agent': 'FlippyApp/1.0' }, cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    const match =
      html.match(/<link[^>]+type=["']application\/rss\+xml["'][^>]+href=["']([^"']+)["']/i) ||
      html.match(/<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/rss\+xml["']/i) ||
      html.match(/<link[^>]+type=["']application\/atom\+xml["'][^>]+href=["']([^"']+)["']/i);
    if (!match?.[1]) return null;
    const feedUrl = match[1].startsWith('http') ? match[1] : new URL(match[1], websiteUrl).toString();
    return tryDirectRss(feedUrl);
  } catch { return null; }
}

async function aiSuggestFeeds(query: string): Promise<FeedSuggestion[]> {
  try {
    const { output } = await ai.generate({
      model: 'googleai/gemini-2.0-flash',
      prompt: `Liste até 3 feeds RSS reais e funcionais sobre o tópico "${query}". Prefira fontes brasileiras conhecidas.`,
      output: {
        schema: z.object({
          suggestions: z.array(z.object({ name: z.string(), url: z.string() })).max(3),
        }),
      },
    });
    if (!output?.suggestions?.length) return [];
    const validated = await Promise.all(output.suggestions.map(s => tryDirectRss(s.url)));
    return validated.filter((s): s is FeedSuggestion => s !== null);
  } catch { return []; }
}

export async function discoverFeed(input: string): Promise<FeedSuggestion[]> {
  const ip = await getClientIp();

  // Rate limit: 10 req/min por IP (faz requests externos + pode usar Gemini)
  const rl = checkRateLimit(`discover:${ip}`, 10, 60_000);
  if (!rl.allowed) return [];

  if (typeof input !== 'string') return [];
  const trimmed = truncate(input.trim(), LIMITS.DISCOVER_QUERY_MAX);
  if (!trimmed) return [];

  const looksLikeUrl = /^https?:\/\//i.test(trimmed) || /\.[a-z]{2,}(\/|$)/i.test(trimmed);
  if (looksLikeUrl) {
    const urlStr = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    // Proteção SSRF antes de fazer qualquer request
    const validation = validateExternalUrl(urlStr);
    if (!validation.ok) return [];
    try {
      new URL(urlStr);
      const direct = await tryDirectRss(urlStr);
      if (direct) return [direct];
      const discovered = await discoverRssFromWebsite(urlStr);
      if (discovered) return [discovered];
    } catch { /* não é URL válida */ }
  }

  const curated = searchCurated(trimmed);
  if (curated.length > 0) return curated;

  return aiSuggestFeeds(trimmed);
}

// Compatibilidade legada
export async function fetchRssFeed(url: string): Promise<NewsArticle[]> {
  const { articles } = await fetchArticlesBatch({ feedUrls: [url] });
  return articles;
}

export async function fetchFeeds(feeds: Array<{ url: string; name: string }>): Promise<NewsArticle[]> {
  const { articles } = await fetchArticlesBatch({ feedUrls: feeds.map(f => f.url) });
  return articles;
}
