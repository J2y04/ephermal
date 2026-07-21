/**
 * Ephermal — AI Assistant Edge Function
 *
 * Powers the in-dashboard AI chat and store analysis. The `chat` action runs a
 * full Anthropic tool-use loop: Claude can call real Ephermal backend actions
 * (list/prepare/launch campaigns, read Meta/Google performance, pause/scale
 * budgets, run ROAS analysis, pull profit reports, search competitor ads) by
 * making authenticated HTTP calls to the same edge functions the dashboard UI
 * itself calls — same auth, same plan-gating, same rate limits. The AI never
 * gets more access than the logged-in user already has.
 *
 * Campaign launches initiated by the AI are ALWAYS created PAUSED — the tool
 * dispatcher hardcodes auto_enable:false and never reads that field from the
 * model's tool input, so there is no code path for the AI to spend money
 * without the user manually enabling the campaign afterward.
 *
 * POST /ai-assistant  { action: 'chat', message: string, context?: object }
 * POST /ai-assistant  { action: 'analyze', url: string }
 * POST /ai-assistant  { action: 'generate_description', product: object }
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY (auto-injected)
 *   APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractUserId, corsHeaders, errResponse, okResponse } from '../_shared/auth.ts';
import { rateLimitTiered, rateLimitResponse, bodyTooLarge } from '../_shared/rate-limit.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const ANTHROPIC_KEY  = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const ANTHROPIC_URL  = 'https://api.anthropic.com/v1/messages';
const MODEL          = 'claude-haiku-4-5-20251001'; // simple single-turn tasks (analyze, generate_description)
const CHAT_MODEL     = 'claude-sonnet-5'; // the tool-use chat loop — reasoning about which live data to pull deserves the stronger model
const SUPABASE_ANON  = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const FN_BASE        = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1`;

// Plan → monthly AI message limits
const PLAN_LIMITS: Record<string, number> = {
  starter: 50,
  growth:  200,
  scale:   500,
};

const STYLE_GUARD = '\n\nWriting style: write like a real advertising consultant, not an AI. Never use em dashes (—) or arrow characters (→). Use periods, commas, or "and" to join clauses instead.';

/** Simple single-turn Claude call — used by analyze/generate_description (no tools). */
async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 1024,
): Promise<string> {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: maxTokens,
      system:     systemPrompt + STYLE_GUARD,
      messages:   [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message: string } }).error?.message ?? `Anthropic error ${res.status}`);
  }

  const data = await res.json() as { content: { type: string; text?: string }[] };
  return data.content?.find(c => c.type === 'text')?.text ?? '';
}

/** Get user's plan and current AI usage */
async function getUsage(userId: string): Promise<{ plan: string; used: number; limit: number }> {
  const month = new Date().toISOString().slice(0, 7);

  const [planRes, creditsRes] = await Promise.all([
    supabase.from('user_plans').select('plan').eq('user_id', userId).single(),
    supabase.from('ai_credits').select('used').eq('user_id', userId).eq('month', month).single(),
  ]);

  const plan  = planRes.data?.plan ?? 'starter';
  const used  = creditsRes.data?.used ?? 0;
  const limit = PLAN_LIMITS[plan] ?? 50;

  return { plan, used, limit };
}

/**
 * Atomically increment AI usage. Returns new count, or null if limit already hit.
 * Uses a DB-level atomic increment to prevent race conditions from concurrent requests.
 */
async function atomicIncrementUsage(userId: string, limit: number): Promise<number | null> {
  const month = new Date().toISOString().slice(0, 7);

  // Ensure row exists first (upsert with 0 if new)
  await supabase.from('ai_credits').upsert(
    { user_id: userId, month, used: 0 },
    { onConflict: 'user_id,month', ignoreDuplicates: true },
  );

  // Atomic conditional increment: only increments if used < limit
  const { data, error } = await supabase.rpc('increment_ai_usage', {
    p_user_id: userId,
    p_month:   month,
    p_limit:   limit,
  });

  if (error) {
    // Fail closed — if usage tracking is broken, block the request rather than give free access
    console.error('atomicIncrementUsage error:', error);
    return null;
  }

  return data as number | null; // null = limit already hit; number = new count
}

