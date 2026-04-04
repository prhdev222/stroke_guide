// GET /ct-temp/view?t=<viewToken> — Neuro เปิดดูไฟล์
// หลายรูป/วิดีโอ: ซูมภาพ, ปรับ playbackRate, ลิงก์บันทึก — raw=1&i=n = ไฟล์ดิบ

import { ctBindingsOk, purgeSession } from '../_ct-temp-shared.js';

const VIEWER_STYLES = `body{font-family:system-ui,'Noto Sans Thai',sans-serif;background:#eee;margin:0;padding:12px;color:#222}
.box{max-width:900px;margin:0 auto;background:#fff;border-radius:12px;padding:16px;box-shadow:0 2px 12px rgba(0,0,0,.07)}
.note{color:#555;font-size:13px;line-height:1.65;margin-bottom:12px}
.note.hint{font-size:12px;background:#f0f7ff;padding:10px 12px;border-radius:8px;border:0.5px solid #cfe2ff}
.media-block{margin-bottom:22px;padding-bottom:18px;border-bottom:0.5px solid #e0e0e0}
.media-block:last-child{border-bottom:0}
.img-cap{font-size:12px;color:#666;margin:0 0 8px;font-weight:600}
.zoom-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
.speed-label{font-size:12px;color:#666;margin-right:4px}
.zbtn{padding:10px 14px;border-radius:10px;border:0.5px solid #ccc;background:#fafafa;font-size:14px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;font-family:inherit}
.zbtn:active{background:#e8e8e8}
.zbtn.save{text-decoration:none;color:#0b6b3a;border-color:#9dc9a8;background:#f0fff4;display:inline-flex;align-items:center;justify-content:center}
.speed-btn.on{background:#1b4f72;color:#fff;border-color:#1b4f72}
.zoom-viewport{overflow:auto;max-height:75vh;-webkit-overflow-scrolling:touch;background:#f5f5f5;border-radius:10px;border:0.5px solid #ddd;touch-action:pan-x pan-y}
.zoom-img{display:block;margin:0 auto;max-width:100%;height:auto;transform-origin:center center;transition:transform .12s ease;user-select:none;-webkit-user-select:none}
video.neuro-vid{width:100%;max-height:70vh;border-radius:10px;background:#000;display:block}`;

const VIEWER_SCRIPT = `
(function(){
  document.querySelectorAll('.media-block[data-type="img"]').forEach(function(block){
    var img=block.querySelector('.zoom-img');
    var scale=1;
    block.querySelectorAll('.zbtn[data-act]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var act=btn.getAttribute('data-act');
        if(act==='in')scale=Math.min(scale+0.25,4);
        else if(act==='out')scale=Math.max(scale-0.25,0.5);
        else if(act==='reset')scale=1;
        if(img)img.style.transform='scale('+scale+')';
      });
    });
  });
  document.querySelectorAll('.media-block[data-type="vid"]').forEach(function(block){
    var vid=block.querySelector('video.neuro-vid');
    block.querySelectorAll('.speed-btn').forEach(function(btn){
      btn.addEventListener('click',function(){
        var r=parseFloat(btn.getAttribute('data-rate'),10);
        if(!vid||isNaN(r))return;
        try{vid.playbackRate=r;}catch(e){}
        block.querySelectorAll('.speed-btn').forEach(function(b){b.classList.remove('on');});
        btn.classList.add('on');
      });
    });
  });
})();
`;

