// POST /ct-temp/upload — Authorization: Bearer <uploadToken>, body: multipart form field "file"

import {
  CT_MAX_UPLOAD_BYTES,
  ctBindingsOk,
  purgeSession,
  remainingKvTtlSec,
} from '../_ct-temp-shared.js';

const ALLOW_CT = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/dicom',
  'application/octet-stream',
]);

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!ctBindingsOk(env)) {
    return Response.json({ error: 'CT R2/KV ยังไม่ได้ตั้งค่า' }, { status: 503 });
  }

  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const uploadToken = m ? m[1].trim() : '';
  if (!uploadToken) {
    return Response.json(
      { error: 'ใส่ Authorization: Bearer <uploadToken> จากขั้นตอนสร้าง session' },
      { status: 401 }
    );
  }

  const sessionId = await env.CT_SESSIONS.get(`ctu:${uploadToken}`);
  if (!sessionId) {
    return Response.json(
      { error: 'upload token ไม่ถูกต้องหรือหมดอายุ' },
      { status: 403 }
    );
  }

  const raw = await env.CT_SESSIONS.get(`cts:${sessionId}`);
  if (!raw) {
    return Response.json({ error: 'session ไม่พบ' }, { status: 410 });
  }

  let session;
  try {
    session = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'ข้อมูล session เสีย' }, { status: 500 });
  }

  if (Date.now() > session.exp) {
    await purgeSession(env, sessionId, session);
    return Response.json({ error: 'session หมดอายุแล้ว (4 ชม.)' }, { status: 410 });
  }

  if (session.uploaded) {
    return Response.json({ error: 'อัปโหลดแล้ว — ไม่อนุญาตซ้ำ' }, { status: 409 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'ต้องเป็น multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file.stream !== 'function') {
    return Response.json({ error: 'ต้องมีฟิลด์ file' }, { status: 400 });
  }

  if (file.size > CT_MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `ไฟล์ใหญ่เกิน ${CT_MAX_UPLOAD_BYTES / (1024 * 1024)} MB` },
      { status: 413 }
    );
  }

  let ct = (file.type || '').toLowerCase() || 'application/octet-stream';
  if (!ALLOW_CT.has(ct) && !ct.startsWith('image/')) {
    ct = 'application/octet-stream';
  }

  await env.CT_IMAGES.put(session.r2Key, file.stream(), {
    httpMetadata: { contentType: ct },
  });

  session.uploaded = true;
  session.contentType = ct;
  const ttl = remainingKvTtlSec(session);
  await env.CT_SESSIONS.put(`cts:${sessionId}`, JSON.stringify(session), {
    expirationTtl: ttl,
  });
  await env.CT_SESSIONS.put(`ctu:${session.uploadToken}`, sessionId, {
    expirationTtl: ttl,
  });
  await env.CT_SESSIONS.put(`ctv:${session.viewToken}`, sessionId, {
    expirationTtl: ttl,
  });

  return Response.json({ ok: true, contentType: ct, bytes: file.size });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
