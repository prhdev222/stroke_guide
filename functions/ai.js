// functions/ai.js
// Cloudflare Pages Function — AI proxy with RAG from Turso + fallback chain
//
// ── RAG (Retrieval-Augmented Generation) ─────────────────────────────────
// ก่อนส่ง AI จะดึง guidelines ทั้งหมดจาก Turso มาใส่ใน system prompt
// Admin เพิ่ม/แก้ guideline ที่ menu.html → AI อ่าน version ล่าสุดอัตโนมัติ
//
// ── Fallback chain ────────────────────────────────────────────────────────
//   TURSO_URL          = https://stroke-db-xxx.turso.io  (จำเป็นสำหรับ RAG)
//   TURSO_TOKEN        = eyJhbGci...
//   GROQ_API_KEY       = gsk_...     (ฟรี — ลองก่อน)
//   SAMBANOVA_API_KEY  = sn-...      (ฟรี — fallback 2)
//   OPENAI_API_KEY     = sk-...      (optional)
//   ANTHROPIC_API_KEY  = sk-ant-...  (optional)

const PROVIDERS = {
  groq:      { baseUrl:'https://api.groq.com/openai/v1',     model:'llama-3.3-70b-versatile',        type:'openai'    },
  sambanova: { baseUrl:'https://api.sambanova.ai/v1',        model:'Meta-Llama-3.1-70B-Instruct',    type:'openai'    },
  claude:    { baseUrl:'https://api.anthropic.com/v1/messages', model:'claude-haiku-4-5-20251001',  type:'anthropic' },
  openai:    { baseUrl:'https://api.openai.com/v1',          model:'gpt-4o-mini',                    type:'openai'    },
};

const CAT_LABEL = {
  nihss:'การประเมิน NIHSS', rtpa:'rt-PA Protocol',
  refer:'เกณฑ์การ Refer',   protocol:'Protocol / แนวทาง', general:'ทั่วไป',
};

// ── RAG: ดึง guidelines จาก Turso ────────────────────────────────────────
async function fetchGuidelines(tursoUrl, tursoToken) {
  if (!tursoUrl || !tursoToken) return [];
  try {
    const res = await fetch(`${tursoUrl}/v2/pipeline`, {
      method: 'POST',
      headers: { 'Authorization':`Bearer ${tursoToken}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ requests:[{ type:'execute', stmt:{
        sql: `SELECT category, title, body FROM guidelines
              WHERE body IS NOT NULL AND body != ''
              ORDER BY category, sort_order ASC, created_at ASC LIMIT 80`,
        args:[]
      }}]})
    });
    const data = await res.json();
    const rows = data.results?.[0]?.response?.result?.rows || [];
    const cols = data.results?.[0]?.response?.result?.cols || [];
    return rows.map(row => Object.fromEntries(cols.map((c,i)=>[c.name, row[i].value])));
  } catch { return []; }
}

// ── Format guidelines เป็น text block สำหรับ system prompt ───────────────
function formatGuidelines(rows) {
  if (!rows.length) return '';
  const grouped = {};
  for (const row of rows) {
    const cat = row.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(row);
  }
  const parts = [
    '═══════════════════════════════════════════',
    'HOSPITAL GUIDELINES — โรงพยาบาลสงฆ์',
    'ตอบตาม guidelines เหล่านี้เป็นอันดับแรก',
    '═══════════════════════════════════════════',
  ];
  for (const [cat, items] of Object.entries(grouped)) {
    parts.push(`\n## ${CAT_LABEL[cat] || cat.toUpperCase()}`);
    for (const item of items) {
      parts.push(`\n### ${item.title}`);
      parts.push(item.body.trim());
    }
  }
  parts.push('\n═══════════════════════════════════════════');
  return parts.join('\n');
}

// ── Build final system prompt = base + RAG guidelines ────────────────────
function buildSystem(base, guidelineText) {
  const sys = base || 'คุณเป็นผู้ช่วยแพทย์ Stroke ที่โรงพยาบาลสงฆ์ ตอบกระชับ ชัดเจน';
  if (!guidelineText) return sys;
  return `${sys}

${guidelineText}

กฎการตอบ:
1. ยึด Hospital Guidelines ข้างต้นเป็นอันดับแรก
2. ถ้า guidelines ไม่ครอบคลุม ใช้ความรู้ทางการแพทย์ทั่วไปและแจ้งให้ทราบ
3. ถ้าไม่แน่ใจ บอกว่า "ควรปรึกษาแพทย์ผู้เชี่ยวชาญ"
4. ตอบเฉพาะเรื่อง Stroke Fast Tract`;
}

// ── Call one AI provider ──────────────────────────────────────────────────
async function callProvider(key, apiKey, model, messages, system, maxTokens, baseUrl) {
  const def = PROVIDERS[key] || { baseUrl, model, type:'openai' };
  const url  = baseUrl || def.baseUrl;
  const mdl  = model   || def.model;

  if (def.type === 'anthropic') {
    const r = await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:mdl, max_tokens:maxTokens, system, messages }),
    });
    return r.json();
  }

  const msgs = system ? [{ role:'system', content:system }, ...messages] : messages;
  const r = await fetch(`${url}/chat/completions`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
    body: JSON.stringify({ model:mdl, max_tokens:maxTokens, messages:msgs }),
  });
  return r.json();
}

