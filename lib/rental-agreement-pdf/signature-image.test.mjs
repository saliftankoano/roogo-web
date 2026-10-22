import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIGNATURE_MAX_BYTES,
  fitSignature,
  parseSignaturePng,
  signaturePath,
} from "./signature-image.ts";

// Smallest valid PNG header: magic + IHDR for a 600 x 200 image.
function fakePng(width = 600, height = 200, extra = 0) {
  const bytes = Buffer.alloc(33 + extra);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

describe("drawn signature validation", () => {
  it("accepts a PNG data URL and bare base64", () => {
    const b64 = fakePng().toString("base64");
    const fromUrl = parseSignaturePng(`data:image/png;base64,${b64}`);
    assert.equal(fromUrl.ok, true);
    assert.equal(fromUrl.width, 600);
    assert.equal(fromUrl.height, 200);
    assert.equal(parseSignaturePng(b64).ok, true);
  });

  it("rejects empty, non-PNG, oversized and malformed input", () => {
    assert.equal(parseSignaturePng("").ok, false);
    assert.equal(parseSignaturePng(undefined).ok, false);
    assert.equal(
      parseSignaturePng(
        `data:image/jpeg;base64,${fakePng().toString("base64")}`,
      ).ok,
      false,
    );
    assert.equal(
      parseSignaturePng(
        Buffer.from("GIF89a not a png at all, padding......").toString(
          "base64",
        ),
      ).ok,
      false,
    );
    assert.equal(
      parseSignaturePng(
        fakePng(600, 200, SIGNATURE_MAX_BYTES).toString("base64"),
      ).ok,
      false,
    );
    assert.equal(parseSignaturePng("not base64 !!").ok, false);
    assert.equal(
      parseSignaturePng(fakePng(0, 200).toString("base64")).ok,
      false,
    );
  });

  it("stores one file per party and keeps the aspect ratio in the PDF", () => {
    assert.equal(signaturePath("abc", "renter"), "abc/renter.png");
    assert.deepEqual(fitSignature(600, 200), { width: 140, height: 46.7 });
    assert.deepEqual(fitSignature(300, 300), { width: 50, height: 50 });
  });
});
