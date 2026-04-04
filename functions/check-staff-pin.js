// Cloudflare Pages Function — ตรวจรหัส Staff ตามหน่วย (ward)
// POST body: { pin: "1234" }
// คืนค่า: { ok: true, ward_code, label } หรือ { ok: false }
// บันทึกการเข้าระบบลง staff_login_log ใน Turso

import { runTurso } from './_turso-shared.js';
import { findWardByPin } from './_ward-pin-shared.js';

export async function onRequestPost(context) {
  const { env } = context;
  let body;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const pin = body.pin != null ? String(body.pin).trim() : '';
  if (!pin) return Response.json({ ok: false, error: 'Missing pin' }, { status: 400 });

  try {
    const match = await findWardByPin(env, pin);
    if (!match) {
      return Response.json({ ok: false }, { status: 200 });
    }

    const wardCode = match.ward_code || '';
    const label = match.label != null ? match.label : wardCode;

    await runTurso(env, [
      {
        sql: `INSERT INTO staff_login_log (ward_code, logged_at) VALUES (?, datetime('now','localtime'))`,
        args: [wardCode],
      },
    ]);

    return Response.json({ ok: true, ward_code: wardCode, label: label });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
