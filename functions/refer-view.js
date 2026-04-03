// functions/refer-view.js
// GET /refer-view?d=BASE64  -> แสดงใบ Refer
// ไม่เก็บข้อมูลผู้ป่วยใน DB เลย — PDPA safe
// ข้อมูลอยู่ใน URL param ?d= (base64 JSON) เมื่อปิด browser -> หายเอง

export async function onRequestGet(context) {
  const url    = new URL(context.request.url);
  const raw    = url.searchParams.get('d') || '';
  const webUrl = (context.env.WEBAPP_URL || 'https://stroke-prh.pages.dev').replace(/\/$/, '');

  let d = null;
  if (raw) {
    try {
      const json = atob(raw.replace(/-/g,'+').replace(/_/g,'/'));
      d = JSON.parse(json);
    } catch { d = null; }
  }

  return new Response(renderPage(d, webUrl), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function v(x, fb='-') { return (x!=null && x!=='') ? String(x) : fb; }

function sev(n) {
  if (n==null) return '-';
  if (n===0)   return 'No stroke symptoms';
  if (n<=4)    return 'Minor';
  if (n<=15)   return 'Moderate';
  if (n<=20)   return 'Moderate-Severe';
  return 'Severe';
}

function sevColor(n) {
  if (n==null||n===0) return '#3B6D11';
  if (n<=4)  return '#3B6D11';
  if (n<=15) return '#854F0B';
  return '#A32D2D';
}

function renderPage(d, webUrl) {
  const now = new Date().toLocaleString('th-TH',{
    timeZone:'Asia/Bangkok', dateStyle:'medium', timeStyle:'short'
  });
  if (!d) return noData(webUrl);

  const nihss   = d.nihss != null ? d.nihss : null;
  const color   = sevColor(nihss);
  const nihssSev = v(d.nihss_sev, nihss!=null ? sev(nihss) : '-');
  const onset   = d.onset_hours!=null ? `${d.onset_hours} ชั่วโมง` : v(d.onset_time);
  const dest    = v(d.refer_destination,'สถาบันประสาทวิทยา');
  const reason  = v(d.refer_reason,'Ischemic Stroke — ต้องการพิจารณา Mechanical Thrombectomy / IV tPA');

  return `<!DOCTYPE html>
<html lang="th"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ใบ Refer Stroke</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Sarabun',sans-serif;background:#f4f4f4}
.pg{max-width:640px;margin:0 auto;background:#fff;min-height:100vh}
.hdr{background:#C1121F;color:#fff;padding:14px 18px}
.hdr h1{font-size:18px;font-weight:700}
.hdr p{font-size:12px;opacity:.85;margin-top:2px}
.bn{background:#fff8e1;border-left:4px solid #f59e0b;padding:9px 16px;font-size:13px;color:#78350f}
.sec{padding:14px 18px;border-bottom:1px solid #eee}
.sec h2{font-size:11px;font-weight:700;color:#C1121F;letter-spacing:.5px;text-transform:uppercase;margin-bottom:10px}
.gr{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.f .lb{font-size:11px;color:#888;margin-bottom:2px}
.f .vl{font-size:15px;font-weight:600}
.big{font-size:36px;font-weight:700;line-height:1}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:3px 12px;border-radius:20px;margin-top:4px}
.dest{background:#e8f0fe;border-left:3px solid #185FA5;padding:9px 14px;border-radius:0 8px 8px 0;font-size:14px;font-weight:600;color:#185FA5;margin-top:8px}
.rsn{background:#f8f8f8;border:1px solid #ddd;border-radius:8px;padding:11px 14px;font-size:14px;line-height:1.6;margin-top:8px}
.sl{border-bottom:1px solid #ccc;min-height:28px;margin-top:22px}
.ft{padding:14px 18px;background:#fafafa;border-top:1px solid #eee}
.ts{font-size:11px;color:#999;margin-bottom:10px}
.btns{display:flex;gap:8px;flex-wrap:wrap}
.btn{flex:1;min-width:110px;padding:11px;border-radius:8px;font-size:14px;font-weight:600;text-align:center;cursor:pointer;border:none;font-family:inherit}
.bp{background:#C1121F;color:#fff}
.bw{background:#185FA5;color:#fff}
@media print{.ft,.bn{display:none}.pg{max-width:100%}body{background:#fff}}
</style></head><body>
<div class="pg">
  <div class="hdr">
    <h1>ใบส่งต่อ (Refer) — Stroke Fast Track</h1>
    <p>โรงพยาบาลสงฆ์ • กลุ่มงานอายุรกรรม</p>
  </div>
  <div class="bn">⏱ Onset: <strong>${onset}</strong>${d.ward?` &nbsp;•&nbsp; Ward: <strong>${v(d.ward)}</strong>`:''} &nbsp;•&nbsp; สร้าง: ${now}</div>

  <div class="sec">
    <h2>ข้อมูลผู้ป่วย</h2>
    <div class="gr">
      <div class="f"><div class="lb">HN</div><div class="vl">${v(d.hn)}</div></div>
      <div class="f"><div class="lb">Ward</div><div class="vl">${v(d.ward)}</div></div>
      <div class="f"><div class="lb">อายุ / เพศ</div><div class="vl">${v(d.age)} ปี / ${v(d.sex)}</div></div>
      <div class="f"><div class="lb">เวลา Onset</div><div class="vl">${v(d.onset_time)}</div></div>
      <div class="f"><div class="lb">BP</div><div class="vl">${v(d.bp)}</div></div>
      <div class="f"><div class="lb">INR</div><div class="vl">${v(d.inr)}</div></div>
    </div>
  </div>

  <div class="sec">
    <h2>ผลประเมิน NIHSS</h2>
    <div class="gr">
      <div class="f">
        <div class="lb">คะแนน NIHSS</div>
        <div class="big" style="color:${color}">${nihss!=null?nihss:'-'}</div>
        <span class="badge" style="background:${color}20;color:${color}">${nihssSev}</span>
      </div>
      <div class="f" style="display:flex;flex-direction:column;gap:8px;justify-content:center">
        <div class="f"><div class="lb">CT Brain</div><div class="vl" style="font-size:13px">${v(d.ct_result)}</div></div>
        <div class="f"><div class="lb">การรักษาที่ให้</div><div class="vl" style="font-size:13px">${v(d.action)}</div></div>
        ${d.dtn?`<div class="f"><div class="lb">Door-to-Needle</div><div class="vl" style="font-size:13px">${d.dtn} นาที</div></div>`:''}
      </div>
    </div>
  </div>

  <div class="sec">
    <h2>ข้อมูลการส่งต่อ</h2>
    <div style="font-size:11px;color:#888">ส่งต่อไปยัง</div>
    <div class="dest">→ ${dest}</div>
    <div style="font-size:11px;color:#888;margin-top:12px">เหตุผล</div>
    <div class="rsn">${reason}</div>
  </div>

  <div class="sec">
    <h2>ลงนามแพทย์ผู้ส่งต่อ</h2>
    <div class="gr">
      <div><div style="font-size:11px;color:#888">ชื่อแพทย์</div><div class="sl"></div></div>
      <div><div style="font-size:11px;color:#888">วันที่ / เวลา</div><div class="sl"></div></div>
    </div>
  </div>

  <div class="ft">
    <div class="ts">สร้างโดย Stroke Fast Track รพ.สงฆ์ • ${now} • ไม่มีการเก็บข้อมูลผู้ป่วยในระบบ</div>
    <div class="btns">
      <button class="btn bp" onclick="window.print()">🖨 พิมพ์ / บันทึก PDF</button>
      <button class="btn bw" onclick="window.open('${webUrl}')">🔗 เปิดระบบ</button>
    </div>
  </div>
</div>
</body></html>`;
}

function noData(webUrl) {
  return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ใบ Refer</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}body{font-family:'Sarabun',sans-serif;background:#f4f4f4;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}.box{background:#fff;border-radius:12px;padding:32px 24px;text-align:center;max-width:300px}.t{font-size:16px;font-weight:600;margin-bottom:6px}.s{font-size:13px;color:#888;line-height:1.6;margin-bottom:20px}.btn{display:block;width:100%;padding:12px;background:#C1121F;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none}</style>
</head><body><div class="box">
<div style="font-size:40px;margin-bottom:12px">📋</div>
<div class="t">ไม่พบข้อมูลใบ Refer</div>
<div class="s">ลิงก์อาจหมดอายุแล้ว<br>หรือไม่มีการแนบข้อมูลมาด้วย</div>
<a class="btn" href="${webUrl}">→ เปิดระบบ Stroke Fast Track</a>
</div></body></html>`;
}
