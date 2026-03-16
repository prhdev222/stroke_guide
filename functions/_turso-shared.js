// Shared Turso client for server-side functions (ไม่เปิดให้ client เรียกโดยตรง)
// ใช้โดย check-staff-pin.js, admin-ward-pins.js

export async function runTurso(env, requests) {
  const { TURSO_URL, TURSO_TOKEN, TURSO_AUTH_TOKEN } = env;
  const token = TURSO_TOKEN || TURSO_AUTH_TOKEN;
  const baseUrl = (TURSO_URL || '').replace(/^libsql:\/\//, 'https://');
  if (!baseUrl || !token) throw new Error('Turso not configured');

  const body = {
    requests: requests.map(r => ({
      type: 'execute',
      stmt: {
        sql: r.sql,
        args: (r.args || []).map(a => ({
          type: typeof a === 'number' ? 'integer' : 'text',
          value: String(a ?? '')
        }))
      }
    }))
  };

  const res = await fetch(`${baseUrl}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data?.message || data?.error || `Turso ${res.status}`);
  if (data.results?.[0]?.type === 'error') throw new Error(data.results[0].error?.message || 'Turso error');
  return data;
}
