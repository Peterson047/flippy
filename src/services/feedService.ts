import { parseStringPromise } from 'xml2js';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { validateExternalUrl } from '@/lib/security';
import type { NewsArticle } from '@/types';

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const OG_TIMEOUT_MS = 2000;
const MAX_OG_SCRAPES = 5;
const PLACEHOLDER = 'https://placehold.co/1080x1920.png';
const DEFAULT_PAGE_SIZE = 20;

// ─── XML helpers ────────────────────────────────────────────────────────────

function getXmlText(field: any): string {
  if (field == null) return '';
  if (Array.isArray(field)) {
    if (field.length === 0) return '';
    const first = field[0];
    if (typeof first === 'string') return first.trim();
    if (typeof first === 'object' && typeof first._ === 'string') return first._.trim();
    return String(first).trim();
  }
  if (typeof field === 'object' && typeof field._ === 'string') return field._.trim();
  if (typeof field === 'string') return field.trim();
  return String(field).trim();
}

function getLinkUrl(field: any): string {
  if (!field) return '';
  const el = Array.isArray(field) ? field[0] : field;
  if (typeof el === 'string') return el.trim();
  if (typeof el === 'object' && el !== null) {
    if (typeof el.href === 'string') return el.href.trim();
    if (typeof el._ === 'string') return el._.trim();
  }
  return '';
}

function extractFirstImg(html: string): string | null {
  return html?.match(/<img[^>]+src="([^">]+)"/)?.[1] || null;
}

function stripHtml(html: string): string {
  return html?.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim() || '';
}

function normalizeCategory(raw: string): string {
  const map: Record<string, string> = {
    technology: 'tecnologia', tech: 'tecnologia',
    sports: 'esportes', sport: 'esportes', futebol: 'esportes',
    politics: 'política', politica: 'política',
    economy: 'economia', economics: 'economia', business: 'economia',
    world: 'mundo', international: 'mundo', internacional: 'mundo',
    science: 'ciência', ciencia: 'ciência',
    health: 'saúde', saude: 'saúde',
    entertainment: 'entretenimento',
    brasil: 'brasil', brazil: 'brasil',
  };
  return map[raw.toLowerCase()] ?? raw.toLowerCase();
}

// ─── OG Image scraping ──────────────────────────────────────────────────────

async function scrapeOgImage(url: string): Promise<string | null> {
  if (!validateExternalUrl(url).ok) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OG_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FlippyApp/1.0' },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    return (
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      null
    );
  } catch {
    return null;
  }
}

// Executa OG scraping para artigos sem imagem de um feed (chamado em background)
export async function scrapeImagesForFeed(feedUrl: string): Promise<void> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('articles')
      .select('id, original_url')
      .eq('feed_url', feedUrl)
      .eq('image_url', PLACEHOLDER)
      .gt('published_at', thirtyDaysAgo)
      .limit(MAX_OG_SCRAPES);

    if (!data || data.length === 0) return;

    const results = await Promise.all(
      data.map(async (row: any) => ({
        id: row.id,
        imageUrl: await scrapeOgImage(row.original_url),
      }))
    );

    for (const { id, imageUrl } of results) {
      if (imageUrl) {
        const { error } = await supabaseAdmin
          .from('articles')
          .update({ image_url: imageUrl })
          .eq('id', id);
        if (error) console.error('[feedService] image update error:', error.message);
      }
    }
  } catch (e) {
    console.error('[feedService] scrapeImagesForFeed error:', e);
  }
}

// ─── Image URL upgrade para CDNs conhecidos ──────────────────────────────────
// Melhora resolução transformando a URL sem nenhum HTTP request adicional.

