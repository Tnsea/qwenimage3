import type { AspectRatio, GenerationRequest } from "../src/types.js";
import { KIE_QWEN_MODEL_ID } from "../src/catalog.js";
import { ExternalRequestError } from "./external.js";

type FetchImplementation = typeof fetch;
type KieAspectRatio = Exclude<AspectRatio, "3:2">;

interface KieCreateResponse {
  code?: number;
  msg?: string;
  data?: {
    taskId?: string;
  };
}

interface KieTaskResponse {
  code?: number;
  msg?: string;
  data?: {
    taskId?: string;
    state?: string;
    resultJson?: string | { resultUrls?: unknown };
    failCode?: string;
    failMsg?: string;
  };
}

interface KieResult {
  width: number;
  height: number;
  bytes: Uint8Array;
  mimeType: string;
  provider: "kie-ai";
  model: typeof KIE_QWEN_MODEL_ID;
  taskId: string;
}

export interface KieImageOptions {
  apiKey: string;
  baseUrl: string;
  allowedApiHost: string;
  allowedImageHosts: string[];
  model?: string;
  requestTimeoutMs?: number;
  maxPollMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: FetchImplementation;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

const resultDimensions: Record<KieAspectRatio, { width: number; height: number }> = {
  "1:1": { width: 2048, height: 2048 },
  "16:9": { width: 2048, height: 1152 },
  "4:3": { width: 2048, height: 1536 },
  "9:16": { width: 1152, height: 2048 },
};
const supportedAspectRatios = new Set<AspectRatio>(["1:1", "16:9", "4:3", "9:16"]);

function boundedMilliseconds(value: number | undefined, fallback: number, maximum: number) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(250, Math.floor(value!))) : fallback;
}

function normalizeExactHosts(values: string[]) {
  return values
    .map((value) => value.trim().toLowerCase().replace(/\.$/, ""))
    .filter((value) => value && !value.includes("*"));
}

function trustedHttpsUrl(value: string, allowedHosts: string[], context: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ExternalRequestError("PROVIDER_RESPONSE_INVALID", `${context} returned an invalid URL.`);
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.port
    || !allowedHosts.includes(parsed.hostname.toLowerCase().replace(/\.$/, ""))
  ) {
    throw new ExternalRequestError("PROVIDER_ASSET_REJECTED", `${context} returned an untrusted asset location.`);
  }
  return parsed;
}

function validImageSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/png") {
    return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  }
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/webp") {
    return bytes.length >= 12
      && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF"
      && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

function parseResultUrls(value: string | { resultUrls?: unknown } | undefined) {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ExternalRequestError("PROVIDER_RESPONSE_INVALID", "The image provider returned an invalid result.");
    }
  }
  if (!parsed || typeof parsed !== "object") return [];
  const resultUrls = (parsed as { resultUrls?: unknown }).resultUrls;
  return Array.isArray(resultUrls) ? resultUrls.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

async function readJson<T>(response: Response, context: string) {
  try {
    return await response.json() as T;
  } catch {
    throw new ExternalRequestError("PROVIDER_RESPONSE_INVALID", `${context} returned an invalid response.`);
  }
}

function mapProviderHttpError(response: Response, message: string | undefined) {
  if (response.status === 401 || response.status === 403) {
    return new ExternalRequestError("PROVIDER_AUTH_FAILED", "The image provider is unavailable.", message);
  }
  if (response.status === 402) {
    return new ExternalRequestError("PROVIDER_BALANCE_LOW", "The image provider is temporarily unavailable.", message);
  }
  if (response.status === 429) {
    return new ExternalRequestError("PROVIDER_RATE_LIMITED", "The image provider is busy. Try again shortly.", message);
  }
  return new ExternalRequestError("PROVIDER_REJECTED", "The image provider could not complete this request.", message);
}

export class KieQwenImageProvider {
  readonly id = "kie-ai";
  readonly model = KIE_QWEN_MODEL_ID;
  private readonly apiKey: string;
  private readonly baseUrl: URL;
  private readonly allowedImageHosts: string[];
  private readonly requestTimeoutMs: number;
  private readonly maxPollMs: number;
  private readonly pollIntervalMs: number;
  private readonly fetchImpl: FetchImplementation;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;

