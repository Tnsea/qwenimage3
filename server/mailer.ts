type MailPurpose = "verify-email" | "reset-password";

export interface MailDelivery {
  delivered: boolean;
  delivery: "console" | "resend" | "none";
  devToken?: string;
}

function applicationBaseUrl() {
  const fallback = process.env.NODE_ENV === "production"
    ? `http://127.0.0.1:${process.env.PORT ?? "8787"}`
    : "http://127.0.0.1:5173";
  return (process.env.APP_BASE_URL ?? fallback).replace(/\/$/, "");
}

function localTokenAllowed() {
  return process.env.ALLOW_DEV_AUTH_TOKENS === "true" || process.env.NODE_ENV !== "production";
}

async function deliver(input: { to: string; subject: string; text: string; token: string; link: string }): Promise<MailDelivery> {
  const provider = (process.env.EMAIL_PROVIDER ?? "console").toLowerCase();
  if (provider === "console") {
    if (!localTokenAllowed()) return { delivered: false, delivery: "none" };
    console.info(`[auth-mail] ${input.subject} for ${input.to}: ${input.link}`);
    return {
      delivered: true,
      delivery: "console",
      devToken: input.token,
    };
  }

  if (provider !== "resend") return { delivered: false, delivery: "none" };
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { delivered: false, delivery: "none" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
    signal: AbortSignal.timeout(Math.max(1_000, Number(process.env.EXTERNAL_HTTP_TIMEOUT_MS ?? 15_000))),
  });
  if (!response.ok) throw new Error(`Email delivery failed with status ${response.status}.`);
  return { delivered: true, delivery: "resend" };
}

export function sendAuthenticationEmail(input: { purpose: MailPurpose; to: string; name: string; token: string }) {
  const route = input.purpose === "verify-email" ? "/verify-email" : "/reset-password";
  const link = `${applicationBaseUrl()}${route}?token=${encodeURIComponent(input.token)}`;
  const isVerification = input.purpose === "verify-email";
  const subject = isVerification ? "Verify your Qwen Image Generator Hub email" : "Reset your Qwen Image Generator Hub password";
  const action = isVerification ? "verify your email and unlock your 20 welcome credits" : "choose a new password";
  const text = `Hello ${input.name},\n\nUse this secure link to ${action}:\n${link}\n\nThis link expires soon and can only be used once. If you did not request it, you can ignore this email.`;
  return deliver({ to: input.to, subject, text, token: input.token, link });
}

export function emailProviderInfo() {
  const provider = (process.env.EMAIL_PROVIDER ?? "console").toLowerCase();
  return {
    provider,
    configured: provider === "console" ? localTokenAllowed() : provider === "resend" && Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  };
}