function upgradeImageUrl(url: string): string {
  if (!url || url.includes('placehold.co')) return url;
  try {
    const { hostname } = new URL(url);

    // Globo / G1: /NNNxMMM/ ou /NNNx/ no path → sobe para /940x/
    if (hostname.includes('glbimg.com')) {
      const upgraded = url.replace(/\/\d+x\d*\//, '/940x/');
      if (upgraded !== url) return upgraded;
    }

    // WordPress (CNN Brasil, Estadão, etc.): imagem-800x450.jpg → imagem.jpg
    if (
      hostname.includes('cnnbrasil.com.br') ||
      hostname.includes('estadao.com.br') ||
      hostname.includes('wp.com') ||
      hostname.includes('wordpress.com')
    ) {
      return url.replace(/(-\d{2,4}x\d{2,4})(\.[a-zA-Z]{2,5})(\?.*)?$/, '$2$3');
    }

    // UOL / Folha: imagem_400x300.jpg → imagem.jpg
    if (hostname.includes('uol.com.br') || hostname.includes('folha.uol.com.br')) {
      return url.replace(/_\d{2,4}x\d{2,4}(\.[a-zA-Z]{2,5})$/, '$1');
    }
  } catch { /* URL inválida, retorna como está */ }
  return url;
}

// ─── Media URL extraction ────────────────────────────────────────────────────

function findMediaUrl(elements: any): string | null {
  if (!elements) return null;
  const list = Array.isArray(elements) ? elements : [elements];

  const valid = list.filter(
    (m: any) => m?.url && (!m.type || m.type.startsWith('image') || m.medium === 'image')
  );
  if (valid.length === 0) return null;

  // Pega a de maior largura — evita thumbnails quando há versão maior disponível
  const best = valid.reduce((prev: any, curr: any) => {
    const pw = parseInt(prev.width || '0', 10);
    const cw = parseInt(curr.width || '0', 10);
    return cw > pw ? curr : prev;
  });

  return upgradeImageUrl(best.url);
}

// ─── RSS Item parser ─────────────────────────────────────────────────────────

function parseItem(item: any, feedTitle: string, feedUrl: string): NewsArticle {
  const title = getXmlText(item.title) || getXmlText(item['dc:title']) || 'Sem título';

  let originalUrl = getLinkUrl(item.link);
  if (!originalUrl) {
    const guid = getXmlText(item.guid);
    if (guid.startsWith('http')) originalUrl = guid;
  }
  if (!originalUrl) originalUrl = '#';

  const id = getXmlText(item.guid) || getXmlText(item.id) || originalUrl || `${title}-${Math.random()}`;

  const rawDesc = getXmlText(item.description) || getXmlText(item.summary) || '';
  const description = stripHtml(rawDesc);

  const contentEncoded = getXmlText(item['content:encoded']);
  const atomContent = getXmlText(item.content);
  const articleText = stripHtml(contentEncoded || atomContent || rawDesc);

  let imageUrl = '';
  const mediaGroup = item['media:group']?.[0];
  if (mediaGroup) {
    imageUrl = findMediaUrl(mediaGroup['media:content']) || findMediaUrl(mediaGroup['media:thumbnail']) || '';
  }
  if (!imageUrl) imageUrl = findMediaUrl(item['media:content']) || '';
  if (!imageUrl) imageUrl = findMediaUrl(item['media:thumbnail']) || '';
  if (!imageUrl && item.enclosure) {
    const encs = Array.isArray(item.enclosure) ? item.enclosure : [item.enclosure];
    imageUrl = encs.find((e: any) => e.url && e.type?.startsWith('image'))?.url || '';
  }
  if (!imageUrl && item['itunes:image']?.[0]?.href) imageUrl = item['itunes:image'][0].href;
  if (!imageUrl && item.image) {
    const img = Array.isArray(item.image) ? item.image[0] : item.image;
    if (img?.url) imageUrl = getXmlText(img.url);
  }
  if (!imageUrl && contentEncoded) imageUrl = extractFirstImg(contentEncoded) || '';
  if (!imageUrl && atomContent) imageUrl = extractFirstImg(atomContent) || '';
  if (!imageUrl && rawDesc) imageUrl = extractFirstImg(rawDesc) || '';

  // Upgrade de resolução para CDNs conhecidos
  if (imageUrl) imageUrl = upgradeImageUrl(imageUrl);

  const rawCat = getXmlText(item.category) || getXmlText(item['dc:subject']) || '';
  const category = rawCat ? normalizeCategory(rawCat) : undefined;

  let publishedAt: string | undefined;
  const pubRaw = getXmlText(item.pubDate) || getXmlText(item.published) || getXmlText(item['dc:date']) || '';
  if (pubRaw) {
    try { publishedAt = new Date(pubRaw).toISOString(); } catch { /* skip */ }
  }

  return {
    id,
    title,
    description,
    articleText,
    imageUrl: imageUrl || PLACEHOLDER,
    originalUrl,
    sourceName: feedTitle,
    feedUrl,
    imageAiHint: title.split(' ').slice(0, 2).join(' ').toLowerCase(),
    category,
    publishedAt,
    isAiSummary: false,
  };
}

// ─── RSS Feed parser ─────────────────────────────────────────────────────────

async function parseRss(xmlText: string, feedUrl: string): Promise<NewsArticle[]> {
  const parsed = await parseStringPromise(xmlText, { explicitArray: true, mergeAttrs: true });
  let items: any[] = [];
  let feedTitle = 'Notícias';

  if (parsed.rss?.channel?.[0]) {
    feedTitle = getXmlText(parsed.rss.channel[0].title) || 'Notícias';
    items = parsed.rss.channel[0].item || [];
  } else if (parsed.feed) {
    feedTitle = getXmlText(parsed.feed.title) || 'Notícias';
    items = parsed.feed.entry || [];
  }

  return items.map((item: any) => parseItem(item, feedTitle, feedUrl));
}

// ─── Supabase row → NewsArticle ──────────────────────────────────────────────

function rowToArticle(row: any): NewsArticle {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    articleText: row.article_text || '',
    aiSummary: row.ai_summary || undefined,
    isAiSummary: row.is_ai_summary || false,
    imageUrl: upgradeImageUrl(row.image_url || PLACEHOLDER),
    originalUrl: row.original_url,
    sourceName: row.source_name,
    feedUrl: row.feed_url,
    imageAiHint: row.image_ai_hint,
    category: row.category,
    publishedAt: row.published_at,
  };
}

