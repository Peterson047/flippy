
import { Genkit, genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

// Enhance global type for NodeJS to include our custom Genkit instance
declare global {
  // eslint-disable-next-line no-var
  var __genkitInstance: Genkit | undefined;
}

let aiInstance: Genkit;

if (process.env.NODE_ENV === 'production') {
  // In production, always create a new instance
  aiInstance = genkit({
    plugins: [googleAI()],
    model: 'googleai/gemini-2.0-flash',
  });
} else {
  // In development, use a global instance to prevent issues with HMR
  // creating multiple Genkit instances.
  if (!global.__genkitInstance) {
    global.__genkitInstance = genkit({
      plugins: [googleAI()],
      model: 'googleai/gemini-2.0-flash',
    });
  }
  aiInstance = global.__genkitInstance;
}

export { aiInstance as ai };
