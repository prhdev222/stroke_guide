# คู่มือตั้งค่า — แชร์ภาพ CT ชั่วคราวให้ Neuro (R2 + KV)

ระบบนี้ให้ฝั่ง รพ. **อัปโหลดภาพ CT** แล้วได้ **ลิงก์ดูชั่วคราว ~4 ชั่วโมง** ส่งให้แพทย์ประสาทเปิดได้ — **ไม่มี HN/ชื่อใน URL หรือ path ไฟล์** (ออกแบบให้ลดความเสี่ยง PDPA)

---

## สิ่งที่ต้องมี

1. บัญชี [Cloudflare](https://dash.cloudflare.com) ที่ deploy **Pages** โปรเจกต์นี้อยู่แล้ว  
2. **Wrangler** ติดตั้งแล้ว (`npm i` ใน repo แล้วใช้ `npx wrangler`)  
3. (แนะนำ) ล็อกอิน Wrangler: `npx wrangler login`

---

## ขั้นตอนที่ 0 — เปิดใช้ R2 ใน Cloudflare (บังคับก่อนสร้าง bucket)

ถ้ารัน `wrangler r2 bucket create` แล้วได้ error **`Please enable R2 through the Cloudflare Dashboard` [code: 10042]** แปลว่ายังไม่ได้เปิดบริการ R2 สำหรับบัญชีนี้

ทำตามนี้:

1. เข้า [Cloudflare Dashboard](https://dash.cloudflare.com)  
2. เมนูซ้ายเลือก **R2 Object Storage** (หรือ **Storage & databases** → **R2**)  
3. ถ้ายังไม่เคยใช้ ระบบจะให้กด **Purchase R2** / **Enable R2** / **Get started** — ทำตามจนจบ (มี free tier ตามนโยบาย Cloudflare ณ ขณะนั้น)  
4. รอสักครู่ แล้วลองคำสั่งสร้าง bucket อีกครั้ง

หรือสร้าง bucket จากหน้า **R2 → Create bucket** ใน Dashboard โดยตรง (ไม่ผ่าน CLI) ก็ได้ — ชื่อเช่น `stroke-ct-temp` ให้ตรงกับ binding `CT_IMAGES`

### ผูกบัตร / PayPal แล้วจะโดนเรียกเก็บทุกเดือนไหม?

หน้า **Activate R2** มักแสดง **$0/month** และ **Due today $0** — การใส่บัตร (หรือ PayPal / Google Pay ตามที่มี) คือ **วิธีชำระเงินสำรอง** กรณีใช้งาน **เกินโควตาฟรี** ต่อเดือน (storage / จำนวน request) ตามที่ Cloudflare กำหนด ณ ขณะนั้น — **ไม่ได้แปลว่ามีค่าธรรมเนียมรายเดือนคงที่** เพียงเพราะเปิด R2

---

## ค่าใช้จ่าย — ทำให้ “ใกล้ฟรี” และลดความกลัวจ่ายเกิน

**ไม่มีใครรับประกันได้ว่า Cloudflare จะฟรีตลอดกาล** (นโยบายอาจเปลี่ยน) แต่ในการใช้งานจริงของฟีเจอร์นี้:

| ปัจจัย | ทำไมมักไม่เกินโควตา |
|--------|----------------------|
| ไฟล์ชั่วคราว ~4 ชม. + KV หมดอายุ | ไม่สะสมเป็น TB |
| แนะนำ **R2 lifecycle** ลบ prefix `ct/` ภายใน 1 วัน | ซากไฟล์ไม่ค้างยาว |
| ขนาดไฟล์จำกัดในโค้ด (~50 MB/ไฟล์) | แต่ละเคสไม่ใหญ่ผิดปกติ |
| จำนวนเคส stroke ต่อวันในหนึ่ง รพ. | ปริมาณ request/storage ต่ำเมื่อเทียบโควตาฟรี |

**ลดความเสี่ยงเพิ่ม:**

1. ใน Cloudflare ตั้ง **billing / usage alerts** (ถ้ามีในแผนของคุณ) ให้แจ้งเตือนเมื่อใกล้เกินงบ  
2. เป็นครั้งคราวดู **R2 → Metrics** (storage, Class A/B operations)  
3. อย่าเผยแพร่ลิงก์ดู CT แบบสาธารณะกว้างๆ — ลดการดาวน์โหลดซ้ำ  

**ถ้าไม่ยอมรับความเสี่ยงค่าเก็บ object storage เลย:** ปิดการใช้ R2 / ไม่เปิดฟีเจอร์แชร์ CT แบบนี้ แล้วใช้ **CD / อีเมล / ระบบภายใน รพ.** แทน

---

## ขั้นตอนที่ 1 — สร้าง R2 Bucket

หลังเปิด R2 แล้ว รันบนเครื่อง (หรือสร้างใน Dashboard → R2 → Create bucket):

```bash
npx wrangler r2 bucket create stroke-ct-temp
```

ตั้งชื่อ bucket ให้ตรงกับที่จะผูกใน binding (ตัวอย่างใช้ `stroke-ct-temp`)

---

## ขั้นตอนที่ 2 — สร้าง KV Namespace

KV ใช้เก็บ metadata ของ session (token อัปโหลด / token ดู / เวลาหมดอายุ)

```bash
npx wrangler kv namespace create CT_SESSIONS
```

จด **id** ที่ได้ (production)

สำหรับทดสอบ local แนะนำสร้าง preview ด้วย:

```bash
npx wrangler kv namespace create CT_SESSIONS --preview
```

จด **preview_id** (ถ้ามี)

ดูรายการ:

```bash
npx wrangler kv namespace list
```

---

## ทำไมกด **Add binding** ใน Dashboard ไม่ได้ / บอกให้ไปดู `wrangler.toml`?

ถ้าใน repo มี **`wrangler.toml`** ที่ระบุ **`pages_build_output_dir`** (เช่น `public`) ไว้แล้ว Cloudflare จะถือว่า **การตั้งค่า Pages (รวม bindings) มาจากไฟล์นี้เป็นแหล่งหลัก** — ตาม [เอกสารทางการ](https://developers.cloudflare.com/pages/functions/wrangler-configuration/) จะ **แก้ฟิลด์เดียวกันใน Dashboard ไม่ได้** (หรือปุ่ม Add binding ใช้ไม่ได้) นี่เป็น**พฤติกรรมปกติ** ไม่ใช่บั๊ก

**ทำอย่างไร:** แก้ **`wrangler.toml`** ใน repo ให้มี `[[kv_namespaces]]` และ `[[r2_buckets]]` ครบ แล้ว **commit + push** ไป branch ที่ Pages build (เช่น `main`) — รอ deploy รอบใหม่แล้ว binding จะถูกใช้จากไฟล์

ข้อกำหนดเพิ่ม:

- โปรเจกต์ Pages ต้องใช้ **Build system V2** ขึ้นไป ([คู่มือ V2](https://developers.cloudflare.com/pages/configuration/build-image/#v2-build-system))  
- ชื่อโปรเจกต์ในไฟล์ **`name`** ต้องตรงกับชื่อโปรเจกต์ใน Dashboard (เช่น `stroke-prh`)

โปรเจกต์นี้ใส่ KV + R2 ใน `wrangler.toml` ไว้แล้ว — แค่ให้ไฟล์นี้ **อยู่บน GitHub และ deploy ผ่านแล้ว**

ตรวจว่า binding มีผล: หลัง deploy ลองกดสร้างลิงก์ CT ใน Staff wizard — ถ้าไม่ขึ้น 503 แปลว่า `CT_SESSIONS` / `CT_IMAGES` เข้าถึงได้

---

## ขั้นตอนที่ 3 — ผูก Bindings บน Cloudflare Pages (เฉพาะโปรเจกต์ที่ยังไม่ใช้ wrangler เป็น source of truth)

> **ถ้าโปรเจกต์คุณใช้ `wrangler.toml` + `pages_build_output_dir` แล้ว — ข้ามขั้นตอนนี้** ใช้การแก้ไฟล์ใน repo ตามหัวข้อด้านบนแทน

1. เปิด **Cloudflare Dashboard** → **Workers & Pages** → เลือกโปรเจกต์ Pages ของ Stroke  
2. **Settings** → **Functions** → **Bindings** → **Add binding**

### 3.1 KV Namespace

- Type: **KV Namespace**  
- Variable name: **`CT_SESSIONS`** (ต้องสะกดตรงนี้)  
- เลือก namespace ที่สร้างในขั้นตอนที่ 2  

### 3.2 R2 Bucket

- Type: **R2 Bucket**  
- Variable name: **`CT_IMAGES`** (ต้องสะกดตรงนี้)  
- Bucket: **`stroke-ct-temp`** (หรือชื่อที่คุณใช้)

กด **Save** แล้ว **รอ deploy รอบใหม่** (หรือ trigger redeploy) เพื่อให้ binding มีผล

### กด **+ Add** แล้วไม่ได้ / ไม่มีอะไรให้เลือก / ผูกไม่ได้

ทำตามลำดับนี้ (จุดที่พบบ่อย):

1. **สร้างทรัพยากรก่อน ค่อยมาผูก**  
   - **KV:** ไปที่เมนูบัญชี **Storage & databases** → **KV** → **Create namespace** ตั้งชื่อเช่น `CT_SESSIONS`  
     (อย่าพึ่งผูกใน Pages ถ้ายังไม่มี namespace ในรายการ)  
   - **R2:** ต้อง **เปิดใช้ R2 ครบ** (หน้า Activate + มี bucket แล้ว) — ถ้ายัง error 10042 ยังผูก R2 ไม่ได้

2. **เลือก Environment ให้ถูก**  
   บน Pages → Settings บางครั้งแยก **Production** / **Preview** — ผูก binding **ทั้งสอง** หรืออย่างน้อย **Production** ที่ใช้จริง

3. **เบราว์เซอร์**  
   ปิด extension บล็อก popup, ลอง **Incognito** หรือเบราว์เซอร์อื่น — ปุ่ม **+ Add** มักเปิด modal ด้านบน ถ้าโดนบล็อกจะเหมือน “กดไม่ได้”

4. **สิทธิ์บัญชี**  
   ต้องเป็นเจ้าของบัญชี / บทบาทที่แก้ Workers & Pages ได้ — ถ้าเป็น subuser อาจไม่เห็นปุ่มหรือบันทึกไม่ได้

5. **R2 ยังไม่เปิด**  
   ถ้าเลือก type **R2** แล้วไม่มี bucket ในรายการ หรือ error — กลับไปเปิด R2 ตาม **ขั้นตอนที่ 0** ก่อน

6. **ผูกผ่าน Git + `wrangler.toml` (ทางเลือก)**  
   ถ้า Dashboard ยังใช้ไม่ได้: ใส่ `[[kv_namespaces]]` และ `[[r2_buckets]]` ใน `wrangler.toml` ให้ถูก (ใส่ **KV id จริง**) แล้วให้ **deploy รอบใหม่**  
   **สำคัญ:** ค่า `name` ใน `wrangler.toml` ต้อง **ตรงกับชื่อโปรเจกต์ Pages** ใน Dashboard (เช่น `stroke-prh`) ไม่งั้น binding อาจไปคนละโปรเจกต์ — ถ้าโปรเจกต์คุณชื่อ `stroke-prh` ให้แก้บรรทัด `name = "..."` ใน `wrangler.toml` ให้ตรง แล้ว push ใหม่

7. **ยังไม่ได้**  
   ลอง **Logout / Login** Cloudflare หรือติดต่อ **Cloudflare Support** พร้อมบอกว่าเป็น Pages project ชื่ออะไร + กด Add แล้วเกิดอะไร (error ข้อความ / จอว่าง)

---

## ขั้นตอนที่ 4 — ตั้งค่าใน `wrangler.toml` (ทางเลือก)

ถ้าใช้ `wrangler pages dev` หรือ deploy ผ่าน Wrangler และอยากให้ binding อยู่ใน repo:

แก้ที่ `wrangler.toml` — เอา comment ออกและใส่ **KV id จริง**:

```toml
[[kv_namespaces]]
binding = "CT_SESSIONS"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

[[r2_buckets]]
binding = "CT_IMAGES"
bucket_name = "stroke-ct-temp"
```

> ถ้าผูกเฉพาะใน Dashboard อย่างเดียว **ไม่บังคับ** ต้องมีบล็อกนี้ในไฟล์ — แต่ local dev อาจต้องใส่เพื่อให้ `pages dev` เห็น KV/R2

---

## ขั้นตอนที่ 5 — Environment Variables (แนะนำ production)

ใน **Pages → Settings → Environment Variables** (และ/หรือ `.dev.vars` สำหรับ local):

| ตัวแปร | ความหมาย |
|--------|-----------|
| `CT_TEMP_SECRET` | **ไม่บังคับ** — ถ้าไม่ตั้ง: สร้างลิงก์ได้ทันทีจาก wizard ถ้าตั้ง: wizard ไม่มีช่องใส่แล้ว ต้องเรียก `POST /ct-temp/session` พร้อม header `X-CT-Temp-Secret` เอง (เช่น Postman) |
| `LINE_CHANNEL_ACCESS_TOKEN` | สำหรับปุ่ม **ส่งเข้า LINE (OA)** — จาก LINE Developers |
| `LINE_NEURO_USER_ID` | (แนะนำ) User ID แพทย์ Neuro (U...) ที่ **add OA แล้ว** — ระบบจะ push ข้อความ 1:1 |
| `LINE_REFER_USER_ID` | (ทางเลือก) Group ID (C...) ถ้าไม่ตั้ง `LINE_NEURO_USER_ID` — OA ต้องอยู่ในกลุ่ม |

---

## ขั้นตอนที่ 6 — R2 Lifecycle (ลบไฟล์ค้าง)

KV หมดอายุประมาณ **4 ชม.** (+ grace) แต่ไฟล์ใน R2 อาจค้างถ้าไม่มี job ลบ

แนะนำใน **R2 → bucket → Settings → Object lifecycle**:

- เพิ่กกฎลบ object ที่มี prefix **`ct/`** หลัง **1 วัน** (หรือตามนโยบาย รพ.)

---

## ทดสอบบนเครื่อง (local)

1. ใส่ใน `.dev.vars` ตามต้องการ: `LINE_CHANNEL_ACCESS_TOKEN` + ปลายทาง (ทดสอบส่ง LINE), `CT_TEMP_SECRET` (ถ้าต้องการล็อกการสร้างลิงก์)

2. ผูก KV/R2 ให้ `wrangler pages dev` เห็น (ตามขั้นตอนที่ 4)

3. รัน:

   ```bash
   npx wrangler pages dev public --compatibility-date=2024-12-01
   ```

4. เปิด Staff wizard → ขั้น **CT Brain** → การ์ด **แชร์ภาพ CT ให้ Neuro**  
   - กดสร้างลิงก์ → เลือก **หลายไฟล์** แล้วอัปโหลด (หรืออัปโหลดซ้ำเพื่อแนบเพิ่ม) → เปิดลิงก์ดูในเบราว์เซอร์ (แสดงทุกภาพ)

**QR สองอัน (หลังสร้างลิงก์):** ลิงก์ **ดู** (`/ct-temp/view?t=...`) ใช้ให้ Neuro เปิดดูเท่านั้น — ถ้าต้องการให้พยาบาลบนมือถือ **อัปโหลด** ให้สแกน QR **ฝั่งพยาบาล** ที่ชี้ไป `GET /ct-temp/mobile-upload?u=<uploadToken>` (หน้าเลือกไฟล์/ถ่ายแล้วส่งเข้า `/ct-temp/upload` พร้อม Bearer token) • QR สร้างในเบราว์เซอร์ด้วยไลบรารี [qrcodejs](https://www.npmjs.com/package/qrcodejs) จาก jsDelivr (ครั้งแรกต้องโหลดสคริปต์จาก CDN) • **ความเสี่ยง:** ใครได้ QR/ลิงก์อัปโหลดก็อัปโหลดเข้า session นั้นได้จนกว่าจะหมดอายุ — ใช้ในพื้นที่ควบคุมของ รพ. เท่านั้น

ขีดจำกัดโดยประมาณ: **ไม่เกิน 30 ไฟล์** ต่อลิงก์, **ไฟล์ละ ~50 MB**, **รวม ~200 MB** ต่อ session (ดู `_ct-temp-shared.js`)

**วิดีโอ:** อัปโหลดได้ (เช่น MP4 / MOV / WebM) หน้า view จะมีตัวเล่น `<video>` — แต่ไฟล์วิดีโอมัก**ใหญ่กว่าภาพ CT มาก** (หลายสิบ–หลายร้อย MB ต่อคลิป) จึงอาจชนเพดาน **50 MB/ไฟล์** หรือ **200 MB รวม** ได้ง่าย; ถ้าต้องการคลิปยาวควรบีบอัดความละเอียด/บิตเรต หรือปรับค่าขีดจำกัดในโค้ด (และระวังเวลาอัปโหลดบนมือถือ)

**ถ่ายวิดีโอในมือถือ (Staff wizard):** บนจอแคบ (ความกว้าง ≤768px) หลังสร้างลิงก์จะมีปุ่ม **เริ่มถ่าย / หยุดถ่าย** และ **สลับกล้องหน้า–หลัง** — ใช้ `getUserMedia` + `MediaRecorder` (ต้อง HTTPS) ถ่ายได้หลายคลิปต่อลิงก์ (หลายมุม) แล้วกด **อัปโหลด** พร้อมไฟล์ที่เลือกจากแกลเลอรี; เบราว์เซอร์ที่ไม่รองรับจะซ่อนบล็อกนี้

---

## API สรุป (สำหรับอ้างอิง)

| Method | Path | หมายเหตุ |
|--------|------|-----------|
| `POST` | `/ct-temp/session` | สร้าง session; header `X-CT-Temp-Secret` **เฉพาะเมื่อ** ตั้ง `CT_TEMP_SECRET` |
| `POST` | `/line-ct-push` | body `{ "text": "..." }` — ส่งข้อความผ่าน LINE Messaging API (ลำดับปลายทางเหมือนในคู่มือ) |
| `POST` | `/ct-temp/upload` | `Authorization: Bearer <uploadToken>` — `multipart` ฟิลด์ `file` ซ้ำได้หลายไฟล์ต่อคำขอ; อัปโหลดซ้ำได้จนกว่าจะครบจำนวน/ขนาดสูงสุด |
| `GET` | `/ct-temp/view?t=<viewToken>` | หน้า viewer: ซูมภาพ (+/−), วิดีโอปรับความเร็ว (slow motion), ปุ่มบันทึก/ดาวน์โหลด • `&raw=1&i=0` = ไฟล์ดิบ |
| `GET` | `/ct-temp/mobile-upload?u=<uploadToken>` | หน้า HTML บนมือถือ: เลือกหลายไฟล์แล้ว `POST /ct-temp/upload` (Bearer = token เดียวกับ `u`) — ใช้คู่กับ QR ฝั่งพยาบาล |

---

## ปุ่มส่ง LINE ใน Staff wizard

ปุ่ม **ส่งเข้า LINE (OA)** จะเรียก `POST /line-ct-push` พร้อมข้อความร่าง (อายุ / onset / V/S — **ไม่ใส่ชื่อ-HN**) + **BEFAST + GCS** เมื่อกรอก GCS ครบ E/V/M + ลิงก์ดู CT + **NIHSS รวม/ระดับความรุนแรง** เมื่อกรอกครบ 15 รายการในขั้น NIHSS

ลำดับปลายทางบนเซิร์ฟเวอร์:

1. มี `LINE_NEURO_USER_ID` → **push** ไปที่ User นั้น (ต้อง add OA แล้ว)  
2. ไม่มีข้อ 1 แต่มี `LINE_REFER_USER_ID` → push เข้า **กลุ่ม** (OA ต้องอยู่ในกลุ่ม)  
3. ไม่มีทั้งคู่ แต่มีแถวใน `line_groups` (Turso) → push ทุกกลุ่ม (เหมือน `/line`)  
4. ไม่มีเลย → **broadcast** ไปทุกคนที่ follow OA (ระวังขอบเขต)

ถ้าส่งผ่าน API ไม่สำเร็จ UI จะถามว่าจะ **เปิด LINE แบบข้อความร่าง** (`line.me/R/msg/text/...`) แทนหรือไม่

---

## LINE เปิดเว็บได้ไหม / ถ้าเปิดไม่ได้ทำอย่างไร

### 1) LINE In-App Browser (WebView)

เมื่อกดลิงก์ `https://...` ในแชท LINE มักเปิดด้วย **เบราว์เซอร์ในแอป LINE** — โดยทั่วไปเปิดหน้า **HTTPS** ของระบบนี้ได้

- หน้า `/ct-temp/view` เป็น **HTTPS** → ควรใช้งานได้  
- ถ้าเว็บโหลดช้า: รอสักครู่ หรือกดรีเฟรช

### 2) ถ้าเปิดแล้วหน้าว่าง / โหลดไม่ได้

ลองในเมนูมุมขวาบนของ WebView LINE (⋯):

- **เปิดด้วยเบราว์เซอร์** / **Open in browser** / **Safari** / **Chrome**  
- แล้วเปิดลิงก์เดิมอีกครั้ง — บางครั้ง WebView จำกัด cookie หรือประเภทไฟล์

### 3) ไฟล์ DICOM (.dcm)

เบราว์เซอร์ส่วนใหญ่ **ไม่แสดง DICOM เป็นรูป** เหมือน JPEG — ผู้ใช้อาจเห็นเป็นการดาวน์โหลดหรือไม่แสดงผล

- **แนะนำ:** ส่ง **JPEG/PNG สกรีนจาก PACS** ถ้าต้องการให้ดูในมือถือได้ทันที  
- หรือให้ Neuro เปิดลิงก์ในเบราว์เซอร์นอก แล้วใช้แอปดู DICOM

### 4) ส่งผ่าน OA (Messaging API)

ตั้ง `LINE_CHANNEL_ACCESS_TOKEN` และปลายทาง (`LINE_NEURO_USER_ID` หรือกลุ่ม) ตามตารางในขั้นตอนที่ 5 — ปุ่ม **ส่งเข้า LINE (OA)** จะใช้ endpoint `line-ct-push.js`

---

## แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุที่เป็นไปได้ |
|--------|---------------------|
| `wrangler r2 bucket create` error **10042** / enable R2 | ยังไม่เปิดบริการ R2 ใน Dashboard — ดู **ขั้นตอนที่ 0** |
| สร้างลิงก์แล้วขึ้น 503 | ยังไม่ผูก `CT_SESSIONS` / `CT_IMAGES` บน Pages |
| สร้างลิงก์แล้วขึ้น 403 | ตั้ง `CT_TEMP_SECRET` แล้ว — ต้องส่ง header จาก client อื่น หรือเอา env ออกถ้าต้องการให้ wizard สร้างลิงก์ได้ |
| ส่ง LINE แล้ว error | ตรวจ Token, User/Group ID, และว่า Neuro **add OA** หรือ OA **อยู่ในกลุ่ม** |
| อัปโหลดไม่ได้ | หมดเวลา session, token ผิด, หรือไฟล์ใหญ่เกิน ~50MB |
| เปิดลิงก์แล้ว “รออัปโหลด” | ยังไม่กดอัปโหลดไฟล์ฝั่ง รพ. — ให้รีเฟรชหลังอัปโหลด |
| ปุ่ม LINE ไม่เปิดแอป | ลองบนมือถือ; บน PC อาจเปิด LINE Desktop หรือเว็บ — ถ้าไม่ได้ ใช้ **คัดลอกลิงก์** แทน |

---

## อ้างอิงในโค้ด

- `functions/_ct-temp-shared.js` — ค่าคงที่ TTL, ลบ session  
- `functions/ct-temp/session.js` — สร้าง session  
- `functions/ct-temp/upload.js` — อัปโหลด  
- `functions/ct-temp/view.js` — ดูไฟล์  
- `public/stroke_staff_wizard.html` — การ์ด UI + ปุ่มส่ง LINE  
- `functions/line-ct-push.js` — ส่งข้อความ CT ผ่าน Messaging API  

หากปรับชื่อ binding หรือ bucket ต้องแก้ให้ตรงกันทั้ง Dashboard และ `wrangler.toml`
