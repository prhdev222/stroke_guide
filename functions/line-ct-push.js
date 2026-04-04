// POST /line-ct-push — ส่งข้อความ+ลิงก์ CT ผ่าน LINE Messaging API (push/broadcast)
// body: { "text": "..." }  (ไม่เกิน ~5000 ตัวอักษร)
//
// ลำดับปลายทาง:
//   1) LINE_NEURO_USER_ID (U...) — push 1:1
//   2) LINE_REFER_USER_ID (C... กลุ่ม) — push เข้ากลุ่ม
//   3) กลุ่มในตาราง line_groups (Turso) — เหมือน /line
//   4) broadcast — ทุกคนที่ add OA

import { runTurso } from './_turso-shared.js';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const LINE_BROADCAST_URL = 'https://api.line.me/v2/bot/message/broadcast';

async function getGroups(env) {
  try {
    await runTurso(env, [
      {
        sql: `CREATE TABLE IF NOT EXISTS line_groups (
        group_id  TEXT PRIMARY KEY,
        ward_name TEXT,
        joined_at TEXT
      )`,
      },
    ]);
    const res = await runTurso(env, [
      { sql: `SELECT group_id, ward_name FROM line_groups LIMIT 20` },
    ]);
    return toRows(res);
  } catch {
    return [];
  }
}

function toRows(res) {
  const rows = res?.results?.[0]?.response?.result?.rows || [];
  const cols = res?.results?.[0]?.response?.result?.cols || [];
  if (!rows.length || !cols.length) return [];
  return rows.map((r) =>
    Object.fromEntries(cols.map((c, i) => [c.name, r[i]?.value ?? r[i]]))
  );
}

async function pushTo(token, to, messages) {
  const res = await fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages }),
  });
  const raw = await res.text();
  return { ok: res.ok, status: res.status, body: raw.slice(0, 300) };
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const token = env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    return Response.json(
      { error: 'LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า' },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const text = body.text != null ? String(body.text).trim() : '';
  if (!text) {
    return Response.json({ error: 'ต้องส่ง text' }, { status: 400 });
  }
  if (text.length > 4800) {
    return Response.json({ error: 'ข้อความยาวเกิน' }, { status: 400 });
  }

  const messages = [{ type: 'text', text }];

  const neuroId =
    env.LINE_NEURO_USER_ID && String(env.LINE_NEURO_USER_ID).trim();
  const referId =
    env.LINE_REFER_USER_ID && String(env.LINE_REFER_USER_ID).trim();

  const pushed = [];

  if (neuroId) {
    const r = await pushTo(token, neuroId, messages);
    pushed.push({ target: 'LINE_NEURO_USER_ID', ...r });
    if (!r.ok) {
      return Response.json(
        {
          ok: false,
          error: 'LINE ปฏิเสธการส่ง (ตรวจ User ID / ว่า Neuro add OA แล้ว)',
          detail: r.body,
        },
        { status: 502 }
      );
    }
    return Response.json({ ok: true, method: 'push_neuro', pushed });
  }

  if (referId) {
    const r = await pushTo(token, referId, messages);
    pushed.push({ target: 'LINE_REFER_USER_ID', ...r });
    if (!r.ok) {
      return Response.json(
        {
          ok: false,
          error: 'LINE ปฏิเสธการส่งเข้ากลุ่ม (ตรวจว่า OA อยู่ในกลุ่ม)',
          detail: r.body,
        },
        { status: 502 }
      );
    }
    return Response.json({ ok: true, method: 'push_refer_group', pushed });
  }

  const groups = await getGroups(env);
  if (groups.length > 0) {
    const results = await Promise.all(
      groups.map((g) =>
        pushTo(token, g.group_id, messages).then((r) => ({
          group_id: g.group_id,
          ...r,
        }))
      )
    );
    const anyOk = results.some((x) => x.ok);
    if (!anyOk) {
      return Response.json(
        {
          ok: false,
          error: 'ส่งเข้ากลุ่มใน Turso ไม่สำเร็จ',
          results,
        },
        { status: 502 }
      );
    }
    return Response.json({ ok: true, method: 'group_push', results });
  }

  const res = await fetch(LINE_BROADCAST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages }),
  });
  const raw = await res.text();
  if (!res.ok) {
    return Response.json(
      {
        ok: false,
        error: 'Broadcast ไม่สำเร็จ — ตั้ง LINE_NEURO_USER_ID หรือเพิ่มบอทในกลุ่ม',
        detail: raw.slice(0, 300),
      },
      { status: 502 }
    );
  }
  return Response.json({ ok: true, method: 'broadcast', status: res.status });
}
