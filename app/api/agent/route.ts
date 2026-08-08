import { NextResponse } from "next/server";
import { buildGuidance, ChatMessage, AgentGuidance } from "@/lib/negotiation";
import { DealConfig, formatUSD } from "@/lib/pricing";

export const runtime = "nodejs";

interface AgentRequest {
  deal: DealConfig;
  messages: ChatMessage[];
}

export async function POST(req: Request) {
  let body: AgentRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.deal || !Array.isArray(body?.messages)) {
    return NextResponse.json({ error: "Expected { deal, messages }" }, { status: 400 });
  }

  const guidance = buildGuidance(body.deal, body.messages);

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const polished = await polishWithLLM(apiKey, body, guidance);
      if (polished) return NextResponse.json(polished);
    } catch {
      // LLM is best-effort; rule-based guidance is always valid.
    }
  }

  return NextResponse.json(guidance);
}

async function polishWithLLM(
  apiKey: string,
  body: AgentRequest,
  guidance: AgentGuidance
): Promise<AgentGuidance | null> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const transcript = body.messages
    .map((m) => `${m.role === "you" ? "BRAND (me)" : "INFLUENCER"}: ${m.text}`)
    .join("\n");

  const system = `You are an expert brand-side negotiation coach for influencer marketing deals.
A deterministic pricing engine has already computed the strategy. You must NOT change any numbers or the strategic stance — only make the language sharper, more natural, and tailored to the actual conversation.

Strategy (authoritative, do not alter):
- Verdict: ${guidance.verdictLabel}
- Their latest ask: ${guidance.theirAsk !== null ? formatUSD(guidance.theirAsk) : "none yet"}
- Recommended number to put forward: ${formatUSD(guidance.recommendedOffer)}
- Tiers: opening ${formatUSD(guidance.tiers.openingOffer)}, target ${formatUSD(guidance.tiers.target)}, stretch ${formatUSD(guidance.tiers.stretch)}, walk-away ${formatUSD(guidance.tiers.walkAway)}, fair value ${formatUSD(guidance.tiers.fairValue)}

Respond with strict JSON: {"advice": string[], "suggestedReply": string}
- "advice": 3-6 short coaching bullets for the brand negotiator, grounded in the strategy above and the actual conversation.
- "suggestedReply": a chat message the brand can send verbatim to the influencer. It MUST contain the recommended number ${formatUSD(guidance.recommendedOffer)} (unless verdict is "Accept", where it accepts their ask). Friendly, confident, concise.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Deal: ${JSON.stringify(body.deal)}\n\nConversation so far:\n${transcript || "(no messages yet)"}`,
        },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return null;

  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed?.advice) || typeof parsed?.suggestedReply !== "string") return null;

  return {
    ...guidance,
    advice: parsed.advice.map(String),
    suggestedReply: parsed.suggestedReply,
    source: "llm",
  };
}