function htmlShell(inner) {
  return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5"><title>CT ชั่วคราว</title>
<style>${VIEWER_STYLES}</style></head><body><div class="box">${inner}</div><script>${VIEWER_SCRIPT}<\/script></body></html>`;
}

function isLegacySession(s) {
  return !!(s && s.r2Key && !s.prefix);
}

function hasAnyUpload(session) {
  if (isLegacySession(session)) return !!session.uploaded;
  return Array.isArray(session.files) && session.files.length > 0;
}

function imageSection(i, n, imgSrc) {
  return `<section class="media-block" data-type="img">
<div class="img-cap">ภาพ ${i + 1} / ${n}</div>
<div class="zoom-toolbar">
<button type="button" class="zbtn" data-act="out" aria-label="ย่อ">− ย่อ</button>
<button type="button" class="zbtn" data-act="reset">ตั้งต้น</button>
<button type="button" class="zbtn" data-act="in" aria-label="ขยาย">+ ขยาย</button>
<a class="zbtn save" href="${imgSrc}" download="stroke-ct-${i + 1}.jpg" target="_blank" rel="noopener">บันทึกภาพ</a>
</div>
<div class="zoom-viewport"><img src="${imgSrc}" alt="ภาพ ${i + 1}" class="zoom-img" draggable="false" loading="lazy"></div>
</section>`;
}

function videoSection(i, n, vSrc) {
  return `<section class="media-block" data-type="vid">
<div class="img-cap">วิดีโอ ${i + 1} / ${n}</div>
<div class="zoom-toolbar speed-bar">
<span class="speed-label">ความเร็ว</span>
<button type="button" class="zbtn speed-btn" data-rate="0.25">0.25×</button>
<button type="button" class="zbtn speed-btn" data-rate="0.5">0.5×</button>
<button type="button" class="zbtn speed-btn on" data-rate="1">1×</button>
<button type="button" class="zbtn speed-btn" data-rate="1.5">1.5×</button>
<button type="button" class="zbtn speed-btn" data-rate="2">2×</button>
<a class="zbtn save" href="${vSrc}" download="stroke-ct-video-${i + 1}.mp4" target="_blank" rel="noopener">บันทึกวิดีโอ</a>
</div>
<video class="neuro-vid" controls playsinline preload="metadata" src="${vSrc}"></video>
</section>`;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const t = url.searchParams.get('t');
  const raw = url.searchParams.get('raw') === '1';
  const idxParam = url.searchParams.get('i');
  const fileIndex =
    idxParam != null && idxParam !== '' ? parseInt(idxParam, 10) : null;

  if (!t || t.length > 200) {
    return new Response(htmlShell('<p class="note">ไม่พบพารามิเตอร์ลิงก์</p>'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  if (!ctBindingsOk(env)) {
    return new Response(htmlShell('<p class="note">ระบบยังไม่ได้ตั้งค่า R2/KV</p>'), {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const sessionId = await env.CT_SESSIONS.get(`ctv:${t}`);
  if (!sessionId) {
    return new Response(
      htmlShell('<p class="note">ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว (4 ชม.)</p>'),
      { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  const rawSession = await env.CT_SESSIONS.get(`cts:${sessionId}`);
  if (!rawSession) {
    return new Response(htmlShell('<p class="note">ไม่พบ session</p>'), {
      status: 410,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  let session;
  try {
    session = JSON.parse(rawSession);
  } catch {
    return new Response(htmlShell('<p class="note">ข้อมูลเสีย</p>'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  if (Date.now() > session.exp) {
    await purgeSession(env, sessionId, session);
    return new Response(
      htmlShell('<p class="note">ลิงก์หมดอายุแล้ว — ขอลิงก์ใหม่จาก รพ.</p>'),
      { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  if (!hasAnyUpload(session)) {
    return new Response(
      htmlShell(
        '<p class="note">รอฝั่ง รพ. อัปโหลดภาพ — กดรีเฟรชภายหลัง<br><small>ไม่มี HN/ชื่อในลิงก์ (PDPA)</small></p>'
      ),
      { status: 202, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  /** @type {{ r2Key: string, contentType?: string }[]} */
  let entries = [];
  if (isLegacySession(session)) {
    entries = [{ r2Key: session.r2Key, contentType: session.contentType }];
  } else {
    entries = session.files || [];
  }

  if (raw) {
    let pick = 0;
    if (fileIndex !== null && !Number.isNaN(fileIndex)) {
      pick = fileIndex;
    }
    if (pick < 0 || pick >= entries.length) {
      return new Response('Not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    const ent = entries[pick];
    const obj = await env.CT_IMAGES.get(ent.r2Key);
    if (!obj) {
      return new Response('Not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    const ct =
      ent.contentType || obj.httpMetadata?.contentType || 'application/octet-stream';
    return new Response(obj.body, {
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const parts = [
    '<p class="note">ลิงก์ชั่วคราว ~4 ชม. — ไม่มีข้อมูลระบุตัวตนใน URL</p>',
    '<p class="note hint">Neuro เปิดดูจากลิงก์นี้ได้เลย • ภาพ: กด <strong>+ ขยาย / − ย่อ</strong> แล้วเลื่อนดูในกรอบ • วิดีโอ: ปรับ <strong>slow motion</strong> ที่ปุ่ม 0.25×–0.5× • <strong>บันทึกภาพ/วิดีโอ</strong> = ดาวน์โหลด (บางมือถืออาจต้อง <strong>กดค้าง</strong> ที่รูปหรือวิดีโอ แล้วเลือกบันทึก)</p>',
  ];
  const basePath = url.pathname;
  const tEnc = encodeURIComponent(t);

  for (let i = 0; i < entries.length; i++) {
    const ent = entries[i];
    const obj = await env.CT_IMAGES.get(ent.r2Key);
    if (!obj) continue;
    const ct =
      ent.contentType || obj.httpMetadata?.contentType || 'application/octet-stream';
    if (ct.startsWith('image/')) {
      const imgSrc = `${basePath}?t=${tEnc}&raw=1&i=${i}`;
      parts.push(imageSection(i, entries.length, imgSrc));
    } else if (ct.startsWith('video/')) {
      const vSrc = `${basePath}?t=${tEnc}&raw=1&i=${i}`;
      parts.push(videoSection(i, entries.length, vSrc));
    } else {
      const dl = `${basePath}?t=${tEnc}&raw=1&i=${i}`;
      parts.push(
        `<section class="media-block"><div class="img-cap">ไฟล์ ${i + 1} / ${entries.length}</div><p class="note">${ct} — <a class="zbtn save" href="${dl}" download="stroke-ct-${i + 1}" target="_blank" rel="noopener" style="display:inline-flex">ดาวน์โหลด</a></p></section>`
      );
    }
  }

  if (parts.length <= 2) {
    return new Response(htmlShell('<p class="note">ไม่พบไฟล์ใน storage</p>'), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  return new Response(htmlShell(parts.join('')), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
