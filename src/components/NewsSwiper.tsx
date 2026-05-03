'use client';

import type { NewsArticle } from '@/types';
import NewsItem from './NewsItem';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/hooks/usePreferences';

interface NewsSwiperProps {
  articles: NewsArticle[];
  seenArticleIds: string[];
  setSeenArticleIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  onOpenFeedManager: () => void;
}

export default function NewsSwiper({
  articles,
  seenArticleIds,
  setSeenArticleIds,
  onOpenFeedManager,
}: NewsSwiperProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const swiperRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const initialScrollDone = useRef(false);
  const prevArticlesRef = useRef<NewsArticle[] | null>(null);

  // Dwell time tracking
  const activatedAt = useRef(Date.now());
  const prevActiveIndex = useRef(0);
  const { trackDwell, trackClick, sortByPreference } = usePreferences();

  // useMemo evita reordenação aleatória a cada render (que causava flickering)
  const sorted = useMemo(() => sortByPreference(articles), [articles]);

  // Track dwell when activeIndex changes
  useEffect(() => {
    const now = Date.now();
    const dwellMs = now - activatedAt.current;
    if (prevActiveIndex.current !== activeIndex && sorted[prevActiveIndex.current]) {
      trackDwell(sorted[prevActiveIndex.current], dwellMs);
    }
    prevActiveIndex.current = activeIndex;
    activatedAt.current = now;
  }, [activeIndex]);

  // Adjust refs array length when articles change
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, sorted.length);
    if (sorted.length > 0 && activeIndex >= sorted.length) {
      setActiveIndex(sorted.length - 1);
    }
  }, [sorted.length]);

  // Scroll to first unseen article on initial load
  useEffect(() => {
    if (prevArticlesRef.current !== articles) {
      initialScrollDone.current = false;
      prevArticlesRef.current = articles;
    }
    if (sorted.length === 0 || !swiperRef.current || initialScrollDone.current) return;

    const firstUnseen = sorted.findIndex(a => !seenArticleIds.includes(a.id));
    const target = firstUnseen !== -1 ? firstUnseen : 0;
    itemRefs.current[target]?.scrollIntoView({ behavior: 'auto' });
    initialScrollDone.current = true;
  }, [sorted, seenArticleIds]);

  // IntersectionObserver to track active article
  useEffect(() => {
    if (!swiperRef.current || sorted.length === 0) return;

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
    return () => {
      refs.forEach(r => observer.unobserve(r));
      observer.disconnect();
    };
  }, [sorted]);

  // Mark active article as seen
  useEffect(() => {
    if (sorted.length === 0 || activeIndex >= sorted.length) return;
    const active = sorted[activeIndex];
    if (active && !seenArticleIds.includes(active.id)) {
      setSeenArticleIds(prev =>
        prev.includes(active.id) ? prev : [...prev, active.id]
      );
    }
  }, [activeIndex, sorted]);

  if (sorted.length === 0) {
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

  const allSeen = sorted.every(a => seenArticleIds.includes(a.id));
  if (allSeen) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-background text-foreground p-4 text-center">
        <div className="bg-card p-6 rounded-lg shadow-xl">
          <p className="font-headline text-xl mb-2">Fim das Notícias</p>
          <p className="text-muted-foreground">Você viu todas as notícias. Limpe o histórico ou adicione novos feeds.</p>
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
      {sorted.map((article, index) => (
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
    </div>
  );
}
