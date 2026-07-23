import type { Env } from "./env.js";
import { ExternalRequestError, fetchWithTimeout, timeoutMs } from "./external.js";

export type OAuthProvider = "google" | "github";

interface OAuthProfile {
  subject: string;
  email: string;
  name: string;
}

function configuration(env: Env, provider: OAuthProvider) {
  const clientId = provider === "google" ? env.GOOGLE_CLIENT_ID : env.GITHUB_CLIENT_ID;
  const clientSecret = provider === "google" ? env.GOOGLE_CLIENT_SECRET : env.GITHUB_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "github";
}

export function oauthMethods(env: Env) {
  return {
    google: Boolean(configuration(env, "google")),
    github: Boolean(configuration(env, "github")),
  };
}

function redirectUri(env: Env, provider: OAuthProvider) {
  return `${env.APP_BASE_URL.replace(/\/$/, "")}/api/auth/oauth/${provider}/callback`;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkceChallenge(codeVerifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  return base64Url(new Uint8Array(digest));
}

export async function createAuthorizationUrl(
  env: Env,
  provider: OAuthProvider,
  state: string,
  codeVerifier: string,
) {
  const config = configuration(env, provider);
  if (!config) {
    throw new ExternalRequestError("OAUTH_UNAVAILABLE", "This sign-in provider is not configured.");
  }
  const url = new URL(
    provider === "google"
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : "https://github.com/login/oauth/authorize",
  );
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri(env, provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await pkceChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", provider === "google" ? "openid profile email" : "read:user user:email");
  if (provider === "google") url.searchParams.set("prompt", "select_account");
  return url.toString();
}

async function readJson<T>(response: Response, context: string) {
  if (!response.ok) {
    throw new ExternalRequestError("OAUTH_PROVIDER_FAILED", "The sign-in provider could not complete this request.", `${context} failed with status ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export async function exchangeOAuthCode(
  env: Env,
  provider: OAuthProvider,
  code: string,
  codeVerifier: string,
): Promise<OAuthProfile> {
  const config = configuration(env, provider);
  if (!config) throw new ExternalRequestError("OAUTH_UNAVAILABLE", "This sign-in provider is not configured.");
  const requestTimeout = timeoutMs(env.EXTERNAL_HTTP_TIMEOUT_MS);
  const tokenUrl = provider === "google"
    ? "https://oauth2.googleapis.com/token"
    : "https://github.com/login/oauth/access_token";
  const tokenBody = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri(env, provider),
  });
  if (provider === "google") tokenBody.set("grant_type", "authorization_code");
  const tokenResponse = await fetchWithTimeout(tokenUrl, {
    method: "POST",
    redirect: "error",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenBody,
  }, requestTimeout, "OAuth token exchange");
  const token = await readJson<{ access_token?: string; error?: string }>(tokenResponse, "OAuth token exchange");
  if (!token.access_token) {
    throw new ExternalRequestError("OAUTH_PROVIDER_FAILED", "The sign-in provider did not return a usable access token.", token.error);
  }
  const authorization = {
    Authorization: `Bearer ${token.access_token}`,
    Accept: "application/json",
  };

  if (provider === "google") {
    const response = await fetchWithTimeout(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: authorization, redirect: "error" },
      requestTimeout,
      "Google profile request",
    );
    const profile = await readJson<{
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    }>(response, "Google profile request");
    if (!profile.sub || !profile.email || !profile.email_verified) {
      throw new ExternalRequestError("OAUTH_EMAIL_REQUIRED", "Google did not provide a verified email address.");
    }
    return {
      subject: profile.sub,
      email: profile.email.toLowerCase(),
      name: profile.name?.trim() || profile.email.split("@")[0],
    };
  }

  const headers = { ...authorization, "X-GitHub-Api-Version": "2022-11-28" };
  const profileResponse = await fetchWithTimeout(
    "https://api.github.com/user",
    { headers, redirect: "error" },
    requestTimeout,
    "GitHub profile request",
  );
  const profile = await readJson<{
    id?: number;
    login?: string;
    name?: string;
    email?: string;
  }>(profileResponse, "GitHub profile request");
  if (!profile.id) {
    throw new ExternalRequestError("OAUTH_PROVIDER_FAILED", "GitHub did not return a durable account identifier.");
  }
  const emailResponse = await fetchWithTimeout(
    "https://api.github.com/user/emails",
    { headers, redirect: "error" },
    requestTimeout,
    "GitHub email request",
  );
  const emails = await readJson<Array<{ email: string; primary: boolean; verified: boolean }>>(
    emailResponse,
    "GitHub email request",
  );
  const verified = emails.filter((entry) => entry.verified);
  const publicEmail = profile.email?.toLowerCase() ?? "";
  const email = verified.some((entry) => entry.email.toLowerCase() === publicEmail)
    ? publicEmail
    : (verified.find((entry) => entry.primary) ?? verified[0])?.email.toLowerCase() ?? "";
  if (!email) {
    throw new ExternalRequestError("OAUTH_EMAIL_REQUIRED", "GitHub did not provide a verified email address.");
  }
  return {
    subject: String(profile.id),
    email,
    name: profile.name?.trim() || profile.login?.trim() || email.split("@")[0],
  };
}
