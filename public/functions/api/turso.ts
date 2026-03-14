interface Env {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
}

interface TursoRequest {
  sql: string;
  args?: (string | number | null)[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { TURSO_URL, TURSO_AUTH_TOKEN } = context.env;

  if (!TURSO_URL || !TURSO_AUTH_TOKEN) {
    return new Response(
      JSON.stringify({ error: "Turso not configured on server" }),
      { status: 500, headers: corsHeaders }
    );
  }

  let body: TursoRequest;
  try {
    body = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: corsHeaders }
    );
  }

  const { sql, args = [] } = body;
  if (!sql) {
    return new Response(
      JSON.stringify({ error: "Missing sql field" }),
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const url = TURSO_URL.startsWith("http") ? TURSO_URL : `https://${TURSO_URL.replace(/^libsql:\/\//, "").replace(/^\/+/, "")}`;
    const tursoResp = await fetch(`${url}/v2/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TURSO_AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            type: "execute",
            stmt: {
              sql,
              args: args.map((a) => ({
                type: typeof a === "number" ? "integer" : "text",
                value: String(a ?? ""),
              })),
            },
          },
        ],
      }),
    });

    const raw = await tursoResp.text();
    if (!raw) {
      return new Response(
        JSON.stringify({ error: "Turso returned empty response" }),
        { status: 502, headers: corsHeaders }
      );
    }
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid Turso response" }),
        { status: 502, headers: corsHeaders }
      );
    }

    if (data.results?.[0]?.type === "error") {
      return new Response(
        JSON.stringify({ error: data.results[0].error.message }),
        { status: 400, headers: corsHeaders }
      );
    }

    const rows = data.results?.[0]?.response?.result?.rows || [];
    const cols = data.results?.[0]?.response?.result?.cols || [];
    const mapped = rows.map((row: any[]) =>
      Object.fromEntries(cols.map((c: any, i: number) => [c.name, row[i]?.value]))
    );

    return new Response(
      JSON.stringify({ rows: mapped }),
      { headers: corsHeaders }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message || "Turso connection failed" }),
      { status: 500, headers: corsHeaders }
    );
  }
};
