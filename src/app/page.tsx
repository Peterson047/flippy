'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import NewsSwiper from '@/components/NewsSwiper';
import FeedManager from '@/components/FeedManager';
import FlippyLogo from '@/components/FlippyLogo';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { NewsArticle, FeedSource } from '@/types';
import { DEFAULT_FEEDS } from '@/types';
import useLocalStorage from '@/hooks/useLocalStorage';
import { useArticleCache } from '@/hooks/useArticleCache';
import { usePreferences } from '@/hooks/usePreferences';
import { fetchArticlesBatch } from './actions';

const LEGACY_PATTERNS = ['rss.app/feeds'];
const MAX_SEEN_IDS = 1000;

export default function Home() {
  const [isFeedManagerOpen, setIsFeedManagerOpen] = useState(false);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [feedSources, setFeedSources] = useLocalStorage<FeedSource[]>('flippy-feedSources', DEFAULT_FEEDS);
  const [seenArticleIds, setSeenArticleIds] = useLocalStorage<string[]>('flippy-seenArticleIds', []);

  const { getCache, setCache } = useArticleCache();
  const { sortByPreference } = usePreferences();

  const loadedFeedsRef = useRef<string>('');
  const isFetchingRef = useRef(false);

  // Feed URLs visíveis (sem legados)
  const getVisibleFeeds = useCallback(() => {
    return feedSources
      .filter(f => !f.isHidden)
      .filter(f => !LEGACY_PATTERNS.some(p => f.url.includes(p)));
  }, [feedSources]);

  // Migração de feeds legados
  useEffect(() => {
    const hasLegacy = feedSources.some(f => LEGACY_PATTERNS.some(p => f.url.includes(p)));
    if (!hasLegacy) return;
    const cleaned = feedSources.filter(f => !LEGACY_PATTERNS.some(p => f.url.includes(p)));
    const existingIds = new Set(cleaned.map(f => f.id));
    const toAdd = DEFAULT_FEEDS.filter(d => !existingIds.has(d.id));
    setFeedSources(cleaned.length > 0 ? [...cleaned, ...toAdd] : DEFAULT_FEEDS);
    loadedFeedsRef.current = '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carregamento inicial dos artigos
  useEffect(() => {
    const visibleFeeds = getVisibleFeeds();

    if (visibleFeeds.length === 0) {
      setError('Todos os feeds estão ocultos. Ative um feed nas configurações.');
      setIsLoading(false);
      return;
    }

    const feedKey = visibleFeeds.map(f => f.url).sort().join('|');
    if (feedKey === loadedFeedsRef.current) return;
    loadedFeedsRef.current = feedKey;
    isFetchingRef.current = false;

    // Mostra cache do localStorage imediatamente (stale-while-revalidate)
    const cached = getCache(feedKey);
    if (cached && cached.length > 0) {
      setArticles(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    setError(null);
    setHasMore(false);

    fetchArticlesBatch({ feedUrls: visibleFeeds.map(f => f.url) })
      .then(({ articles: fetched, hasMore: more }) => {
        if (fetched.length === 0 && !cached?.length) {
          setError('Nenhuma notícia encontrada. Verifique os feeds nas configurações.');
          return;
        }
        if (fetched.length > 0) {
          // Aplica preferências só no primeiro batch
          const sorted = sortByPreference(fetched);
          setArticles(sorted);
          setHasMore(more);
          setCache(feedKey, sorted);
        }
      })
      .catch(() => {
        if (!cached?.length) {
          setError('Falha ao carregar notícias. Verifique sua conexão e tente novamente.');
        }
      })
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedSources]);

  // Carrega mais artigos (paginação por cursor)
  const handleLoadMore = useCallback(async () => {
    if (isFetchingRef.current || !hasMore) return;

    const visibleFeeds = getVisibleFeeds();
    if (visibleFeeds.length === 0) return;

    const lastArticle = articles[articles.length - 1];
    if (!lastArticle?.publishedAt) return;

    isFetchingRef.current = true;
    setIsLoadingMore(true);

    try {
      const { articles: more, hasMore: moreAvailable } = await fetchArticlesBatch({
        feedUrls: visibleFeeds.map(f => f.url),
        cursor: lastArticle.publishedAt,
      });

      if (more.length > 0) {
        setArticles(prev => {
          const existingIds = new Set(prev.map(a => a.id));
          const deduped = more.filter(a => !existingIds.has(a.id));
          return [...prev, ...deduped];
        });
        setHasMore(moreAvailable);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error('[page] handleLoadMore error:', e);
    } finally {
      setIsLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [articles, hasMore, getVisibleFeeds]);

  const handleSeenArticleIds = useCallback(
    (ids: string[] | ((prev: string[]) => string[])) => {
      setSeenArticleIds(prev => {
        const next = typeof ids === 'function' ? ids(prev) : ids;
        return next.length > MAX_SEEN_IDS ? next.slice(-MAX_SEEN_IDS) : next;
      });
    },
    [setSeenArticleIds]
  );

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background">
      <header className="absolute top-0 left-0 right-0 z-10 p-4 flex justify-between items-center">
        <FlippyLogo />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsFeedManagerOpen(true)}
          className="text-foreground hover:bg-white/10"
        >
          <Settings className="h-6 w-6" />
          <span className="sr-only">Gerenciar Feeds</span>
        </Button>
      </header>

      {isLoading && (
        <div className="h-screen w-screen flex flex-col items-center justify-center p-4 relative">
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-none" />
          <Skeleton className="h-[60vh] w-full max-w-md rounded-lg opacity-70" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <div className="bg-black/60 backdrop-blur-md p-4 rounded-lg shadow-xl space-y-3">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <div className="flex justify-between items-end pt-1">
                <Skeleton className="h-5 w-1/4" />
                <Skeleton className="h-9 w-1/3" />
              </div>
            </div>
          </div>
        </div>
      )}

      {!isLoading && error && (
        <div className="flex items-center justify-center h-screen w-screen bg-background text-foreground p-4 text-center">
          <div className="bg-card p-6 rounded-lg shadow-xl">
            <p className="font-headline text-xl text-destructive mb-2">Erro ao Carregar</p>
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={() => setIsFeedManagerOpen(true)} className="mt-4">Gerenciar Feeds</Button>
          </div>
        </div>
      )}

      {!isLoading && !error && (
        <NewsSwiper
          articles={articles}
          seenArticleIds={seenArticleIds}
          setSeenArticleIds={handleSeenArticleIds}
          onOpenFeedManager={() => setIsFeedManagerOpen(true)}
          onLoadMore={handleLoadMore}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
        />
      )}

      <FeedManager
        isOpen={isFeedManagerOpen}
        onOpenChange={setIsFeedManagerOpen}
        feedSources={feedSources}
        onFeedSourcesChange={newSources => {
          setFeedSources(newSources);
          loadedFeedsRef.current = '';
        }}
        seenArticleIds={seenArticleIds}
        onSeenArticleIdsChange={setSeenArticleIds}
      />
    </main>
  );
}
