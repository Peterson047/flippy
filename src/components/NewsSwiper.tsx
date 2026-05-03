'use client';

import type { NewsArticle } from '@/types';
import NewsItem from './NewsItem';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { usePreferences } from '@/hooks/usePreferences';

interface NewsSwiperProps {
  articles: NewsArticle[];
  seenArticleIds: string[];
  setSeenArticleIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  onOpenFeedManager: () => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
}

const LOAD_MORE_THRESHOLD = 5;

export default function NewsSwiper({
  articles,
  seenArticleIds,
  setSeenArticleIds,
  onOpenFeedManager,
  onLoadMore,
  hasMore,
  isLoadingMore,
}: NewsSwiperProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const swiperRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const initialScrollDone = useRef(false);
  const prevArticlesRef = useRef<NewsArticle[] | null>(null);
  const loadMoreTriggered = useRef(false);

  const activatedAt = useRef(Date.now());
  const prevActiveIndex = useRef(0);
  const { trackDwell, trackClick } = usePreferences();

  // Dispara load more quando o usuário está perto do fim
  useEffect(() => {
    const distanceFromEnd = articles.length - 1 - activeIndex;
    if (distanceFromEnd <= LOAD_MORE_THRESHOLD && hasMore && !isLoadingMore && !loadMoreTriggered.current) {
      loadMoreTriggered.current = true;
      onLoadMore();
    }
    // Reseta o trigger quando novos artigos chegam
    if (distanceFromEnd > LOAD_MORE_THRESHOLD) {
      loadMoreTriggered.current = false;
    }
  }, [activeIndex, articles.length, hasMore, isLoadingMore, onLoadMore]);

  // Dwell time
  useEffect(() => {
    const now = Date.now();
    const dwellMs = now - activatedAt.current;
    if (prevActiveIndex.current !== activeIndex && articles[prevActiveIndex.current]) {
      trackDwell(articles[prevActiveIndex.current], dwellMs);
    }
    prevActiveIndex.current = activeIndex;
    activatedAt.current = now;
  }, [activeIndex]);

  // Ajusta refs quando artigos mudam
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, articles.length);
    if (articles.length > 0 && activeIndex >= articles.length) {
      setActiveIndex(articles.length - 1);
    }
  }, [articles.length]);

  // Scroll inicial para primeiro artigo não visto
  useEffect(() => {
    if (prevArticlesRef.current !== articles) {
      initialScrollDone.current = false;
      prevArticlesRef.current = articles;
    }
    if (articles.length === 0 || !swiperRef.current || initialScrollDone.current) return;

    const firstUnseen = articles.findIndex(a => !seenArticleIds.includes(a.id));
    const target = firstUnseen !== -1 ? firstUnseen : 0;
    itemRefs.current[target]?.scrollIntoView({ behavior: 'auto' });
    initialScrollDone.current = true;
  }, [articles, seenArticleIds]);

  // IntersectionObserver
  useEffect(() => {
    if (!swiperRef.current || articles.length === 0) return;
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = itemRefs.current.findIndex(r => r === entry.target);
            if (idx !== -1) setActiveIndex(idx);
          }
        });
      },
      { root: swiperRef.current, threshold: 0.75 }
    );
    const refs = itemRefs.current.filter(Boolean) as HTMLDivElement[];
    refs.forEach(r => observer.observe(r));
    return () => { refs.forEach(r => observer.unobserve(r)); observer.disconnect(); };
  }, [articles]);

  // Marca artigo ativo como visto
  useEffect(() => {
    if (articles.length === 0 || activeIndex >= articles.length) return;
    const active = articles[activeIndex];
    if (active && !seenArticleIds.includes(active.id)) {
      setSeenArticleIds(prev => prev.includes(active.id) ? prev : [...prev, active.id]);
    }
  }, [activeIndex, articles]);

  if (articles.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-background text-foreground p-4 text-center">
        <div className="bg-card p-6 rounded-lg shadow-xl">
          <p className="font-headline text-xl mb-2">Nenhuma Notícia no Feed</p>
          <p className="text-muted-foreground">O feed selecionado está vazio ou não retornou notícias.</p>
          <Button onClick={onOpenFeedManager} className="mt-4">Gerenciar Feeds</Button>
        </div>
      </div>
    );
  }

  const allSeen = articles.every(a => seenArticleIds.includes(a.id));
  if (allSeen && !hasMore) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-background text-foreground p-4 text-center">
        <div className="bg-card p-6 rounded-lg shadow-xl">
          <p className="font-headline text-xl mb-2">Você está em dia!</p>
          <p className="text-muted-foreground">Leu todas as notícias disponíveis. Limpe o histórico ou adicione novos feeds.</p>
          <Button onClick={onOpenFeedManager} className="mt-4">Gerenciar Feeds</Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={swiperRef}
      className="h-screen w-screen overflow-y-auto snap-y snap-mandatory no-scrollbar snap-stop-always overscroll-y-contain"
    >
      {articles.map((article, index) => (
        <div
          key={article.id}
          ref={el => { itemRefs.current[index] = el; }}
          className="h-screen w-screen snap-start flex-shrink-0 relative"
        >
          <NewsItem
            article={article}
            isActive={index === activeIndex}
            shouldFetchSummary={index === activeIndex + 1}
            onArticleClick={trackClick}
          />
        </div>
      ))}

      {/* Indicador de carregamento de mais artigos */}
      {(isLoadingMore || hasMore) && (
        <div className="h-screen w-screen snap-start flex-shrink-0 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Carregando mais notícias...</p>
          </div>
        </div>
      )}
    </div>
  );
}
