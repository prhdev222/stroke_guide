// functions/refer-view.js
// GET /refer-view?d={base64url}  → แสดงใบ Refer จากข้อมูลใน URL
//
// ✅ PDPA: ไม่มีการ query Turso เลย
//         decode จาก ?d= ที่ encode มาจาก line.js (TextEncoder)
//         ไม่มี HN ไม่มีชื่อผู้ป่วย — เฉพาะข้อมูล clinical
//         รองรับภาษาไทยด้วย TextDecoder
//         link หมดอายุใน 4 ชั่วโมง

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const encoded = url.searchParams.get('d');

  let d = null;
  let expired = false;
  let decodeError = false;

  if (encoded) {
    try {
      // Unicode-safe decode (รองรับภาษาไทย)
      const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const binString = atob(b64);
      const bytes = Uint8Array.from(binString, c => c.charCodeAt(0));
      const json = new TextDecoder().decode(bytes);
      d = JSON.parse(json);

      if (d.ts) {
        const age = Date.now() - new Date(d.ts).getTime();
        if (age > 4 * 60 * 60 * 1000) { expired = true; d = null; }
      }
    } catch { decodeError = true; }
  }

  const webUrl = (context.env.WEBAPP_URL || 'https://stroke-prh.pages.dev').replace(/\/$/, '');
  return new Response(renderPage(d, webUrl, expired, decodeError), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function sevColor(n) {
  n = Number(n);
  if (n <= 4) return '#3B6D11';
  if (n <= 15) return '#854F0B';
  return '#A32D2D';
}
function sevBg(n) {
  n = Number(n);
  if (n <= 4) return '#EAF3DE';
  if (n <= 15) return '#FAEEDA';
  return '#FCEBEB';
}
function sevLabel(n) {
  n = Number(n);
  if (n === 0) return 'No stroke';
  if (n <= 4) return 'Minor';
  if (n <= 15) return 'Moderate';
  if (n <= 20) return 'Moderate-Severe';
  return 'Severe';
}

function renderPage(d, webUrl, expired, decodeError) {
  const now = new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short'
  });

  const ward     = d?.ward    || '-';
  const onset    = d?.onset != null && d.onset !== '' ? `${d.onset} ชั่วโมง` : '-';
  const nihss    = d?.nihss != null && d.nihss !== '' ? String(d.nihss) : '-';
  const nihssSev = d?.nihss_sev || (d?.nihss != null ? sevLabel(d.nihss) : '-');
  const ct       = d?.ct      || '-';
  const action   = d?.action  || '-';
  const bp       = d?.bp      || '-';
  const inr      = d?.inr     || '-';
  const dtn      = d?.dtn && d.dtn !== '' ? `${d.dtn} นาที` : null;
  const dest     = d?.dest    || 'สถาบันประสาทวิทยา';
  const reason   = d?.reason  || 'Ischemic Stroke — ต้องการ Mechanical Thrombectomy / IV tPA';
  const createdAt = d?.ts
    ? new Date(d.ts).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok',
        dateStyle: 'medium', timeStyle: 'short' })
    : now;
  const nColor = (d?.nihss != null && d.nihss !== '') ? sevColor(d.nihss) : '#222';
  const nBg    = (d?.nihss != null && d.nihss !== '') ? sevBg(d.nihss)    : '#eee';

  const body = !d ? `
    <div class="empty">
      <div class="big-icon">${expired ? '⏱' : decodeError ? '⚠️' : '📋'}</div>
      <h2>${expired ? 'Link หมดอายุแล้ว' : decodeError ? 'ไม่พบข้อมูล' : 'ยังไม่มีเคส Stroke'}</h2>
      <p>${expired
        ? 'Link มีอายุ 4 ชั่วโมงจากเวลา Activate<br>กรุณา Activate Stroke ใหม่เพื่อรับ link ล่าสุด'
        : decodeError
          ? 'Link ไม่ถูกต้อง กรุณาใช้ link จาก LINE'
          : 'กรุณา Activate Stroke จากระบบก่อนค่ะ'
      }</p>
      <a class="btn-blue" href="${webUrl}">→ ไปยังระบบ Stroke Fast Track</a>
    </div>
  ` : `
    <div class="alert-bar">⏱ Onset: <strong>${onset}</strong> &nbsp;|&nbsp; เวลา Activate: ${createdAt}</div>

    <div class="section">
      <h2>ข้อมูล Clinical</h2>
      <div class="grid">
        <div class="field"><div class="label">Ward</div><div class="value">${ward}</div></div>
        <div class="field"><div class="label">Onset</div><div class="value">${onset}</div></div>
        <div class="field"><div class="label">BP</div><div class="value">${bp}</div></div>
        <div class="field"><div class="label">INR</div><div class="value">${inr}</div></div>
      </div>
    </div>

    <div class="section">
      <h2>ผลการประเมิน NIHSS</h2>
      <div class="nihss-row">
        <div class="nihss-num" style="color:${nColor}">${nihss}</div>
        <div class="nihss-badge" style="background:${nBg};color:${nColor}">${nihssSev}</div>
      </div>
      <div class="grid" style="margin-top:12px">
        <div class="field"><div class="label">CT Brain</div><div class="value">${ct}</div></div>
        <div class="field"><div class="label">การรักษาที่ให้</div><div class="value">${action}</div></div>
        ${dtn ? `<div class="field"><div class="label">Door-to-Needle</div><div class="value">${dtn}</div></div>` : ''}
      </div>
    </div>

    <div class="section">
      <h2>ข้อมูลการส่งต่อ</h2>
      <div class="dest-box">→ ${dest}</div>
      <div class="label" style="margin-top:12px;margin-bottom:4px">เหตุผลการส่งต่อ</div>
      <div class="reason-box">${reason}</div>
    </div>

    <div class="section">
      <h2>ลงนามแพทย์ผู้ส่งต่อ</h2>
      <div class="grid">
        <div class="field"><div class="label">ชื่อแพทย์</div><div class="sign-line"></div></div>
        <div class="field"><div class="label">วันที่ / เวลา</div><div class="sign-line"></div></div>
      </div>
    </div>

    <div class="pdpa-note">
      🔒 เอกสารนี้ไม่มีข้อมูลส่วนบุคคล (HN/ชื่อ) — เฉพาะข้อมูล clinical เท่านั้น<br>
      link หมดอายุอัตโนมัติใน 4 ชั่วโมงจากเวลา Activate
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ใบ Refer Stroke — รพ.สงฆ์</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Sarabun',sans-serif;background:#f4f4f4;color:#222}
.page{max-width:660px;margin:0 auto;background:#fff;min-height:100vh}
.header{background:#C1121F;color:#fff;padding:14px 20px}
.header h1{font-size:18px;font-weight:700}
.header .sub{font-size:12px;opacity:.85;margin-top:2px}
.alert-bar{background:#FFF3CD;border-left:4px solid #E85D04;padding:10px 16px;font-size:13px;color:#7B3C00}
.section{padding:16px 20px;border-bottom:1px solid #eee}
.section h2{font-size:11px;font-weight:700;color:#C1121F;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.field .label{font-size:11px;color:#888;margin-bottom:2px}
.field .value{font-size:15px;font-weight:600}
.sign-line{border-bottom:1px solid #ccc;height:28px;margin-top:4px}
.nihss-row{display:flex;align-items:center;gap:14px}
.nihss-num{font-size:44px;font-weight:700;line-height:1}
.nihss-badge{font-size:14px;font-weight:700;padding:4px 14px;border-radius:20px}
.dest-box{background:#E6F1FB;border-left:3px solid #185FA5;padding:10px 14px;border-radius:0 8px 8px 0;font-size:15px;font-weight:700;color:#185FA5;margin-top:6px}
.reason-box{background:#f8f8f8;border:1px solid #ddd;border-radius:8px;padding:12px;font-size:14px;line-height:1.6}
.pdpa-note{margin:12px 20px;padding:10px 14px;background:#EAF3DE;border-radius:8px;font-size:11px;color:#3B6D11;line-height:1.7}
.footer{padding:14px 20px;background:#f9f9f9;border-top:1px solid #eee}
.footer .ts{font-size:11px;color:#999;margin-bottom:10px}
.btn-row{display:flex;gap:8px;flex-wrap:wrap}
.btn{flex:1;min-width:120px;padding:11px;border-radius:8px;font-size:14px;font-weight:600;text-align:center;border:none;cursor:pointer;color:#fff}
.btn-red{background:#C1121F}
.btn-dark{background:#444}
.empty{text-align:center;padding:60px 20px;display:flex;flex-direction:column;align-items:center;gap:14px}
.empty .big-icon{font-size:44px}
.empty h2{font-size:18px;font-weight:600;color:#555}
.empty p{font-size:14px;color:#888;line-height:1.7}
.btn-blue{background:#185FA5;color:#fff;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none}
@media print{.footer,.pdpa-note,.alert-bar{display:none}.page{max-width:100%}body{background:#fff}}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1>ใบส่งต่อ (Refer) — Stroke Fast Track</h1>
    <div class="sub">โรงพยาบาลสงฆ์ &nbsp;|&nbsp; กลุ่มงานอายุรกรรม</div>
  </div>
  ${body}
  ${d ? `
  <div class="footer">
    <div class="ts">สร้างโดยระบบ Stroke Fast Track รพ.สงฆ์ | ${now}</div>
    <div class="btn-row">
      <button class="btn btn-red" onclick="window.print()">🖨 พิมพ์ / บันทึก PDF</button>
      <button class="btn btn-dark" onclick="window.open('${webUrl}')">🔗 เปิดระบบ</button>
    </div>
  </div>
  ` : ''}
</div>
</body></html>`;
}
