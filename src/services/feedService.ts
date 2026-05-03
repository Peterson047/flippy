import { parseStringPromise } from 'xml2js';
import { supabase } from '@/lib/supabase';
import type { NewsArticle } from '@/types';

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const OG_TIMEOUT_MS = 2000;
const MAX_OG_SCRAPES = 5;
const PLACEHOLDER = 'https://placehold.co/1080x1920.png';

// --- XML helpers ---

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
  const m = html?.match(/<img[^>]+src="([^">]+)"/);
  return m?.[1] || null;
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

// --- OG image scraping ---

async function scrapeOgImage(url: string): Promise<string | null> {
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
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    return m?.[1] || null;
  } catch {
    return null;
  }
}

// --- Media URL extraction ---

function findMediaUrl(elements: any): string | null {
  if (!elements) return null;
  const list = Array.isArray(elements) ? elements : [elements];
  for (const m of list) {
    if (m?.url) {
      if (!m.type || m.type.startsWith('image') || m.medium === 'image') return m.url;
    }
  }
  return null;
}

// --- Item parser ---

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

// --- RSS parser ---

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

// --- Supabase cache ---

function rowToArticle(row: any): NewsArticle {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    articleText: row.article_text || '',
    aiSummary: row.ai_summary || undefined,
    isAiSummary: row.is_ai_summary || false,
    imageUrl: row.image_url || PLACEHOLDER,
    originalUrl: row.original_url,
    sourceName: row.source_name,
    feedUrl: row.feed_url,
    imageAiHint: row.image_ai_hint,
    category: row.category,
    publishedAt: row.published_at,
  };
}

async function getCached(feedUrl: string): Promise<NewsArticle[] | null> {
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('feed_url', feedUrl)
      .gt('expires_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(30);

    if (error || !data || data.length === 0) return null;
    return data.map(rowToArticle);
  } catch {
    return null;
  }
}

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

  try {
    await supabase.from('articles').upsert(rows, { onConflict: 'id' });
  } catch (e) {
    console.error('[feedService] Supabase upsert error:', e);
  }
}

export async function updateArticleSummary(
  articleId: string,
  summary: string
): Promise<void> {
  try {
    await supabase
      .from('articles')
      .update({ ai_summary: summary, is_ai_summary: true })
      .eq('id', articleId);
  } catch (e) {
    console.error('[feedService] Failed to update summary:', e);
  }
}

// --- Public API ---

export async function fetchFeedArticles(feedUrl: string): Promise<NewsArticle[]> {
  const cached = await getCached(feedUrl);
  if (cached) return cached;

  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'FlippyApp/1.0' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const xml = await res.text();
    const articles = await parseRss(xml, feedUrl);

    // OG scrape somente para artigos recentes (< 30 dias) sem imagem
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const noImage = articles.filter(a => {
      if (a.imageUrl !== PLACEHOLDER) return false;
      if (a.originalUrl === '#') return false;
      if (a.publishedAt && new Date(a.publishedAt).getTime() < thirtyDaysAgo) return false;
      return true;
    });
    if (noImage.length > 0) {
      const targets = noImage.slice(0, MAX_OG_SCRAPES);
      const imgs = await Promise.all(targets.map(a => scrapeOgImage(a.originalUrl)));
      imgs.forEach((img, i) => {
        if (img) {
          const art = articles.find(a => a.id === targets[i].id);
          if (art) art.imageUrl = img;
        }
      });
    }

    await upsertArticles(articles);
    return articles;
  } catch (e) {
    console.error(`[feedService] Error fetching ${feedUrl}:`, e);
    return [];
  }
}

export async function fetchMultipleFeedsArticles(
  feeds: Array<{ url: string; name: string }>
): Promise<NewsArticle[]> {
  const results = await Promise.allSettled(feeds.map(f => fetchFeedArticles(f.url)));

  const seen = new Set<string>();
  const articles = results
    .filter((r): r is PromiseFulfilledResult<NewsArticle[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(a => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });

  return articles.sort((a, b) => {
    const tA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tB - tA;
  });
}
