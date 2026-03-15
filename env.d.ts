/**
 * Cloudflare Pages Functions — ตัวแปร environment (ตั้งใน Dashboard / .dev.vars)
 * ประกาศ type เพื่อให้ editor ไม่ขึ้นเส้นแดงใน functions/*.js
 */
export {};

declare global {
  interface Env {
    TURSO_URL?: string;
    TURSO_TOKEN?: string;
    GROQ_API_KEY?: string;
    GROQ_MODEL?: string;
    SAMBANOVA_API_KEY?: string;
    SAMBANOVA_MODEL?: string;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    ANTHROPIC_API_KEY?: string;
    CLAUDE_MODEL?: string;
    AI_PROVIDER?: string;
    AI_MODEL?: string;
    AI_API_KEY?: string;
    AI_BASE_URL?: string;
  }
}
