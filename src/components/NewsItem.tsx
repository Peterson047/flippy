'use client';

import type { NewsArticle } from '@/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { generateSummary } from '@/app/actions';

interface NewsItemProps {
  article: NewsArticle;
  isActive: boolean;
  shouldFetchSummary?: boolean;
  onArticleClick?: (article: NewsArticle) => void;
}

const PLACEHOLDER = 'https://placehold.co/1080x1920.png';

export default function NewsItem({ article, isActive, shouldFetchSummary, onArticleClick }: NewsItemProps) {
  const [aiText, setAiText] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const fetchedRef = useRef(false);

  // Reset when article changes
  useEffect(() => {
    setAiText(null);
    setLoadingAi(false);
    fetchedRef.current = false;
  }, [article.id]);

  // Call Gemini only when description is absent and we have articleText
  useEffect(() => {
    if (fetchedRef.current) return;
    if (!isActive && !shouldFetchSummary) return;

    const hasText = article.description && article.description.length > 30;
    const hasCached = article.aiSummary;
    if (hasText || hasCached) return;

    if (!article.articleText || article.articleText.length < 50) return;

    fetchedRef.current = true;
    setLoadingAi(true);

    generateSummary(article.id, article.articleText)
      .then(({ summary, isAi }) => {
        if (summary) setAiText(summary);
        void isAi;
      })
      .catch(() => { /* silent fail */ })
      .finally(() => setLoadingAi(false));
  }, [isActive, shouldFetchSummary, article]);

  const displayText = aiText || article.aiSummary || article.description || '';
  const isAi = !!(aiText || (article.isAiSummary && article.aiSummary));

  const handleOpen = () => {
    if (article.originalUrl && article.originalUrl !== '#') {
      onArticleClick?.(article);
      window.open(article.originalUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-background">
      <img
        src={article.imageUrl}
        alt={article.title}
        loading={isActive ? 'eager' : 'lazy'}
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ willChange: 'transform' }}
        data-ai-hint={article.imageAiHint || 'news background'}
        onError={(e) => {
          const t = e.target as HTMLImageElement;
          if (t.src !== PLACEHOLDER) {
            t.src = PLACEHOLDER;
            t.onerror = null;
          }
        }}
      />

      {/* Gradiente em duas camadas: escurece o fundo sem degradar a imagem */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/10 pointer-events-none" />

      <div className="absolute bottom-0 left-0 right-0 pt-4 px-4 pb-20 sm:pt-6 sm:px-6 sm:pb-20 md:pt-8 md:px-8 md:pb-24 text-foreground">
        <h2
          className="font-headline text-2xl sm:text-3xl font-bold mb-2 sm:mb-3"
          style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
        >
          {article.title}
        </h2>

        <div className="min-h-[5rem] mb-3 sm:mb-4">
          {loadingAi ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          ) : (
            <p className="font-body text-sm sm:text-base md:text-lg text-white/90 whitespace-pre-line leading-relaxed line-clamp-5"
               style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}>
              {displayText || 'Conteúdo não disponível.'}
            </p>
          )}
        </div>

        <div className="mt-3 sm:mt-4 flex items-end justify-between">
          <div>
            {isAi && !loadingAi && (
              <p className="text-xs text-muted-foreground italic mb-0.5">Resumido por IA</p>
            )}
            {article.sourceName && (
              <p className="font-body text-sm font-medium text-foreground">{article.sourceName}</p>
            )}
          </div>
          <Button
            onClick={handleOpen}
            variant="outline"
            size="sm"
            className="font-body"
            disabled={!article.originalUrl || article.originalUrl === '#'}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Leia na íntegra
          </Button>
        </div>
      </div>
    </div>
  );
}
