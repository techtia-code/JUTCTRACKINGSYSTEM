import { createClient } from "@supabase/supabase-js";

let client = null;

export function isDemoMode() {
  return import.meta.env?.VITE_DEMO_MODE === 'true';
}

// Created on first use so missing settings show the page's error message
// instead of stopping every script from loading.
export function getSupabase() {
  if (client) return client;

  const url = import.meta.env?.VITE_SUPABASE_URL;
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase is not set up. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env, then restart the app.');
  }

  client = createClient(url, key);
  return client;
}
