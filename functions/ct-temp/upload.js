// POST /ct-temp/upload — Authorization: Bearer <uploadToken>
// multipart: ฟิลด์ "file" หนึ่งไฟล์หรือหลายไฟล์ (ชื่อเดียวกัน) — อัปโหลดเพิ่มได้จนครบ CT_MAX_FILES

import {
  CT_MAX_UPLOAD_BYTES,
  CT_MAX_FILES,
  CT_MAX_SESSION_BYTES,
  ctBindingsOk,
  purgeSession,
  remainingKvTtlSec,
  timingSafeEqualAscii,
} from '../_ct-temp-shared.js';

const ALLOW_CT = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'application/dicom',
  'application/octet-stream',
]);

function isLegacySession(s) {
  return !!(s && s.r2Key && !s.prefix);
}

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!ctBindingsOk(env)) {
    return Response.json({ error: 'CT R2/KV ยังไม่ได้ตั้งค่า' }, { status: 503 });
  }

  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const bearer = m ? m[1].trim() : '';
  if (!bearer) {
    return Response.json(
      { error: 'ใส่ Authorization: Bearer <uploadToken> จากขั้นตอนสร้าง session' },
      { status: 401 }
    );
  }

  const viaWrite = await env.CT_SESSIONS.get(`ctw:${bearer}`);
  const resolvedUploadToken = viaWrite ? String(viaWrite).trim() : bearer;

  const sessionId = await env.CT_SESSIONS.get(`ctu:${resolvedUploadToken}`);
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

  if (session.uploadPin) {
    const staffOk = !viaWrite && timingSafeEqualAscii(bearer, session.uploadToken);
    const mobileOk = !!viaWrite;
    if (!staffOk && !mobileOk) {
      return Response.json(
        {
          error:
            'session นี้ต้องยืนยันรหัสบนมือถือก่อน — สแกน QR แล้วกรอกรหัสจากจอ Staff',
        },
        { status: 403 }
      );
    }
  }

  if (Date.now() > session.exp) {
    await purgeSession(env, sessionId, session);
    return Response.json({ error: 'session หมดอายุแล้ว (4 ชม.)' }, { status: 410 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'ต้องเป็น multipart/form-data' }, { status: 400 });
  }

  const fromForm = formData.getAll('file');
  const files = fromForm.filter((f) => f && typeof f.stream === 'function');
  if (!files.length) {
    return Response.json({ error: 'ต้องมีฟิลด์ file อย่างน้อย 1 ไฟล์' }, { status: 400 });
  }

  /** @type {File[]} */
  let toStore = files;

  if (isLegacySession(session)) {
    if (session.uploaded) {
      return Response.json(
        { error: 'session แบบเก่ารองรับไฟล์เดียว — สร้างลิงก์ใหม่เพื่อแนบหลายรูป' },
        { status: 409 }
      );
    }
    if (files.length > 1) {
      return Response.json(
        { error: 'session นี้รองรับทีละ 1 ไฟล์ — สร้างลิงก์ใหม่' },
        { status: 400 }
      );
    }
    toStore = [files[0]];
  } else {
    const existing = Array.isArray(session.files) ? session.files.length : 0;
    if (existing + files.length > CT_MAX_FILES) {
      return Response.json(
        {
          error: `แนบได้ไม่เกิน ${CT_MAX_FILES} ไฟล์ (เหลือ ${CT_MAX_FILES - existing} ช่อง)`,
        },
        { status: 400 }
      );
    }
  }

  let sessionBytes = 0;
  if (!isLegacySession(session) && Array.isArray(session.files)) {
    sessionBytes = session.files.reduce((s, f) => s + (f.bytes || 0), 0);
  }

  for (const file of toStore) {
    if (file.size > CT_MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: `แต่ละไฟล์ไม่เกิน ${CT_MAX_UPLOAD_BYTES / (1024 * 1024)} MB` },
        { status: 413 }
      );
    }
  }

  const addBytes = toStore.reduce((s, f) => s + f.size, 0);
  if (!isLegacySession(session) && sessionBytes + addBytes > CT_MAX_SESSION_BYTES) {
    return Response.json(
      {
        error: `ขนาดรวมทุกไฟล์ไม่เกิน ${CT_MAX_SESSION_BYTES / (1024 * 1024)} MB`,
      },
      { status: 413 }
    );
  }

  const saved = [];

  if (isLegacySession(session)) {
    const file = toStore[0];
    let ct = (file.type || '').toLowerCase() || 'application/octet-stream';
    if (!ALLOW_CT.has(ct) && !ct.startsWith('image/') && !ct.startsWith('video/')) {
      ct = 'application/octet-stream';
    }
    await env.CT_IMAGES.put(session.r2Key, file.stream(), {
      httpMetadata: { contentType: ct },
    });
    session.uploaded = true;
    session.contentType = ct;
    saved.push({ r2Key: session.r2Key, contentType: ct, bytes: file.size });
  } else {
    session.files = Array.isArray(session.files) ? session.files : [];
    session.nextIdx = Number(session.nextIdx) || 0;
    for (const file of toStore) {
      let ct = (file.type || '').toLowerCase() || 'application/octet-stream';
      if (!ALLOW_CT.has(ct) && !ct.startsWith('image/') && !ct.startsWith('video/')) {
        ct = 'application/octet-stream';
      }
      const r2Key = `${session.prefix}/${session.nextIdx}`;
      session.nextIdx += 1;
      await env.CT_IMAGES.put(r2Key, file.stream(), {
        httpMetadata: { contentType: ct },
      });
      const entry = { r2Key, contentType: ct, bytes: file.size };
      session.files.push(entry);
      saved.push(entry);
    }
  }

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

  const count = isLegacySession(session)
    ? 1
    : session.files.length;
  return Response.json({
    ok: true,
    added: saved.length,
    totalFiles: count,
    files: saved.map((f) => ({
      contentType: f.contentType,
      bytes: f.bytes,
    })),
  });
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
