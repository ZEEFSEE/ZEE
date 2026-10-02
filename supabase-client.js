// ZHI 双 Project 客户端
// Finance：登录、金融 RPC 与用户钱包。
const ZHI_FINANCE_URL = 'https://bkttvffunyvbswkxpygp.supabase.co';
const ZHI_FINANCE_PUBLISHABLE_KEY = 'sb_publishable_NYVMp3Nhk9QDtIxz1MGOEA_Z7RtbMyP';

// Core：智能人、KING、虚拟世界与世界状态。
// Core 目前是公开读取 + 后台写入模型；不要把 Finance 的 JWT 当成 Core JWT 使用。
const ZHI_CORE_URL = 'https://jozrslgdjreepxplicen.supabase.co';
const ZHI_CORE_PUBLISHABLE_KEY = 'sb_publishable_MOVcpW2XoLdHbUVp6f-nrw_e_HY1Bav';

const ZHI_AUTH_OPTIONS = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'sb-bkttvffunyvbswkxpygp-auth-token'
  }
};

const ZHI_CORE_AUTH_OPTIONS = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  global: {
    headers: {
      'x-zhi-client': 'king-world'
    }
  }
};

window.zhiSupabase = window.supabase.createClient(
  ZHI_FINANCE_URL,
  ZHI_FINANCE_PUBLISHABLE_KEY,
  ZHI_AUTH_OPTIONS
);

window.zhiCoreSupabase = window.supabase.createClient(
  ZHI_CORE_URL,
  ZHI_CORE_PUBLISHABLE_KEY,
  ZHI_CORE_AUTH_OPTIONS
);
window.zhiCorePublishableKey = ZHI_CORE_PUBLISHABLE_KEY;

window.__zhiCoreReadErrors = window.__zhiCoreReadErrors || [];
window.zhiCoreRead = async function(label, operation, fallback = null) {
  try {
    const result = await operation(window.zhiCoreSupabase);
    if (result?.error) {
      const item = {
        label,
        message: result.error.message || String(result.error),
        code: result.error.code || null,
        at: new Date().toISOString()
      };
      window.__zhiCoreReadErrors.push(item);
      if (window.__zhiCoreReadErrors.length > 30) window.__zhiCoreReadErrors.shift();
      console.warn('[ZHI Core read]', item);
      return { data: fallback, error: result.error, source: 'error' };
    }
    return { data: result?.data ?? fallback, error: null, source: 'core' };
  } catch (error) {
    const item = {
      label,
      message: error?.message || String(error),
      code: error?.code || null,
      at: new Date().toISOString()
    };
    window.__zhiCoreReadErrors.push(item);
    if (window.__zhiCoreReadErrors.length > 30) window.__zhiCoreReadErrors.shift();
    console.warn('[ZHI Core read exception]', item);
    return { data: fallback, error, source: 'exception' };
  }
};
