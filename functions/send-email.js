// functions/send-email.js
// POST /send-email  → ส่ง email ผ่าน Resend พร้อม PDF แนบ
//
// ENV ที่ต้องตั้งใน Cloudflare Pages → Settings → Environment Variables:
//   RESEND_API_KEY  = re_xxxxxxxxxx   (จาก resend.com ฟรี)
//   NEURO_EMAIL     = krida009@yahoo.com
//   ADMIN_EMAIL     = uradev222@gmail.com
//
// body: {
//   subject: string,
//   html: string,           // email body HTML
//   pdf_base64: string,     // PDF as base64 string
//   filename: string        // ชื่อไฟล์ PDF
// }

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

  // ส่งไปหา neuro + admin พร้อมกัน
  const recipients = [
    NEURO_EMAIL || 'krida009@yahoo.com',
    ADMIN_EMAIL || 'uradev222@gmail.com',
  ].filter(Boolean);

  const payload = {
    from: 'Stroke Fast Track รพ.สงฆ์ <onboarding@resend.dev>',
    to: recipients,
    subject,
    html,
  };

  // แนบ PDF ถ้ามี
  if (pdf_base64 && filename) {
    payload.attachments = [{
      filename,
      content: pdf_base64,
    }];
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    return Response.json({
      error: data.message || 'ส่ง email ไม่สำเร็จ',
      detail: data
    }, { status: res.status });
  }

  return Response.json({
    ok: true,
    id: data.id,
    to: recipients,
  });
}

export async function onRequestGet(context) {
  return Response.json({
    ok: true,
    configured: !!context.env.RESEND_API_KEY,
    neuro_email: context.env.NEURO_EMAIL || '(ยังไม่ได้ตั้งค่า)',
    admin_email: context.env.ADMIN_EMAIL || '(ยังไม่ได้ตั้งค่า)',
  });
}
