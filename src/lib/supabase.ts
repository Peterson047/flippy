import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// Um único cliente — funciona para leitura e escrita com RLS desabilitado
export const supabase = createClient(url, publishableKey);
export const supabaseAdmin = supabase;
