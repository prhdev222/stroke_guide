// Cloudflare Pages Function — Admin จัดการรหัสหน่วย (ward) ใน Turso
// POST body: { admin_secret, action: 'list'|'set'|'delete', ward_code?, pin?, label? }
// ต้องตั้ง ADMIN_SECRET ใน Environment Variables

import { runTurso } from './_turso-shared.js';

export async function onRequestPost(context) {
  const { env } = context;
  const adminSecret = env.ADMIN_SECRET;
  if (!adminSecret) {
    return Response.json({ error: 'ADMIN_SECRET not configured' }, { status: 503 });
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.admin_secret !== adminSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const action = body.action || 'list';
  const wardCode = body.ward_code != null ? String(body.ward_code).trim() : '';
  const pin = body.pin != null ? String(body.pin).trim() : '';
  const label = body.label != null ? String(body.label).trim() : '';

  try {
    await runTurso(env, [
      { sql: `CREATE TABLE IF NOT EXISTS ward_pins (
        ward_code TEXT PRIMARY KEY,
        pin TEXT NOT NULL,
        label TEXT
      )` }
    ]);

    if (action === 'list') {
      const res = await runTurso(env, [
        { sql: 'SELECT ward_code, label FROM ward_pins ORDER BY ward_code' }
      ]);
      const rows = res?.results?.[0]?.response?.result?.rows || [];
      const cols = res?.results?.[0]?.response?.result?.cols || [];
      const wards = rows.map(r => Object.fromEntries((cols || []).map((c, i) => [c.name, r[i]?.value ?? r[i]])));
      return Response.json({ ok: true, wards });
    }

    if (action === 'set') {
      if (!wardCode) return Response.json({ error: 'Missing ward_code' }, { status: 400 });
      if (!pin || pin.length !== 4 || !/^\d+$/.test(pin)) {
        return Response.json({ error: 'pin must be 4 digits' }, { status: 400 });
      }
      await runTurso(env, [
        { sql: `INSERT INTO ward_pins(ward_code, pin, label) VALUES(?,?,?) 
                 ON CONFLICT(ward_code) DO UPDATE SET pin=excluded.pin, label=excluded.label`, args: [wardCode, pin, label || wardCode] }
      ]);
      return Response.json({ ok: true });
    }

    if (action === 'delete') {
      if (!wardCode) return Response.json({ error: 'Missing ward_code' }, { status: 400 });
      await runTurso(env, [
        { sql: 'DELETE FROM ward_pins WHERE ward_code = ?', args: [wardCode] }
      ]);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
