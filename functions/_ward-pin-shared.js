// ค้นหาหน่วยจาก PIN ใน Turso (ward_pins) — ใช้ร่วม check-staff-pin + ct-temp/session
import { runTurso } from './_turso-shared.js';

export async function ensureWardPinsTables(env) {
  await runTurso(env, [
    {
      sql: `CREATE TABLE IF NOT EXISTS ward_pins (
        ward_code TEXT PRIMARY KEY,
        pin TEXT NOT NULL,
        label TEXT
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS staff_login_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ward_code TEXT NOT NULL,
        logged_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      )`,
    },
  ]);
}

/** @returns {Promise<{ ward_code: string, label: string } | null>} */
export async function findWardByPin(env, pin) {
  const p = pin != null ? String(pin).trim() : '';
  if (!p) return null;
  await ensureWardPinsTables(env);
  const selectRes = await runTurso(env, [
    { sql: 'SELECT ward_code, pin, label FROM ward_pins' },
  ]);
  const rows = selectRes?.results?.[0]?.response?.result?.rows || [];
  const cols = selectRes?.results?.[0]?.response?.result?.cols || [];
  const list = rows.map((r) =>
    Object.fromEntries((cols || []).map((c, i) => [c.name, r[i]?.value ?? r[i]]))
  );
  const match = list.find((w) => String(w.pin != null ? w.pin : '').trim() === p);
  if (!match) return null;
  const wardCode = match.ward_code || '';
  const label = match.label != null ? match.label : wardCode;
  return { ward_code: wardCode, label };
}
