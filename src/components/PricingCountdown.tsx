import { useEffect, useState, type CSSProperties } from "react";
import { Clock3 } from "lucide-react";
import type { PricingPromotion } from "../types";

type CountdownStyle = CSSProperties & { "--value": number };

export interface PromotionCountdownState {
  active: boolean;
  minutes: number;
  seconds: number;
  remainingMs: number;
}

export function usePromotionCountdown(promotion: PricingPromotion | null | undefined): PromotionCountdownState {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!promotion?.active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [promotion?.active, promotion?.expiresAt]);

  const expiresAt = promotion ? new Date(promotion.expiresAt).getTime() : 0;
  const remainingMs = promotion?.active && Number.isFinite(expiresAt) ? Math.max(0, expiresAt - now) : 0;
  const totalSeconds = Math.ceil(remainingMs / 1000);
  return {
    active: Boolean(promotion?.active && remainingMs > 0),
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
    remainingMs,
  };
}

export function PricingCountdown({ state, compact = false }: { state: PromotionCountdownState; compact?: boolean }) {
  if (!state.active) {
    return <div className={`promotion-expired ${compact ? "is-compact" : ""}`}><Clock3 size={15} /><span>Launch offer ended · Standard $10 monthly price restored</span></div>;
  }
  const label = `${state.minutes} minutes and ${state.seconds} seconds remaining`;
  return (
    <div className={`promotion-countdown ${compact ? "is-compact" : ""}`} aria-label={label}>
      <span className="promotion-countdown-label"><Clock3 size={15} />Your $8 launch price is held for</span>
      <span className="promotion-timer" aria-live="polite" aria-label={label}>
        <span className="countdown"><span style={{ "--value": state.minutes } as CountdownStyle}>{state.minutes}</span></span>
        <small>m</small>
        <span aria-hidden="true">:</span>
        <span className="countdown"><span style={{ "--value": state.seconds } as CountdownStyle}>{state.seconds}</span></span>
        <small>s</small>
      </span>
      <span className="promotion-countdown-note">One time · Refreshing will not restart it</span>
    </div>
  );
}
