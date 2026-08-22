/**
 * Ephermal — ad strategy library
 *
 * The gap this closes: the campaign generator already knew good tactics, but it
 * applied the SAME ones to every product and never said why. An agency does not
 * do that. It picks a play based on price point, category, margin, proof
 * available and buying intent, then tests one variable at a time.
 *
 * Each entry carries an explicit `evidence` level, because they are not equally
 * well founded and pretending otherwise is how folklore gets shipped as fact:
 *
 *   'platform'    documented by Meta or Google themselves. Treat as reliable.
 *   'framework'   an established copy/structure pattern. Organises a message,
 *                 does NOT prove it will persuade.
 *   'mechanical'  follows from how the ad system provably works (auction,
 *                 delivery, learning phase), not from a claimed win rate.
 *
 * Deliberately absent: anything of the "this hook gets 10x ROAS" variety. None
 * of it is verifiable, it dates badly, and a paying customer who follows it and
 * loses money has been actively harmed. Where a real number exists it is
 * attributed; where it does not, the strategy is written as a question to answer
 * rather than a promise to repeat.
 */

export type Evidence = 'platform' | 'framework' | 'mechanical';
export type Surface = 'meta' | 'google' | 'both';

export interface AdStrategy {
  id: string;
  name: string;
  surface: Surface;
  evidence: Evidence;
  /** The situation that makes this play the right one. The model matches on this. */
  when: string;
  /** What to actually do. Concrete enough to execute, not a slogan. */
  how: string;
  /** Where it comes from, so a claim can be traced rather than trusted. */
  source: string;
}

