import { createClient } from "@supabase/supabase-js";

let client = null;

// Created on first use so missing settings show the page's error message
// instead of stopping every script from loading.
export function getSupabase() {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase is not set up. Copy .env.example to .env and fill in your project details.");
  }

  client = createClient(url, key);
  return client;
}
