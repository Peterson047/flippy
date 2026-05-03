'use client';

import { useCallback } from 'react';
import type { NewsArticle } from '@/types';

const CACHE_KEY = 'flippy-articles-cache';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

interface ArticleCache {
  feedKey: string;
  articles: NewsArticle[];
  cachedAt: number;
}

export function useArticleCache() {
  const getCache = useCallback((feedKey: string): NewsArticle[] | null => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cache: ArticleCache = JSON.parse(raw);
      if (cache.feedKey !== feedKey) return null;
      if (Date.now() - cache.cachedAt > CACHE_TTL_MS) return null;
      return cache.articles;
    } catch {
      return null;
    }
  }, []);

  const setCache = useCallback((feedKey: string, articles: NewsArticle[]) => {
    try {
      const cache: ArticleCache = { feedKey, articles, cachedAt: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch { /* quota exceeded - ignora */ }
  }, []);

  const clearCache = useCallback(() => {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch { /* ignora */ }
  }, []);

  return { getCache, setCache, clearCache };
}
