// GET /ct-temp/view?t=<viewToken> — Neuro เปิดดูไฟล์ (&raw=1 = ไฟล์ดิบสำหรับแท็ก img)

import { ctBindingsOk, purgeSession } from '../_ct-temp-shared.js';

function htmlShell(inner) {
  return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CT ชั่วคราว</title>
<style>body{font-family:system-ui,'Noto Sans Thai',sans-serif;background:#eee;margin:0;padding:16px;color:#222}.box{max-width:800px;margin:0 auto;background:#fff;border-radius:12px;padding:18px;box-shadow:0 2px 12px rgba(0,0,0,.07)}.note{color:#555;font-size:13px;line-height:1.65;margin-bottom:14px}img{max-width:100%;height:auto;border-radius:8px;display:block}</style></head><body><div class="box">${inner}</div></body></html>`;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const t = url.searchParams.get('t');
  const raw = url.searchParams.get('raw') === '1';

  if (!t || t.length > 200) {
    return new Response(htmlShell('<p class="note">ไม่พบพารามิเตอร์ลิงก์</p>'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  if (!ctBindingsOk(env)) {
    return new Response(htmlShell('<p class="note">ระบบยังไม่ได้ตั้งค่า R2/KV</p>'), {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const sessionId = await env.CT_SESSIONS.get(`ctv:${t}`);
  if (!sessionId) {
    return new Response(
      htmlShell('<p class="note">ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว (4 ชม.)</p>'),
      { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  const rawSession = await env.CT_SESSIONS.get(`cts:${sessionId}`);
  if (!rawSession) {
    return new Response(htmlShell('<p class="note">ไม่พบ session</p>'), {
      status: 410,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  let session;
  try {
    session = JSON.parse(rawSession);
  } catch {
    return new Response(htmlShell('<p class="note">ข้อมูลเสีย</p>'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  if (Date.now() > session.exp) {
    await purgeSession(env, sessionId, session);
    return new Response(
      htmlShell('<p class="note">ลิงก์หมดอายุแล้ว — ขอลิงก์ใหม่จาก รพ.</p>'),
      { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  if (!session.uploaded) {
    return new Response(
      htmlShell(
        '<p class="note">รอฝั่ง รพ. อัปโหลดภาพ — กดรีเฟรชภายหลัง<br><small>ไม่มี HN/ชื่อในลิงก์ (PDPA)</small></p>'
      ),
      { status: 202, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  const obj = await env.CT_IMAGES.get(session.r2Key);
  if (!obj) {
    return new Response(htmlShell('<p class="note">ไม่พบไฟล์</p>'), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const ct =
    session.contentType || obj.httpMetadata?.contentType || 'application/octet-stream';

  const binHeaders = {
    'Content-Type': ct,
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  };

  if (raw) {
    return new Response(obj.body, { headers: binHeaders });
  }

  if (ct.startsWith('image/')) {
    const imgSrc = `${url.pathname}?t=${encodeURIComponent(t)}&raw=1`;
    return new Response(
      htmlShell(
        `<p class="note">ลิงก์ชั่วคราว ~4 ชม. — ไม่มีข้อมูลระบุตัวตนใน URL</p><img src="${imgSrc}" alt="CT">`
      ),
      { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  return new Response(obj.body, { headers: binHeaders });
}
