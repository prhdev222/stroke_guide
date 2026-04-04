// POST /ct-temp/session — สร้าง session อัปโหลด + ลิงก์ดูให้ Neuro (อายุ 4 ชม.)
// รองรับหลายไฟล์ต่อ session (prefix R2 + ดัชนี)

import {
  CT_TTL_SEC,
  CT_KV_GRACE_SEC,
  CT_MAX_FILES,
  randomHex,
  checkCtTempSecret,
  ctBindingsOk,
} from '../_ct-temp-shared.js';

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!checkCtTempSecret(env, request)) {
    return Response.json(
      { error: 'ต้องใส่ header X-CT-Temp-Secret ให้ตรงกับ CT_TEMP_SECRET' },
      { status: 403 }
    );
  }

  if (!ctBindingsOk(env)) {
    return Response.json(
      {
        error:
          'ยังไม่ได้ผูก KV (CT_SESSIONS) และ R2 (CT_IMAGES) — ดู wrangler.toml',
      },
      { status: 503 }
    );
  }

  const sessionId = crypto.randomUUID();
  const uploadToken = randomHex(24);
  const viewToken = randomHex(24);
  const exp = Date.now() + CT_TTL_SEC * 1000;
  const session = {
    prefix: `ct/${sessionId}`,
    files: [],
    nextIdx: 0,
    exp,
    uploadToken,
    viewToken,
  };

  const ttl = CT_TTL_SEC + CT_KV_GRACE_SEC;
  await env.CT_SESSIONS.put(`cts:${sessionId}`, JSON.stringify(session), {
    expirationTtl: ttl,
  });
  await env.CT_SESSIONS.put(`ctu:${uploadToken}`, sessionId, {
    expirationTtl: ttl,
  });
  await env.CT_SESSIONS.put(`ctv:${viewToken}`, sessionId, {
    expirationTtl: ttl,
  });

  const origin = new URL(request.url).origin;
  return Response.json({
    sessionId,
    uploadToken,
    viewUrl: `${origin}/ct-temp/view?t=${encodeURIComponent(viewToken)}`,
    uploadUrl: `${origin}/ct-temp/upload`,
    expiresAt: new Date(exp).toISOString(),
    expiresInSec: CT_TTL_SEC,
    maxFiles: CT_MAX_FILES,
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, X-CT-Temp-Secret, Authorization',
    },
  });
}
