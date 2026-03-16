// functions/line.js ? LINE Messaging API (Broadcast only)
// POST /line  ? ??? alert ??? Staff Wizard ? Broadcast ?????????? Follow OA
// GET  /line  ? status check
//
// ENV (Cloudflare Pages ? Settings ? Environment Variables):
//   LINE_CHANNEL_ACCESS_TOKEN  = ??? LINE Developers ? Messaging API
//   WEBAPP_URL                 = https://stroke-prh.pages.dev
//   TURSO_URL / TURSO_TOKEN    = ?????????? template ??????? LINE ???????? settings
//
// ???????:
//   1. ????? LINE OA ? ???????????????? + ??? refer ??? Add OA ??????????
//   2. ???????? Follow ???????? alert ?????????????? Staff ???????????
//   3. ???? 1 token ??? 1 ?????????? ???????????? follow ?????

import { runTurso } from './_turso-shared.js';

const DEFAULT_STROKE_TEMPLATE = `Stroke Alert — รพ.สงฆ์
-------------------------
Ward: {{ward}}
Onset: {{onset}} ชม.
NIHSS: {{nihss}} — {{nihss_sev}}
CT: {{ct}}
{{dtn_line}}
-------------------------
รายละเอียด: {{web_url}}`;

const DEFAULT_REFER_TEMPLATE = `REFER — Stroke Fast Tract
-------------------------
Ward: {{ward}}
Onset: {{onset}} ชม.
NIHSS: {{nihss}} — {{nihss_sev}}
CT: {{ct}}
Refer — ไม่ได้ให้ที่รพ.สงฆ์
{{dtn_line}}
-------------------------
รายละเอียด: {{web_url}}
กรุณาติดต่อกลับโดยด่วน`;

export async function onRequestPost(context) {
  const { LINE_CHANNEL_ACCESS_TOKEN, WEBAPP_URL } = context.env;

  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    return Response.json({
      error: 'LINE_CHANNEL_ACCESS_TOKEN ???????????????? ? ????? Cloudflare Pages ? Settings ? Environment Variables'
    }, { status: 503 });
  }

  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { type, data } = body;
  const webUrl = (WEBAPP_URL || 'https://stroke-prh.pages.dev').replace(/\/$/, '');
  const messages = await buildMessage(context.env, type, data, webUrl);

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

async function getTemplate(env, key, fallback) {
  try {
    await runTurso(env, [{
      sql: `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )`
    }]);
    const res = await runTurso(env, [{
      sql: 'SELECT value FROM settings WHERE key = ? LIMIT 1',
      args: [key]
    }]);
    const rows = res?.results?.[0]?.response?.result?.rows || [];
    const cols = res?.results?.[0]?.response?.result?.cols || [];
    if (!rows.length || !cols.length) return fallback;
    const row = Object.fromEntries(cols.map((c, i) => [c.name, rows[0][i]?.value ?? rows[0][i]]));
    return row.value || fallback;
  } catch {
    return fallback;
  }
}

function applyTemplate(tpl, data) {
  let out = tpl;
  Object.keys(data).forEach(k => {
    const re = new RegExp(`{{\\s*${k}\\s*}}`, 'g');
    out = out.replace(re, data[k] == null ? '' : String(data[k]));
  });
  return out;
}

async function buildMessage(env, type, data = {}, webUrl) {
  const d = data || {};
  const isRefer = type === 'refer_alert';
  const key = isRefer ? 'line_template_refer' : 'line_template_stroke';
  const fallback = isRefer ? DEFAULT_REFER_TEMPLATE : DEFAULT_STROKE_TEMPLATE;
  const tpl = await getTemplate(env, key, fallback);

  const dtnLine = d.dtn ? `? DTN: ${d.dtn} ????` : '';

  const text = applyTemplate(tpl, {
    ward: d.ward || '',
    onset: d.onset != null ? d.onset : '',
    nihss: d.nihss != null ? d.nihss : '',
    nihss_sev: d.nihss_sev || '',
    ct: d.ct || '',
    action: d.action || '',
    dtn: d.dtn != null ? d.dtn : '',
    dtn_line: dtnLine,
    web_url: webUrl,
  });

  return [{ type: 'text', text }];
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