export const AD_STRATEGIES: AdStrategy[] = [
  // ── Meta: structure and delivery ──────────────────────────────────────────
  {
    id: 'meta-creative-volume',
    name: 'Creative volume over audience slicing',
    surface: 'meta',
    evidence: 'platform',
    when: 'Almost always on Meta now. Especially when the store has no audience data and the instinct is to hand-build interest stacks.',
    how: 'Ship many distinct creatives into one broad ad set and let delivery find the pocket. Meta accepts up to 50 images or videos in an Advantage+ sales campaign and combines them automatically. Spend the effort on angles, not on interest layering.',
    source: 'Meta for Business, Advantage+ sales campaigns documentation',
  },
  {
    id: 'meta-lowest-cost-no-cap',
    name: 'Lowest cost, no bid cap, while learning',
    surface: 'meta',
    evidence: 'platform',
    when: 'A new campaign with no conversion history, or one that is under-delivering and not spending its budget.',
    how: 'Use lowest-cost bidding with no bid cap until the ad set has enough conversions to be out of the learning phase. A cap set before you know your true cost per result throttles delivery and starves the model of data.',
    source: 'Meta for Business, Advantage+ bidding guidance',
  },
  {
    id: 'meta-creative-fatigue-refresh',
    name: 'Refresh on a schedule, not on a crash',
    surface: 'meta',
    evidence: 'platform',
    when: 'Any campaign running longer than a few weeks against a warm or small audience.',
    how: 'Rotate in new assets a few times a month rather than waiting for CPA to visibly deteriorate. By the time fatigue shows in the numbers you have already paid for it. Small audiences fatigue faster.',
    source: 'Meta for Business, creative best practices',
  },
  {
    id: 'meta-first-line-hook',
    name: 'The sale happens above the fold',
    surface: 'meta',
    evidence: 'mechanical',
    when: 'Every Meta primary text.',
    how: 'Meta truncates primary text at roughly 125 characters behind "See more". Put the actual reason to care in the first sentence. Anything built up to is written for a reader who already tapped.',
    source: 'Meta placement rendering behaviour',
  },
  {
    id: 'meta-native-register',
    name: 'Write in the feed\'s register',
    surface: 'meta',
    evidence: 'framework',
    when: 'Cold traffic on Instagram and Facebook feeds, Reels and Stories.',
    how: 'Match the visual and verbal grammar of organic posts in that surface. A polished studio ad announces itself as an ad and is scrolled past as one. This is a register choice, not a licence to disguise advertising: the ad must still be honestly identifiable.',
    source: 'Practitioner pattern; register only, disclosure obligations unchanged',
  },
  {
    id: 'meta-angle-diversity',
    name: 'Different angles, not different sentences',
    surface: 'meta',
    evidence: 'mechanical',
    when: 'Whenever producing more than one ad variation.',
    how: 'Vary the underlying claim, not the wording: problem-first, curiosity, social proof, transformation, objection-handling, price-anchoring. Three rewrites of one idea give the algorithm one idea to test.',
    source: 'Follows from how Meta allocates delivery across creatives',
  },
  {
    id: 'meta-specific-anchor',
    name: 'One concrete anchor beats three adjectives',
    surface: 'meta',
    evidence: 'framework',
    when: 'Lower-funnel and retargeting ads, and any ad whose draft reads as hype.',
    how: 'Every ad carries at least one checkable specific: a rating with a count, a price, a guarantee window, a delivery time, a measured result. "4.8 from 1,200 buyers" outperforms "loved by everyone" because it can be believed. Only use figures the merchant can substantiate.',
    source: 'Specificity principle; substantiation required before use',
  },

  // ── Google: structure and intent ──────────────────────────────────────────
  {
    id: 'google-asset-saturation',
    name: 'Fill the asset group',
    surface: 'google',
    evidence: 'platform',
    when: 'Every Performance Max or responsive search build.',
    how: 'Google asks for up to 15 headlines, 5 descriptions, 20 images across orientations and 5 videos, with every asset type covered in each group. A half-filled asset group limits the combinations the system can assemble and caps performance before the auction starts.',
    source: 'Google Ads Help, best practices for asset groups in Performance Max',
  },
  {
    id: 'google-themed-asset-groups',
    name: 'One asset group per theme, not per campaign',
    surface: 'google',
    evidence: 'platform',
    when: 'A store with more than one product category, audience or language.',
    how: 'Split asset groups by content category, theme, language or audience so each set is internally coherent. A single group mixing unrelated products produces incoherent combinations.',
    source: 'Google Ads Help, best practices for asset groups',
  },
  {
    id: 'google-hold-before-judging',
    name: 'Wait two to three weeks before replacing an asset',
    surface: 'google',
    evidence: 'platform',
    when: 'Any time an asset looks like it is underperforming early.',
    how: 'Google explicitly advises waiting 2-3 weeks before swapping low performers. Killing an asset inside the learning window measures noise and resets what the system has learned.',
    source: 'Google Ads Help, best practices for asset groups',
  },
  {
    id: 'google-intent-mirroring',
    name: 'Mirror the query, do not describe the product',
    surface: 'google',
    evidence: 'mechanical',
    when: 'Every Search ad group.',
    how: 'The headline should answer the phrase the person typed. Search is intent advertising: someone searching "waterproof running shoes" wants that promise in the headline, not the brand story. Copy written for social and shortened for Search underperforms on both.',
    source: 'Follows from Search ad relevance and Quality Score mechanics',
  },
  {
    id: 'google-match-type-ladder',
    name: 'Match types are a ladder, not a setting',
    surface: 'google',
    evidence: 'mechanical',
    when: 'Every keyword list.',
    how: 'Exact match on the highest-intent, most specific terms where control matters most. Phrase for related variations. Broad only for deliberate discovery, and only with tight negatives and a conversion-based bid strategy underneath it.',
    source: 'Follows from Google keyword matching behaviour',
  },
  {
    id: 'google-negatives-mandatory',
    name: 'Negatives are part of the build, not maintenance',
    surface: 'google',
    evidence: 'mechanical',
    when: 'Every Search or Shopping campaign, from day one.',
    how: 'Ship negatives with the campaign: informational modifiers (free, diy, how to, meaning), job-seeking terms, competitor names where not wanted, and adjacent categories the product is not. Without them, broad and phrase spend on clicks that were never going to buy.',
    source: 'Follows from query matching; standard practice',
  },
  {
    id: 'google-extensions-leverage',
    name: 'Extensions are free auction real estate',
    surface: 'google',
    evidence: 'platform',
    when: 'Every Search campaign, always.',
    how: 'Sitelinks to genuinely different sections, short concrete callouts, and one structured snippet with real values. Extensions expand the ad physically and informationally at no extra cost per click and are among the most under-used levers in Search.',
    source: 'Google Ads Help, ad extensions guidance',
  },
  {
    id: 'google-value-rules',
    name: 'Tell Smart Bidding which conversions are worth more',
    surface: 'google',
    evidence: 'platform',
    when: 'A store where margin, region or new-versus-returning materially changes the value of a sale.',
    how: 'Conversion value rules feed Smart Bidding in real time for Target ROAS and Maximise conversion value. Without them every conversion is treated as equal and bidding optimises toward volume the merchant may not want.',
    source: 'Google Ads Help, about conversion value rules',
  },

  // ── Cross-platform: economics and method ──────────────────────────────────
  {
    id: 'profit-not-revenue-target',
    name: 'Bid to margin, not to revenue',
    surface: 'both',
    evidence: 'mechanical',
    when: 'Any store with a known COGS, which is Ephermal\'s distinctive advantage.',
    how: 'A 3x ROAS on a 20% margin product loses money; a 2x on a 60% margin product prints. Derive the break-even ROAS from gross margin first, set the target above it, and treat platform-reported ROAS as a revenue figure that still needs margin applied.',
    source: 'Unit economics; the basis of Ephermal\'s profit-linked bidding',
  },
  {
    id: 'one-variable-tests',
    name: 'Change one declared thing at a time',
    surface: 'both',
    evidence: 'framework',
    when: 'Any comparison intended to produce a decision.',
    how: 'State the hypothesis and the primary outcome before launching, vary a single message variable, and wait the declared window. Two changes at once produce a result you cannot attribute and will misapply next time.',
    source: 'Experiment design; mirrors the claude-ads selection and experiment gate',
  },
  {
    id: 'no-early-winners',
    name: 'Do not move spend on an early signal',
    surface: 'both',
    evidence: 'framework',
    when: 'The first days of any test, and any time a platform surfaces a "top performer" badge.',
    how: 'Wait for the observation window that was declared up front. Early platform-reported leads are dominated by delivery noise and low sample size. Acting on them repeatedly is how accounts get worse while looking busy.',
    source: 'claude-ads experiment gate; standard measurement practice',
  },
  {
    id: 'offer-before-copy',
    name: 'Fix the offer before rewriting the ad',
    surface: 'both',
    evidence: 'framework',
    when: 'Traffic is arriving and not converting, and the instinct is to rewrite headlines.',
    how: 'Shipping cost, return policy, price relative to category, and proof do more for conversion than adjective choice. If the offer is the constraint, better copy buys more expensive failure. Say so plainly rather than iterating creative.',
    source: 'Practitioner pattern; conversion constraint ordering',
  },
  {
    id: 'landing-continuity',
    name: 'The ad and the landing page must be the same promise',
    surface: 'both',
    evidence: 'mechanical',
    when: 'Every campaign, and especially any ad promising a discount or specific product.',
    how: 'The claim, the imagery and the price in the ad must be the first thing on the destination page. A break between them is paid for twice: once in bounce, once in Quality Score on Google.',
    source: 'Landing page experience is an explicit Google Ads Quality Score component',
  },
  {
    id: 'proof-substantiation-gate',
    name: 'No claim ships without something behind it',
    surface: 'both',
    evidence: 'framework',
    when: 'Any ad containing a review count, a result, a comparison, a price, or an urgency statement.',
    how: 'Treat testimonials, product facts, comparisons, prices, availability, urgency and performance evidence as untrusted until the merchant supplies substantiation. Where none exists, write the ad without the claim rather than inventing a plausible one.',
    source: 'claude-ads evidence gate; platform policy on unsupported claims',
  },
  // ── Small budgets: where the usual advice inverts ─────────────────────────
  // Ephermal's customers run EUR 0-10K months. Most published ad advice assumes
  // enough daily volume for the optimiser to have something to learn from. Below
  // roughly EUR 30/day that is not true, and following the standard playbook
  // produces an account that never stabilises. These cover that case.
  {
    id: 'meta-learning-phase-math',
    name: 'Check the learning-phase arithmetic before choosing a structure',
    surface: 'meta',
    evidence: 'platform',
    when: 'Any Meta campaign where daily budget divided by expected CPA gives fewer than about 7 conversions a day. Almost every store under EUR 10K/month.',
    how: 'Meta needs roughly 50 optimisation events per ad set per 7 days to leave the learning phase, and an ad set that cannot reach it is marked Learning Limited and keeps paying unstable costs. Do the division first: at a EUR 25 CPA, 50 events a week needs about EUR 180/day. If the budget cannot reach that, do not split it across ad sets, and do not expect the account to settle. Say so in the plan rather than letting the merchant discover it after a month of noisy results.',
    source: 'Meta Business Help Centre, About the learning phase and About Learning Limited',
  },
  {
    id: 'meta-consolidate-under-volume',
    name: 'One ad set, not five, when volume is scarce',
    surface: 'meta',
    evidence: 'mechanical',
    when: 'Budget is too small for any single ad set to hit 50 weekly events, and the instinct is to split by audience, placement or creative to "test".',
    how: 'Splitting a small budget divides the same scarce conversions across more ad sets, so each one learns more slowly and every one of them stays unstable. Consolidate into one ad set with broad targeting and let creative carry the variation. Testing is what you do once there is volume to read; before that, splitting only buys noise that looks like data.',
    source: 'Follows arithmetically from the 50-event learning threshold above.',
  },
  {
    id: 'both-optimize-upstream-event',
    name: 'Optimise on an event that actually happens',
    surface: 'both',
    evidence: 'mechanical',
    when: 'The store gets too few purchases per week for purchase optimisation to have signal. Common for a new store or a high-ticket product.',
    how: 'Optimising for an event that fires twice a week gives the delivery system almost nothing to work with. Move one step up the funnel, to add-to-cart or initiate-checkout, which fires often enough to be learnable, and move back down to purchase once purchase volume can support it. Track the actual purchase either way: the optimisation event is what you buy against, not what you judge success by.',
    source: 'Follows from how conversion optimisation works on both platforms: the optimiser needs event frequency, not event value.',
  },
  {
    id: 'meta-exclude-recent-purchasers',
    name: 'Stop paying to reach people who already bought',
    surface: 'meta',
    evidence: 'mechanical',
    when: 'Any retargeting or broad campaign on a store with repeat customers, unless the product genuinely has a short repurchase cycle.',
    how: 'A customer who bought yesterday is the most engaged person in the pixel data, so delivery keeps serving them. That is spend on someone who has already converted, and it flatters ROAS because their next organic purchase gets attributed to the ad. Exclude recent purchasers by default, with the window set to the product\'s real repurchase cycle: weeks for consumables, months or never for durables.',
    source: 'Follows from how lookalike and engagement signals feed delivery, plus the attribution double-count it causes.',
  },
  {
    id: 'google-concentrate-small-budget',
    name: 'Concentrate a small Search budget, do not spread it',
    surface: 'google',
    evidence: 'mechanical',
    when: 'Google Search with a daily budget under roughly EUR 30 and a keyword list longer than a handful of terms.',
    how: 'A budget spread across twenty keywords buys a fraction of the impressions on each and wins nothing anywhere, while still paying the cost of learning on all of them. Pick the smallest set of highest-intent terms the budget can genuinely compete on, usually exact and phrase match on terms that name the product or its direct problem, and let the rest wait until there is budget to serve them. Breadth is something a budget earns, not something it starts with.',
    source: 'Follows from auction mechanics: impression share is bought, and partial share across many terms wins fewer auctions than full share across few.',
  },

];

