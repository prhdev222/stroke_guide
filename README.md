# Stroke Fast Tract — โรงพยาบาลสงฆ์
## คู่มือการติดตั้งและใช้งานฉบับสมบูรณ์

---

## สารบัญ
1. [ภาพรวมโปรเจกต์](#1-ภาพรวมโปรเจกต์)
2. [ไฟล์ทั้งหมดในระบบ](#2-ไฟล์ทั้งหมดในระบบ)
3. [ขั้นตอนที่ 1 — เตรียม Folder](#3-ขั้นตอนที่-1--เตรียม-folder)
4. [ขั้นตอนที่ 2 — ตั้งค่า Turso Database](#4-ขั้นตอนที่-2--ตั้งค่า-turso-database)
5. [ขั้นตอนที่ 3 — ขึ้น GitHub](#5-ขั้นตอนที่-3--ขึ้น-github)
6. [ขั้นตอนที่ 4 — Deploy บน Cloudflare Pages](#6-ขั้นตอนที่-4--deploy-บน-cloudflare-pages)
7. [ขั้นตอนที่ 5 — เชื่อม Custom Domain](#7-ขั้นตอนที่-5--เชื่อม-custom-domain)
8. [ขั้นตอนที่ 6 — ตั้งค่าครั้งแรกในแอป](#8-ขั้นตอนที่-6--ตั้งค่าครั้งแรกในแอป)
9. [การอัปเดตไฟล์ในอนาคต](#9-การอัปเดตไฟล์ในอนาคต)
10. [สรุป URL และฟีเจอร์ทั้งหมด](#10-สรุป-url-และฟีเจอร์ทั้งหมด)
11. [PDPA Compliance Summary](#11-pdpa-compliance-summary)
12. [แผน Database](#12-แผน-database)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. ภาพรวมโปรเจกต์

```
ปัญหาเดิม:
  ผู้ป่วย stroke ได้รับการวินิจฉัยช้า + ส่งต่อล่าช้า
  → ออก web app ช่วยหน้างานประเมินเร็วขึ้น

ระบบที่สร้าง:
  menu.html              → หน้าหลัก + Guideline + วิดีโอ (database-backed)
  stroke_staff_wizard.html → Staff: 8-step wizard + AI + Refer PDF
  stroke_guest.html      → Guest: BEFAST + NIHSS + rt-PA คำนวณ (ไม่ต้อง PIN)

Infrastructure:
  Hosting   → Cloudflare Pages (ฟรี, HTTPS, auto-deploy)
  Database  → Turso (ฟรี, HTTP API, SQLite)
  AI        → Claude / Groq / OpenAI / Custom (เลือกได้)
```

---

## 2. ไฟล์ทั้งหมดในระบบ

| ไฟล์ | บทบาท | ใครใช้ |
|---|---|---|
| `index.html` | หน้า menu หลัก (copy จาก menu.html) | ทุกคน |
| `stroke_staff_wizard.html` | Staff mode — 8 ขั้นตอน wizard | แพทย์/พยาบาลที่มี PIN |
| `stroke_guest.html` | Guest mode — เครื่องมือคลินิก | ทุกคน ไม่ต้อง PIN |

### โครงสร้าง Folder สุดท้าย

```
stroke-app/
├── index.html                    ← หน้า menu (rename จาก menu.html)
├── stroke_staff_wizard.html
├── stroke_guest.html
└── README.md                     ← ไฟล์นี้ (optional)
```

> **สำคัญ:** ไม่ต้องมีไฟล์อื่นเพิ่ม — ทุกอย่างอยู่ใน HTML ไฟล์เดียว (self-contained)

---

## 3. ขั้นตอนที่ 1 — เตรียม Folder

### 3.1 Download ไฟล์จากแชท Claude
1. กด Download บน `menu.html` → บันทึกเป็น **`index.html`**
2. Download `stroke_staff_wizard.html`
3. Download `stroke_guest.html`

### 3.2 สร้าง Folder
```
สร้าง folder ชื่อ: stroke-app
ใส่ไฟล์ทั้ง 3 ลงไป
```

### 3.3 ตรวจสอบ
เปิด `index.html` ด้วย browser — ควรเห็นหน้า menu ที่มี 4 card:
- Staff Mode
- Guest Mode
- Guideline & Protocol
- วิดีโอ & ลิงก์อ้างอิง

---

## 4. ขั้นตอนที่ 2 — ตั้งค่า Turso Database

> Turso ใช้สำหรับเก็บ: Guideline/Protocol, วิดีโอลิงก์, และ Case Log (anonymous)

### 4.1 สมัคร Turso (ฟรี ไม่ต้องบัตรเครดิต)
```
1. ไปที่ turso.tech
2. กด "Get started" → Sign up with GitHub
3. ยืนยัน email
```

### 4.2 สร้าง Database
```
1. ไปที่ app.turso.tech
2. กด "Databases" → "Create Database"
3. ตั้งชื่อ: stroke-db
4. เลือก Region: Asia Pacific (Singapore) — ใกล้ไทยที่สุด
5. กด "Create Database"
```

### 4.3 สร้าง Auth Token
```
1. คลิกที่ database "stroke-db"
2. กด tab "Credentials" หรือ "Tokens"
3. กด "Create Token" → ตั้งชื่อ: stroke-app
4. Copy token ทั้งหมด (จะแสดงครั้งเดียว!)
5. Copy Database URL (รูปแบบ: https://stroke-db-xxx.turso.io)
```

### 4.4 บันทึก Credentials ไว้
```
Database URL: https://stroke-db-[xxxxxx].turso.io
Auth Token:   eyJhbGci....(ยาวมาก)
```

> ตาราง SQL จะถูกสร้างอัตโนมัติเมื่อเปิดใช้งานครั้งแรก ไม่ต้องรัน SQL เอง

---

## 5. ขั้นตอนที่ 3 — ขึ้น GitHub

### 5.1 สร้าง Repository
```
1. ไปที่ github.com → Sign in
2. กด "+" → "New repository"
3. Repository name: stroke-app
4. เลือก: Private (แนะนำ — เป็น clinical tool)
5. กด "Create repository"
```

### 5.2 Push ไฟล์ขึ้น GitHub

**วิธีที่ 1: ผ่าน Terminal (macOS/Linux)**
```bash
cd stroke-app          # เข้าไปใน folder
git init
git add .
git commit -m "initial: stroke fast tract app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/stroke-app.git
git push -u origin main
```

**วิธีที่ 2: GitHub Desktop (ง่ายกว่า ไม่ต้องพิมพ์คำสั่ง)**
```
1. Download: desktop.github.com
2. เปิด GitHub Desktop → File → Add Local Repository
3. เลือก folder stroke-app
4. กด "Publish repository"
5. ติ๊ก "Keep this code private"
6. กด Publish
```

### 5.3 ตรวจสอบ
เปิด `github.com/YOUR_USERNAME/stroke-app` → ควรเห็นไฟล์ทั้ง 3 ไฟล์

---

## 6. ขั้นตอนที่ 4 — Deploy บน Cloudflare Pages

### 6.1 เชื่อม GitHub กับ Cloudflare
```
1. ไปที่ dash.cloudflare.com
2. เมนูซ้าย: "Workers & Pages"
3. กด "Pages" → "Create a project"
4. เลือก "Connect to Git"
5. กด "Connect GitHub" → อนุญาต access
6. เลือก repository: stroke-app
7. กด "Begin setup"
```

### 6.2 ตั้งค่า Build
```
Project name:        stroke-app
Production branch:   main
Build command:       (เว้นว่าง — ไม่มี build step)
Build output dir:    /   (slash เดียว)
```

### 6.3 Deploy
```
กด "Save and Deploy"
รอ ~30-60 วินาที
```

### 6.4 ผลลัพธ์
```
ได้ URL: https://stroke-app.pages.dev
เปิด browser → ควรเห็นหน้า menu
```

---

## 7. ขั้นตอนที่ 5 — เชื่อม Custom Domain

> ถ้ามีโดเมน medpriest.com อยู่บน Cloudflare แล้ว

```
1. Cloudflare Dashboard → Pages → stroke-app
2. กด tab "Custom domains"
3. กด "Set up a custom domain"
4. พิมพ์: stroke.medpriest.com
5. กด "Continue"
6. Cloudflare เพิ่ม DNS record ให้อัตโนมัติ
7. รอ ~5 นาที → ใช้งานได้
```

> **หมายเหตุ:** ถ้าโดเมนไม่ได้อยู่บน Cloudflare ต้องเพิ่ม CNAME record เองที่ DNS provider

---

## 8. ขั้นตอนที่ 6 — ตั้งค่าครั้งแรกในแอป

### 8.1 ตั้ง PIN ระบบ
```
เปิด stroke-app.pages.dev
→ Staff Mode → กด PIN แรก: 2567 (default)
→ เข้าไปได้ แนะนำให้เปลี่ยน PIN ใหม่

เปลี่ยน PIN:
  staff wizard → กดปุ่ม 🔒 มุมบนขวา → เปลี่ยน PIN
```

### 8.2 ตั้งค่า Turso ใน Menu
```
เปิด index.html (หน้า menu)
→ กดปุ่ม ⚙️ มุมบนขวา
→ ใส่ Turso Database URL
→ ใส่ Auth Token
→ กด "บันทึกการตั้งค่า"
→ กด Test → เห็น ✓ = สำเร็จ
```

### 8.3 ตั้งค่า Turso ใน Staff Wizard
```
เปิด stroke_staff_wizard.html
→ Login ด้วย PIN
→ กดปุ่ม 📦 มุมบนขวา
→ ใส่ Turso URL + Token
→ กด "Test" → เห็น ✓
(บันทึกจะ auto-fire เมื่อสร้าง PDF)
```

### 8.4 เพิ่ม Guideline และวิดีโอแรก
```
เปิด index.html → tab "Guideline"
→ กด "+ เพิ่มรายการ"
→ ใส่หมวดหมู่, ชื่อ, เนื้อหา
→ กด "บันทึก"

เพิ่มวิดีโอ NIHSS:
→ tab "วิดีโอ" → กด "+ เพิ่มวิดีโอ"
→ วาง YouTube URL
→ ตั้งชื่อ, หมวดหมู่ NIHSS
→ กด "บันทึก"
```

### 8.5 บันทึก App บน Homescreen (สำหรับมือถือ)
```
iOS Safari:
  เปิด URL → กด Share → "Add to Home Screen"

Android Chrome:
  เปิด URL → เมนู ⋮ → "Add to Home Screen"
```

---

## 9. การอัปเดตไฟล์ในอนาคต

### แก้ไขไฟล์แล้ว push → Cloudflare auto-deploy

**ผ่าน GitHub Desktop:**
```
1. แก้ไขไฟล์บนเครื่อง
2. เปิด GitHub Desktop
3. เห็น changes → ใส่ commit message → กด "Commit to main"
4. กด "Push origin"
5. Cloudflare deploy อัตโนมัติใน ~30 วินาที
```

**ผ่าน Terminal:**
```bash
git add .
git commit -m "อธิบายสิ่งที่แก้ไข"
git push
```

---

## 10. สรุป URL และฟีเจอร์ทั้งหมด

| URL | ไฟล์ | ฟีเจอร์ |
|---|---|---|
| `stroke.medpriest.com/` | index.html | Menu + Guideline + วิดีโอ |
| `stroke.medpriest.com/stroke_staff_wizard.html` | staff | 8-step wizard + AI + PDF |
| `stroke.medpriest.com/stroke_guest.html` | guest | BEFAST + NIHSS + rt-PA |

### Staff Mode — 8 ขั้นตอน
```
1. ข้อมูลผู้ป่วย    ชื่อ, HN, อายุ, น้ำหนัก, ward
2. Timeline         onset, ER, CT, rt-PA พร้อม DTN auto-calculate
3. อาการ BEFAST     5 ตัวอักษร + nurse checklist
4. CT Brain         เลือกผล → ICH = alert refer ทันที
5. NIHSS            ประเมิน 15 รายการ คะแนน real-time
6. Checklist rt-PA  Inclusion + Absolute/Relative exclusion
7. AI ประเมิน       เลือก Claude / Groq / OpenAI / Custom หรือข้ามได้
8. แผนการรักษา      action items + dose + แนบรูป + PDF ส่งต่อ
```

### Guest Mode — 4 แท็บ
```
BEFAST    ประเมินอาการ 5 ตัวอักษร + nurse checklist
Checklist Inclusion + Exclusion criteria
NIHSS     ประเมิน 15 รายการ คะแนน real-time
rt-PA     คำนวณ dose จากน้ำหนัก
```

### Menu — 3 แท็บ
```
หน้าหลัก   ลิงก์ไป Staff / Guest / Guideline / วิดีโอ
Guideline  เพิ่ม/แก้ไข protocol ได้ (ต้องใส่ PIN) — Turso database
วิดีโอ     YouTube embed + Google Drive link (ต้องใส่ PIN) — Turso database
```

---

## 11. PDPA Compliance Summary

### ข้อมูลที่เก็บใน Turso (case_log)
```sql
-- ไม่มีชื่อ นามสกุล HN เลย
ward          TEXT     -- หอผู้ป่วย (เช่น ICU)
age_group     TEXT     -- กลุ่มอายุ (เช่น 60-69) ไม่ใช่อายุจริง
ct_result     TEXT     -- ผล CT (ais/ich/neg)
onset_bucket  TEXT     -- ช่วงเวลา (0-4.5h / 4.5-24h / >24h)
nihss_score   INTEGER  -- คะแนน NIHSS
nihss_sev     TEXT     -- ระดับ (ปานกลาง)
lvo_suspect   INTEGER  -- สงสัย LVO (0/1)
rtpa_elig     INTEGER  -- เข้าเกณฑ์ rt-PA (0/1)
action        TEXT     -- rtpa/ward/refer-ich/refer-thr/icu
rtpa_given    INTEGER  -- ให้ rt-PA (0/1)
referred      INTEGER  -- Refer (0/1)
dtn_min       INTEGER  -- Door-to-Needle นาที
logged_at     TEXT     -- เวลาบันทึก (ไม่มีข้อมูลผู้ป่วย)
```

### ข้อมูลที่ไม่เก็บเลย
```
✗ ชื่อ-นามสกุล
✗ HN (Hospital Number)
✗ อายุจริง (เก็บเฉพาะกลุ่มอายุ)
✗ ที่อยู่หรือข้อมูลติดต่อ
✗ ผลแล็บ ค่า BP ค่าต่างๆ
✗ ภาพถ่ายผู้ป่วย (PDF download ลงเครื่องแล้วหาย)
```

### มาตรการ PDPA ในแอป
```
PIN Lock        ต้องใส่รหัสทุกครั้งก่อน Staff mode
Auto-lock       ไม่แตะ 5 นาที → ล็อกอัตโนมัติ
Session clear   ข้อมูลผู้ป่วยเคลียร์ทันทีเมื่อล็อก
RAM only        ข้อมูลผู้ป่วยอยู่ใน RAM ไม่ persist ลง storage
PDF local       PDF generate ในเครื่อง ไม่ผ่าน server
Privacy mode    ซ่อนชื่อเป็นตัวย่อในหน้า Refer
```

---

## 12. แผน Database

### Turso — ใช้ 2 ตาราง

**ตาราง guidelines** (Guideline + วิดีโอ)
```sql
CREATE TABLE IF NOT EXISTS guidelines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category    TEXT,     -- nihss/rtpa/refer/protocol/general
  title       TEXT,     -- ชื่อรายการ
  body        TEXT,     -- เนื้อหา
  link_url    TEXT,     -- URL
  link_type   TEXT,     -- youtube/gdrive/url
  link_label  TEXT,     -- ชื่อลิงก์
  sort_order  INTEGER,
  created_at  TEXT
);
```

**ตาราง case_log** (Anonymous audit trail)
```sql
CREATE TABLE IF NOT EXISTS case_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  logged_at    TEXT,
  ward         TEXT,
  age_group    TEXT,
  ct_result    TEXT,
  onset_bucket TEXT,
  nihss_score  INTEGER,
  nihss_sev    TEXT,
  lvo_suspect  INTEGER,
  rtpa_elig    INTEGER,
  abs_excl_n   INTEGER,
  rel_excl_n   INTEGER,
  action       TEXT,
  rtpa_given   INTEGER,
  referred     INTEGER,
  dtn_min      INTEGER,
  note         TEXT
);
```

> ทั้ง 2 ตาราง สร้างอัตโนมัติเมื่อเปิดใช้งานครั้งแรก

### Query วิเคราะห์ข้อมูล QI (ตัวอย่าง)
```sql
-- จำนวน case แต่ละเดือน
SELECT strftime('%Y-%m', logged_at) as month,
       COUNT(*) as total_cases,
       SUM(rtpa_given) as rtpa_cases,
       SUM(referred) as refer_cases,
       ROUND(AVG(nihss_score),1) as avg_nihss,
       ROUND(AVG(CASE WHEN dtn_min > 0 THEN dtn_min END),0) as avg_dtn
FROM case_log
GROUP BY month
ORDER BY month DESC;

-- DTN distribution
SELECT
  SUM(CASE WHEN dtn_min <= 60 THEN 1 ELSE 0 END) as dtn_le60,
  SUM(CASE WHEN dtn_min > 60 THEN 1 ELSE 0 END) as dtn_gt60,
  COUNT(CASE WHEN dtn_min > 0 THEN 1 END) as total_with_dtn
FROM case_log;
```

---

## 13. Troubleshooting

### ❌ เปิดไฟล์แล้ว blank หรือ error

```
สาเหตุ: เปิดโดย double-click ตรงๆ (file:// protocol)
แก้ไข: deploy ขึ้น Cloudflare Pages แล้วเปิดผ่าน https://
หรือ: ใช้ Live Server extension ใน VS Code
```

### ❌ Staff mode ล็อกอยู่ ใส่ PIN ไม่ได้

```
PIN default: 2567
ถ้าลืม PIN ใหม่: เปิด browser DevTools (F12) → Console
→ พิมพ์: localStorage.removeItem('sp')
→ กด Enter → reload หน้า → PIN reset เป็น 2567
```

### ❌ Turso Test แล้วขึ้น error

```
ตรวจสอบ:
1. Database URL ถูกต้อง? (ต้องขึ้นต้น https://)
2. Token ถูกต้อง? (copy ทั้งหมด ไม่มีช่องว่างหน้าหลัง)
3. Internet ใช้งานได้?
4. Token ยังไม่หมดอายุ? (ตรวจที่ app.turso.tech)
```

### ❌ AI ไม่ตอบ (ขั้น 7)

```
Claude:   ต้องเรียกผ่าน claude.ai เท่านั้น — ถ้าเปิดไฟล์ local จะไม่ทำงาน
Groq:     ต้องมี API key จาก console.groq.com (ฟรี)
Custom:   ตรวจสอบ Base URL และ Model name ถูกต้อง
```

### ❌ Cloudflare Pages ไม่ deploy

```
ตรวจสอบ:
1. Build command: (เว้นว่าง)
2. Build output directory: /
3. ไฟล์ชื่อ index.html อยู่ใน root ของ repo?
4. Branch: main
```

### ❌ PDF ไม่ออก

```
สาเหตุ: Library jsPDF หรือ pdf-lib โหลดไม่ได้
แก้ไข: ต้องใช้งานผ่าน internet (libraries โหลดจาก CDN)
       ไม่สามารถสร้าง PDF แบบ offline ได้
```

---

## Quick Reference

### PIN Default
```
Staff mode:  2567
Menu edit:   2567
```

### ลิงก์สำคัญ
```
Turso Dashboard:     app.turso.tech
Cloudflare Pages:    dash.cloudflare.com → Workers & Pages → Pages
GitHub Desktop:      desktop.github.com
Groq (free AI):      console.groq.com
```

### ไฟล์สำคัญที่ต้อง config หลัง deploy
```
1. index.html          → ⚙️ ใส่ Turso URL+Token, ตั้ง PIN menu
2. stroke_staff_wizard → 📦 ใส่ Turso URL+Token, เปลี่ยน PIN
3. stroke_guest.html   → ไม่ต้อง config อะไร พร้อมใช้ทันที
```

---

*อัปเดตล่าสุด: มีนาคม 2568 — Stroke Fast Tract โรงพยาบาลสงฆ์ (Priest Hospital)*