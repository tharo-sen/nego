import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nego — Influencer Negotiation Agent",
  description:
    "Chat-based negotiation copilot: pricing tiers, counter-offers, and reply drafts for influencer deals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
