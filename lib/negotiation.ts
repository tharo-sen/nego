import { DealConfig, PricingTiers, computeTiers, formatUSD, PLATFORM_LABELS } from "./pricing";

export type Role = "you" | "influencer";

export interface ChatMessage {
  role: Role;
  text: string;
}

export type Verdict =
  | "accept" // their ask is at/below your target — take it (with a small trade)
  | "counter" // their ask is negotiable — counter with a number
  | "push_back" // their ask is above stretch but below walk-away — pressure + restructure
  | "walk_risk" // their ask exceeds walk-away — hold firm, prepare alternatives
  | "open"; // no ask on the table yet — you should anchor first

export interface AgentGuidance {
  verdict: Verdict;
  verdictLabel: string;
  theirAsk: number | null;
  yourLastOffer: number | null;
  recommendedOffer: number;
  tiers: PricingTiers;
  advice: string[];
  suggestedReply: string;
  source: "rules" | "llm";
}

/** Extract the most recent dollar amount mentioned by a given role. */
export function extractLatestAmount(messages: ChatMessage[], role: Role): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== role) continue;
    const amt = parseAmount(m.text);
    if (amt !== null) return amt;
  }
  return null;
}

/** Parse amounts like "$1,200", "1200 usd", "1.2k", "2k". Returns the largest match. */
export function parseAmount(text: string): number | null {
  const results: number[] = [];
  const re = /(?:\$|usd\s*)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?\b(?:\s*(?:usd|dollars|bucks))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const hasCurrencyHint =
      m[0].includes("$") ||
      /usd|dollars|bucks/i.test(m[0]) ||
      !!m[2] ||
      m[1].includes(",");
    const raw = parseFloat(m[1].replace(/,/g, ""));
    if (isNaN(raw)) continue;
    let value = m[2] ? raw * 1000 : raw;
    // Ignore bare small numbers with no currency hint (quantities, dates, "3 reels").
    if (!hasCurrencyHint && value < 100) continue;
    // Ignore bare 4-digit numbers that look like years.
    if (!hasCurrencyHint && value >= 1900 && value <= 2100 && Number.isInteger(value)) continue;
    if (value >= 20 && value <= 10_000_000) results.push(value);
  }
  if (!results.length) return null;
  return Math.max(...results);
}

/** Count how many priced offers you have already made (concession rounds). */
function countYourOffers(messages: ChatMessage[]): number {
  return messages.filter((m) => m.role === "you" && parseAmount(m.text) !== null).length;
}

export function buildGuidance(deal: DealConfig, messages: ChatMessage[]): AgentGuidance {
  const tiers = computeTiers(deal);
  const theirAsk = extractLatestAmount(messages, "influencer");
  const yourLastOffer = extractLatestAmount(messages, "you");
  const round = countYourOffers(messages);
  const name = deal.influencerName || "the influencer";
  const deliverablesText = tiers.perDeliverable.map((d) => d.label).join(", ") || "the deliverables";

  const advice: string[] = [];
  let verdict: Verdict;
  let recommendedOffer: number;

  if (theirAsk === null) {
    verdict = "open";
    recommendedOffer = tiers.openingOffer;
    advice.push(
      `No number is on the table yet. Anchor first: whoever names the first number frames the deal. Open at ${formatUSD(tiers.openingOffer)} — low enough to leave room, high enough to be credible.`,
      `Justify the anchor with data, not apology: cite the benchmark rate for ${PLATFORM_LABELS[deal.platform]} at their follower size and engagement.`,
      `Never open with a range. A range concedes the bottom of it instantly.`
    );
  } else if (theirAsk <= tiers.target) {
    verdict = "accept";
    recommendedOffer = theirAsk;
    advice.push(
      `Their ask of ${formatUSD(theirAsk)} is at or below your target (${formatUSD(tiers.target)}). Take the deal — but never accept instantly, it signals you'd have paid more.`,
      `Accept "with a condition": ask for one small extra (e.g. an additional story, a usage-rights window, or a posting-date guarantee) so they feel the price bought something.`,
      `Lock scope in writing immediately: deliverables, dates, revisions, and payment terms.`
    );
  } else if (theirAsk <= tiers.stretch) {
    verdict = "counter";
    recommendedOffer = nextConcession(yourLastOffer ?? tiers.openingOffer, theirAsk, round, tiers);
    advice.push(
      `Their ask (${formatUSD(theirAsk)}) sits between your target (${formatUSD(tiers.target)}) and stretch (${formatUSD(tiers.stretch)}). This deal should close — it's now about where in that band.`,
      `Counter at ${formatUSD(recommendedOffer)}. Use precise, non-round numbers when possible — they read as calculated, not haggled.`,
      `Make every concession conditional: "I can move to ${formatUSD(recommendedOffer)} if we add one extra story frame" — never move for free.`,
      `Your concessions should shrink each round. Big jumps late in a negotiation teach them to keep pushing.`
    );
  } else if (theirAsk <= tiers.walkAway) {
    verdict = "push_back";
    recommendedOffer = nextConcession(yourLastOffer ?? tiers.openingOffer, Math.min(theirAsk, tiers.stretch), round, tiers);
    advice.push(
      `Their ask (${formatUSD(theirAsk)}) is above your stretch (${formatUSD(tiers.stretch)}) but under your walk-away (${formatUSD(tiers.walkAway)}). Don't chase it — reframe it.`,
      `Counter at ${formatUSD(recommendedOffer)} and restructure: offer a smaller scope at their rate, or the full scope at yours. Let them choose which variable moves.`,
      `Cheap-for-you trades to close the gap: performance bonus tied to results, affiliate commission, a 2–3 post commitment at this rate, faster payment terms (net-7).`,
      `Use a calibrated question instead of "no": "How did you land on ${formatUSD(theirAsk)} for ${deliverablesText}?" — it forces them to defend the number.`
    );
  } else {
    verdict = "walk_risk";
    recommendedOffer = tiers.stretch;
    advice.push(
      `Their ask (${formatUSD(theirAsk)}) exceeds your walk-away (${formatUSD(tiers.walkAway)}). Do not stretch your ceiling — a deal above walk-away is worse than no deal.`,
      `State your best-and-final at ${formatUSD(tiers.stretch)} calmly, with the benchmark math attached. Silence after a final number is a tool — let them respond.`,
      `Strengthen your BATNA out loud (politely): you're evaluating comparable creators in the same niche at benchmark rates.`,
      `Leave the door open: "If your rates change or a lighter package works, I'd love to revisit." Walk-aways frequently come back within days.`
    );
  }

  // Clamp: never recommend above walk-away, never below your own last offer.
  recommendedOffer = Math.min(recommendedOffer, tiers.walkAway);
  if (yourLastOffer !== null) recommendedOffer = Math.max(recommendedOffer, yourLastOffer);

  advice.push(...tiers.notes.map((n) => `Pricing note: ${n}`));

  const suggestedReply = draftReply(verdict, deal, tiers, theirAsk, recommendedOffer, name, deliverablesText);

  return {
    verdict,
    verdictLabel: VERDICT_LABELS[verdict],
    theirAsk,
    yourLastOffer,
    recommendedOffer,
    tiers,
    advice,
    suggestedReply,
    source: "rules",
  };
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  open: "Anchor first",
  accept: "Accept (with a trade)",
  counter: "Counter-offer",
  push_back: "Push back & restructure",
  walk_risk: "Hold firm — walk-away risk",
};

