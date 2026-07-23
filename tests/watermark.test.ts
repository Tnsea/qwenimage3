import assert from "node:assert/strict";
import test from "node:test";
import { originalExport, watermarkedExport } from "../server/watermark.js";

const source = {
  data: '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="100%" height="100%" fill="blue"/></svg>',
  mimeType: "image/svg+xml",
  width: 1024,
  height: 1024,
};

test("free exports wrap the private source in a visible repeated watermark", () => {
  const exported = watermarkedExport(source);
  assert.equal(exported.mimeType, "image/svg+xml");
  assert.equal(exported.extension, "svg");
  assert.equal(exported.watermarked, true);
  assert.match(String(exported.data), /data-export-watermark="free"/);
  assert.match(String(exported.data), /QWEN IMAGE 3\.0 · FREE/);
  assert.match(String(exported.data), /Qwen Image 3\.0 · Free export/);
  assert.match(String(exported.data), /data:image\/svg\+xml;base64,/);
});

test("VIP exports retain the original format and bytes", () => {
  const exported = originalExport(source);
  assert.equal(exported.mimeType, "image/svg+xml");
  assert.equal(exported.extension, "svg");
  assert.equal(exported.watermarked, false);
  assert.equal(exported.data, source.data);
});
