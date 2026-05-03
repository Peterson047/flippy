'use server';
/**
 * @fileOverview An AI agent that finds relevant RSS feed URLs based on a user query.
 *
 * - findRssFeed - A function that handles finding an RSS feed.
 * - FindRssFeedInput - The input type for the findRssFeed function.
 * - FindRssFeedOutput - The return type for the findRssFeed function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const FindRssFeedInputSchema = z.object({
  query: z.string().describe('The user query or topic to find an RSS feed for (e.g., "technology news", "brazilian sports", "culinária vegana").'),
});
export type FindRssFeedInput = z.infer<typeof FindRssFeedInputSchema>;

const FindRssFeedOutputSchema = z.object({
  found: z.boolean().describe('Whether a relevant RSS feed was found.'),
  suggestedName: z.string().optional().describe('A suitable name for the found RSS feed, if any.'),
  suggestedUrl: z.string().optional().describe('The URL of the found RSS feed, if any. Must be a valid RSS/Atom feed URL if provided.'),
});
export type FindRssFeedOutput = z.infer<typeof FindRssFeedOutputSchema>;

export async function findRssFeed(input: FindRssFeedInput): Promise<FindRssFeedOutput> {
  return findRssFeedFlow(input);
}

const prompt = ai.definePrompt({
  name: 'findRssFeedPrompt',
  input: {schema: FindRssFeedInputSchema},
  output: {schema: FindRssFeedOutputSchema},
  prompt: `Você é um especialista em encontrar feeds RSS de alta qualidade em português ou sobre tópicos relevantes para o Brasil, quando aplicável. Dada a consulta do usuário, encontre a URL de feed RSS mais relevante e funcional. Além disso, forneça um nome adequado para este feed em português.

Se você encontrar um feed RSS relevante e funcional, defina "found" como true e forneça "suggestedName" e "suggestedUrl".
Se você não conseguir encontrar um feed RSS relevante, tiver dúvidas sobre sua funcionalidade, ou se a URL não parecer ser de um feed RSS/Atom direto, defina "found" como false e não forneça "suggestedName" ou "suggestedUrl".

Consulta do Usuário: {{{query}}}

Certifique-se de que a URL fornecida seja um link direto para um feed RSS ou Atom (geralmente terminando em .xml, .rss, .atom, ou contendo "feed", "rss", "atom"). Não forneça links para páginas HTML comuns ou agregadores que não sejam o feed direto.
Exemplo de nome sugerido: "Notícias de Tecnologia Avançada"
Exemplo de URL sugerida: "https://www.examplenews.com/tech/feed.xml"
Exemplo de nome sugerido para consulta "futebol brasileiro": "Feed de Notícias do Futebol Brasileiro GE"
Exemplo de URL sugerida para consulta "futebol brasileiro": "https://ge.globo.com/ voetbal/feed/generico/rss/2.0/feed.xml" (exemplo ilustrativo, verifique a URL real)
`,
});

const findRssFeedFlow = ai.defineFlow(
  {
    name: 'findRssFeedFlow',
    inputSchema: FindRssFeedInputSchema,
    outputSchema: FindRssFeedOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    
    if (!output) {
        console.warn("AI prompt did not return a parsable output for findRssFeedFlow.");
        return { found: false };
    }

    if (output.found) {
        if (!output.suggestedName || !output.suggestedUrl) {
            console.warn("AI reported feed found but missing name/url. Treating as not found.", output);
            return { found: false };
        }
        try {
            new URL(output.suggestedUrl); // Basic URL syntax validation
            // Heuristic check for common feed indicators in URL
            if (!/\.(xml|rss|atom)$/i.test(output.suggestedUrl) && !/(feed|rss|atom)/i.test(output.suggestedUrl)) {
                 console.warn("AI suggested URL does not strongly indicate a feed URL. Treating as not found.", output.suggestedUrl);
                 return { found: false };
            }
            return {
                found: true,
                suggestedName: output.suggestedName,
                suggestedUrl: output.suggestedUrl,
            };
        } catch (e) {
            console.warn("AI suggested URL is invalid. Treating as not found.", output.suggestedUrl, e);
            return { found: false };
        }
    } else {
        return { found: false };
    }
  }
);
