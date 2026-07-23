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
  try {
    return await fetch(input, {
      redirect: "error",
      ...init,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (reason) {
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
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== expectedHost || url.username || url.password || url.port) {
    throw new ExternalRequestError("EXTERNAL_RESPONSE_INVALID", `${context} returned an untrusted URL.`);
  }
  return url.toString();
}