/**
 * Midpoint-style concession with decreasing step size per round:
 * round 0 → 50% of the gap, then 35%, 25%, 15%, 10% floor.
 */
function nextConcession(lastOffer: number, theirAsk: number, round: number, tiers: PricingTiers): number {
  const factors = [0.5, 0.35, 0.25, 0.15];
  const factor = factors[Math.min(round, factors.length - 1)] ?? 0.1;
  const gap = Math.max(0, theirAsk - lastOffer);
  let next = lastOffer + gap * factor;
  next = Math.min(next, tiers.walkAway);
  // Precise-looking rounding (to $25 or $10) reads as calculated.
  return next >= 1000 ? Math.round(next / 25) * 25 : Math.round(next / 10) * 10;
}

function draftReply(
  verdict: Verdict,
  deal: DealConfig,
  tiers: PricingTiers,
  theirAsk: number | null,
  offer: number,
  name: string,
  deliverablesText: string
): string {
  const platform = PLATFORM_LABELS[deal.platform];
  switch (verdict) {
    case "open":
      return `Hi ${name}! We love your content and think you're a great fit for this campaign. For ${deliverablesText} on ${platform}, our budget for this collaboration is ${formatUSD(offer)}, based on current benchmark rates for your audience size and engagement. We move fast on contracts and payment — would that work as a starting point?`;
    case "accept":
      return `That works on our side — happy to move forward at ${formatUSD(theirAsk ?? offer)}. One small thing to make the package complete: could we include one extra story frame with a swipe-up link? If so, I'll send the agreement over today so we can lock in dates.`;
    case "counter":
      return `Thanks for the quick reply! ${formatUSD(theirAsk ?? 0)} is a bit above where benchmarks put ${deliverablesText} for an audience your size, even accounting for your strong engagement. I can move to ${formatUSD(offer)} if we can also lock the posting dates this month — can we shake on that?`;
    case "push_back":
      return `I appreciate you sharing your rate. Honestly, ${formatUSD(theirAsk ?? 0)} is beyond what this campaign supports for ${deliverablesText} — benchmark pricing for your tier puts it closer to ${formatUSD(tiers.target)}. Here's what I can do: ${formatUSD(offer)} for the full scope, or we trim the package to fit your rate. I'd also be open to adding a performance bonus if the content over-delivers. Which direction works better for you?`;
    case "walk_risk":
      return `I completely respect your rates — you clearly know your value. Transparently, our ceiling for this scope is ${formatUSD(offer)}, and that's genuinely our best and final based on benchmark rates for this package. If that works, we'd love to move today. If not, no hard feelings at all — and if a lighter package or a future campaign makes sense, my door is open.`;
  }
}
