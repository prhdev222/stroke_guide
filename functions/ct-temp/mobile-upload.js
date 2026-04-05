// GET /ct-temp/mobile-upload?k=<mobileKey> หรือ ?u=<uploadToken> — อัปโหลดบนมือถือ (มี PIN ถ้า session ใหม่)
// QR ฝั่งพยาบาลใช้เฉพาะ ?k= — ไม่มี upload token ในลิงก์

import {
  ctBindingsOk,
  resolveCtSessionIdFromMobileParams,
  purgeSession,
} from '../_ct-temp-shared.js';

function htmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const k = url.searchParams.get('k') || '';
  const u = url.searchParams.get('u') || '';

  if (!k.trim() && !u.trim()) {
    return new Response(
      `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ลิงก์ไม่ถูกต้อง</title></head><body style="font-family:system-ui,'Noto Sans Thai',sans-serif;padding:20px;line-height:1.6">ลิงก์ไม่ถูกต้อง — สแกน QR จากจอ Staff หรือขอลิงก์ใหม่</body></html>`,
      {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      }
    );
  }

  if (!ctBindingsOk(env)) {
    return new Response(
      `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ระบบไม่พร้อม</title></head><body style="font-family:system-ui,'Noto Sans Thai',sans-serif;padding:20px">ยังไม่ได้ตั้งค่า CT storage</body></html>`,
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  const resolved = await resolveCtSessionIdFromMobileParams(env, k, u);
  if (!resolved) {
    return new Response(
      `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ลิงก์ไม่ถูกต้อง</title></head><body style="font-family:system-ui,'Noto Sans Thai',sans-serif;padding:20px;line-height:1.6">ลิงก์ไม่ถูกต้องหรือหมดอายุ — ขอ QR / ลิงก์ใหม่จากเจ้าหน้าที่</body></html>`,
      {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      }
    );
  }

  const raw = await env.CT_SESSIONS.get(`cts:${resolved.sessionId}`);
  if (!raw) {
    return new Response(
      `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>หมดอายุ</title></head><body style="font-family:system-ui,'Noto Sans Thai',sans-serif;padding:20px">session ไม่พบ</body></html>`,
      { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  let session;
  try {
    session = JSON.parse(raw);
  } catch {
    return new Response(
      `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ข้อผิดพลาด</title></head><body style="font-family:system-ui,'Noto Sans Thai',sans-serif;padding:20px">ข้อมูล session เสีย</body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  if (Date.now() > session.exp) {
    await purgeSession(env, resolved.sessionId, session);
    return new Response(
      `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>หมดอายุ</title></head><body style="font-family:system-ui,'Noto Sans Thai',sans-serif;padding:20px;line-height:1.6">ลิงก์หมดอายุแล้ว (4 ชม.) — ขอสร้างลิงก์ใหม่จาก Staff</body></html>`,
      { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  const needsPin = !!session.uploadPin;
  const kJs = resolved.paramK != null ? JSON.stringify(resolved.paramK) : 'null';
  const uJs = resolved.paramU != null ? JSON.stringify(resolved.paramU) : 'null';
  const directTokenJs = !needsPin ? JSON.stringify(session.uploadToken) : 'null';

  const pinBlock = needsPin
    ? `<div id="pinGate" class="box">
<h1>ยืนยันรหัส</h1>
<p class="sub">ดูรหัส <strong>4 หลัก</strong>บนจอเจ้าหน้าที่ (Stroke wizard) แล้วกรอกด้านล่าง — ไม่แชร์รหัสนอกทีมดูแล</p>
<input type="text" id="pinInp" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="••••" autocomplete="one-time-code" style="width:100%;font-size:22px;letter-spacing:0.35em;text-align:center;padding:14px;border:1px solid #ccc;border-radius:10px;box-sizing:border-box;font-family:ui-monospace,monospace">
<button type="button" class="btn" id="pinBtn">ยืนยัน</button>
<p class="st err" id="pinErr" style="display:none;margin-top:10px"></p>
</div>`
    : '';

  const mainStyle = needsPin ? 'display:none' : '';
  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5"><title>อัปโหลด CT ชั่วคราว</title>
<style>
body{font-family:system-ui,'Noto Sans Thai',sans-serif;background:#f0f4f8;margin:0;padding:16px;color:#1a1a1a}
.box{max-width:480px;margin:0 auto 16px;background:#fff;border-radius:14px;padding:18px;box-shadow:0 2px 16px rgba(0,0,0,.08)}
h1{font-size:18px;margin:0 0 8px}
.sub{font-size:13px;color:#555;line-height:1.55;margin-bottom:12px}
.lbl{font-size:12px;font-weight:700;color:#333;margin-top:10px;margin-bottom:4px}
.hint{font-size:11px;color:#666;line-height:1.45;margin:4px 0 6px}
input[type=file]{width:100%;font-size:16px;margin:6px 0 10px;padding:10px;border:1px solid #ccc;border-radius:10px;box-sizing:border-box}
.btn{width:100%;padding:14px;border:none;border-radius:12px;background:#1b4f72;color:#fff;font-size:16px;font-weight:700;cursor:pointer;margin-top:8px;touch-action:manipulation;font-family:inherit}
.btn:disabled{opacity:.55;cursor:not-allowed}
.st{font-size:13px;margin-top:12px;line-height:1.5;color:#333}
.err{color:#a30}
.ok{color:#0a6b3a}
.mob-cap{border-top:1px solid #e0e0e0;margin-top:14px;padding-top:14px}
.mob-cap h2{font-size:14px;margin:0 0 6px}
.mob-rb{display:inline-flex;align-items:center;justify-content:center;padding:12px 14px;margin:6px 6px 0 0;border-radius:10px;border:1px solid #1b4f72;background:#f8fafc;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;touch-action:manipulation}
.mob-rb:disabled{opacity:.5;cursor:not-allowed}
#mobPrev{width:100%;max-height:220px;min-height:120px;background:#111;border-radius:10px;display:none;object-fit:contain;-webkit-transform:translateZ(0);transform:translateZ(0)}
</style></head><body>
${pinBlock}
<div id="mainUpload" class="box" style="${mainStyle}">
<h1>อัปโหลดภาพ / วิดีโอ CT</h1>
<p class="sub">เลือกหลายไฟล์ได้ • ไม่มี HN/ชื่อในลิงก์ • หมดอายุตาม session (~4 ชม.)</p>
<div class="lbl">รูปภาพ / DICOM</div>
<p class="hint">มือถือบางเครื่องถ้ารวมช่องเดียวจะเหลือแค่ “ถ่ายรูป” — เลือกวิดีโอจากช่องถัดไป หรือถ่ายคลิปในหน้านี้</p>
<input type="file" id="f" multiple accept="image/*,.dcm,application/dicom">
<div class="lbl">วิดีโอจากเครื่อง / แกลเลอรี</div>
<input type="file" id="fv" multiple accept="video/*">
<div class="mob-cap" id="mobCapWrap">
<h2>📹 ถ่ายวิดีโอในหน้านี้ (หลายคลิปได้)</h2>
<p class="hint">อนุญาตกล้อง+ไมค์ • กดเริ่ม/หยุดทีละคลิป แล้วกด <strong>อัปโหลด</strong> — ส่งพร้อมรูป/วิดีโอที่เลือกด้านบน</p>
<video id="mobPrev" playsinline webkit-playsinline muted></video>
<div>
<button type="button" class="mob-rb" id="mobRecStart">● เริ่มถ่าย</button>
<button type="button" class="mob-rb" id="mobRecStop" disabled>■ หยุดถ่าย</button>
<button type="button" class="mob-rb" id="mobRecFlip">↻ สลับกล้อง</button>
</div>
<p class="hint" id="mobRecHint">รอบถัดไป: กล้องหลัง</p>
<div id="mobRecList"></div>
</div>
<button type="button" class="btn" id="b">อัปโหลด</button>
<p class="st" id="s"></p>
</div>
<script>
(function(){
  var K=${kJs};
  var U=${uJs};
  var NEEDS_PIN=${needsPin ? 'true' : 'false'};
  var T=${directTokenJs};
  window._mobRecFiles=window._mobRecFiles||[];
  window._mobFacing='environment';
  window._mobStream=null;
  window._mobMR=null;
  window._mobChunks=[];
  var b,f,fv,s,cap,_inited=false;
  function pickMime(){
    var c=['video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
    for(var i=0;i<c.length;i++){if(window.MediaRecorder&&MediaRecorder.isTypeSupported(c[i]))return c[i];}
    return '';
  }
  function bindMobPrev(v,stream){
    if(!v||!stream)return;
    v.muted=true;
    v.defaultMuted=true;
    v.setAttribute('muted','');
    v.setAttribute('playsinline','');
    v.setAttribute('webkit-playsinline','');
    try{v.playsInline=true;}catch(e){}
    v.style.objectFit='contain';
    v.style.minHeight='120px';
    v.srcObject=stream;
    v.style.display='block';
    function tryPlay(){var p=v.play&&v.play();if(p&&typeof p.then==='function')p.catch(function(){});}
    v.onloadedmetadata=function(){tryPlay();};
    tryPlay();
  }
  function recListRefresh(){
    var el=document.getElementById('mobRecList');
    if(!el)return;
    var arr=window._mobRecFiles;
    if(!arr.length){el.innerHTML='';return;}
    el.innerHTML='<div style="font-weight:600;margin:8px 0 6px;font-size:12px">คลิปรออัปโหลด ('+arr.length+')</div>'+arr.map(function(file,i){
      var mb=(file.size/(1024*1024)).toFixed(2);
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid #eee;font-size:12px"><span>คลิป '+(i+1)+' — '+mb+' MB</span><button type="button" data-ri="'+i+'" class="mob-rm" style="padding:6px 12px;border-radius:8px;border:1px solid #ccc;background:#f5f5f5;font-size:12px">ลบ</button></div>';
    }).join('');
    el.querySelectorAll('.mob-rm').forEach(function(btn){
      btn.addEventListener('click',function(){
        var i=parseInt(btn.getAttribute('data-ri'),10);
        if(i>=0&&i<window._mobRecFiles.length){window._mobRecFiles.splice(i,1);recListRefresh();}
      });
    });
  }
  function initUpload(){
    if(_inited)return;
    _inited=true;
    b=document.getElementById('b');
    f=document.getElementById('f');
    fv=document.getElementById('fv');
    s=document.getElementById('s');
    cap=document.getElementById('mobCapWrap');
    document.getElementById('mobRecFlip').addEventListener('click',function(){
      window._mobFacing=window._mobFacing==='environment'?'user':'environment';
      var h=document.getElementById('mobRecHint');
      if(h)h.textContent='รอบถัดไป: '+(window._mobFacing==='environment'?'กล้องหลัง':'กล้องหน้า');
    });
    document.getElementById('mobRecStop').addEventListener('click',function(){
      if(window._mobMR&&window._mobMR.state==='recording'){try{window._mobMR.stop();}catch(e){}}
    });
    document.getElementById('mobRecStart').addEventListener('click',async function(){
      if(window._mobMR&&window._mobMR.state==='recording')return;
      var bs=document.getElementById('mobRecStart');
      var be=document.getElementById('mobRecStop');
      try{
        window._mobChunks=[];
        var constraints={audio:true,video:{facingMode:window._mobFacing,width:{ideal:1280},height:{ideal:720}}};
        try{
          window._mobStream=await navigator.mediaDevices.getUserMedia(constraints);
        }catch(e0){
          try{window._mobStream=await navigator.mediaDevices.getUserMedia({audio:true,video:{facingMode:window._mobFacing}});}
          catch(e1){window._mobStream=await navigator.mediaDevices.getUserMedia({audio:true,video:true});}
        }
        var v=document.getElementById('mobPrev');
        bindMobPrev(v,window._mobStream);
        var mime=pickMime();
        if(!mime){
          window._mobStream.getTracks().forEach(function(t){t.stop();});
          window._mobStream=null;
          alert('เบราว์เซอร์นี้ไม่รองรับการบันทึกวิดีโอ — ใช้เลือกวิดีโอจากแกลเลอรีแทน');
          return;
        }
        window._mobMR=new MediaRecorder(window._mobStream,{mimeType:mime});
        window._mobMR.ondataavailable=function(e){if(e.data&&e.data.size>0)window._mobChunks.push(e.data);};
        window._mobMR.onstop=function(){
          var mr=window._mobMR;
          var blob=new Blob(window._mobChunks,{type:(mr&&mr.mimeType)||mime||'video/webm'});
          var ext=blob.type.indexOf('mp4')>=0?'mp4':'webm';
          var file=new File([blob],'ct-mob-'+(window._mobRecFiles.length+1)+'-'+Date.now()+'.'+ext,{type:blob.type||mime});
          window._mobRecFiles.push(file);
          recListRefresh();
          if(window._mobStream){window._mobStream.getTracks().forEach(function(t){t.stop();});window._mobStream=null;}
          window._mobMR=null;
          window._mobChunks=[];
          var pv=document.getElementById('mobPrev');
          if(pv){pv.onloadedmetadata=null;pv.srcObject=null;pv.style.display='none';}
          if(bs)bs.disabled=false;
          if(be)be.disabled=true;
        };
        window._mobMR.start(500);
        if(bs)bs.disabled=true;
        if(be)be.disabled=false;
      }catch(err){
        if(window._mobStream){window._mobStream.getTracks().forEach(function(t){t.stop();});window._mobStream=null;}
        if(bs)bs.disabled=false;
        if(be)be.disabled=true;
        alert('เปิดกล้องไม่ได้: '+(err&&err.message?err.message:err));
      }
    });
    if(!window.MediaRecorder||!navigator.mediaDevices||typeof navigator.mediaDevices.getUserMedia!=='function'){
      if(cap){
        cap.querySelector('h2').textContent='📹 ถ่ายวิดีโอ (ไม่รองรับบนเบราว์เซอร์นี้)';
        var p=cap.querySelector('.hint');
        if(p)p.textContent='ใช้ช่อง «วิดีโอจากเครื่อง» ด้านบนแทน';
        ['mobPrev','mobRecStart','mobRecStop','mobRecFlip','mobRecHint'].forEach(function(id){var e=document.getElementById(id);if(e)e.style.display='none';});
      }
    }
    b.addEventListener('click',async function(){
      if(!T){s.className='st err';s.textContent='ยังไม่ได้ยืนยันรหัส';return;}
      var nImg=f&&f.files?f.files.length:0;
      var nVid=fv&&fv.files?fv.files.length:0;
      var nRec=(window._mobRecFiles||[]).length;
      if(!nImg&&!nVid&&!nRec){s.className='st err';s.textContent='เลือกไฟล์ หรือถ่ายวิดีโอ หรือเลือกคลิปจากแกลเลอรีก่อน';return;}
      b.disabled=true;
      s.className='st';
      s.textContent='กำลังอัปโหลด...';
      try{
        var fd=new FormData();
        var i;
        for(i=0;i<nImg;i++)fd.append('file',f.files[i]);
        for(i=0;i<nVid;i++)fd.append('file',fv.files[i]);
        for(i=0;i<nRec;i++)fd.append('file',window._mobRecFiles[i]);
        var r=await fetch('/ct-temp/upload',{method:'POST',headers:{'Authorization':'Bearer '+T},body:fd});
        var j=await r.json().catch(function(){return {};});
        if(!r.ok)throw new Error(j.error||('HTTP '+r.status));
        s.className='st ok';
        s.textContent='อัปโหลดสำเร็จ '+j.added+' ไฟล์ — รวม '+j.totalFiles+' ไฟล์ • แจ้ง Neuro เปิดลิงก์ดูได้';
        f.value='';
        fv.value='';
        window._mobRecFiles=[];
        recListRefresh();
      }catch(e){
        s.className='st err';
        s.textContent='ไม่สำเร็จ: '+(e.message||e);
      }
      b.disabled=false;
    });
  }
  async function afterPinOk(writeToken){
    T=writeToken;
    var pg=document.getElementById('pinGate');
    var mu=document.getElementById('mainUpload');
    if(pg)pg.style.display='none';
    if(mu)mu.style.display='block';
    initUpload();
  }
  if(NEEDS_PIN){
    document.getElementById('pinBtn').addEventListener('click',async function(){
      var pe=document.getElementById('pinErr');
      var pi=document.getElementById('pinInp');
      var pv=(pi&&pi.value)?pi.value.trim():'';
      if(!/^\\d{4}$/.test(pv)){
        if(pe){pe.style.display='block';pe.textContent='กรอกรหัส 4 หลัก (ตัวเลข)';}return;
      }
      var btn=document.getElementById('pinBtn');
      if(btn)btn.disabled=true;
      if(pe){pe.style.display='none';}
      try{
        var r=await fetch('/ct-temp/mobile-verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({k:K,u:U,pin:pv})});
        var j=await r.json().catch(function(){return {};});
        if(!r.ok)throw new Error(j.error||('HTTP '+r.status));
        if(!j.writeToken)throw new Error('ไม่ได้รับโทเคน');
        await afterPinOk(j.writeToken);
      }catch(e){
        if(pe){pe.style.display='block';pe.textContent=(e&&e.message)?e.message:'ไม่สำเร็จ';}
      }
      if(btn)btn.disabled=false;
    });
  }else{
    initUpload();
  }
})();
<\/script></body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}
