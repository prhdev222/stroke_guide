// functions/line.js — LINE Messaging API
//
// POST /line  → ส่ง Stroke alert เข้า LINE Group
//   body: { type, data: { ward, onset, nihss, nihss_sev, ct, dtn, action, bp, inr, dest, reason } }
//
// ✅ PDPA: ไม่เก็บข้อมูลใน Turso เลย
//         encode ข้อมูล clinical (ไม่มี HN/ชื่อ) เป็น base64 ใส่ URL
//         link หมดอายุ 4 ชั่วโมง (timestamp อยู่ใน payload)
//
// Token ที่เสีย: 1 ต่อ 1 destination

import { runTurso } from './_turso-shared.js';

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

  // encode ข้อมูล clinical (ไม่มี PII) เป็น base64 → ใส่ใน URL ปุ่มใบ Refer
  const referUrl = buildReferUrl(webUrl, data);

  // ดึงข้อความเสริม (prefix/suffix) ที่ admin ปรับได้
  const extras = await getLineExtras(context.env);

  // สร้าง Flex message
  const messages = buildMessages(type, data, webUrl, referUrl, extras);

  // หา LINE Group จาก Turso
  const groups = await getGroups(context.env);

  let result;
  if (groups.length > 0) {
    result = await pushToGroups(LINE_CHANNEL_ACCESS_TOKEN, groups, messages);
  } else {
    // fallback broadcast ถ้ายังไม่มี group
    result = await sendBroadcast(LINE_CHANNEL_ACCESS_TOKEN, messages);
  }

  return Response.json({
    ok: true,
    method: groups.length > 0 ? 'group_push' : 'broadcast',
    refer_url: referUrl,
    ...result
  });
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

// ── Encode clinical data → URL param ──────────────────────────────────
// ไม่มี HN ไม่มีชื่อ — เฉพาะข้อมูลที่ Neuro ต้องการตัดสินใจ

