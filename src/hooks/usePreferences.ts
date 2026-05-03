'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { NewsArticle } from '@/types';

interface Scores {
  categories: Record<string, number>;
  sources: Record<string, number>;
  lastDecayAt: string;
}

const STORAGE_KEY = 'flippy-preferences';
const DECAY_FACTOR = 0.95;
const RANDOMNESS = 0.15;

function loadScores(): Scores {
  if (typeof window === 'undefined') {
    return { categories: {}, sources: {}, lastDecayAt: new Date().toISOString() };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { categories: {}, sources: {}, lastDecayAt: new Date().toISOString() };
  } catch {
    return { categories: {}, sources: {}, lastDecayAt: new Date().toISOString() };
  }
}

function saveScores(scores: Scores) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch { /* ignore */ }
}

function applyDecay(scores: Scores): Scores {
  const daysDiff =
    (Date.now() - new Date(scores.lastDecayAt).getTime()) / 86_400_000;
  if (daysDiff < 1) return scores;

  const factor = Math.pow(DECAY_FACTOR, Math.floor(daysDiff));
  return {
    categories: Object.fromEntries(
      Object.entries(scores.categories).map(([k, v]) => [k, v * factor])
    ),
    sources: Object.fromEntries(
      Object.entries(scores.sources).map(([k, v]) => [k, v * factor])
    ),
    lastDecayAt: new Date().toISOString(),
  };
}

function recencyScore(publishedAt?: string): number {
  if (!publishedAt) return 4;
  const ageH = (Date.now() - new Date(publishedAt).getTime()) / 3_600_000;
  return Math.max(0, 10 - Math.log2(ageH + 1));
}

export function usePreferences() {
  const [scores, setScores] = useState<Scores>(loadScores);
  const scoresRef = useRef(scores);

  useEffect(() => {
    const decayed = applyDecay(scores);
    if (decayed !== scores) {
      saveScores(decayed);
      setScores(decayed);
    }
  }, []);

  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);

  const bump = useCallback(
    (category: string | undefined, source: string | undefined, catPts: number, srcPts: number) => {
      setScores(prev => {
        const next: Scores = {
          ...prev,
          categories: { ...prev.categories },
          sources: { ...prev.sources },
        };
        if (category) next.categories[category] = (next.categories[category] || 0) + catPts;
        if (source) next.sources[source] = (next.sources[source] || 0) + srcPts;
        saveScores(next);
        return next;
      });
    },
    []
  );

  const trackDwell = useCallback(
    (article: NewsArticle, ms: number) => {
      if (ms > 8000) bump(article.category, article.sourceName, 2, 1);
      else if (ms > 3000) bump(article.category, article.sourceName, 1, 0.5);
      else if (ms < 1500) bump(article.category, article.sourceName, -0.5, 0);
    },
    [bump]
  );

  const trackClick = useCallback(
    (article: NewsArticle) => bump(article.category, article.sourceName, 3, 2),
    [bump]
  );

  const sortByPreference = useCallback(
    (articles: NewsArticle[]): NewsArticle[] => {
      const s = scoresRef.current;
      return [...articles].sort((a, b) => {
        const score = (art: NewsArticle) =>
          (s.categories[art.category || ''] || 0) * 0.4 +
          (s.sources[art.sourceName || ''] || 0) * 0.3 +
          recencyScore(art.publishedAt) * 0.3 +
          Math.random() * RANDOMNESS * 10;
        return score(b) - score(a);
      });
    },
    []
  );

  return { trackDwell, trackClick, sortByPreference };
}
