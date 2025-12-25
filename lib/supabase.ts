import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  process.env.SUPABASE_ANON;

if (!supabaseUrl || !supabaseAnonKey) {
  // We intentionally throw on the server only; the browser bundle should not
  // contain secret keys and will rely on the public anon key.
  console.warn(
    "Supabase URL or anon key is not set. API routes that depend on Supabase will fail until env is configured."
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    persistSession: false,
  },
  global: {
    fetch: (url, options) => {
      // Custom fetch with longer timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout
      
      return fetch(url, {
        ...options,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));
    },
  },
});

/**
 * Retry wrapper for Supabase RPC calls
 */
export async function supabaseRpcWithRetry<T>(
  rpcName: string,
  params: Record<string, unknown>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<{ data: T | null; error: Error | null }> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await supabase.rpc(rpcName, params);
      
      if (error) {
        // Check if it's a timeout error
        if (error.message?.includes("timeout") || error.message?.includes("fetch failed")) {
          lastError = new Error(error.message);
          console.warn(`Supabase RPC attempt ${attempt}/${maxRetries} failed: ${error.message}`);
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
            continue;
          }
        }
        return { data: null, error: new Error(error.message) };
      }
      
      return { data: data as T, error: null };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`Supabase RPC attempt ${attempt}/${maxRetries} exception: ${lastError.message}`);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  
  return { data: null, error: lastError };
}