// ─── Supabase write ──────────────────────────────────────────────────────────

async function upsertArticles(articles: NewsArticle[]): Promise<void> {
  if (articles.length === 0) return;
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();

  const rows = articles.map(a => ({
    id: a.id,
    title: a.title,
    description: a.description,
    article_text: a.articleText || null,
    image_url: a.imageUrl,
    original_url: a.originalUrl,
    source_name: a.sourceName || null,
    feed_url: a.feedUrl || null,
    image_ai_hint: a.imageAiHint || null,
    category: a.category || null,
    published_at: a.publishedAt || null,
    expires_at: expiresAt,
    ai_summary: a.aiSummary || null,
    is_ai_summary: a.isAiSummary || false,
  }));

  // Supabase JS v2 retorna { error } em vez de lançar exceção
  const { error } = await supabaseAdmin
    .from('articles')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    console.error('[feedService] upsert error:', error.message, error.details ?? '');
    throw new Error(error.message);
  }
}

export async function updateArticleSummary(articleId: string, summary: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('articles')
    .update({ ai_summary: summary, is_ai_summary: true })
    .eq('id', articleId);
  if (error) console.error('[feedService] updateArticleSummary error:', error.message);
}

// ─── Supabase cache read (paginado) ──────────────────────────────────────────

export interface ArticlePage {
  articles: NewsArticle[];
  hasMore: boolean;
  staleFeeds: string[]; // feeds sem cache fresco
}

