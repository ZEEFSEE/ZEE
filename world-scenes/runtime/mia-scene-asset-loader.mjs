/**
 * Resolves the one approved private Forest Corner GLB using the existing
 * authenticated Mia session token. The token and signed URL stay in memory.
 */
export const MIA_SCENE_ASSET_ENDPOINT = "https://dbooikzqprnqbgpfwsze.supabase.co/functions/v1/mia-scene-asset-url";
const PROJECT_ORIGIN = "https://dbooikzqprnqbgpfwsze.supabase.co";
const OBJECT_PATH = "/storage/v1/object/sign/lovelydragon/tiny_planet_friends_3d-defective-product-4083.glb";

export async function resolveTinyPlanetFriendsUrl({ token, fetchImpl = fetch }) {
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
    throw new Error("请先在同一浏览器标签页登录 Mia 独立聊天室，再打开场景页。");
  }
  const response = await fetchImpl(MIA_SCENE_ASSET_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": "sb_publishable_spH47ZngJJTk13cpYPBjSw_X5qAsBmK",
      "Authorization": "Bearer " + token
    },
    body: "{}",
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true || typeof payload.signedUrl !== "string") {
    throw new Error(payload?.error || ("场景资产授权失败（HTTP " + response.status + "）"));
  }
  let signed;
  try { signed = new URL(payload.signedUrl); } catch { throw new Error("资产授权服务返回了无效地址。"); }
  if (signed.origin !== PROJECT_ORIGIN || !signed.pathname.startsWith(OBJECT_PATH)) {
    throw new Error("资产授权地址与预期的私有 GLB 不匹配，已拒绝加载。");
  }
  if (!Number.isFinite(payload.expiresIn) || payload.expiresIn <= 0 || payload.expiresIn > 3600) {
    throw new Error("资产授权期限不符合安全策略，已拒绝加载。");
  }
  return { url: payload.signedUrl, expiresIn: payload.expiresIn };
}
