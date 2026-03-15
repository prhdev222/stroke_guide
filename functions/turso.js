// functions/turso.js
// Cloudflare Pages Function — proxies all Turso SQL calls
// Env vars required: TURSO_URL, TURSO_TOKEN

export async function onRequestPost(context) {
  const { TURSO_URL, TURSO_TOKEN } = context.env;

  if (!TURSO_URL || !TURSO_TOKEN) {
    return Response.json(
      { error: 'Turso ยังไม่ได้ตั้งค่า — กรุณาเพิ่ม TURSO_URL และ TURSO_TOKEN ใน Cloudflare Pages Environment Variables' },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sql, args = [] } = body;
  if (!sql) return Response.json({ error: 'Missing sql' }, { status: 400 });

  try {
    const tursoRes = await fetch(`${TURSO_URL}/v2/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TURSO_TOKEN}`,
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

    const data = await tursoRes.json();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
