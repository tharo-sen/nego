// Pricing engine: estimates fair market value for influencer deals from
// public benchmark heuristics, then derives negotiation tiers from it.
//
// Rates are intentionally "guesswork" anchors (industry CPM-style heuristics),
// meant to give the negotiator a defensible starting frame — not a quote.

export type Platform = "instagram" | "tiktok" | "youtube" | "twitter" | "twitch";

export interface Deliverable {
  type: string;
  quantity: number;
}

export interface DealConfig {
  influencerName: string;
  platform: Platform;
  followers: number;
  engagementRate: number; // percent, e.g. 3.5
  niche: string;
  deliverables: Deliverable[];
  budgetMax: number; // hard walk-away budget in USD (0 = no cap set)
  usageRights: boolean; // brand wants paid-media usage rights
  exclusivity: boolean; // brand wants category exclusivity
}

export interface PricingTiers {
  fairValue: number;
  openingOffer: number; // your anchor
  target: number; // where you want to land
  stretch: number; // acceptable if you extract trades
  walkAway: number; // do not exceed
  perDeliverable: { label: string; value: number }[];
  notes: string[];
}

// USD per 1,000 followers, per deliverable type.
export const RATE_CARD: Record<Platform, Record<string, number>> = {
  instagram: { post: 10, story: 4, reel: 14, carousel: 12 },
  tiktok: { video: 20, live: 28, series: 55 },
  youtube: { integration: 30, dedicated: 55, short: 12 },
  twitter: { tweet: 4, thread: 9 },
  twitch: { stream: 32, shoutout: 8 },
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "X / Twitter",
  twitch: "Twitch",
};

export const NICHE_MULTIPLIERS: Record<string, number> = {
  finance: 1.3,
  b2b: 1.3,
  tech: 1.2,
  beauty: 1.15,
  fitness: 1.1,
  parenting: 1.1,
  travel: 1.05,
  food: 1.0,
  fashion: 1.05,
  gaming: 1.0,
  lifestyle: 1.0,
  other: 1.0,
};

function engagementMultiplier(er: number): { mult: number; note: string } {
  if (er >= 6) return { mult: 1.5, note: `Engagement ${er}% is exceptional (+50% premium is justified — but so is your budget scrutiny of how it's measured).` };
  if (er >= 3) return { mult: 1.25, note: `Engagement ${er}% is above average (+25%). Strong but not rare — don't let them price it like it is.` };
  if (er >= 1) return { mult: 1.0, note: `Engagement ${er}% is average. Benchmark pricing applies with no premium.` };
  return { mult: 0.75, note: `Engagement ${er}% is below average (−25%). This is your strongest lever to push the price down.` };
}

function audienceSizeMultiplier(followers: number): { mult: number; note: string } {
  if (followers >= 1_000_000) return { mult: 0.85, note: "Mega accounts sell reach in bulk — CPM should compress ~15% at this scale." };
  if (followers >= 100_000) return { mult: 1.0, note: "" };
  if (followers >= 10_000) return { mult: 1.1, note: "Mid/micro tier converts better per follower; a small premium is normal." };
  return { mult: 1.2, note: "Nano accounts carry the highest trust per follower, but absolute fees should stay low." };
}

export function computeTiers(deal: DealConfig): PricingTiers {
  const notes: string[] = [];
  const rates = RATE_CARD[deal.platform] ?? {};
  const per1k = deal.followers / 1000;

  const perDeliverable: { label: string; value: number }[] = [];
  let base = 0;
  for (const d of deal.deliverables) {
    if (!d.quantity) continue;
    const rate = rates[d.type] ?? 10;
    const value = rate * per1k * d.quantity;
    base += value;
    perDeliverable.push({
      label: `${d.quantity}× ${d.type}`,
      value,
    });
  }

  const er = engagementMultiplier(deal.engagementRate);
  const size = audienceSizeMultiplier(deal.followers);
  const niche = NICHE_MULTIPLIERS[deal.niche.toLowerCase()] ?? 1.0;

  if (er.note) notes.push(er.note);
  if (size.note) notes.push(size.note);
  if (niche > 1) notes.push(`"${deal.niche}" is a premium niche (+${Math.round((niche - 1) * 100)}%) — expect them to know that.`);

  let fair = base * er.mult * size.mult * niche;

  if (deal.usageRights) {
    fair *= 1.2;
    notes.push("Paid usage rights add ~20%. If price gets tight, dropping or time-limiting usage rights is your cheapest concession to trade away.");
  }
  if (deal.exclusivity) {
    fair *= 1.25;
    notes.push("Category exclusivity adds ~25%. Narrow the exclusivity window (30–60 days) before you raise the price.");
  }

  // Round to sensible increments.
  const round = (v: number) => {
    if (v >= 5000) return Math.round(v / 250) * 250;
    if (v >= 1000) return Math.round(v / 100) * 100;
    if (v >= 100) return Math.round(v / 25) * 25;
    return Math.max(25, Math.round(v / 5) * 5);
  };

  const fairValue = round(fair);
  const openingOffer = round(fair * 0.7);
  const target = round(fair * 0.9);
  const stretch = round(fair * 1.05);
  let walkAway = round(fair * 1.2);

  if (deal.budgetMax > 0 && deal.budgetMax < walkAway) {
    walkAway = deal.budgetMax;
    if (deal.budgetMax < target) {
      notes.push(`Warning: your budget cap ($${deal.budgetMax.toLocaleString()}) is below the market target ($${target.toLocaleString()}). Plan to cut deliverables or offer non-cash value (affiliate %, long-term contract, content amplification).`);
    }
  }

  return { fairValue, openingOffer, target, stretch, walkAway, perDeliverable, notes };
}

export function formatUSD(v: number): string {
  return "$" + Math.round(v).toLocaleString("en-US");
}
