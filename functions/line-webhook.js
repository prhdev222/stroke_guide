// functions/line-webhook.js
// POST /line-webhook  ← ตั้งเป็น Webhook URL ใน LINE Developers Console
//
// จัดการ events:
//   join   → bot ถูก add เข้า group → บันทึก groupId + ส่ง welcome
//   leave  → bot ถูกเตะออก → ลบ groupId
//   follow → มีคนกด follow OA → บันทึก userId
//
// ไม่เสีย token เลย — ใช้ replyToken ทั้งหมด

import { runTurso } from './_turso-shared.js';

export async function onRequestPost(context) {
  const { LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET, WEBAPP_URL } = context.env;
  const webUrl = (WEBAPP_URL || 'https://stroke-prh.pages.dev').replace(/\/$/, '');

  // Verify signature
  if (LINE_CHANNEL_SECRET) {
    const rawBody = await context.request.clone().text();
    const sig = context.request.headers.get('x-line-signature') || '';
    if (!(await verifySignature(LINE_CHANNEL_SECRET, rawBody, sig))) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  let payload;
  try { payload = await context.request.json(); }
  catch { return new Response('Bad Request', { status: 400 }); }

  // สร้าง tables ถ้ายังไม่มี
  await initTables(context.env);

  for (const event of payload.events || []) {
    const src = event.source || {};
    const groupId = src.groupId;
    const userId  = src.userId;
    const replyToken = event.replyToken;

    // ── Bot ถูก add เข้า group ──────────────────────────────────
    if (event.type === 'join' && groupId) {
      await saveGroup(context.env, groupId);
      // Reply welcome (ฟรี)
      await replyText(
        LINE_CHANNEL_ACCESS_TOKEN, replyToken,
        `✅ Stroke Fast Track Bot พร้อมทำงานในกลุ่มนี้แล้วค่ะ\n\nระบบจะส่ง Alert + ใบ Refer มาที่กลุ่มนี้เมื่อมีการ Activate Stroke\n\nดูระบบ: ${webUrl}`
      );
    }

    // ── Bot ถูกเตะออก ────────────────────────────────────────────
    if (event.type === 'leave' && groupId) {
      await removeGroup(context.env, groupId);
    }

    // ── มีคนกด Follow OA ────────────────────────────────────────
    if (event.type === 'follow' && userId) {
      await saveUser(context.env, userId);
    }

    // ── ข้อความใน group หรือ 1-on-1 ────────────────────────────
    if (event.type === 'message' && event.message?.type === 'text' && replyToken) {
      const text = (event.message.text || '').trim().toLowerCase();
      if (text === 'refer' || text === 'ใบ refer') {
        await replyText(
          LINE_CHANNEL_ACCESS_TOKEN, replyToken,
          `📋 ดูใบ Refer ล่าสุด:\n${webUrl}/refer-view`
        );
      }
    }
  }

  return new Response('OK', { status: 200 });
}

// ── Turso helpers ────────────────────────────────────────────────────

async function initTables(env) {
  await runTurso(env, [
    {
      sql: `CREATE TABLE IF NOT EXISTS line_groups (
        group_id   TEXT PRIMARY KEY,
        ward_name  TEXT,
        joined_at  TEXT
      )`
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS line_users (
        user_id    TEXT PRIMARY KEY,
        followed_at TEXT
      )`
    }
  ]);
}

async function saveGroup(env, groupId) {
  await runTurso(env, [{
    sql: `INSERT OR IGNORE INTO line_groups (group_id, joined_at)
          VALUES (?, ?)`,
    args: [groupId, new Date().toISOString()]
  }]);
}

async function removeGroup(env, groupId) {
  await runTurso(env, [{
    sql: `DELETE FROM line_groups WHERE group_id = ?`,
    args: [groupId]
  }]);
}

async function saveUser(env, userId) {
  await runTurso(env, [{
    sql: `INSERT OR IGNORE INTO line_users (user_id, followed_at)
          VALUES (?, ?)`,
    args: [userId, new Date().toISOString()]
  }]);
}

// ── LINE API helpers ─────────────────────────────────────────────────

async function replyText(token, replyToken, text) {
  if (!token || !replyToken) return;
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }]
    })
  });
}

async function verifySignature(secret, body, signature) {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
    return expected === signature;
  } catch { return false; }
}
