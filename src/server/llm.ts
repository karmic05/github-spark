// LLM abstraction. All model calls live server-side. Two providers are
// supported so the same code runs locally and on Lovable Cloud:
//
//   1. Lovable AI Gateway (LOVABLE_API_KEY)  — auto-provisioned on Lovable.
//      OpenAI-compatible chat-completions endpoint.
//   2. Anthropic (ANTHROPIC_API_KEY)         — Claude Opus 4.8, Messages API.
//
// Both are called over plain fetch (no SDK dependency) so the bundle stays the
// same locally and on Lovable, and nothing needs installing. Whichever key is
// present wins (Lovable first). Callers handle parse/throw fallbacks.

const LOVABLE_URL =
  process.env.LOVABLE_AI_URL || "https://ai.gateway.lovable.dev/v1/chat/completions";

const ANTHROPIC_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1/messages";

export interface LLMOptions {
  system?: string;
  prompt: string;
  maxTokens?: number;
  /** Hint the provider to return JSON (best-effort). */
  json?: boolean;
}

export function llmConfigured(): boolean {
  return Boolean(process.env.LOVABLE_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export async function callLLM(opts: LLMOptions): Promise<string> {
  if (process.env.LOVABLE_API_KEY) return callLovable(opts);
  if (process.env.ANTHROPIC_API_KEY) return callAnthropic(opts);
  throw new Error("No LLM key configured. Set LOVABLE_API_KEY (Lovable AI) or ANTHROPIC_API_KEY.");
}

async function callLovable(opts: LLMOptions): Promise<string> {
  const model = process.env.LOVABLE_AI_MODEL || "google/gemini-2.5-flash";
  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.prompt });

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: opts.maxTokens ?? 1024,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  const res = await fetch(LOVABLE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Lovable AI ${res.status}: ${detail.slice(0, 400)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(opts: LLMOptions): Promise<string> {
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const system = [
    opts.system,
    opts.json
      ? "Respond with a single valid JSON object and nothing else — no prose, no markdown fences."
      : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      system: system || undefined,
      messages: [{ role: "user", content: opts.prompt }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 400)}`);
  }
  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  return (json.content ?? [])
    .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
    .join("")
    .trim();
}

/**
 * Pull the first JSON object/array out of a model response, tolerating code
 * fences and surrounding prose. Throws if nothing parses.
 */
export function extractJson<T = unknown>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "");
  // Try a straight parse first.
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fall through to bracket-scan
  }
  const firstObj = cleaned.indexOf("{");
  const firstArr = cleaned.indexOf("[");
  let start = -1;
  let close = "}";
  if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
    start = firstArr;
    close = "]";
  } else if (firstObj !== -1) {
    start = firstObj;
  }
  if (start === -1) throw new Error("No JSON found in LLM response");
  const end = cleaned.lastIndexOf(close);
  if (end <= start) throw new Error("Malformed JSON in LLM response");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

/** Call the LLM and parse JSON, retrying once before giving up. */
export async function callLLMJson<T = unknown>(opts: LLMOptions): Promise<T> {
  const o = { ...opts, json: true };
  try {
    return extractJson<T>(await callLLM(o));
  } catch {
    return extractJson<T>(await callLLM(o));
  }
}