  constructor(options: KieImageOptions) {
    if ((options.model ?? KIE_QWEN_MODEL_ID) !== KIE_QWEN_MODEL_ID) {
      throw new Error(`Unsupported Kie.ai Qwen model: ${options.model}.`);
    }
    const allowedApiHost = options.allowedApiHost.trim().toLowerCase().replace(/\.$/, "");
    let baseUrl: URL;
    try {
      baseUrl = new URL(options.baseUrl);
    } catch {
      throw new Error("Kie.ai API base URL is invalid.");
    }
    if (
      baseUrl.protocol !== "https:"
      || baseUrl.username
      || baseUrl.password
      || baseUrl.port
      || baseUrl.hostname.toLowerCase() !== allowedApiHost
    ) {
      throw new Error("Kie.ai API base URL does not match its allowed host.");
    }
    const allowedImageHosts = normalizeExactHosts(options.allowedImageHosts);
    if (!options.apiKey.trim() || !allowedApiHost || !allowedImageHosts.length) {
      throw new Error("Kie.ai provider configuration is incomplete.");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = baseUrl;
    this.allowedImageHosts = allowedImageHosts;
    this.requestTimeoutMs = boundedMilliseconds(options.requestTimeoutMs, 15_000, 120_000);
    this.maxPollMs = boundedMilliseconds(options.maxPollMs, 120_000, 180_000);
    this.pollIntervalMs = boundedMilliseconds(options.pollIntervalMs, 2_000, 10_000);
    const fetchImpl = options.fetchImpl;
    this.fetchImpl = fetchImpl
      ? (input, init) => fetchImpl(input, init)
      : (input, init) => fetch(input, init);
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = options.now ?? Date.now;
  }

  private endpoint(path: string) {
    return new URL(path, this.baseUrl).toString();
  }

  private async request(input: RequestInfo | URL, init: RequestInit, context: string) {
    try {
      return await this.fetchImpl(input, {
        ...init,
        redirect: "manual",
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (reason) {
      if (reason instanceof DOMException && (reason.name === "TimeoutError" || reason.name === "AbortError")) {
        throw new ExternalRequestError("EXTERNAL_TIMEOUT", `${context} timed out.`);
      }
      throw new ExternalRequestError("EXTERNAL_UNAVAILABLE", `${context} is temporarily unavailable.`, reason instanceof Error ? reason.message : undefined);
    }
  }

  private async createTask(input: GenerationRequest) {
    const response = await this.request(this.endpoint("/api/v1/jobs/createTask"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: {
          prompt: `${input.prompt}\nVisual direction: ${input.style.toLowerCase()}.`,
          image_size: input.aspectRatio,
          seed: 0,
          output_format: "png",
        },
      }),
    }, "Kie.ai task creation");
    const payload = await readJson<KieCreateResponse>(response, "Kie.ai task creation");
    if (!response.ok || payload.code !== 200) throw mapProviderHttpError(response, payload.msg);
    const taskId = payload.data?.taskId?.trim();
    if (!taskId) throw new ExternalRequestError("PROVIDER_RESPONSE_INVALID", "The image provider returned no task identifier.");
    return taskId;
  }

  private async waitForResult(taskId: string) {
    const startedAt = this.now();
    while (this.now() - startedAt < this.maxPollMs) {
      const statusUrl = new URL("/api/v1/jobs/recordInfo", this.baseUrl);
      statusUrl.searchParams.set("taskId", taskId);
      const response = await this.request(statusUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }, "Kie.ai task status");
      const payload = await readJson<KieTaskResponse>(response, "Kie.ai task status");
      if (!response.ok || !payload.data) throw mapProviderHttpError(response, payload.msg);
      const state = payload.data.state?.trim().toLowerCase();
      if (state === "success") {
        const resultUrl = parseResultUrls(payload.data.resultJson)[0];
        if (!resultUrl) throw new ExternalRequestError("PROVIDER_RESPONSE_INVALID", "The image provider returned no usable image.");
        return resultUrl;
      }
      if (state === "fail") {
        throw new ExternalRequestError(
          "PROVIDER_REJECTED",
          "The image provider could not complete this request.",
          payload.data.failMsg || payload.data.failCode || payload.msg,
        );
      }
      if (!state || !["waiting", "queuing", "generating"].includes(state)) {
        throw new ExternalRequestError("PROVIDER_RESPONSE_INVALID", "The image provider returned an unknown task state.");
      }
      await this.sleep(this.pollIntervalMs);
    }
    throw new ExternalRequestError("EXTERNAL_TIMEOUT", "The image provider timed out.");
  }

  private async downloadImage(initialUrl: string) {
    let assetUrl = trustedHttpsUrl(initialUrl, this.allowedImageHosts, "Kie.ai");
    for (let redirectCount = 0; redirectCount <= 2; redirectCount += 1) {
      const response = await this.request(assetUrl, { method: "GET" }, "Kie.ai image download");
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount === 2) {
          throw new ExternalRequestError("PROVIDER_ASSET_REJECTED", "The image provider returned too many redirects.");
        }
        assetUrl = trustedHttpsUrl(new URL(location, assetUrl).toString(), this.allowedImageHosts, "Kie.ai");
        continue;
      }
      if (!response.ok) throw new ExternalRequestError("PROVIDER_ASSET_UNAVAILABLE", "The generated image could not be downloaded.");
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > 25 * 1024 * 1024) {
        throw new ExternalRequestError("PROVIDER_ASSET_INVALID", "The generated image exceeded the product size limit.");
      }
      const mimeType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 25 * 1024 * 1024 || !validImageSignature(bytes, mimeType)) {
        throw new ExternalRequestError("PROVIDER_ASSET_INVALID", "The generated image did not pass asset validation.");
      }
      return { bytes, mimeType };
    }
    throw new ExternalRequestError("PROVIDER_ASSET_REJECTED", "The image provider returned an unusable asset.");
  }

  async generate(input: GenerationRequest): Promise<KieResult> {
    if (!supportedAspectRatios.has(input.aspectRatio) || input.quality !== "Standard" || input.prompt.length > 800) {
      throw new ExternalRequestError("PROVIDER_REQUEST_UNSUPPORTED", "Choose settings supported by the selected image model.");
    }
    const taskId = await this.createTask(input);
    const resultUrl = await this.waitForResult(taskId);
    const image = await this.downloadImage(resultUrl);
    return {
      ...image,
      ...resultDimensions[input.aspectRatio as KieAspectRatio],
      provider: this.id,
      model: this.model,
      taskId,
    };
  }
}
