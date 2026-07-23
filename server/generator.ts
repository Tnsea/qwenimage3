import type { AspectRatio, ImageQuality, ImageStyle } from "../src/types.js";

const dimensions: Record<AspectRatio, [number, number]> = {
  "1:1": [1024, 1024],
  "3:2": [1216, 832],
  "16:9": [1344, 768],
  "4:3": [1152, 896],
  "9:16": [768, 1344],
};

const palettes = [
  ["#0b132b", "#1c2541", "#3a506b", "#5bc0be", "#f7fff7"],
  ["#271033", "#6b1f4d", "#c04a70", "#f0a07c", "#ffe3b3"],
  ["#051923", "#003554", "#006494", "#00a6fb", "#f5fbff"],
  ["#1f1300", "#7a3e00", "#d9822b", "#f6c453", "#fff7dc"],
  ["#161a1d", "#30343f", "#5c677d", "#c7d3dd", "#f5f3f4"],
  ["#1b4332", "#2d6a4f", "#52b788", "#b7e4c7", "#f1faee"],
];

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function splitCaption(prompt: string, max = 34) {
  const words = prompt.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

export function renderGeneration(input: {
  prompt: string;
  aspectRatio: AspectRatio;
  style: ImageStyle;
  quality: ImageQuality;
}) {
  const [width, height] = dimensions[input.aspectRatio];
  const seed = hash(`${input.prompt}:${input.style}:${input.quality}`);
  const palette = palettes[seed % palettes.length];
  const portrait = height > width;
  const unit = Math.min(width, height);
  const focalX = Math.round(width * (0.34 + ((seed >> 3) % 28) / 100));
  const focalY = Math.round(height * (0.3 + ((seed >> 8) % 24) / 100));
  const caption = splitCaption(input.prompt);
  const blur = input.style === "Photorealistic" ? 38 : input.style === "Cinematic" ? 22 : 8;
  const grain = input.quality === "Ultra" ? 0.16 : input.quality === "High" ? 0.11 : 0.07;
  const lineTwo = caption[1]
    ? `<tspan x="${Math.round(width * 0.075)}" dy="${Math.round(unit * 0.052)}">${escapeXml(caption[1])}</tspan>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette[0]}"/><stop offset="0.52" stop-color="${palette[1]}"/><stop offset="1" stop-color="${palette[0]}"/></linearGradient>
    <radialGradient id="orb"><stop stop-color="${palette[4]}" stop-opacity=".96"/><stop offset=".24" stop-color="${palette[3]}" stop-opacity=".88"/><stop offset=".72" stop-color="${palette[2]}" stop-opacity=".34"/><stop offset="1" stop-color="${palette[1]}" stop-opacity="0"/></radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="${blur}"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" seed="${seed % 97}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 ${grain}"/></feComponentTransfer></filter>
    <pattern id="grid" width="${Math.max(24, Math.round(unit * 0.045))}" height="${Math.max(24, Math.round(unit * 0.045))}" patternUnits="userSpaceOnUse"><path d="M 0 0 H 999 M 0 0 V 999" fill="none" stroke="${palette[4]}" stroke-opacity=".055"/></pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>
  <ellipse cx="${focalX}" cy="${focalY}" rx="${Math.round(unit * 0.53)}" ry="${Math.round(unit * 0.47)}" fill="url(#orb)" filter="url(#blur)" transform="rotate(${(seed % 32) - 16} ${focalX} ${focalY})"/>
  <circle cx="${focalX}" cy="${focalY}" r="${Math.round(unit * 0.19)}" fill="none" stroke="${palette[4]}" stroke-opacity=".46" stroke-width="2"/>
  <circle cx="${focalX}" cy="${focalY}" r="${Math.round(unit * 0.27)}" fill="none" stroke="${palette[3]}" stroke-opacity=".18" stroke-width="1" stroke-dasharray="7 13"/>
  <path d="M ${Math.round(width * 0.08)} ${Math.round(height * 0.72)} C ${Math.round(width * 0.32)} ${Math.round(height * 0.55)}, ${Math.round(width * 0.6)} ${Math.round(height * 0.92)}, ${Math.round(width * 0.94)} ${Math.round(height * 0.58)}" fill="none" stroke="${palette[4]}" stroke-opacity=".36" stroke-width="2"/>
  <rect x="${Math.round(width * 0.055)}" y="${Math.round(height * 0.055)}" width="${Math.round(width * 0.89)}" height="${Math.round(height * 0.89)}" rx="${Math.round(unit * 0.025)}" fill="none" stroke="${palette[4]}" stroke-opacity=".24"/>
  <g fill="${palette[4]}" font-family="Inter, Arial, sans-serif">
    <text x="${Math.round(width * 0.075)}" y="${Math.round(height * 0.79)}" font-size="${Math.round(unit * (portrait ? 0.045 : 0.038))}" font-weight="600" letter-spacing="-.5">${escapeXml(caption[0] || "Untitled creation")}${lineTwo}</text>
    <text x="${Math.round(width * 0.075)}" y="${Math.round(height * 0.92)}" font-size="${Math.round(unit * 0.017)}" opacity=".62" letter-spacing="2">${escapeXml(input.style.toUpperCase())} / ${escapeXml(input.quality.toUpperCase())}</text>
  </g>
  <rect width="100%" height="100%" filter="url(#grain)" opacity=".7"/>
</svg>`;

  return { width, height, svg };
}
