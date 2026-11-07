import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { coverFromBuffer, fetchCover, formatResult, IMG_COLS, IMG_ROWS } from "@/format";
import type { Result } from "@/comic";

const result: Result = {
  title: "Berserk", authors: ["Kentaro Miura"], publisher: "Glénat", year: 2004, languages: ["fr"],
  isbn: null, cover: null, volumes: null, seriesSize: null, sources: [{ source: "bnf", id: "1" }],
};

test("without a terminal the result is plain text", () => {
  const tty = process.stdout.isTTY;
  process.stdout.isTTY = false;
  assert.equal(formatResult(result, 0).split("\n").length, 3);
  process.stdout.isTTY = tty;
});

test("on a terminal the missing cover becomes a tile as tall as the image area", () => {
  const tty = process.stdout.isTTY;
  process.stdout.isTTY = true;
  assert.equal(formatResult(result, 0).split("\n").length, IMG_ROWS);
  process.stdout.isTTY = tty;
});

const solid = (r: number, g: number, b: number) =>
  sharp({ create: { width: 40, height: 60, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();

test("a decoded cover becomes IMG_ROWS rows of IMG_COLS half-blocks in the image colors", async () => {
  const rows = (await coverFromBuffer(await solid(255, 0, 0), "blocks")) as string[];
  assert.equal(rows.length, IMG_ROWS);
  assert.equal((rows[0]!.match(/▀/g) ?? []).length, IMG_COLS);
  assert.match(rows[0]!, /38;2;2[45]\d;\d{1,2};\d{1,2};48;2;2[45]\d;/); // red, give or take jpeg noise
});

test("png mode returns base64 PNG data", async () => {
  const png = (await coverFromBuffer(await solid(0, 0, 255), "png")) as string;
  assert.equal(Buffer.from(png, "base64").subarray(1, 4).toString(), "PNG");
});

test("data that is not an image makes fetchCover give up instead of throwing", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response("<html>not an image</html>");
  try {
    assert.equal(await fetchCover("https://x.test/c.jpg", "blocks"), null);
  } finally {
    globalThis.fetch = real;
  }
});

test("a missing url gives no cover", async () => {
  assert.equal(await fetchCover(null, "blocks"), null);
});
