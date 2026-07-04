import { config } from '../config.js';
import type { LlmClient } from '../types.js';

/**
 * Minimal OpenAI-compatible chat client (works with Anthropic's OpenAI-compatible
 * endpoint, OpenRouter, direct OpenAI/Gemini endpoints, etc.). JSON-only responses.
 */
export function createLlmClient(log: (m: string) => void): LlmClient | null {
  const cfg = config();
  if (!cfg.LLM_API_KEY) return null;

  const client: LlmClient = {
    callsUsed: 0,
    async json<T>(system: string, user: string, maxTokens = 2000): Promise<T | null> {
      if (client.callsUsed >= cfg.LLM_MAX_CALLS) {
        log(`LLM call cap reached (${cfg.LLM_MAX_CALLS}) — skipping`);
        return null;
      }
      client.callsUsed++;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(`${cfg.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
            method: 'POST',
            signal: AbortSignal.timeout(45_000),
            headers: {
              Authorization: `Bearer ${cfg.LLM_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: cfg.LLM_MODEL,
              messages: [
                { role: 'system', content: `${system}\nRespond with ONLY valid JSON. No markdown fences, no prose.` },
                { role: 'user', content: user },
              ],
              max_tokens: maxTokens,
              temperature: 0.1,
            }),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => '');
            log(`LLM HTTP ${res.status}: ${body.slice(0, 160)}`);
            if (res.status === 429 && attempt === 0) {
              await new Promise((r) => setTimeout(r, 5000));
              continue;
            }
            return null;
          }
          const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const content = data.choices?.[0]?.message?.content ?? '';
          const parsed = extractJson<T>(content);
          if (parsed !== null) return parsed;
          log(`LLM returned unparseable JSON (attempt ${attempt + 1})`);
        } catch (err) {
          log(`LLM error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return null;
    },
  };
  return client;
}

export function extractJson<T>(content: string): T | null {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // fall through: grab the outermost JSON object/array
  }
  const start = trimmed.search(/[[{]/);
  if (start === -1) return null;
  const opener = trimmed[start];
  const closer = opener === '[' ? ']' : '}';
  const end = trimmed.lastIndexOf(closer);
  if (end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