export async function getArticlesFromCache(params: {
  feedUrls: string[];
  cursor?: string; // published_at do último artigo visto (para paginar)
  limit?: number;
}): Promise<ArticlePage> {
  const { feedUrls, cursor, limit = DEFAULT_PAGE_SIZE } = params;
  if (feedUrls.length === 0) return { articles: [], hasMore: false, staleFeeds: [] };

  try {
    // 1. Quais feeds têm cache fresco?
    const { data: freshCheck, error: freshErr } = await supabase
      .from('articles')
      .select('feed_url')
      .in('feed_url', feedUrls)
      .gt('expires_at', new Date().toISOString());

    if (freshErr) throw freshErr;

    const freshFeeds = [...new Set((freshCheck || []).map((r: any) => r.feed_url as string))];
    const staleFeeds = feedUrls.filter(url => !freshFeeds.includes(url));

    if (freshFeeds.length === 0) {
      return { articles: [], hasMore: false, staleFeeds };
    }

    // 2. Query paginada: todos os feeds frescos de uma vez
    let query = supabase
      .from('articles')
      .select('*')
      .in('feed_url', freshFeeds)
      .gt('expires_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(limit + 1); // +1 para saber se há mais

    if (cursor) {
      query = query.lt('published_at', cursor);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    const hasMore = rows.length > limit;
    const articles = rows.slice(0, limit).map(rowToArticle);

    return { articles, hasMore, staleFeeds };
  } catch (e) {
    console.error('[feedService] getArticlesFromCache error:', e);
    // Falha no Supabase: marca todos os feeds como stale para fetch direto
    return { articles: [], hasMore: false, staleFeeds: feedUrls };
  }
}

// ─── RSS fetch e refresh ─────────────────────────────────────────────────────

async function fetchOneFeed(feedUrl: string): Promise<NewsArticle[]> {
  const ssrf = validateExternalUrl(feedUrl);
  if (!ssrf.ok) throw new Error(`URL bloqueada: ${ssrf.reason}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'FlippyApp/1.0' },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseRss(xml, feedUrl);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Atualiza feeds stale e retorna os artigos obtidos.
// Persiste no Supabase de forma fire-and-forget (não bloqueia em caso de falha).
export async function refreshFeeds(feedUrls: string[]): Promise<NewsArticle[]> {
  if (feedUrls.length === 0) return [];

  const results = await Promise.allSettled(feedUrls.map(url => fetchOneFeed(url)));
  const fetched: NewsArticle[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled' && result.value.length > 0) {
      fetched.push(...result.value);
      // Persiste em background — falha silenciosa se Supabase indisponível
      upsertArticles(result.value).catch(e =>
        console.error(`[feedService] upsert failed for ${feedUrls[i]}:`, e)
      );
    } else if (result.status === 'rejected') {
      console.error(`[feedService] fetch failed for ${feedUrls[i]}:`, result.reason);
    }
  }

  return fetched;
}

// Compatibilidade com código legado
export async function fetchFeedArticles(feedUrl: string): Promise<NewsArticle[]> {
  const { articles, staleFeeds } = await getArticlesFromCache({ feedUrls: [feedUrl] });
  if (articles.length > 0) return articles;
  if (staleFeeds.length > 0) {
    await refreshFeeds(staleFeeds);
    const fresh = await getArticlesFromCache({ feedUrls: [feedUrl] });
    return fresh.articles;
  }
  return [];
}

export async function fetchMultipleFeedsArticles(
  feeds: Array<{ url: string; name: string }>
): Promise<NewsArticle[]> {
  const feedUrls = feeds.map(f => f.url);
  const { articles, staleFeeds } = await getArticlesFromCache({ feedUrls });
  if (articles.length > 0) return articles;
  if (staleFeeds.length > 0) {
    await refreshFeeds(staleFeeds);
    const fresh = await getArticlesFromCache({ feedUrls });
    return fresh.articles;
  }
  return [];
}
