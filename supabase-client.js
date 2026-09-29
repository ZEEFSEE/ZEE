// ZHI 双 Project 客户端
// Finance：现有生产 Project，继续承载登录、金融 RPC 与流水，避免切换时中断现有用户。
const ZHI_FINANCE_URL = 'https://bkttvffunyvbswkxpygp.supabase.co';
const ZHI_FINANCE_PUBLISHABLE_KEY = 'sb_publishable_NYVMp3Nhk9QDtIxz1MGOEA_Z7RtbMyP';
// Core：用户核心资料/钱包镜像，后续用于逐步迁移核心数据。
const ZHI_CORE_URL = 'https://jozrslgdjreepxplicen.supabase.co';
const ZHI_CORE_PUBLISHABLE_KEY = 'sb_publishable_MOVcpW2XoLdHbUVp6f-nrw_e_HY1Bav';
window.zhiSupabase = window.supabase.createClient(ZHI_FINANCE_URL, ZHI_FINANCE_PUBLISHABLE_KEY);
window.zhiCoreSupabase = window.supabase.createClient(ZHI_CORE_URL, ZHI_CORE_PUBLISHABLE_KEY);
