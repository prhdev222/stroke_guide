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
// PDPA / ไฟล์แนบเข้ารหัส (optional):
//   PDF_ATTACH_PASSWORD = รหัสผ่านสำหรับ AES-256-GCM (เช่น strokeprh)
//   ถ้าตั้งแล้ว ระบบจะแนบไฟล์เป็น .stroke-enc แทน PDF เปล่า
//   ผู้รับเปิดได้ที่ /pdf-unlock.html บนเว็บเดียวกัน (ถอดรหัสในเบราว์เซอร์ ไม่อัปโหลดเซิร์ฟเวอร์)
//
// ปลายทาง: ADMIN_EMAIL เท่านั้น (ถ้าไม่ตั้ง → fallback NEURO_EMAIL)
// Resend Free: ต้องเป็นอีเมลที่ verify กับ Resend — มิฉะนั้น 403

const STKE_MAGIC = new TextEncoder().encode('STKE1');
const STKE_VERSION = 1;
const PBKDF2_ITER = 210000;

/** @param {Uint8Array} pdfBytes */
async function encryptPdfForAttachment(pdfBytes, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pdfBytes);
  const ctU8 = new Uint8Array(ct);
  const out = new Uint8Array(5 + 1 + 16 + 12 + ctU8.length);
  out.set(STKE_MAGIC, 0);
  out[5] = STKE_VERSION;
  out.set(salt, 6);
  out.set(iv, 22);
  out.set(ctU8, 34);
  return out;
}

function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function onRequestPost(context) {
  const { RESEND_API_KEY, NEURO_EMAIL, ADMIN_EMAIL, PDF_ATTACH_PASSWORD, WEBAPP_URL } = context.env;

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

  const webBase = (WEBAPP_URL || 'https://stroke-prh.pages.dev').replace(/\/$/, '');
  const pass = PDF_ATTACH_PASSWORD != null ? String(PDF_ATTACH_PASSWORD).trim() : '';

  let finalHtml = html;
  let attachments;

  if (pdf_base64 && filename) {
    let attachB64 = pdf_base64;
    let attachName = filename;
    let encrypted = false;

    if (pass) {
      try {
        const b64 = pdf_base64.replace(/\s/g, '');
        const bin = atob(b64);
        const raw = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
        const encBytes = await encryptPdfForAttachment(raw, pass);
        attachB64 = bytesToBase64(encBytes);
        attachName = /\.pdf$/i.test(filename)
          ? filename.replace(/\.pdf$/i, '.pdf.stroke-enc')
          : `${filename}.stroke-enc`;
        encrypted = true;
      } catch (e) {
        return Response.json({ error: 'เข้ารหัสไฟล์แนบไม่สำเร็จ: ' + e.message }, { status: 500 });
      }
    }

    if (encrypted) {
      finalHtml += `<p style="font-size:12px;color:#b00020;line-height:1.65;margin-top:14px"><strong>PDPA:</strong> ไฟล์แนบถูกเข้ารหัสแล้ว — ดาวน์โหลดไฟล์แนบ แล้วเปิดถอดรหัสที่ <a href="${webBase}/pdf-unlock.html" target="_blank" rel="noopener">หน้าเปิด PDF (ถอดรหัส)</a> โดยใช้รหัสผ่านตามที่โรงพยาบาลกำหนด (ไม่แนะนำส่งรหัสผ่านทางอีเมล)</p>`;
    }

    attachments = [{ filename: attachName, content: attachB64 }];
  } else {
    attachments = undefined;
  }

  const results = await Promise.all(recipients.map(async (to) => {
    try {
      const payload = {
        from: 'Stroke Fast Track <onboarding@resend.dev>',
        to: [to],
        subject,
        html: finalHtml,
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
    encrypted: !!(pass && pdf_base64 && filename),
    unlock_url: pass && pdf_base64 && filename ? `${webBase}/pdf-unlock.html` : undefined,
    sent: sent.map(r => r.to),
    failed: failed.map(r => ({ to: r.to, error: r.error })),
  });
}

export async function onRequestGet(context) {
  const pass = context.env.PDF_ATTACH_PASSWORD != null ? String(context.env.PDF_ATTACH_PASSWORD).trim() : '';
  return Response.json({
    ok: true,
    configured: !!context.env.RESEND_API_KEY,
    sends_to: 'ADMIN_EMAIL (หรือ NEURO_EMAIL ถ้าไม่มี ADMIN)',
    admin_email: context.env.ADMIN_EMAIL || '(ยังไม่ได้ตั้งค่า)',
    neuro_email: context.env.NEURO_EMAIL || '(ยังไม่ได้ตั้งค่า)',
    pdf_attachment_encrypted: !!pass,
  });
}
