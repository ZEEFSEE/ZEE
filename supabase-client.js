// ZHI知币 Supabase client
const ZHI_SUPABASE_URL = 'https://bkttvffunyvbswkxpygp.supabase.co';
const ZHI_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_NYVMp3Nhk9QDtIxz1MGOEA_Z7RtbMyP';

(function initZhiSupabaseClient(){
  if (window.zhiSupabase?.auth) return window.zhiSupabase;
  if (!window.supabase?.createClient) {
    console.error('[ZHI] Supabase JS SDK failed to load.');
    return null;
  }
  window.zhiSupabase = window.supabase.createClient(
    ZHI_SUPABASE_URL,
    ZHI_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, lock: async (_name, _acquireTimeout, fn) => await fn() } }
  );
  return window.zhiSupabase;
})();
