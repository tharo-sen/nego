# Nego — Influencer Negotiation Agent

A chat-based negotiation copilot for closing influencer deals at the right price. You log the conversation (paste the influencer's DMs/emails, type your own replies), and the agent coaches every round: it estimates fair market value, builds your pricing-tier ladder, reads the influencer's ask, and hands you a counter-offer number plus a ready-to-send reply.

## What the agent does

1. **Prices the deal** from platform benchmark rates (CPM-style, per deliverable), adjusted for follower count, engagement rate, niche, usage rights, and exclusivity.
2. **Builds your tier ladder**:
   - **Opening anchor** (~70% of fair value) — where you start
   - **Target** (~90%) — where you want to land
   - **Stretch** (~105%) — acceptable if you extract trades
   - **Walk-away** (~120%, or your budget cap) — never exceed
3. **Reads the chat**: extracts the influencer's latest dollar ask (handles `$1,500`, `1.5k`, `1500 usd`, …) and tracks your concession rounds.
4. **Gives a verdict** each round — *Anchor first*, *Accept (with a trade)*, *Counter-offer*, *Push back & restructure*, or *Hold firm — walk-away risk* — with a specific number computed via a shrinking-concession schedule.
5. **Drafts your reply**, grounded in the strategy, which you can copy or drop straight into the chat.

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### Optional: AI-enhanced replies

The app is fully functional offline with its deterministic rule engine. If you set an OpenAI key, replies and coaching are polished by an LLM (the numbers and strategy stay under the rule engine's control):

```bash
cp .env.example .env.local
# set OPENAI_API_KEY (and optionally OPENAI_MODEL)
```

## How to use it

1. Fill in **Deal setup** (left): platform, followers, engagement %, niche, deliverables, and your hard budget cap.
2. Hit **Get guidance** to get your opening anchor before you name a number.
3. When the influencer replies with a rate, paste it as **Influencer said…** — the agent re-analyzes automatically.
4. Use the suggested reply (edit as needed), send it in your real DM, and log it as **You said…**.
5. Repeat until the verdict turns **Accept** — or the agent tells you to hold firm and walk.

Deal setup and chat history persist in your browser (localStorage).

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- No database, no required external services
- Pricing engine: `lib/pricing.ts` · Negotiation strategy: `lib/negotiation.ts` · API: `app/api/agent/route.ts`

> Benchmark rates are heuristics for negotiation framing ("educated guesswork"), not market quotes. Tune `RATE_CARD` and the multipliers in `lib/pricing.ts` to your vertical.