function buildReferUrl(webUrl, d) {
  const payload = {
    ward:      d.ward      || '',
    onset:     d.onset     ?? '',
    nihss:     d.nihss     ?? '',
    nihss_sev: d.nihss_sev || '',
    ct:        d.ct        || '',
    action:    d.action    || '',
    dtn:       d.dtn       ?? '',
    bp:        d.bp        || '',
    inr:       d.inr       || '',
    dest:      d.dest      || 'สถาบันประสาทวิทยา',
    reason:    d.reason    || '',
    ts: new Date().toISOString()  // สำหรับตรวจ expiry 4 ชม.
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  const encoded = btoa(binary)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${webUrl}/refer-view?d=${encoded}`;
}

// ── Flex Message builder ───────────────────────────────────────────────

function buildMessages(type, d, webUrl, referUrl, extras) {
  const isRefer = type === 'refer_alert';
  const nihss   = d.nihss   != null ? String(d.nihss) : '-';
  const sev     = d.nihss_sev || '';
  const onset   = d.onset   != null ? `${d.onset} ชม.` : '-';
  const ward    = d.ward    || '-';
  const ct      = d.ct      || '-';
  const dtnLine = d.dtn     ? `⏱ DTN: ${d.dtn} นาที` : '';

  const headerColor = isRefer ? '#C1121F' : '#1B4F72';
  const headerText  = isRefer
    ? '🚨 Refer Stroke — รพ.สงฆ์'
    : '🚨 Stroke Alert — รพ.สงฆ์';
  const altText = isRefer
    ? `🚨 Refer Stroke — Ward ${ward} | NIHSS ${nihss}`
    : `🚨 Stroke Alert — Ward ${ward} | NIHSS ${nihss} | Onset ${onset}`;

  const bodyRows = [
    ...(getExtra(type, 'prefix', extras)
      ? [
        extraText(getExtra(type, 'prefix', extras)),
        { type: 'separator', margin: 'md' }
      ]
      : []),
    row('Ward',    ward),
    row('Onset',   onset),
    row('NIHSS',   `${nihss}${sev ? ' — ' + sev : ''}`),
    row('CT Brain', ct),
    ...(dtnLine ? [row('DTN', dtnLine)] : []),
    ...(isRefer ? [
      { type: 'separator', margin: 'md' },
      { type: 'text', text: 'ไม่ได้ให้การรักษาที่ รพ.สงฆ์ — กรุณา Refer',
        size: 'sm', color: '#C1121F', weight: 'bold', margin: 'md' }
    ] : [])
    ,
    ...(getExtra(type, 'suffix', extras)
      ? [
        { type: 'separator', margin: 'md' },
        extraText(getExtra(type, 'suffix', extras))
      ]
      : [])
  ];

  return [{
    type: 'flex',
    altText,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        backgroundColor: headerColor,
        contents: [{ type: 'text', text: headerText,
          color: '#ffffff', weight: 'bold', size: 'md' }]
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: bodyRows
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          {
            type: 'button', style: 'primary', color: headerColor,
            action: { type: 'uri', label: '📋 เปิดใบ Refer PDF', uri: referUrl }
          },
          {
            type: 'button', style: 'secondary',
            action: { type: 'uri', label: '🔗 เปิดระบบ', uri: webUrl }
          }
        ]
      }
    }
  }];
}

function row(label, value) {
  return {
    type: 'box', layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#888888', flex: 2 },
      { type: 'text', text: String(value), size: 'sm', color: '#222222',
        flex: 5, weight: 'bold', wrap: true }
    ]
  };
}

function extraText(text) {
  return { type: 'text', text: String(text || ''), size: 'sm', wrap: true, color: '#444444', margin: 'md' };
}

function getExtra(type, pos, extras) {
  const isRefer = type === 'refer_alert';
  if (!extras) return '';
  if (isRefer) return pos === 'prefix' ? (extras.referPrefix || '') : (extras.referSuffix || '');
  return pos === 'prefix' ? (extras.strokePrefix || '') : (extras.strokeSuffix || '');
}

// ── Turso: ดึง LINE groups ─────────────────────────────────────────────

async function getGroups(env) {
  try {
    await runTurso(env, [{
      sql: `CREATE TABLE IF NOT EXISTS line_groups (
        group_id  TEXT PRIMARY KEY,
        ward_name TEXT,
        joined_at TEXT
      )`
    }]);
    const res = await runTurso(env, [{
      sql: `SELECT group_id, ward_name FROM line_groups LIMIT 20`
    }]);
    return toRows(res);
  } catch { return []; }
}

async function getLineExtras(env) {
  const out = { strokePrefix: '', strokeSuffix: '', referPrefix: '', referSuffix: '' };
  try {
    await runTurso(env, [{
      sql: `CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      )`
    }]);
    const res = await runTurso(env, [{
      sql: `SELECT key, value FROM settings WHERE key IN (
        'line_extra_stroke_prefix','line_extra_stroke_suffix',
        'line_extra_refer_prefix','line_extra_refer_suffix'
      )`
    }]);
    const rows = toRows(res);
    rows.forEach(r => {
      const v = r.value != null ? String(r.value) : '';
      if (r.key === 'line_extra_stroke_prefix') out.strokePrefix = v;
      if (r.key === 'line_extra_stroke_suffix') out.strokeSuffix = v;
      if (r.key === 'line_extra_refer_prefix') out.referPrefix = v;
      if (r.key === 'line_extra_refer_suffix') out.referSuffix = v;
    });
  } catch {}
  return out;
}

function toRows(res) {
  const rows = res?.results?.[0]?.response?.result?.rows || [];
  const cols = res?.results?.[0]?.response?.result?.cols || [];
  if (!rows.length || !cols.length) return [];
  return rows.map(r =>
    Object.fromEntries(cols.map((c, i) => [c.name, r[i]?.value ?? r[i]]))
  );
}

// ── LINE API ───────────────────────────────────────────────────────────

async function pushToGroups(token, groups, messages) {
  const results = await Promise.all(
    groups.map(g =>
      fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ to: g.group_id, messages })
      }).then(r => ({ groupId: g.group_id, ok: r.ok, status: r.status }))
    )
  );
  return { results };
}

async function sendBroadcast(token, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ messages })
  });
  return { ok: res.ok, status: res.status };
}
