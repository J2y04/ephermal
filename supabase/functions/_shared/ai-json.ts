/**
 * Ephermal — Claude JSON response parsing (shared)
 *
 * Every AI-generation function prompts Claude with "Return ONLY valid JSON, no markdown" but
 * the model occasionally wraps its output in a ```json code fence anyway. roas-optimizer and
 * store-intelligence already defended against this independently; budget-ai, competitor-radar,
 * and creative-brief did a bare JSON.parse and would throw a spurious "failed to parse" error
 * on the exact same model behavior. One shared helper instead of five divergent copies.
 */
export function parseClaudeJson<T = unknown>(raw: string): T {
  const cleaned = raw.replace(/```json\s*|```/g, '').trim();
  return JSON.parse(cleaned) as T;
}
