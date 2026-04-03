// functions/line-groups-admin.js
// GET  /line-groups-admin         → ดู group ทั้งหมดที่ bot อยู่
// POST /line-groups-admin         → ตั้งชื่อ ward ให้ groupId
//   body: { group_id, ward_name }
//
// ใช้ตอนตั้งค่าครั้งแรก: bot join group แล้ว → มา assign ชื่อ ward

import { runTurso } from './_turso-shared.js';

export async function onRequestGet(context) {
  try {
    const res = await runTurso(context.env, [{
      sql: `SELECT group_id, ward_name, joined_at
            FROM line_groups
            ORDER BY joined_at DESC`
    }]);
    const rows = toRows(res);
    return Response.json({ ok: true, groups: rows });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { group_id, ward_name } = body;
  if (!group_id || !ward_name) {
    return Response.json({ error: 'ต้องระบุ group_id และ ward_name' }, { status: 400 });
  }

  await runTurso(context.env, [{
    sql: `UPDATE line_groups SET ward_name = ? WHERE group_id = ?`,
    args: [ward_name, group_id]
  }]);

  return Response.json({ ok: true, group_id, ward_name });
}

function toRows(res) {
  const rows = res?.results?.[0]?.response?.result?.rows || [];
  const cols = res?.results?.[0]?.response?.result?.cols || [];
  if (!rows.length || !cols.length) return [];
  return rows.map(r =>
    Object.fromEntries(cols.map((c, i) => [c.name, r[i]?.value ?? r[i]]))
  );
}
