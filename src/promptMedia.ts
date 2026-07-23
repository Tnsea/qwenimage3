import { exampleMedia } from "./exampleMedia.js";

export interface PromptMedia {
  src: string;
  alt: string;
  width: number;
  height: number;
}

const existingReferences: Record<string, PromptMedia> = Object.fromEntries(
  Object.entries(exampleMedia).map(([id, media]) => [
    id,
    {
      src: media.src,
      alt: media.alt,
      width: media.width,
      height: media.height,
    },
  ]),
);

export const promptMedia: Record<string, PromptMedia> = {
  ...existingReferences,
  character: {
    src: "/prompts/botanical-field-researcher.jpg",
    alt: "Field researcher recording observations beside luminous alpine flowers",
    width: 1400,
    height: 1050,
  },
  packaging: {
    src: "/prompts/sustainable-tea-packaging.jpg",
    alt: "Moss green tea boxes and canisters with botanical blind embossing",
    width: 1400,
    height: 1050,
  },
  editorial: {
    src: "/prompts/floating-paper-city.jpg",
    alt: "Detailed coral, cobalt, and white folded-paper city floating above clouds",
    width: 1400,
    height: 1050,
  },
  automotive: {
    src: "/prompts/electric-coupe-after-rain.jpg",
    alt: "Silver electric coupe beneath brutalist concrete after rain",
    width: 1400,
    height: 1050,
  },
};