/** JSON response for the monthly-limit case — includes `limit` so the UI can show the real upgrade prompt. */
function limitReachedResponse(origin: string | null, limit: number): Response {
  return new Response(JSON.stringify({ error: `AI message limit reached (${limit}/month). Top up in billing.`, limit }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// ── Tool-use: give the AI real access to Ephermal's own backend ──────────────
//
// Each tool maps to an action on an existing edge function. The dispatcher calls
// that function over HTTP with the SAME Clerk JWT + anon apikey the browser
// itself would send — so every tool call still goes through that function's own
// auth, plan-gating, and rate limiting. The AI can never do anything the logged-in
// user couldn't already do by clicking the equivalent dashboard button.

interface ToolDef {
  fn: string;
  buildBody: (input: Record<string, unknown>) => Record<string, unknown>;
  label: (input: Record<string, unknown>) => string;
}

const TOOL_DISPATCH: Record<string, ToolDef> = {
  list_campaigns: {
    fn: 'campaign-launcher',
    buildBody: () => ({ action: 'list' }),
    label: () => 'Listing your campaigns',
  },
  get_campaign_status: {
    fn: 'campaign-launcher',
    buildBody: (i) => ({ action: 'status', campaign_id: i.campaign_id }),
    label: (i) => `Checking status of campaign ${i.campaign_id}`,
  },
  prepare_campaign: {
    fn: 'campaign-launcher',
    buildBody: (i) => ({
      action:    'prepare',
      product:   i.product ?? {},
      audience:  i.audience ?? {},
      budget:    i.budget ?? 20,
      objective: i.objective ?? 'OUTCOME_SALES',
    }),
    label: (i) => `Generating campaign for ${(i.product as Record<string, unknown>)?.name ?? 'product'}`,
  },
  launch_campaign_to_meta: {
    fn: 'campaign-launcher',
    // auto_enable is hardcoded false — never read from model input. This is the only
    // guardrail that matters: it makes an AI-initiated live launch impossible in code,
    // not just discouraged by prompting.
    buildBody: (i) => ({ action: 'launch_meta', campaign_id: i.campaign_id, auto_enable: false }),
    label: (i) => `Launching campaign ${i.campaign_id} to Meta (created paused)`,
  },
  launch_campaign_to_google: {
    fn: 'campaign-launcher',
    buildBody: (i) => ({ action: 'launch_google', campaign_id: i.campaign_id, auto_enable: false }),
    label: (i) => `Launching campaign ${i.campaign_id} to Google (created paused)`,
  },
  get_meta_overview: {
    fn: 'meta-api',
    buildBody: () => ({ action: 'overview' }),
    label: () => 'Pulling Meta Ads account overview',
  },
  get_meta_campaigns: {
    fn: 'meta-api',
    buildBody: () => ({ action: 'campaigns' }),
    label: () => 'Pulling Meta campaign performance',
  },
  pause_meta_campaign: {
    fn: 'meta-api',
    buildBody: (i) => ({ action: 'pause', campaign_id: i.campaign_id }),
    label: (i) => `Pausing Meta campaign ${i.campaign_id}`,
  },
  enable_meta_campaign: {
    fn: 'meta-api',
    buildBody: (i) => ({ action: 'enable', campaign_id: i.campaign_id }),
    label: (i) => `Enabling Meta campaign ${i.campaign_id}`,
  },
  scale_meta_budget: {
    fn: 'meta-api',
    buildBody: (i) => ({ action: 'scale_budget', campaign_id: i.campaign_id, multiplier: i.multiplier ?? 1.15 }),
    label: (i) => `Scaling budget for Meta campaign ${i.campaign_id} (×${i.multiplier ?? 1.15})`,
  },
  get_google_campaigns: {
    fn: 'google-api',
    buildBody: () => ({ action: 'campaigns' }),
    label: () => 'Pulling Google Ads campaigns',
  },
  toggle_google_campaign: {
    fn: 'google-api',
    buildBody: (i) => ({ action: 'toggle', campaign_id: i.campaign_id, status: i.status }),
    label: (i) => `${i.status === 'ENABLED' ? 'Enabling' : 'Pausing'} Google campaign ${i.campaign_id}`,
  },
  update_google_budget: {
    fn: 'google-api',
    buildBody: (i) => ({ action: 'budget', campaign_id: i.campaign_id, budget_usd: i.budget_usd }),
    label: (i) => `Updating Google budget for campaign ${i.campaign_id}`,
  },
  calculate_budget_recommendation: {
    fn: 'budget-ai',
    buildBody: (i) => ({
      action:       'calculate',
      revenue_goal: i.revenue_goal,
      days:         i.days ?? 30,
      aov:          i.aov ?? 50,
      current_roas: i.current_roas ?? 2.5,
      platforms:    i.platforms ?? ['meta'],
    }),
    label: () => 'Calculating budget recommendation',
  },
  analyze_roas: {
    fn: 'roas-optimizer',
    buildBody: () => ({ action: 'analyze' }),
    label: () => 'Analyzing campaigns against ROAS rules (read-only)',
  },
  get_profit_report: {
    fn: 'profit-tracker',
    buildBody: () => ({ action: 'get_report' }),
    label: () => 'Pulling profit report',
  },
  search_competitor_ads: {
    fn: 'competitor-radar',
    buildBody: (i) => ({ action: 'search', search_terms: i.search_terms }),
    label: (i) => `Searching competitor ads for "${i.search_terms}"`,
  },
};

const TOOLS = [
  { name: 'list_campaigns', description: 'List all campaigns (drafts and launched) created in Ephermal for this user. Returns Ephermal-internal campaign_id values (UUIDs) — use these with get_campaign_status/launch_campaign_to_meta/launch_campaign_to_google, not with the Meta/Google tools below.', input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'get_campaign_status', description: 'Get full details/status of one Ephermal campaign by its internal campaign_id (UUID).', input_schema: { type: 'object', properties: { campaign_id: { type: 'string' } }, required: ['campaign_id'] } },
  { name: 'prepare_campaign', description: 'Generate a complete new ad campaign (copy, targeting, creative variations) for a product using AI. Saves as a draft only — does not launch or spend anything.', input_schema: { type: 'object', properties: { product: { type: 'object', description: 'Product info: name, description, price' }, audience: { type: 'object', description: 'Optional target audience hints' }, budget: { type: 'number', description: 'Daily budget in USD' }, objective: { type: 'string', description: 'e.g. OUTCOME_SALES, OUTCOME_TRAFFIC' } }, required: ['product'] } },
  { name: 'launch_campaign_to_meta', description: "Launch a previously prepared draft campaign to Meta Ads. Always created PAUSED for the user to review — this tool can never make a campaign go live, regardless of what's asked.", input_schema: { type: 'object', properties: { campaign_id: { type: 'string', description: 'Ephermal internal campaign_id from prepare_campaign/list_campaigns' } }, required: ['campaign_id'] } },
  { name: 'launch_campaign_to_google', description: 'Launch a previously prepared draft campaign to Google Ads. Always created PAUSED.', input_schema: { type: 'object', properties: { campaign_id: { type: 'string' } }, required: ['campaign_id'] } },
  { name: 'get_meta_overview', description: "Get the connected Meta Ads account's overview: spend, ROAS, impressions, clicks.", input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'get_meta_campaigns', description: 'List live Meta Ads campaigns with performance metrics. Returns real Meta campaign IDs — use these with pause_meta_campaign/enable_meta_campaign/scale_meta_budget.', input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'pause_meta_campaign', description: 'Pause a live Meta campaign by its real Meta campaign ID (from get_meta_campaigns).', input_schema: { type: 'object', properties: { campaign_id: { type: 'string' } }, required: ['campaign_id'] } },
  { name: 'enable_meta_campaign', description: 'Resume a paused Meta campaign by its real Meta campaign ID.', input_schema: { type: 'object', properties: { campaign_id: { type: 'string' } }, required: ['campaign_id'] } },
  { name: 'scale_meta_budget', description: "Multiply a Meta campaign's current daily budget by a factor (e.g. 1.15 = +15%, 0.8 = -20%).", input_schema: { type: 'object', properties: { campaign_id: { type: 'string' }, multiplier: { type: 'number', description: 'e.g. 1.15 for +15%' } }, required: ['campaign_id', 'multiplier'] } },
  { name: 'get_google_campaigns', description: 'List Google Ads campaigns with 30-day metrics.', input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'toggle_google_campaign', description: 'Pause or enable a Google Ads campaign by its Google campaign ID.', input_schema: { type: 'object', properties: { campaign_id: { type: 'string' }, status: { type: 'string', enum: ['PAUSED', 'ENABLED'] } }, required: ['campaign_id', 'status'] } },
  { name: 'update_google_budget', description: "Set a Google Ads campaign's daily budget in USD.", input_schema: { type: 'object', properties: { campaign_id: { type: 'string' }, budget_usd: { type: 'number' } }, required: ['campaign_id', 'budget_usd'] } },
  { name: 'calculate_budget_recommendation', description: 'Get an AI-calculated daily budget split across Meta/Google for a given revenue goal.', input_schema: { type: 'object', properties: { revenue_goal: { type: 'number', description: 'Target revenue over the period, in USD' }, days: { type: 'number' }, aov: { type: 'number', description: 'Average order value in USD' }, current_roas: { type: 'number' }, platforms: { type: 'array', items: { type: 'string' } } }, required: ['revenue_goal'] } },
  { name: 'analyze_roas', description: "Analyze all live Meta campaigns against the user's ROAS optimization rules and get pause/scale/hold recommendations. Read-only — does not pause or change any budget.", input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'get_profit_report', description: 'Get a profit/margin report combining Shopify COGS with ad spend.', input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'search_competitor_ads', description: "Search Meta's public Ad Library for ads matching a search term (brand name, niche, or keyword).", input_schema: { type: 'object', properties: { search_terms: { type: 'string' } }, required: ['search_terms'] } },
];

interface ToolCallTrail { label: string; status: 'done' | 'error' }

/** Call another Ephermal edge function on the user's behalf, forwarding their own Clerk JWT. */
async function callInternal(fn: string, body: Record<string, unknown>, rawToken: string): Promise<unknown> {
  const res = await fetch(`${FN_BASE}/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${rawToken}`,
      'apikey':        SUPABASE_ANON,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `${fn} returned ${res.status}`);
  return data;
}

const MAX_TOOL_ROUNDS = 5;

interface ClaudeContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}
interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

/** Runs the tool-use loop for the chat action. Returns the final reply text + tool call trail. */
async function runChatWithTools(
  rawToken: string,
  message: string,
  context: unknown,
): Promise<{ reply: string; tool_calls: ToolCallTrail[] }> {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  const contextStr = context ? `\n\nDashboard context: ${JSON.stringify(context, null, 2)}` : '';
  const system = `You are Auren, Ephermal's AI advertising expert — an elite Meta Ads, Google Ads, and Shopify growth specialist.
You help Shopify store owners maximize ROAS, reduce wasted ad spend, and scale winning campaigns.

You have real tools to read this specific user's live campaign/account data and to prepare, launch (always paused), pause, enable, and scale campaigns.

MANDATORY: before giving ANY strategic recommendation (what approach to take, what budget to set, what audience to target, whether to scale or pause, what's underperforming and why), call the relevant tool(s) FIRST — get_meta_overview / get_meta_campaigns / get_google_campaigns / analyze_roas / get_profit_report / calculate_budget_recommendation, as applicable — and ground your answer in the real numbers that come back. Never answer a strategy question from generic knowledge alone when a tool could tell you what is actually happening in this account. Chain multiple tool calls in one turn when the question touches more than one platform or metric (e.g. pull both Meta and Google campaigns before comparing budget allocation).
If a tool call reveals the platform isn't connected or there's no data yet, say so plainly and tell the user what to connect — don't fall back to hypothetical advice as if it were their real numbers.
Only skip tool calls for purely conceptual/educational questions with no connection to this user's own account (e.g. "what does ROAS mean").

Be concise, data-driven, and actionable. Cite the actual figures you pulled (spend, ROAS, CTR, etc.) so the user can see the recommendation is grounded, not generic.
Every campaign you launch is always created PAUSED regardless of what the user asks — you cannot make anything go live. Tell the user this plainly if they ask you to launch something live.${contextStr}`;

  const messages: ClaudeMessage[] = [{ role: 'user', content: message }];
  const trail: ToolCallTrail[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      CHAT_MODEL,
        max_tokens: 1200,
        system:     system + STYLE_GUARD,
        messages,
        tools:      TOOLS,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: { message: string } }).error?.message ?? `Anthropic error ${res.status}`);
    }

    const data = await res.json() as { content: ClaudeContentBlock[]; stop_reason: string };
    const toolUses = data.content.filter(b => b.type === 'tool_use');

    if (data.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const text = data.content.find(b => b.type === 'text')?.text ?? '';
      return { reply: text, tool_calls: trail };
    }

    messages.push({ role: 'assistant', content: data.content });

    // Anthropic tool_result blocks require `tool_use_id` + `content`, one per tool_use
    // block in the preceding assistant turn, in the same order.
    const resultBlocks: { type: string; tool_use_id: string; content: string }[] = [];
    for (const use of toolUses) {
      const def = TOOL_DISPATCH[use.name ?? ''];
      let content: string;
      if (!def) {
        content = JSON.stringify({ error: `Unknown tool: ${use.name}` });
        trail.push({ label: `Unknown tool: ${use.name}`, status: 'error' });
      } else {
        const input = use.input ?? {};
        try {
          const result = await callInternal(def.fn, def.buildBody(input), rawToken);
          content = JSON.stringify(result).slice(0, 8000); // cap payload back to the model
          trail.push({ label: def.label(input), status: 'done' });
        } catch (e) {
          content = JSON.stringify({ error: e instanceof Error ? e.message : 'Tool call failed' });
          trail.push({ label: def.label(input), status: 'error' });
        }
      }
      resultBlocks.push({ type: 'tool_result', tool_use_id: use.id!, content });
    }
    messages.push({ role: 'user', content: resultBlocks } as unknown as ClaudeMessage);
  }

  return { reply: "I've made several tool calls but need another step to finish — ask me to continue and I'll pick up where I left off.", tool_calls: trail };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') return errResponse('Method not allowed', 405, origin);

  const authHeader = req.headers.get('Authorization');
  const userId = await extractUserId(authHeader);
  if (!userId) return errResponse('Unauthorized', 401, origin);
  const rawToken = authHeader!.slice(7); // "Bearer <token>" — safe, extractUserId already validated it

  // ── Rate limiting: 10/min burst, 100/hour sustained ─────────────────────
  const rl = await rateLimitTiered(userId, 'ai', [
    { max: 10,  window: 60   },
    { max: 100, window: 3600 },
  ]);
  if (!rl.allowed) return rateLimitResponse(origin, rl.resetIn);

  // ── Body size guard (64 KB max) ──────────────────────────────────────────
  if (bodyTooLarge(req, 65_536)) return errResponse('Request body too large', 413, origin);

  if (!ANTHROPIC_KEY) return errResponse('AI not configured. Set ANTHROPIC_API_KEY', 503, origin);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return errResponse('Invalid JSON', 400, origin); }

  const action = String(body.action ?? 'chat');

  // ── Atomic monthly usage check + increment ───────────────────────────────
  const { plan } = await getUsage(userId);
  const limit = PLAN_LIMITS[plan] ?? 50;
  const newCount = await atomicIncrementUsage(userId, limit);
  if (newCount === null) {
    return limitReachedResponse(origin, limit);
  }

  try {
    let result: unknown;

    switch (action) {
      case 'chat': {
        const message = String(body.message ?? '').trim();
        if (!message) return errResponse('message is required', 400, origin);

        const { reply, tool_calls } = await runChatWithTools(rawToken, message, body.context);
        result = { reply, tool_calls, used: newCount, limit };
        break;
      }

      case 'analyze': {
        const url = String(body.url ?? '').trim();
        if (!url) return errResponse('url is required', 400, origin);

        const system = `You are an expert Shopify store analyst and Meta Ads strategist.
Analyze the provided store URL and return a structured JSON object with these exact keys:
- summary: 2-3 sentence overview of the store
- target_audience: who the ideal customer is
- ad_opportunities: top 3 advertising opportunities
- meta_strategy: recommended Meta Ads approach
- products: array of 3-5 key product categories/items
- estimated_cpa: rough CPA estimate for the niche
- roas_target: realistic ROAS target for first 90 days
Return ONLY valid JSON, no markdown.`;

        const reply = await callClaude(system, `Analyze this Shopify store: ${url}`, 1500);
        try {
          result = JSON.parse(reply);
        } catch {
          result = { summary: reply, target_audience: '', ad_opportunities: '', meta_strategy: '', products: [] };
        }
        break;
      }

      case 'generate_description': {
        const product = body.product as Record<string, unknown> ?? {};
        const system = `You are an expert copywriter for Meta Ads. Write high-converting ad copy.
Return a JSON object with: headline (max 40 chars), primary_text (max 125 chars), description (max 30 chars).
Make it punchy, benefit-focused, and scroll-stopping. Return ONLY valid JSON.`;

        const reply = await callClaude(
          system,
          `Write Meta ad copy for this product: ${JSON.stringify(product)}`,
          512,
        );
        try {
          result = JSON.parse(reply);
        } catch {
          result = { headline: String(product.title ?? ''), primary_text: reply, description: '' };
        }
        break;
      }

      default:
        return errResponse(`Unknown action: ${action}`, 400, origin);
    }

    return okResponse(result, origin);

  } catch (err) {
    console.error('ai-assistant error:', err);
    const msg = err instanceof Error ? err.message : 'AI error';
    return errResponse(msg, 500, origin);
  }
});