/** Copy frameworks, kept separate because they organise a message rather than
 *  making a strategic choice. Selection is per message, and using none is valid. */
export const COPY_FRAMEWORKS = [
  { id: 'aida', name: 'Attention, Interest, Desire, Action', risk: 'sensational hooks, implied guarantees, hidden conditions' },
  { id: 'pas', name: 'Problem, Agitation, Solution', risk: 'invented pain, manipulative pressure, sensitive-trait language' },
  { id: 'bab', name: 'Before, After, Bridge', risk: 'unrealistic transformation, fabricated timelines' },
  { id: '4p', name: 'Promise, Picture, Proof, Push', risk: 'unqualified outcomes, fictional customers, unciteable proof' },
  { id: 'fab', name: 'Feature, Advantage, Benefit', risk: 'unsupported comparisons, jargon, plan-dependent features' },
  { id: 'sss', name: 'Star, Story, Solution', risk: 'fictional testimonials, undisclosed sponsorship, synthetic likeness' },
] as const;

/** Renders the library for a system prompt. Surface-filtered so a Meta-only
 *  build is not asked to reason about asset groups. */
export function renderStrategies(surface: Surface | 'all' = 'all'): string {
  const picked = AD_STRATEGIES.filter(
    (s) => surface === 'all' || s.surface === surface || s.surface === 'both',
  );
  const lines = picked.map(
    (s) =>
      `- [${s.id}] ${s.name} (${s.evidence})\n    WHEN: ${s.when}\n    HOW: ${s.how}\n    SOURCE: ${s.source}`,
  );
  const fw = COPY_FRAMEWORKS.map((f) => `- [${f.id}] ${f.name} — watch for: ${f.risk}`);
  return `STRATEGY LIBRARY (${picked.length} plays)\n\n${lines.join('\n')}\n\nCOPY FRAMEWORKS\n${fw.join('\n')}`;
}

