import type { GenerationRequest } from "../../src/types.js";

export interface GeneratedAsset {
  width: number;
  height: number;
  data: string | Uint8Array;
  mimeType: string;
  provider: string;
  model: string;
}

export interface GenerationProvider {
  id: string;
  model: string;
  generate(input: GenerationRequest): Promise<GeneratedAsset>;
}

export class ProviderError extends Error {
  code: "CONTENT_BLOCKED" | "PROVIDER_UNAVAILABLE" | "GENERATION_TIMEOUT" | "INVALID_PROVIDER_RESPONSE";

  constructor(code: ProviderError["code"], message: string) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
  }
}
