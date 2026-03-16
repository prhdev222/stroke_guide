// Cloudflare Pages Function — ตรวจรหัส Staff ตามหน่วย (ward)
// POST body: { pin: "1234" }
// คืนค่า: { ok: true, ward_code, label } หรือ { ok: false }
// บันทึกการเข้าระบบลง staff_login_log ใน Turso

import { runTurso } from './_turso-shared.js';

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
    // สร้างตารางถ้ายังไม่มี
    await runTurso(env, [
      { sql: `CREATE TABLE IF NOT EXISTS ward_pins (
        ward_code TEXT PRIMARY KEY,
        pin TEXT NOT NULL,
        label TEXT
      )` },
      { sql: `CREATE TABLE IF NOT EXISTS staff_login_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ward_code TEXT NOT NULL,
        logged_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      )` }
    ]);

    // ดึงรายการรหัสหน่วยทั้งหมด (ตรวจฝั่ง server เท่านั้น — ไม่ส่งรหัสกลับไปที่ client)
    const selectRes = await runTurso(env, [
      { sql: 'SELECT ward_code, pin, label FROM ward_pins' }
    ]);
    const rows = selectRes?.results?.[0]?.response?.result?.rows || [];
    const cols = selectRes?.results?.[0]?.response?.result?.cols || [];
    const list = rows.map(r => Object.fromEntries((cols || []).map((c, i) => [c.name, r[i]?.value ?? r[i]])));

    const match = list.find(w => w.pin === pin);
    if (!match) {
      return Response.json({ ok: false }, { status: 200 });
    }

    const wardCode = match.ward_code || '';
    const label = match.label != null ? match.label : wardCode;

    // บันทึก log การเข้าใช้งาน
    await runTurso(env, [
      { sql: `INSERT INTO staff_login_log (ward_code, logged_at) VALUES (?, datetime('now','localtime'))`, args: [wardCode] }
    ]);

    return Response.json({ ok: true, ward_code: wardCode, label: label });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
