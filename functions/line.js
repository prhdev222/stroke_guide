// functions/line.js  — LINE Messaging API
//
// POST /line  →  ส่ง Stroke alert
//   body: { type, data: { ward, onset, nihss, nihss_sev, ct, dtn, action } }
//
// Logic การส่ง (เรียงลำดับ priority):
//   1. ถ้ามี group ที่ชื่อ ward ตรงกัน → push เข้า group นั้น  (targeted)
//   2. ถ้ามี group ใดๆ ใน DB เลย       → push ทุก group       (all groups)
//   3. ไม่มี group เลย                 → broadcast ปกติ       (fallback)
//
// Token ที่เสีย: 1 ต่อ 1 destination เสมอ

import { runTurso } from './_turso-shared.js';

const REFER_VIEW_PATH = '/refer-view';

export async function onRequestPost(context) {
  const { LINE_CHANNEL_ACCESS_TOKEN, WEBAPP_URL } = context.env;
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    return Response.json({ error: 'LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า' }, { status: 503 });
  }

  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { type, data = {} } = body;
  const webUrl = (WEBAPP_URL || 'https://stroke-prh.pages.dev').replace(/\/$/, '');

  // สร้าง messages
  const messages = buildMessages(type, data, webUrl);

  // หา group ที่เกี่ยวข้อง
  const groups = await getGroups(context.env, data.ward);

  let result;
  if (groups.length > 0) {
    // ส่งเข้าทุก group ที่เจอ
    result = await pushToGroups(LINE_CHANNEL_ACCESS_TOKEN, groups, messages);
  } else {
    // fallback: broadcast
    result = await sendBroadcast(LINE_CHANNEL_ACCESS_TOKEN, messages);
  }

  return Response.json({ ok: true, method: groups.length > 0 ? 'group_push' : 'broadcast', groups: groups.map(g => g.ward_name || g.group_id), ...result });
}

export async function onRequestGet(context) {
  const groups = await getGroups(context.env);
  return Response.json({
    ok: true,
    configured: !!context.env.LINE_CHANNEL_ACCESS_TOKEN,
    groups: groups.length,
    group_list: groups.map(g => ({ id: g.group_id, ward: g.ward_name || '(ยังไม่ตั้งชื่อ)' }))
  });
}

// ── Message builder ──────────────────────────────────────────────────

function buildMessages(type, d, webUrl) {
  const isRefer = type === 'refer_alert';
  const nihss   = d.nihss != null ? d.nihss : '-';
  const sev     = d.nihss_sev || '';
  const onset   = d.onset  != null ? `${d.onset} ชม.` : '-';
  const ward    = d.ward   || '-';
  const ct      = d.ct     || '-';
  const dtnLine = d.dtn    ? `⏱ DTN: ${d.dtn} นาที` : '';
  const referUrl = `${webUrl}${REFER_VIEW_PATH}`;

  if (isRefer) {
    // Flex message: สวยกว่า text ธรรมดา แต่ fallback เป็น text ได้
    return [{
      type: 'flex',
      altText: `🚨 Refer Stroke — Ward ${ward} | NIHSS ${nihss}`,
      contents: {
        type: 'bubble',
        size: 'kilo',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#C1121F',
          contents: [{
            type: 'text',
            text: '🚨 Refer Stroke — รพ.สงฆ์',
            color: '#ffffff',
            weight: 'bold',
            size: 'md'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            row('Ward', ward),
            row('Onset', onset),
            row('NIHSS', `${nihss}${sev ? ' — ' + sev : ''}`),
            row('CT Brain', ct),
            ...(dtnLine ? [row('DTN', dtnLine)] : []),
            { type: 'separator', margin: 'md' },
            {
              type: 'text',
              text: 'ไม่ได้ให้การรักษาที่ รพ.สงฆ์ — กรุณา Refer',
              size: 'sm',
              color: '#C1121F',
              weight: 'bold',
              margin: 'md'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#C1121F',
              action: {
                type: 'uri',
                label: '📋 เปิดใบ Refer PDF',
                uri: referUrl
              }
            },
            {
              type: 'button',
              style: 'secondary',
              action: {
                type: 'uri',
                label: '🔗 ระบบ Stroke Fast Track',
                uri: webUrl
              }
            }
          ]
        }
      }
    }];
  }

  // Stroke alert ปกติ
  return [{
    type: 'flex',
    altText: `🚨 Stroke Alert — Ward ${ward} | NIHSS ${nihss} | Onset ${onset}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1B4F72',
        contents: [{
          type: 'text',
          text: '🚨 Stroke Alert — รพ.สงฆ์',
          color: '#ffffff',
          weight: 'bold',
          size: 'md'
        }]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          row('Ward', ward),
          row('Onset', onset),
          row('NIHSS', `${nihss}${sev ? ' — ' + sev : ''}`),
          row('CT Brain', ct),
          ...(dtnLine ? [row('', dtnLine)] : [])
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#1B4F72',
            action: {
              type: 'uri',
              label: '📋 ดูใบ Refer + ข้อมูลเคส',
              uri: referUrl
            }
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'uri',
              label: '🧠 ประเมิน NIHSS',
              uri: webUrl
            }
          }
        ]
      }
    }
  }];
}

function row(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#888888', flex: 2 },
      { type: 'text', text: value, size: 'sm', color: '#222222', flex: 5, weight: 'bold', wrap: true }
    ]
  };
}

// ── Turso: ดึง group ─────────────────────────────────────────────────

async function getGroups(env, wardName) {
  try {
    await runTurso(env, [{
      sql: `CREATE TABLE IF NOT EXISTS line_groups (
        group_id  TEXT PRIMARY KEY,
        ward_name TEXT,
        joined_at TEXT
      )`
    }]);

    // ถ้าระบุ wardName → หา group ที่ชื่อตรงก่อน
    if (wardName) {
      const res = await runTurso(env, [{
        sql: `SELECT group_id, ward_name FROM line_groups
              WHERE LOWER(ward_name) = LOWER(?) LIMIT 5`,
        args: [wardName]
      }]);
      const rows = toRows(res);
      if (rows.length > 0) return rows;
    }

    // ถ้าไม่เจอ ward ที่ตรง → เอาทุก group
    const res = await runTurso(env, [{
      sql: `SELECT group_id, ward_name FROM line_groups LIMIT 20`
    }]);
    return toRows(res);
  } catch {
    return [];
  }
}

function toRows(res) {
  const rows = res?.results?.[0]?.response?.result?.rows || [];
  const cols = res?.results?.[0]?.response?.result?.cols || [];
  if (!rows.length || !cols.length) return [];
  return rows.map(r =>
    Object.fromEntries(cols.map((c, i) => [c.name, r[i]?.value ?? r[i]]))
  );
}

// ── LINE API ─────────────────────────────────────────────────────────

async function pushToGroups(token, groups, messages) {
  const results = await Promise.all(
    groups.map(g =>
      fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ to: g.group_id, messages })
      }).then(r => ({ groupId: g.group_id, ok: r.ok, status: r.status }))
    )
  );
  return { results };
}

async function sendBroadcast(token, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ messages })
  });
  return { ok: res.ok, status: res.status };
}
