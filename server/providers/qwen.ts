import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { AspectRatio, GenerationRequest, ImageQuality } from "../../src/types.js";
import { ProviderError, type GenerationProvider } from "./types.js";

const dimensions: Record<ImageQuality, Record<AspectRatio, { width: number; height: number }>> = {
  Standard: {
    "1:1": { width: 1024, height: 1024 },
    "3:2": { width: 1536, height: 1024 },
    "16:9": { width: 1536, height: 864 },
    "4:3": { width: 1360, height: 1024 },
    "9:16": { width: 864, height: 1536 },
  },
  High: {
    "1:1": { width: 1536, height: 1536 },
    "3:2": { width: 1920, height: 1280 },
    "16:9": { width: 2048, height: 1152 },
    "4:3": { width: 1792, height: 1344 },
    "9:16": { width: 1152, height: 2048 },
  },
  Ultra: {
    "1:1": { width: 2048, height: 2048 },
    "3:2": { width: 2496, height: 1664 },
    "16:9": { width: 2688, height: 1536 },
    "4:3": { width: 2368, height: 1728 },
    "9:16": { width: 1536, height: 2688 },
  },
};

interface QwenResponse {
  code?: string;
  message?: string;
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{ image?: string }>;
      };
    }>;
  };
}

export interface QwenProviderOptions {
  apiKey: string;
  baseUrl: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  allowedImageHosts?: string[];
  resolveHostname?: (hostname: string) => Promise<string[]>;
}

function isPrivateOrReservedIp(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || (b === 168) || (b === 0 && c === 2)))
      || (a === 198 && (b === 18 || b === 19 || b === 51))
      || (a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd")
      || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff") || normalized.startsWith("::ffff:");
  }
  return true;
}

function matchesAllowedHost(hostname: string, allowedHosts: string[]) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return allowedHosts.some((value) => {
    const allowed = value.toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
    return normalized === allowed || normalized.endsWith(`.${allowed}`);
  });
}

function validImageSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/webp") return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  return false;
}

export class QwenImageProvider implements GenerationProvider {
  id = "alibaba-model-studio";
  model: string;
  private apiKey: string;
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;
  private allowedImageHosts: string[];
  private resolveHostname: (hostname: string) => Promise<string[]>;

  constructor(options: QwenProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.model = options.model ?? "qwen-image-2.0-pro";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.allowedImageHosts = options.allowedImageHosts ?? (process.env.QWEN_IMAGE_ALLOWED_HOSTS ?? "aliyuncs.com").split(",").map((value) => value.trim()).filter(Boolean);
    this.resolveHostname = options.resolveHostname ?? (async (hostname) => (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address));
  }

  private async assertTrustedImageUrl(value: string) {
    let parsed: URL;
    try { parsed = new URL(value); } catch { throw new ProviderError("INVALID_PROVIDER_RESPONSE", "The Qwen provider returned an invalid image URL."); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !matchesAllowedHost(parsed.hostname, this.allowedImageHosts)) {
      throw new ProviderError("INVALID_PROVIDER_RESPONSE", "The Qwen provider returned an image URL outside the trusted asset hosts.");
    }
    let addresses: string[];
    try { addresses = await this.resolveHostname(parsed.hostname); } catch { throw new ProviderError("PROVIDER_UNAVAILABLE", "The provider asset host could not be resolved."); }
    if (!addresses.length || addresses.some(isPrivateOrReservedIp)) {
      throw new ProviderError("INVALID_PROVIDER_RESPONSE", "The provider asset host resolved to a blocked network address.");
    }
    return parsed;
  }

  async generate(input: GenerationRequest) {
    const requested = dimensions[input.quality][input.aspectRatio];
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/services/aigc/multimodal-generation/generation`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          model: this.model,
          input: { messages: [{ role: "user", content: [{ text: `${input.prompt}\nVisual direction: ${input.style.toLowerCase()}.` }] }] },
          parameters: { size: `${requested.width}*${requested.height}`, n: 1, prompt_extend: true, watermark: false },
        }),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new ProviderError("GENERATION_TIMEOUT", "Qwen generation timed out. No credits were charged.");
      }
      throw new ProviderError("PROVIDER_UNAVAILABLE", "The Qwen provider is currently unavailable. No credits were charged.");
    }

    const payload = await response.json() as QwenResponse;
    if (!response.ok) {
      if (payload.code === "DataInspectionFailed") throw new ProviderError("CONTENT_BLOCKED", "The prompt was blocked by the model provider. Revise the request and try again.");
      throw new ProviderError("PROVIDER_UNAVAILABLE", payload.message || "The Qwen provider rejected the generation request.");
    }
    const imageUrl = payload.output?.choices?.[0]?.message?.content?.find((item) => item.image)?.image;
    if (!imageUrl) throw new ProviderError("INVALID_PROVIDER_RESPONSE", "The Qwen provider returned no image.");
    let imageResponse: Response;
    try {
      let assetUrl = (await this.assertTrustedImageUrl(imageUrl)).toString();
      let redirects = 0;
      while (true) {
        imageResponse = await this.fetchImpl(assetUrl, { signal: AbortSignal.timeout(30_000), redirect: "manual" });
        if (imageResponse.status < 300 || imageResponse.status >= 400) break;
        const location = imageResponse.headers.get("location");
        if (!location || redirects >= 2) throw new ProviderError("INVALID_PROVIDER_RESPONSE", "The provider asset returned too many redirects.");
        assetUrl = (await this.assertTrustedImageUrl(new URL(location, assetUrl).toString())).toString();
        redirects += 1;
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("PROVIDER_UNAVAILABLE", "The generated image could not be downloaded from the provider.");
    }
    if (!imageResponse.ok) throw new ProviderError("PROVIDER_UNAVAILABLE", "The generated image could not be downloaded from the provider.");
    const contentLength = Number(imageResponse.headers.get("content-length") ?? 0);
    if (contentLength > 25 * 1024 * 1024) throw new ProviderError("INVALID_PROVIDER_RESPONSE", "The generated image exceeded the 25 MB product limit.");
    const mimeType = (imageResponse.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
    if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) throw new ProviderError("INVALID_PROVIDER_RESPONSE", "The provider asset type is not allowed.");
    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    if (bytes.byteLength > 25 * 1024 * 1024) throw new ProviderError("INVALID_PROVIDER_RESPONSE", "The generated image exceeded the 25 MB product limit.");
    if (!validImageSignature(bytes, mimeType)) throw new ProviderError("INVALID_PROVIDER_RESPONSE", "The provider asset did not match its declared image type.");

    return { width: requested.width, height: requested.height, data: bytes, mimeType, provider: this.id, model: this.model };
  }
}

export function qwenConfiguration() {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim() ?? "";
  const baseUrl = process.env.QWEN_API_BASE_URL?.trim() ?? "";
  return { configured: Boolean(apiKey && baseUrl), apiKey, baseUrl, model: process.env.QWEN_MODEL_ID?.trim() || "qwen-image-2.0-pro" };
}
