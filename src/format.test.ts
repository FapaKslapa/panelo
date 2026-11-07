import { test } from "node:test";
import assert from "node:assert/strict";
import { blocksFromBmp, formatResult, IMG_ROWS } from "@/format";
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

test("a bottom-up BMP becomes half-block rows, top pixel first", () => {
  const bmp = Buffer.alloc(54 + 8 * 2); // 1x2 image, 24 bit, rows padded to 4 bytes
  bmp.writeUInt32LE(54, 10);
  bmp.writeInt32LE(1, 18);
  bmp.writeInt32LE(2, 22);
  bmp.writeUInt16LE(24, 28);
  bmp.set([0, 0, 255], 54 + 0); // stored first = bottom row: red (BGR)
  bmp.set([255, 0, 0], 54 + 4); // stored second = top row: blue
  assert.deepEqual(blocksFromBmp(bmp), ["\x1b[38;2;0;0;255;48;2;255;0;0m▀\x1b[0m"]);
});
