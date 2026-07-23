export const GA_MEASUREMENT_ID = "G-7Q6BB5CR23";
export const ANALYTICS_CONSENT_STORAGE_KEY = "qwen-analytics-consent-v1";

export type AnalyticsConsent = "granted" | "denied";

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

function ensureDataLayer() {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || ((...args: unknown[]) => {
    window.dataLayer!.push(args);
  });
}

export function readAnalyticsConsent(): AnalyticsConsent | null {
  const value = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
  return value === "granted" || value === "denied" ? value : null;
}

export function initializeAnalytics() {
  if (initialized || readAnalyticsConsent() !== "granted") return;
  initialized = true;
  ensureDataLayer();
  window.gtag!("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag!("set", "ads_data_redaction", true);
  window.gtag!("js", new Date());
  window.gtag!("config", GA_MEASUREMENT_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    anonymize_ip: true,
  });

  if (!document.getElementById("qwen-ga4-script")) {
    const script = document.createElement("script");
    script.id = "qwen-ga4-script";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.append(script);
  }
}

export function setAnalyticsConsent(consent: AnalyticsConsent) {
  window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, consent);
  if (consent === "granted") {
    initializeAnalytics();
  } else if (window.gtag) {
    window.gtag("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  }
}

export function trackPageView(path: string) {
  if (readAnalyticsConsent() !== "granted") return;
  initializeAnalytics();
  window.gtag?.("event", "page_view", {
    page_location: `${window.location.origin}${path}`,
    page_path: path,
    page_title: document.title,
  });
}

export function openAnalyticsPreferences() {
  window.dispatchEvent(new Event("qwen:analytics-preferences"));
}
