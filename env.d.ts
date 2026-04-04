/**
 * Cloudflare Pages Functions — Environment Variables
 * ตั้งใน Cloudflare Pages Dashboard → Settings → Environment Variables
 * หรือ .dev.vars สำหรับ local dev
 */
export {};

declare global {
  interface Env {
    // ── Turso Database ──────────────────────────────────
    TURSO_URL?: string;
    TURSO_TOKEN?: string;

    // ── AI: Fallback Chain ──────────────────────────────
    GROQ_API_KEY?: string;
    GROQ_MODEL?: string;
    SAMBANOVA_API_KEY?: string;
    SAMBANOVA_MODEL?: string;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    ANTHROPIC_API_KEY?: string;
    CLAUDE_MODEL?: string;

    // ── AI: Single Provider ─────────────────────────────
    AI_PROVIDER?: string;
    AI_MODEL?: string;
    AI_API_KEY?: string;
    AI_BASE_URL?: string;

    // ── LINE Messaging API ──────────────────────────────
    LINE_CHANNEL_ACCESS_TOKEN?: string;
    WEBAPP_URL?: string;
    LINE_NEURO_USER_ID?: string;   // User ID แพทย์ระบบประสาท (U...)
    LINE_REFER_USER_ID?: string;   // Group ID ทีม refer (C...)

    // ── Email (Resend) ─────────────────────────────────
    RESEND_API_KEY?: string;
    NEURO_EMAIL?: string;
    ADMIN_EMAIL?: string;

    // ── CT ชั่วคราว (R2 + KV) — แชร์ภาพให้ Neuro ───────
    CT_SESSIONS?: KVNamespace;
    CT_IMAGES?: R2Bucket;
    /** ถ้าตั้งแล้ว ต้องส่ง header X-CT-Temp-Secret ตอน POST /ct-temp/session */
    CT_TEMP_SECRET?: string;

    // ── General ─────────────────────────────────────────
    ADMIN_SECRET?: string;
    ENVIRONMENT?: string;
  }
}
