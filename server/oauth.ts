import crypto from "node:crypto";

export type OAuthProvider = "google" | "github";

interface OAuthConfiguration {
  clientId: string;
  clientSecret: string;
}

export interface OAuthProfile {
  subject: string;
  email: string;
  name: string;
}

export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthError";
  }
}

function appBaseUrl() {
  const fallback = process.env.NODE_ENV === "production"
    ? `http://127.0.0.1:${process.env.PORT ?? "8787"}`
    : "http://127.0.0.1:5173";
  return (process.env.APP_BASE_URL ?? fallback).replace(/\/$/, "");
}

function configuration(provider: OAuthProvider): OAuthConfiguration | null {
  const prefix = provider === "google" ? "GOOGLE" : "GITHUB";
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function oauthMethods() {
  return { google: Boolean(configuration("google")), github: Boolean(configuration("github")) };
}

export function oauthRedirectUri(provider: OAuthProvider) {
  return `${appBaseUrl()}/api/auth/oauth/${provider}/callback`;
}

export function createPkceChallenge(codeVerifier: string) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

export function createAuthorizationUrl(provider: OAuthProvider, state: string, codeVerifier: string) {
  const config = configuration(provider);
  if (!config) throw new OAuthError(`${provider === "google" ? "Google" : "GitHub"} sign-in is not configured.`);
  const challenge = createPkceChallenge(codeVerifier);
  const url = new URL(provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", oauthRedirectUri(provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", provider === "google" ? "openid profile email" : "read:user user:email");
  if (provider === "google") url.searchParams.set("prompt", "select_account");
  return url.toString();
}

async function readJson<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) throw new OAuthError(`${context} failed with status ${response.status}.`);
  return response.json() as Promise<T>;
}

export async function exchangeOAuthCode(provider: OAuthProvider, code: string, codeVerifier: string): Promise<OAuthProfile> {
  const config = configuration(provider);
  if (!config) throw new OAuthError("This sign-in provider is not configured.");
  const tokenUrl = provider === "google" ? "https://oauth2.googleapis.com/token" : "https://github.com/login/oauth/access_token";
  const tokenBody = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    code_verifier: codeVerifier,
    redirect_uri: oauthRedirectUri(provider),
  });
  if (provider === "google") tokenBody.set("grant_type", "authorization_code");
  const signal = AbortSignal.timeout(Math.max(1_000, Number(process.env.EXTERNAL_HTTP_TIMEOUT_MS ?? 15_000)));
  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenBody,
    signal,
  });
  const tokenPayload = await readJson<{ access_token?: string; error?: string }>(tokenResponse, "OAuth token exchange");
  if (!tokenPayload.access_token) throw new OAuthError(tokenPayload.error ?? "The provider did not return an access token.");
  const authorization = { Authorization: `Bearer ${tokenPayload.access_token}`, Accept: "application/json" };

  if (provider === "google") {
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: authorization, signal });
    const profile = await readJson<{ sub?: string; email?: string; email_verified?: boolean; name?: string }>(profileResponse, "Google profile request");
    if (!profile.sub || !profile.email || !profile.email_verified) throw new OAuthError("Google did not provide a verified email address.");
    return { subject: profile.sub, email: profile.email.toLowerCase(), name: profile.name?.trim() || profile.email.split("@")[0] };
  }

  const profileResponse = await fetch("https://api.github.com/user", { headers: { ...authorization, "X-GitHub-Api-Version": "2022-11-28" }, signal });
  const profile = await readJson<{ id?: number; login?: string; name?: string; email?: string }>(profileResponse, "GitHub profile request");
  if (!profile.id) throw new OAuthError("GitHub did not return a durable account identifier.");
  const emailsResponse = await fetch("https://api.github.com/user/emails", { headers: { ...authorization, "X-GitHub-Api-Version": "2022-11-28" }, signal });
  const emails = await readJson<Array<{ email: string; primary: boolean; verified: boolean }>>(emailsResponse, "GitHub email request");
  const verifiedEmails = emails.filter((entry) => entry.verified);
  const publicEmail = profile.email?.toLowerCase() ?? "";
  const email = verifiedEmails.some((entry) => entry.email.toLowerCase() === publicEmail)
    ? publicEmail
    : (verifiedEmails.find((entry) => entry.primary) ?? verifiedEmails[0])?.email.toLowerCase() ?? "";
  if (!email) throw new OAuthError("GitHub did not provide a verified email address.");
  return { subject: String(profile.id), email, name: profile.name?.trim() || profile.login?.trim() || email.split("@")[0] };
}
