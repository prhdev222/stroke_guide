// Shared helpers — CT ชั่วคราว (R2 + KV) PDPA: ไม่มี HN/ชื่อใน key หรือ URL

export const CT_TTL_SEC = 4 * 60 * 60; // 4 ชม.
export const CT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
export const CT_KV_GRACE_SEC = 300; // KV TTL เกิน exp เล็กน้อย

export function randomHex(byteLen = 24) {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** ถ้าตั้ง CT_TEMP_SECRET ใน env → ต้องส่ง header X-CT-Temp-Secret ตรงกัน */
export function checkCtTempSecret(env, request) {
  const required = env.CT_TEMP_SECRET;
  if (required == null || String(required).trim() === '') return true;
  const h =
    request.headers.get('X-CT-Temp-Secret') ||
    request.headers.get('x-ct-temp-secret') ||
    '';
  return h === String(required);
}

export function ctBindingsOk(env) {
  return !!(env.CT_SESSIONS && env.CT_IMAGES);
}

export async function purgeSession(env, sessionId, session) {
  if (!env.CT_SESSIONS || !session) return;
  try {
    await env.CT_IMAGES.delete(session.r2Key);
  } catch (_) { /* ignore */ }
  await env.CT_SESSIONS.delete(`cts:${sessionId}`);
  await env.CT_SESSIONS.delete(`ctu:${session.uploadToken}`);
  await env.CT_SESSIONS.delete(`ctv:${session.viewToken}`);
}

export function remainingKvTtlSec(session) {
  const left = Math.floor((session.exp - Date.now()) / 1000);
  return Math.max(CT_KV_GRACE_SEC, left + CT_KV_GRACE_SEC);
}
