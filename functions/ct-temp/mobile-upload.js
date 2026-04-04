// GET /ct-temp/mobile-upload?u=<uploadToken> — หน้าเว็บบนมือถือให้พยาบาลอัปโหลดภาพ/วิดีโอ (สแกน QR จาก Staff wizard)
// Token อยู่ใน URL — ใช้ภายใน รพ. ระวังอย่าแชร์ภายนอก

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const token = (url.searchParams.get('u') || '').trim();
  if (
    !token ||
    token.length < 16 ||
    token.length > 256 ||
    !/^[a-fA-F0-9]+$/i.test(token)
  ) {
    return new Response(
      `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ลิงก์ไม่ถูกต้อง</title></head><body style="font-family:system-ui,'Noto Sans Thai',sans-serif;padding:20px;line-height:1.6">ลิงก์อัปโหลดไม่ถูกต้อง — ขอ QR / ลิงก์ใหม่จากเจ้าหน้าที่</body></html>`,
      {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      }
    );
  }

  const tJs = JSON.stringify(token);
  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5"><title>อัปโหลด CT ชั่วคราว</title>
<style>
body{font-family:system-ui,'Noto Sans Thai',sans-serif;background:#f0f4f8;margin:0;padding:16px;color:#1a1a1a}
.box{max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:18px;box-shadow:0 2px 16px rgba(0,0,0,.08)}
h1{font-size:18px;margin:0 0 8px}
.sub{font-size:13px;color:#555;line-height:1.55;margin-bottom:16px}
input[type=file]{width:100%;font-size:16px;margin:10px 0;padding:10px;border:1px solid #ccc;border-radius:10px;box-sizing:border-box}
.btn{width:100%;padding:14px;border:none;border-radius:12px;background:#1b4f72;color:#fff;font-size:16px;font-weight:700;cursor:pointer;margin-top:8px;touch-action:manipulation;font-family:inherit}
.btn:disabled{opacity:.55;cursor:not-allowed}
.st{font-size:13px;margin-top:12px;line-height:1.5;color:#333}
.err{color:#a30}
.ok{color:#0a6b3a}
</style></head><body><div class="box">
<h1>อัปโหลดภาพ / วิดีโอ CT</h1>
<p class="sub">เลือกหลายไฟล์ได้ • ไม่มี HN/ชื่อในลิงก์ • หมดอายุตาม session (~4 ชม.)</p>
<input type="file" id="f" multiple accept="image/*,video/*,.dcm,application/dicom">
<button type="button" class="btn" id="b">อัปโหลด</button>
<p class="st" id="s"></p>
</div>
<script>
(function(){
  var T=${tJs};
  var b=document.getElementById('b');
  var f=document.getElementById('f');
  var s=document.getElementById('s');
  b.addEventListener('click',async function(){
    if(!f.files||!f.files.length){s.className='st err';s.textContent='เลือกไฟล์ก่อน';return;}
    b.disabled=true;
    s.className='st';
    s.textContent='กำลังอัปโหลด...';
    try{
      var fd=new FormData();
      for(var i=0;i<f.files.length;i++)fd.append('file',f.files[i]);
      var r=await fetch('/ct-temp/upload',{method:'POST',headers:{'Authorization':'Bearer '+T},body:fd});
      var j=await r.json().catch(function(){return {};});
      if(!r.ok)throw new Error(j.error||('HTTP '+r.status));
      s.className='st ok';
      s.textContent='อัปโหลดสำเร็จ '+j.added+' ไฟล์ — รวม '+j.totalFiles+' ไฟล์ • แจ้ง Neuro เปิดลิงก์ดูได้';
      f.value='';
    }catch(e){
      s.className='st err';
      s.textContent='ไม่สำเร็จ: '+(e.message||e);
    }
    b.disabled=false;
  });
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
