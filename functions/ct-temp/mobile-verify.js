// POST /ct-temp/mobile-verify — body JSON { k?, u?, pin } → { writeToken } สำหรับอัปโหลดหลังกรอกรหัสจากจอ Staff

import {
  randomHex,
  remainingKvTtlSec,
  ctBindingsOk,
  timingSafeEqualAscii,
  resolveCtSessionIdFromMobileParams,
} from '../_ct-temp-shared.js';

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!ctBindingsOk(env)) {
    return Response.json({ error: 'CT KV ยังไม่ได้ตั้งค่า' }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'ต้องส่ง JSON' }, { status: 400 });
  }

  const pin = String(body.pin ?? '').trim();
  const k = body.k != null ? String(body.k) : '';
  const u = body.u != null ? String(body.u) : '';
  if (!pin) {
    return Response.json({ error: 'ใส่รหัส' }, { status: 400 });
  }

  const resolved = await resolveCtSessionIdFromMobileParams(env, k, u);
  if (!resolved) {
    return Response.json(
      { error: 'ลิงก์ไม่ถูกต้องหรือหมดอายุ' },
      { status: 400 }
    );
  }

  const raw = await env.CT_SESSIONS.get(`cts:${resolved.sessionId}`);
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
    return Response.json({ error: 'session หมดอายุแล้ว' }, { status: 410 });
  }

  if (!session.uploadPin) {
    return Response.json(
      { error: 'session นี้ไม่ต้องใส่รหัส — ใช้ลิงก์แบบเก่า' },
      { status: 400 }
    );
  }

  if (!timingSafeEqualAscii(pin, session.uploadPin)) {
    return Response.json({ error: 'รหัสไม่ถูกต้อง' }, { status: 403 });
  }

  const writeToken = randomHex(24);
  const ttl = remainingKvTtlSec(session);
  await env.CT_SESSIONS.put(`ctw:${writeToken}`, session.uploadToken, {
    expirationTtl: ttl,
  });

  return Response.json({ ok: true, writeToken });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
