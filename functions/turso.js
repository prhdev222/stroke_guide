// functions/turso.js
// Cloudflare Pages Function — proxies all Turso SQL calls
// Env vars required: TURSO_URL, TURSO_TOKEN

export async function onRequestPost(context) {
  const { TURSO_URL, TURSO_TOKEN, TURSO_AUTH_TOKEN } = context.env;
  const token = TURSO_TOKEN || TURSO_AUTH_TOKEN;
  const baseUrl = (TURSO_URL || '').replace(/^libsql:\/\//, 'https://');

  if (!baseUrl || !token) {
    return Response.json(
      { error: 'Turso ยังไม่ได้ตั้งค่า — กรุณาเพิ่ม TURSO_URL และ TURSO_TOKEN (หรือ TURSO_AUTH_TOKEN) ใน Cloudflare Pages → Settings → Environment variables' },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sql = body.sql;
  const args = Array.isArray(body.args) ? body.args : [];
  if (!sql) return Response.json({ error: 'Missing sql' }, { status: 400 });

  try {
    const tursoRes = await fetch(`${baseUrl}/v2/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          type: 'execute',
          stmt: {
            sql,
            args: args.map(a => ({
              type: typeof a === 'number' ? 'integer' : 'text',
              value: String(a ?? '')
            }))
          }
        }]
      })
    });

    let data;
    try {
      const text = await tursoRes.text();
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      return Response.json(
        { error: `Turso responded with ${tursoRes.status} (response not JSON). Check TURSO_URL and token.` },
        { status: 502 }
      );
    }

    if (!tursoRes.ok) {
      return Response.json(
        { error: data?.message || data?.error || `Turso error ${tursoRes.status}` },
        { status: 502 }
      );
    }

    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: err.message || 'Turso request failed' },
      { status: 500 }
    );
  }
}
