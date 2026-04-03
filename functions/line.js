// functions/line.js — LINE Messaging API
// POST /line -> ส่ง Stroke alert + ใบ Refer link เข้า LINE group
// ข้อมูลผู้ป่วยฝังใน URL (?d=base64) ไม่เก็บใน DB — PDPA safe

import { runTurso } from './_turso-shared.js';

export async function onRequestPost(context) {
  const { LINE_CHANNEL_ACCESS_TOKEN, WEBAPP_URL } = context.env;
  if (!LINE_CHANNEL_ACCESS_TOKEN)
    return Response.json({ error: 'LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า' }, { status: 503 });

  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { type, data = {} } = body;
  const webUrl   = (WEBAPP_URL || 'https://stroke-prh.pages.dev').replace(/\/$/, '');
  const referUrl = buildReferUrl(webUrl, data);   // URL พร้อมข้อมูลฝังไว้
  const messages = buildFlex(type, data, webUrl, referUrl);
  const groups   = await getGroups(context.env);

  let result;
  if (groups.length > 0)
    result = await pushAll(LINE_CHANNEL_ACCESS_TOKEN, groups, messages);
  else
    result = await broadcast(LINE_CHANNEL_ACCESS_TOKEN, messages);

  return Response.json({ ok: true, method: groups.length ? 'group_push' : 'broadcast', ...result });
}

export async function onRequestGet(context) {
  const groups = await getGroups(context.env);
  return Response.json({ ok: true, groups: groups.length,
    list: groups.map(g => ({ id: g.group_id, ward: g.ward_name || '?' })) });
}

// -- URL builder: ฝังข้อมูลใน base64 param ---------------------------

function buildReferUrl(webUrl, d) {
  const payload = {
    ward: d.ward||null, hn: d.hn||null, age: d.age||null, sex: d.sex||null,
    onset_time: d.onset_time||null, onset_hours: d.onset_hours??null,
    nihss: d.nihss??null, nihss_sev: d.nihss_sev||null,
    ct_result: d.ct_result||null, bp: d.bp||null, inr: d.inr||null,
    action: d.action||null, dtn: d.dtn??null,
    refer_destination: d.refer_destination||null,
    refer_reason: d.refer_reason||null,
  };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  return `${webUrl}/refer-view?d=${b64}`;
}

// -- Flex message -----------------------------------------------------

function buildFlex(type, d, webUrl, referUrl) {
  const isRefer = type === 'refer_alert';
  const ward    = d.ward    || '-';
  const nihss   = d.nihss  != null ? String(d.nihss) : '-';
  const sev     = d.nihss_sev || '';
  const onset   = d.onset_hours != null ? `${d.onset_hours} ชม.` : (d.onset_time||'-');
  const ct      = d.ct_result  || '-';
  const hdrBg   = isRefer ? '#C1121F' : '#1B4F72';
  const hdrTx   = isRefer ? '🚨 Refer Stroke — รพ.สงฆ์' : '🚨 Stroke Alert — รพ.สงฆ์';

  const bodyContents = [
    row('Ward',   ward),
    row('Onset',  onset),
    row('NIHSS',  sev ? `${nihss} (${sev})` : nihss),
    row('CT',     ct),
    ...(d.dtn ? [row('DTN', `${d.dtn} นาที`)] : []),
    ...(isRefer ? [
      { type: 'separator', margin: 'md' },
      { type: 'text', text: 'ไม่ได้ให้การรักษาที่นี่ — กรุณา Refer',
        size: 'sm', color: '#C1121F', weight: 'bold', margin: 'md' }
    ] : [])
  ];

  return [{
    type: 'flex',
    altText: `${isRefer?'Refer':'Stroke Alert'} — Ward ${ward} | NIHSS ${nihss} | Onset ${onset}`,
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: hdrBg,
        contents: [{ type: 'text', text: hdrTx, color: '#ffffff', weight: 'bold', size: 'md' }]
      },
      body:   { type: 'box', layout: 'vertical', spacing: 'sm', contents: bodyContents },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', color: hdrBg,
            action: { type: 'uri', label: '📋 เปิดใบ Refer PDF', uri: referUrl } },
          { type: 'button', style: 'secondary',
            action: { type: 'uri', label: '🧠 ระบบ Stroke Fast Track', uri: webUrl } }
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
      { type: 'text', text: String(value), size: 'sm', color: '#111111', flex: 5, weight: 'bold', wrap: true }
    ]
  };
}

// -- Turso ------------------------------------------------------------

async function getGroups(env) {
  try {
    await runTurso(env, [{ sql: `CREATE TABLE IF NOT EXISTS line_groups
      (group_id TEXT PRIMARY KEY, ward_name TEXT, joined_at TEXT)` }]);
    const res = await runTurso(env, [{ sql: 'SELECT group_id, ward_name FROM line_groups LIMIT 20' }]);
    const rows = res?.results?.[0]?.response?.result?.rows || [];
    const cols = res?.results?.[0]?.response?.result?.cols || [];
    if (!rows.length) return [];
    return rows.map(r => Object.fromEntries(cols.map((c,i) => [c.name, r[i]?.value??r[i]])));
  } catch { return []; }
}

// -- LINE API ---------------------------------------------------------

async function pushAll(token, groups, messages) {
  const results = await Promise.all(groups.map(g =>
    fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ to: g.group_id, messages })
    }).then(r => ({ gid: g.group_id, ok: r.ok, status: r.status }))
  ));
  return { results };
}

async function broadcast(token, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ messages })
  });
  return { ok: res.ok, status: res.status };
}
