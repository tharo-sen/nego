"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentGuidance, ChatMessage, Role } from "@/lib/negotiation";
import type { DealConfig, Deliverable, Platform } from "@/lib/pricing";
import { RATE_CARD, PLATFORM_LABELS, NICHE_MULTIPLIERS, formatUSD } from "@/lib/pricing";

const DEFAULT_DEAL: DealConfig = {
  influencerName: "",
  platform: "instagram",
  followers: 50000,
  engagementRate: 3,
  niche: "lifestyle",
  deliverables: [
    { type: "post", quantity: 1 },
    { type: "story", quantity: 2 },
  ],
  budgetMax: 0,
  usageRights: false,
  exclusivity: false,
};

const STORAGE_KEY = "nego-state-v1";

export default function Home() {
  const [deal, setDeal] = useState<DealConfig>(DEFAULT_DEAL);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [role, setRole] = useState<Role>("influencer");
  const [guidance, setGuidance] = useState<AgentGuidance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.deal) setDeal({ ...DEFAULT_DEAL, ...saved.deal });
        if (Array.isArray(saved.messages)) setMessages(saved.messages);
      }
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ deal, messages }));
  }, [deal, messages, hydrated]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const platformTypes = useMemo(() => Object.keys(RATE_CARD[deal.platform]), [deal.platform]);

  const updateDeal = <K extends keyof DealConfig>(key: K, value: DealConfig[K]) => {
    setDeal((d) => ({ ...d, [key]: value }));
  };

  const setDeliverable = (i: number, patch: Partial<Deliverable>) => {
    setDeal((d) => ({
      ...d,
      deliverables: d.deliverables.map((del, idx) => (idx === i ? { ...del, ...patch } : del)),
    }));
  };

  const analyze = useCallback(
    async (msgs: ChatMessage[], currentDeal: DealConfig) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deal: currentDeal, messages: msgs }),
        });
        if (!res.ok) throw new Error(`Agent error (${res.status})`);
        setGuidance(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const msgs = [...messages, { role, text }];
    setMessages(msgs);
    setDraft("");
    // Influencer messages are the trigger for fresh guidance.
    if (role === "influencer") void analyze(msgs, deal);
    else setRole("influencer");
  };

  const useReply = () => {
    if (!guidance) return;
    setMessages((m) => [...m, { role: "you", text: guidance.suggestedReply }]);
    setRole("influencer");
  };

  const copyReply = async () => {
    if (!guidance) return;
    await navigator.clipboard.writeText(guidance.suggestedReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const clearChat = () => {
    setMessages([]);
    setGuidance(null);
    setError(null);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <span className="logo-mark">₦</span>
          Nego
        </div>
        <span className="header-sub">Influencer negotiation agent — pricing tiers, counters &amp; reply drafts</span>
        <div className="header-right">
          {guidance && (
            <span className={`badge ${guidance.source === "llm" ? "llm" : ""}`}>
              {guidance.source === "llm" ? "AI-enhanced" : "Rule engine"}
            </span>
          )}
          <button className="btn" style={{ flex: "none" }} onClick={clearChat}>
            Reset chat
          </button>
        </div>
      </header>

      {/* ------------ Deal setup ------------ */}
      <aside className="sidebar">
        <div className="panel-title">Deal setup</div>

        <div className="field">
          <label>Influencer name / handle</label>
          <input
            value={deal.influencerName}
            onChange={(e) => updateDeal("influencerName", e.target.value)}
            placeholder="@creator"
          />
        </div>

        <div className="field">
          <label>Platform</label>
          <select
            value={deal.platform}
            onChange={(e) => {
              const p = e.target.value as Platform;
              const firstType = Object.keys(RATE_CARD[p])[0];
              setDeal((d) => ({
                ...d,
                platform: p,
                deliverables: [{ type: firstType, quantity: 1 }],
              }));
            }}
          >
            {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Followers</label>
            <input
              type="number"
              min={0}
              value={deal.followers || ""}
              onChange={(e) => updateDeal("followers", Number(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label>Engagement %</label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={deal.engagementRate || ""}
              onChange={(e) => updateDeal("engagementRate", Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="field">
          <label>Niche</label>
          <select value={deal.niche} onChange={(e) => updateDeal("niche", e.target.value)}>
            {Object.keys(NICHE_MULTIPLIERS).map((n) => (
              <option key={n} value={n}>
                {n.charAt(0).toUpperCase() + n.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="divider" />
        <div className="panel-title">Deliverables</div>

        {deal.deliverables.map((d, i) => (
          <div className="deliverable-row" key={i}>
            <input
              type="number"
              min={1}
              value={d.quantity || ""}
              onChange={(e) => setDeliverable(i, { quantity: Number(e.target.value) || 0 })}
            />
            <select value={d.type} onChange={(e) => setDeliverable(i, { type: e.target.value })}>
              {platformTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              className="icon-btn"
              onClick={() =>
                setDeal((dd) => ({
                  ...dd,
                  deliverables: dd.deliverables.filter((_, idx) => idx !== i),
                }))
              }
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="add-btn"
          onClick={() =>
            setDeal((d) => ({
              ...d,
              deliverables: [...d.deliverables, { type: platformTypes[0], quantity: 1 }],
            }))
          }
        >
          + Add deliverable
        </button>

        <div className="divider" />
        <div className="panel-title">Constraints</div>

        <div className="field">
          <label>Max budget (walk-away, USD — 0 = auto)</label>
          <input
            type="number"
            min={0}
            value={deal.budgetMax || ""}
            placeholder="0"
            onChange={(e) => updateDeal("budgetMax", Number(e.target.value) || 0)}
          />
        </div>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={deal.usageRights}
            onChange={(e) => updateDeal("usageRights", e.target.checked)}
          />
          Paid usage rights needed
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={deal.exclusivity}
            onChange={(e) => updateDeal("exclusivity", e.target.checked)}
          />
          Category exclusivity needed
        </label>
      </aside>

      {/* ------------ Chat ------------ */}
      <main className="chat">
        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <h2>Negotiation workspace</h2>
              <p>
                Set up the deal on the left, then log the conversation here. Paste what the
                influencer says (from DMs or email) as <b>Influencer</b>, and your messages as{" "}
                <b>You</b>.
              </p>
              <p>
                Every influencer message triggers the agent: it reads their ask, places it against
                your pricing tiers, and hands you a counter-offer and a reply you can send.
              </p>
              <p style={{ marginTop: 12 }}>
                No message yet? Hit <b>Get guidance</b> on the right to get an opening anchor.
              </p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <span className="msg-meta">
                  {m.role === "you" ? "You" : deal.influencerName || "Influencer"}
                </span>
                {m.text}
                <button
                  className="msg-delete"
                  title="Delete message"
                  onClick={() => setMessages((ms) => ms.filter((_, idx) => idx !== i))}
                >
                  ✕
                </button>
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-input-bar">
          <div className="role-toggle">
            <button
              className={role === "influencer" ? "active-influencer" : ""}
              onClick={() => setRole("influencer")}
            >
              Influencer said…
            </button>
            <button className={role === "you" ? "active-you" : ""} onClick={() => setRole("you")}>
              You said…
            </button>
          </div>
          <div className="input-row">
            <textarea
              value={draft}
              rows={2}
              placeholder={
                role === "influencer"
                  ? "Paste the influencer's message… e.g. “My rate for 1 post + 2 stories is $1,500”"
                  : "Type your message to the influencer…"
              }
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="send-btn" onClick={send} disabled={!draft.trim() || loading}>
              {role === "influencer" ? "Log & analyze" : "Send"}
            </button>
          </div>
        </div>
      </main>

      {/* ------------ Agent panel ------------ */}
      <aside className="agent-panel">
        <div className="panel-title">Negotiation agent</div>

        <button className="analyze-btn" onClick={() => void analyze(messages, deal)} disabled={loading}>
          {loading ? <span className="spin">◌</span> : guidance ? "Re-run guidance" : "Get guidance"}
        </button>

        {error && <div className="error-box">{error}</div>}

        {!guidance && !loading && (
          <div className="agent-empty">
            The agent estimates fair market value from platform benchmarks, engagement and niche,
            builds your tier ladder (anchor → target → stretch → walk-away), and coaches every
            round of the negotiation.
          </div>
        )}

        {guidance && (
          <>
            <div className={`verdict ${guidance.verdict}`}>{guidance.verdictLabel}</div>

            <div className="offer-highlight">
              <span className="label">
                {guidance.verdict === "accept" ? "Accept at" : "Your number"}
              </span>
              <div className="value">{formatUSD(guidance.recommendedOffer)}</div>
              <div className="ask-compare">
                <span>
                  Their ask: <b>{guidance.theirAsk !== null ? formatUSD(guidance.theirAsk) : "—"}</b>
                </span>
                <span>
                  Fair value: <b>{formatUSD(guidance.tiers.fairValue)}</b>
                </span>
              </div>
            </div>

            <TierLadder guidance={guidance} />

            <div className="panel-title">Coaching</div>
            <ul className="advice-list">
              {guidance.advice.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>

            <div className="panel-title">Suggested reply</div>
            <div className="reply-box">{guidance.suggestedReply}</div>
            <div className="reply-actions">
              <button className="btn primary" onClick={useReply}>
                Add to chat as “You”
              </button>
              <button className="btn" onClick={() => void copyReply()}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function TierLadder({ guidance }: { guidance: AgentGuidance }) {
  const { tiers, theirAsk, recommendedOffer } = guidance;
  const rows: { name: string; value: number; color: string; key: string }[] = [
    { name: "Opening anchor", value: tiers.openingOffer, color: "var(--green)", key: "open" },
    { name: "Target", value: tiers.target, color: "var(--accent)", key: "target" },
    { name: "Stretch", value: tiers.stretch, color: "var(--amber)", key: "stretch" },
    { name: "Walk-away", value: tiers.walkAway, color: "var(--red)", key: "walk" },
  ];

  const min = tiers.openingOffer * 0.85;
  const max = Math.max(tiers.walkAway, theirAsk ?? 0) * 1.08;
  const pct = (v: number) => Math.min(99, Math.max(1, ((v - min) / (max - min)) * 100));

  // Highlight the tier band the recommendation currently sits in.
  const activeKey =
    recommendedOffer <= tiers.openingOffer
      ? "open"
      : recommendedOffer <= tiers.target
        ? "target"
        : recommendedOffer <= tiers.stretch
          ? "stretch"
          : "walk";

  return (
    <div className="tiers">
      <div className="panel-title">Pricing tiers</div>
      {rows.map((r) => (
        <div key={r.key} className={`tier-row ${r.key === activeKey ? "active" : ""}`}>
          <span className="tier-name">
            <span className="tier-dot" style={{ background: r.color }} />
            {r.name}
          </span>
          <span className="tier-value">{formatUSD(r.value)}</span>
        </div>
      ))}

      <div className="tier-bar">
        {theirAsk !== null && (
          <>
            <div className="tier-marker" style={{ left: `${pct(theirAsk)}%` }} />
            <div className="tier-marker-label" style={{ left: `${pct(theirAsk)}%` }}>
              ask {formatUSD(theirAsk)}
            </div>
          </>
        )}
        {theirAsk === null && (
          <>
            <div className="tier-marker" style={{ left: `${pct(recommendedOffer)}%` }} />
            <div className="tier-marker-label" style={{ left: `${pct(recommendedOffer)}%` }}>
              you {formatUSD(recommendedOffer)}
            </div>
          </>
        )}
      </div>

      {tiers.perDeliverable.length > 0 && (
        <>
          <div className="panel-title">Fair-value breakdown</div>
          {tiers.perDeliverable.map((d, i) => (
            <div key={i} className="tier-row">
              <span className="tier-name">{d.label}</span>
              <span className="tier-value">{formatUSD(d.value)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
