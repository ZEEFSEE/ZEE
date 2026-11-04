/**
 * Read-only browser client for prototype Mia's Forest Corner autonomy snapshot.
 * Requires the existing Mia chat session token; never persists or refreshes it.
 */
export const MIA_FOREST_OBSERVATION_ENDPOINT =
  "https://dbooikzqprnqbgpfwsze.supabase.co/functions/v1/mia-forest-observation";
const PUBLISHABLE_KEY = "sb_publishable_spH47ZngJJTk13cpYPBjSw_X5qAsBmK";

export function validateMiaForestObservation(value) {
  const p = value?.provenance;
  if (value?.schema !== "zhi.mia.headless-scene-state.v1" ||
      value?.subject !== "prototype-mia" ||
      value?.identity_id !== "cb6d01b4-0e3f-46ee-8946-360aa91db1ea" ||
      value?.scene?.id !== "mia-forest-corner" ||
      p?.read_only !== true ||
      p?.may_drive_movement !== false ||
      p?.physical_3d_movement !== false ||
      p?.live_camera_perception !== false ||
      p?.perception_mode !== "headless-semantic-state") {
    throw new Error("观察响应不符合原型 Mia 只读场景状态契约，已拒绝显示。");
  }
  return value;
}

export async function fetchMiaForestObservation({ token, fetchImpl = fetch }) {
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
    throw new Error("请先在同一浏览器会话中登录原型 Mia。");
  }
  const response = await fetchImpl(MIA_FOREST_OBSERVATION_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": PUBLISHABLE_KEY,
      "Authorization": "Bearer " + token
    },
    body: "{}",
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.error || ("场景状态读取失败（HTTP " + response.status + "）。"));
  }
  return validateMiaForestObservation(payload.observation);
}
