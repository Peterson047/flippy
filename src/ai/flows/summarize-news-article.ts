
'use server';
/**
 * @fileOverview An AI agent that summarizes news articles into a concise, 5-line summary in Portuguese.
 *
 * - summarizeNewsArticle - A function that handles the news article summarization process.
 * - SummarizeNewsArticleInput - The input type for the summarizeNewsArticle function.
 * - SummarizeNewsArticleOutput - The return type for the summarizeNewsArticle function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeNewsArticleInputSchema = z.object({
  articleText: z.string().describe('The full text content of the news article.'),
});
export type SummarizeNewsArticleInput = z.infer<typeof SummarizeNewsArticleInputSchema>;

const SummarizeNewsArticleOutputSchema = z.object({
  summary: z
    .string()
    .describe('A concise, 5-line summary of the news article, in Portuguese.'),
});
export type SummarizeNewsArticleOutput = z.infer<typeof SummarizeNewsArticleOutputSchema>;

export async function summarizeNewsArticle(
  input: SummarizeNewsArticleInput
): Promise<SummarizeNewsArticleOutput> {
  if (!input.articleText || input.articleText.trim().length < 50) { 
    const length = input.articleText ? input.articleText.trim().length : 0;
    return { summary: `Conteúdo do artigo muito curto (apenas ${length} caracteres) para resumo ou não disponível.` };
  }
  return summarizeNewsArticleFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeNewsArticlePrompt',
  input: {schema: SummarizeNewsArticleInputSchema},
  output: {schema: SummarizeNewsArticleOutputSchema},
  prompt: `Resuma o seguinte artigo de notícia em 5 linhas concisas, em português:\n\n{{{articleText}}}`,
});

const summarizeNewsArticleFlow = ai.defineFlow(
  {
    name: 'summarizeNewsArticleFlow',
    inputSchema: SummarizeNewsArticleInputSchema,
    outputSchema: SummarizeNewsArticleOutputSchema,
  },
  async (input: SummarizeNewsArticleInput): Promise<SummarizeNewsArticleOutput> => {
    let finishReasonString = 'unknown'; // Default value
    try {
      const {output, finishReason} = await prompt(input);
      finishReasonString = String(finishReason); // Capture finishReason as string

      console.log(`[summarizeNewsArticleFlow] Attempt - Finish Reason: ${finishReasonString}, Output: ${JSON.stringify(output)}`);

      if ((finishReasonString.toLowerCase() === 'stop') && output?.summary && typeof output.summary === 'string' && output.summary.trim() !== '') {
        return {summary: output.summary.trim()};
      }
      
      let userMessage = ''; 

      if (finishReasonString === 'BLOCKED' || finishReasonString === 'SAFETY') {
        userMessage = `O resumo não pôde ser gerado devido a restrições (${finishReasonString}).`;
        console.warn(`[summarizeNewsArticleFlow] Summarization blocked by safety/policy. Finish Reason: ${finishReasonString}. Input text length: ${input.articleText.length}`);
      } else if (finishReasonString === 'OTHER') {
        userMessage = `O resumo não pôde ser gerado (Motivo: ${finishReasonString}).`;
        console.warn(`[summarizeNewsArticleFlow] Summarization failed with OTHER reason. Finish Reason: ${finishReasonString}, Output: ${JSON.stringify(output)}`);
      } else if (finishReasonString === 'MAX_TOKENS') { 
        userMessage = `O resumo não pôde ser gerado pois o texto do artigo é muito longo (MAX_TOKENS).`;
        console.warn(`[summarizeNewsArticleFlow] Summarization failed due to MAX_TOKENS. Finish Reason: ${finishReasonString}, Output: ${JSON.stringify(output)}`);
      } else if (!output) {
        userMessage = 'A IA não retornou nenhuma estrutura de saída válida.';
        console.warn(`[summarizeNewsArticleFlow] AI prompt returned no output object. Finish Reason: ${finishReasonString}`);
      } else if (typeof output.summary !== 'string' || output.summary.trim() === '') {
        userMessage = 'A IA retornou um resumo inválido (não é texto ou está vazio).';
        console.warn(`[summarizeNewsArticleFlow] AI prompt returned invalid or empty summary. Summary type: ${typeof output.summary}, Summary: "${output.summary}". Finish Reason: ${finishReasonString}, Output: ${JSON.stringify(output)}`);
      } else {
        userMessage = `Falha ao processar o resumo da IA (Motivo Final: ${finishReasonString}).`;
        console.warn(`[summarizeNewsArticleFlow] Unhandled case or unexpected finishReason. Finish Reason: ${finishReasonString}, Output: ${JSON.stringify(output)}`);
      }
      
      return { summary: userMessage };

    } catch (error: any) {
      console.error('[summarizeNewsArticleFlow] Error during AI prompt call:', JSON.stringify(error, null, 2));
      let summaryMessage = 'Ocorreu um erro desconhecido ao gerar o resumo.';

      const errorMessage = error?.message?.toLowerCase() || '';
      const errorDetailsString = JSON.stringify(error?.errorDetails || '').toLowerCase();

      if (errorMessage.includes('429') || error?.status === 429 || error?.response?.status === 429 || errorDetailsString.includes('_free_tier_requests') || errorDetailsString.includes('quota')) {
        summaryMessage = 'Resumo indisponível devido a limites da API (429). Tente novamente mais tarde.';
      } else if (finishReasonString === 'SAFETY' || error?.response?.promptFeedback?.blockReason === 'SAFETY' || errorMessage.includes('safety')) {
        summaryMessage = 'O resumo não pôde ser gerado devido a restrições de segurança do conteúdo.';
      }
      
      console.warn(`[summarizeNewsArticleFlow] Caught error, returning message: "${summaryMessage}"`);
      return { summary: summaryMessage };
    }
  }
);
