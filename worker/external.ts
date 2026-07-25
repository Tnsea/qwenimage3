export class ExternalRequestError extends Error {
  readonly code: string;
  readonly publicMessage: string;

  constructor(code: string, publicMessage: string, internalMessage?: string) {
    super(internalMessage ?? publicMessage);
    this.name = "ExternalRequestError";
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

export function timeoutMs(value: string | undefined, fallback = 15_000) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(120_000, Math.max(1_000, Math.floor(parsed))) : fallback;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeout: number,
  context: string,
) {
  const redirect = init.redirect ?? "manual";
  try {
    const response = await fetch(input, {
      ...init,
      redirect,
      signal: AbortSignal.timeout(timeout),
    });
    if (redirect === "manual" && response.status >= 300 && response.status < 400) {
      throw new ExternalRequestError(
        "EXTERNAL_REDIRECT_BLOCKED",
        `${context} returned an unexpected redirect.`,
        `${context} returned redirect status ${response.status}.`,
      );
    }
    return response;
  } catch (reason) {
    if (reason instanceof ExternalRequestError) {
      throw reason;
    }
    if (reason instanceof DOMException && reason.name === "TimeoutError") {
      throw new ExternalRequestError("EXTERNAL_TIMEOUT", `${context} timed out.`, `${context} timed out after ${timeout}ms.`);
    }
    throw new ExternalRequestError("EXTERNAL_UNAVAILABLE", `${context} is temporarily unavailable.`, reason instanceof Error ? reason.message : undefined);
  }
}

export function trustedServiceUrl(value: unknown, expectedHost: string, context: string) {
  if (typeof value !== "string") {
    throw new ExternalRequestError("EXTERNAL_RESPONSE_INVALID", `${context} returned an invalid URL.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ExternalRequestError("EXTERNAL_RESPONSE_INVALID", `${context} returned an invalid URL.`);
  }
  if (url.protocol !== "https:" || url.hostname !== expectedHost || url.username || url.password || url.port) {
    throw new ExternalRequestError("EXTERNAL_RESPONSE_INVALID", `${context} returned an untrusted URL.`);
  }
  return url.toString();
}
