import { CONFIG } from './config.js';

const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
document.head.appendChild(script);

export const getSupabase = () => new Promise((resolve) => {
  if (window.supabase) {
    resolve(window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY));
    return;
  }
  script.onload = () => {
    resolve(window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY));
  };
});