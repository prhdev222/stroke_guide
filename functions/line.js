// functions/line.js — LINE Messaging API (Broadcast only)
// POST /line  → ส่ง alert จาก Staff Wizard → Broadcast หาทุกคนที่ Follow OA
// GET  /line  → status check
//
// ENV (Cloudflare Pages → Settings → Environment Variables):
//   LINE_CHANNEL_ACCESS_TOKEN  = จาก LINE Developers → Messaging API
//   WEBAPP_URL                 = https://stroke-prh.pages.dev
//
// วิธีใช้:
//   1. สร้าง LINE OA → บอกหมอระบบประสาท + ทีม refer ให้ Add OA เป็นเพื่อน
//   2. ทุกคนที่ Follow จะได้รับ alert อัตโนมัติเมื่อ Staff กดแจ้งเตือน
//   3. เสีย 1 token ต่อ 1 ครั้งที่กด ไม่ว่าจะมีคน follow กี่คน

export async function onRequestPost(context) {
  const { LINE_CHANNEL_ACCESS_TOKEN, WEBAPP_URL } = context.env;

  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    return Response.json({
      error: 'LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า — ไปที่ Cloudflare Pages → Settings → Environment Variables'
    }, { status: 503 });
  }

  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { type, data } = body;
  const webUrl = (WEBAPP_URL || 'https://stroke-prh.pages.dev').replace(/\/$/, '');
  const messages = buildMessage(type, data, webUrl);

  const result = await sendBroadcast(LINE_CHANNEL_ACCESS_TOKEN, messages);
  return Response.json({ ok: result.ok, method: 'broadcast', ...result });
}

export async function onRequestGet(context) {
  return Response.json({
    ok: true,
    configured: !!context.env.LINE_CHANNEL_ACCESS_TOKEN,
    mode: 'broadcast',
    webapp_url: context.env.WEBAPP_URL || '(not set)',
  });
}

function buildMessage(type, data = {}, webUrl) {
  const d = data;
  const icon   = type === 'refer_alert' ? '🚨' : '⚡';
  const header = type === 'refer_alert'
    ? `${icon} REFER — Stroke Fast Tract`
    : `${icon} Stroke Alert — รพ.สงฆ์`;

  const lines = [header, '─────────────────────'];
  if (d.ward)   lines.push(`🏥 Ward: ${d.ward}`);
  if (d.onset)  lines.push(`⏱ Onset: ${d.onset} ชม.`);
  if (d.nihss !== undefined) lines.push(`📊 NIHSS: ${d.nihss} — ${d.nihss_sev || ''}`);
  if (d.ct)     lines.push(`🧠 CT: ${d.ct}`);
  if (d.action) lines.push(`✅ Action: ${d.action}`);
  if (d.dtn)    lines.push(`⏰ DTN: ${d.dtn} นาที`);
  lines.push('─────────────────────');
  lines.push('🔗 รายละเอียด: ' + webUrl);
  if (type === 'refer_alert') lines.push('\nกรุณาติดต่อกลับโดยด่วน');

  return [{ type: 'text', text: lines.join('\n') }];
}

async function sendBroadcast(token, messages) {
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ messages }),
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
