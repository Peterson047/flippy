'use server';

import type { NewsArticle } from '@/types';
import { fetchFeedArticles, fetchMultipleFeedsArticles, updateArticleSummary } from '@/services/feedService';
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

export async function fetchRssFeed(url: string): Promise<NewsArticle[]> {
  return fetchFeedArticles(url);
}

export async function fetchFeeds(
  feeds: Array<{ url: string; name: string }>
): Promise<NewsArticle[]> {
  return fetchMultipleFeedsArticles(feeds);
}

export async function generateSummary(
  articleId: string,
  articleText: string
): Promise<{ summary: string; isAi: boolean }> {
  if (!articleText || articleText.trim().length < 50) {
    return { summary: '', isAi: false };
  }

  try {
    const { output } = await ai.generate({
      model: 'googleai/gemini-2.0-flash',
      prompt: `Resuma o seguinte artigo de notícia em 5 linhas concisas, em português:\n\n${articleText}`,
      output: {
        schema: z.object({
          summary: z.string().describe('Resumo de 5 linhas em português'),
        }),
      },
    });

    const summary = output?.summary?.trim() || '';
    if (summary) {
      await updateArticleSummary(articleId, summary);
      return { summary, isAi: true };
    }
  } catch (e) {
    console.error('[generateSummary] Gemini error:', e);
  }

  return { summary: '', isAi: false };
}
