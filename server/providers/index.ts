import { LocalPreviewProvider } from "./local.js";
import { QwenImageProvider, qwenConfiguration } from "./qwen.js";
import type { GenerationProvider } from "./types.js";

let provider: GenerationProvider | null = null;

export function getGenerationProvider() {
  if (provider) return provider;
  const requested = process.env.GENERATION_PROVIDER?.trim().toLowerCase() || "local";
  if (requested === "qwen") {
    const configuration = qwenConfiguration();
    if (!configuration.configured) throw new Error("GENERATION_PROVIDER=qwen requires DASHSCOPE_API_KEY and QWEN_API_BASE_URL.");
    provider = new QwenImageProvider(configuration);
    return provider;
  }
  provider = new LocalPreviewProvider();
  return provider;
}

export function providerInfo() {
  const requested = process.env.GENERATION_PROVIDER?.trim().toLowerCase() || "local";
  const configuration = qwenConfiguration();
  if (requested === "qwen") return { id: "alibaba-model-studio", model: configuration.model, configured: configuration.configured };
  return { id: "local-preview", model: "local-qwen-preview", configured: true };
}

export function resetProviderForTests() {
  provider = null;
}
