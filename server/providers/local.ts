import { renderGeneration } from "../generator.js";
import type { GenerationProvider } from "./types.js";

export class LocalPreviewProvider implements GenerationProvider {
  id = "local-preview";
  model = "local-qwen-preview";

  async generate(input: Parameters<GenerationProvider["generate"]>[0]) {
    const result = renderGeneration(input);
    return {
      width: result.width,
      height: result.height,
      data: result.svg,
      mimeType: "image/svg+xml",
      provider: this.id,
      model: this.model,
    };
  }
}
