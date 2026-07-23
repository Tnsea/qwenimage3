import { useEffect, useState } from "react";
import { BarChart3, ShieldCheck } from "lucide-react";
import {
  readAnalyticsConsent,
  setAnalyticsConsent,
  trackPageView,
  type AnalyticsConsent as AnalyticsConsentValue,
} from "../analytics";

export function AnalyticsConsent({ path }: { path: string }) {
  const [choice, setChoice] = useState<AnalyticsConsentValue | null>(() => readAnalyticsConsent());
  const [open, setOpen] = useState(() => choice === null);

  useEffect(() => {
    const showPreferences = () => setOpen(true);
    window.addEventListener("qwen:analytics-preferences", showPreferences);
    return () => window.removeEventListener("qwen:analytics-preferences", showPreferences);
  }, []);

  function choose(next: AnalyticsConsentValue) {
    setAnalyticsConsent(next);
    setChoice(next);
    setOpen(false);
    if (next === "granted") trackPageView(path);
  }

  if (!open) return null;

  return (
    <aside
      className="card card-border analytics-consent"
      role="dialog"
      aria-modal="false"
      aria-labelledby="analytics-consent-title"
    >
      <div className="card-body">
        <div className="analytics-consent-heading">
          <span className="analytics-consent-icon"><BarChart3 size={18} /></span>
          <div>
            <h2 className="card-title" id="analytics-consent-title">Optional analytics</h2>
            <p>
              Allow GA4 to measure page visits and help improve the site. Analytics stays off unless you allow it.
              Prompts, generated images, and account identifiers are not sent, and ad personalization is disabled.
            </p>
          </div>
        </div>
        <div className="analytics-consent-status"><ShieldCheck size={15} />Your choice is stored only in this browser and can be changed from the footer.</div>
        <div className="card-actions justify-end">
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => choose("denied")}>Decline</button>
          <button className="btn btn-primary btn-sm" type="button" onClick={() => choose("granted")}>Allow analytics</button>
        </div>
        {choice && <small>Current choice: {choice === "granted" ? "allowed" : "declined"}.</small>}
      </div>
    </aside>
  );
}
