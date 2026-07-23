export interface SourceAsset {
  data: string | Uint8Array;
  mimeType: string;
  width: number;
  height: number;
}

export interface ExportAsset {
  data: string | Uint8Array;
  mimeType: string;
  extension: "svg" | "png" | "jpg" | "webp";
  watermarked: boolean;
}

function sourceExtension(mimeType: string): ExportAsset["extension"] {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/svg+xml") return "svg";
  return "png";
}

export function originalExport(asset: SourceAsset): ExportAsset {
  return { data: asset.data, mimeType: asset.mimeType, extension: sourceExtension(asset.mimeType), watermarked: false };
}

export function watermarkedExport(asset: SourceAsset): ExportAsset {
  const width = Math.max(1, Math.floor(asset.width));
  const height = Math.max(1, Math.floor(asset.height));
  const bytes = typeof asset.data === "string" ? Buffer.from(asset.data, "utf8") : Buffer.from(asset.data);
  const source = `data:${asset.mimeType};base64,${bytes.toString("base64")}`;
  const unit = Math.min(width, height);
  const fontSize = Math.max(18, Math.round(unit * 0.026));
  const patternWidth = Math.max(280, Math.round(fontSize * 14));
  const patternHeight = Math.max(150, Math.round(fontSize * 7));
  const badgeWidth = Math.min(width - 32, Math.max(260, Math.round(fontSize * 13.2)));
  const badgeHeight = Math.max(48, Math.round(fontSize * 2.25));
  const badgeX = Math.max(16, width - badgeWidth - Math.round(unit * 0.028));
  const badgeY = Math.max(16, height - badgeHeight - Math.round(unit * 0.028));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-export-watermark="free">
  <defs>
    <pattern id="qwen-free-watermark" width="${patternWidth}" height="${patternHeight}" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
      <text x="0" y="${Math.round(patternHeight * 0.58)}" fill="#ffffff" fill-opacity="0.18" font-family="Inter,Arial,sans-serif" font-size="${fontSize}" font-weight="700" letter-spacing="${Math.max(1, Math.round(fontSize * 0.08))}">QWEN IMAGE 3.0 · FREE</text>
    </pattern>
  </defs>
  <image href="${source}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>
  <rect width="${width}" height="${height}" fill="url(#qwen-free-watermark)"/>
  <g transform="translate(${badgeX} ${badgeY})">
    <rect width="${badgeWidth}" height="${badgeHeight}" rx="${Math.round(badgeHeight / 2)}" fill="#080909" fill-opacity="0.82" stroke="#ffffff" stroke-opacity="0.24"/>
    <circle cx="${Math.round(badgeHeight * 0.5)}" cy="${Math.round(badgeHeight * 0.5)}" r="${Math.round(badgeHeight * 0.16)}" fill="#8b5cf6"/>
    <text x="${Math.round(badgeHeight * 0.82)}" y="${Math.round(badgeHeight * 0.63)}" fill="#ffffff" font-family="Inter,Arial,sans-serif" font-size="${Math.max(14, Math.round(fontSize * 0.78))}" font-weight="650">Qwen Image 3.0 · Free export</text>
  </g>
</svg>`;

  return { data: svg, mimeType: "image/svg+xml", extension: "svg", watermarked: true };
}
