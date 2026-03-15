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

    // ── General ─────────────────────────────────────────
    ENVIRONMENT?: string;
  }
}