function isSuccess(d) {
  return !!(d?.content?.[0]?.text || d?.choices?.[0]?.message?.content);
}

// ── Main handler ──────────────────────────────────────────────────────────
export async function onRequestPost(context) {
  const env = context.env;

  let body;
  try { body = await context.request.json(); }
  catch { return Response.json({ error:'Invalid JSON body' }, { status:400 }); }

  const { messages, system, max_tokens = 1500 } = body;

  // ── Step 1: RAG — ดึง guidelines จาก Turso แล้ว inject ─────────────
  const rows         = await fetchGuidelines(env.TURSO_URL, env.TURSO_TOKEN);
  const ragText      = formatGuidelines(rows);
  const fullSystem   = buildSystem(system, ragText);

  // ── Step 2: fallback chain ────────────────────────────────────────────
  const chain = [];
  if (env.GROQ_API_KEY)      chain.push({ key:'groq',      apiKey:env.GROQ_API_KEY,      model:env.GROQ_MODEL      || null });
  if (env.SAMBANOVA_API_KEY) chain.push({ key:'sambanova', apiKey:env.SAMBANOVA_API_KEY, model:env.SAMBANOVA_MODEL || null });
  if (env.OPENAI_API_KEY)    chain.push({ key:'openai',    apiKey:env.OPENAI_API_KEY,    model:env.OPENAI_MODEL    || 'gpt-4o-mini' });
  if (env.ANTHROPIC_API_KEY) chain.push({ key:'claude',    apiKey:env.ANTHROPIC_API_KEY, model:env.CLAUDE_MODEL    || 'claude-haiku-4-5-20251001' });

  // Single provider fallback
  if (chain.length === 0 && env.AI_API_KEY) {
    chain.push({ key:env.AI_PROVIDER||'groq', apiKey:env.AI_API_KEY, model:env.AI_MODEL||null });
  }

  if (chain.length === 0) {
    return Response.json({ error:'ไม่พบ API Key — ตั้งค่า GROQ_API_KEY หรือ SAMBANOVA_API_KEY ใน Cloudflare Pages' }, { status:503 });
  }

  const errors = [];
  for (const p of chain) {
    try {
      const data = await callProvider(p.key, p.apiKey, p.model, messages, fullSystem, max_tokens, env.AI_BASE_URL||null);
      if (isSuccess(data)) {
        data._provider  = p.key;
        data._rag_count = rows.length;
        return Response.json(data);
      }
      errors.push(`${p.key}: ${data?.error?.message || data?.error || 'no output'}`);
    } catch(err) {
      errors.push(`${p.key}: ${err.message}`);
    }
  }

  return Response.json({ error:`ทุก AI provider ไม่ตอบสนอง — ${errors.join(' | ')}` }, { status:503 });
}