/** Every valid strategy id, for server-side validation of a model response. */
export const STRATEGY_IDS: ReadonlySet<string> = new Set(AD_STRATEGIES.map((s) => s.id));

/**
 * Validates what the model claimed it used.
 *
 * The prompt ASKS for strategy selection; this makes it a requirement. Without
 * it, "always relies on the strategies" is a hope: a model under token pressure
 * drops the least-structured field first, and a rationale is exactly that. It
 * would fail silently and look identical to a good response.
 *
 * Returns the accepted ids plus a reason when the response is not usable, so
 * the caller can retry once with a corrective instruction.
 */
export function validateStrategySelection(
  ids: unknown,
  rationale: unknown,
): { ok: true; ids: string[]; rationale: string } | { ok: false; reason: string } {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, reason: 'strategy_ids was missing or empty' };
  }
  const asStrings = ids.map((i) => String(i));
  const unknownIds = asStrings.filter((i) => !STRATEGY_IDS.has(i));
  if (unknownIds.length) {
    // An invented id means the model pattern-matched the shape instead of
    // reading the library, which is precisely the failure this guards against.
    return { ok: false, reason: `strategy_ids contained ids that are not in the library: ${unknownIds.join(', ')}` };
  }
  if (asStrings.length < 3) {
    return { ok: false, reason: `only ${asStrings.length} strategy id(s) selected, at least 3 required` };
  }
  const text = typeof rationale === 'string' ? rationale.trim() : '';
  if (text.length < 40) {
    return { ok: false, reason: 'strategy_rationale was missing or too short to be a real justification' };
  }
  return { ok: true, ids: asStrings, rationale: text };
}
