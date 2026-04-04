// functions/send-email.js
// POST /send-email  → ส่ง email ผ่าน Resend พร้อม PDF แนบ
//
// ENV ใน Cloudflare Pages → Settings → Environment Variables:
//   RESEND_API_KEY  = re_...          (จากบัญชี Resend ที่สมัครด้วยเมลทีม)
//   ADMIN_EMAIL     = stroketeamprh@gmail.com  (ควรตรงกับอีเมลที่ verify ใน Resend — Free ส่งได้แค่เมลนี้)
//   NEURO_EMAIL     = (optional fallback ถ้าไม่ตั้ง ADMIN_EMAIL)
//
// body: {
//   subject: string,
//   html: string,
//   pdf_base64?: string,
//   filename?: string
// }
//
// ปลายทาง: ADMIN_EMAIL เท่านั้น (ถ้าไม่ตั้ง → fallback NEURO_EMAIL)
// Resend Free: ต้องเป็นอีเมลที่ verify กับ Resend — มิฉะนั้น 403

export async function onRequestPost(context) {
  const { RESEND_API_KEY, NEURO_EMAIL, ADMIN_EMAIL } = context.env;

  if (!RESEND_API_KEY) {
    return Response.json({
      error: 'RESEND_API_KEY ยังไม่ได้ตั้งค่า — ไปที่ Cloudflare Pages → Settings → Environment Variables'
    }, { status: 503 });
  }

  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { subject, html, pdf_base64, filename } = body;
  if (!subject || !html) {
    return Response.json({ error: 'ต้องระบุ subject และ html' }, { status: 400 });
  }

  // ส่งเฉพาะ Admin (อีเมลที่ verify กับ Resend) — ไม่รับที่อยู่จาก client
  let recipients = [...new Set([ADMIN_EMAIL].filter(Boolean))];
  if (recipients.length === 0) {
    recipients = [...new Set([NEURO_EMAIL].filter(Boolean))];
  }
  if (recipients.length === 0) {
    return Response.json({ error: 'ยังไม่ได้ตั้ง ADMIN_EMAIL (หรือ NEURO_EMAIL) ใน Environment Variables' }, { status: 503 });
  }

  const attachments = (pdf_base64 && filename)
    ? [{ filename, content: pdf_base64 }]
    : undefined;

  const results = await Promise.all(recipients.map(async (to) => {
    try {
      const payload = {
        from: 'Stroke Fast Track <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
      };
      if (attachments) payload.attachments = attachments;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return { to, ok: false, status: res.status, error: data.message || 'Resend error' };
      return { to, ok: true, id: data.id };
    } catch (e) {
      return { to, ok: false, error: e.message };
    }
  }));

  const sent = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);

  if (sent.length === 0) {
    const hint = failed[0]?.status === 403
      ? ' — Resend Free Plan ส่งได้เฉพาะ email ที่สมัคร Resend เท่านั้น (ต้อง verify domain หรืออัพเกรด)'
      : '';
    return Response.json({
      error: `ส่ง email ไม่สำเร็จทุกราย${hint}`,
      detail: failed,
    }, { status: failed[0]?.status || 500 });
  }

  return Response.json({
    ok: true,
    sent: sent.map(r => r.to),
    failed: failed.map(r => ({ to: r.to, error: r.error })),
  });
}

export async function onRequestGet(context) {
  return Response.json({
    ok: true,
    configured: !!context.env.RESEND_API_KEY,
    sends_to: 'ADMIN_EMAIL (หรือ NEURO_EMAIL ถ้าไม่มี ADMIN)',
    admin_email: context.env.ADMIN_EMAIL || '(ยังไม่ได้ตั้งค่า)',
    neuro_email: context.env.NEURO_EMAIL || '(ยังไม่ได้ตั้งค่า)',
  });
}
