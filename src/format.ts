import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { styleText } from "node:util";
import type { Result, SourceName } from "@/comic";

const SOURCE_LABELS: Record<SourceName, string> = { openlibrary: "ol", bnf: "bnf", sbn: "sbn", anilist: "ani", comicvine: "cv" };

const seriesLabel = ({ seriesSize, volumes }: Result) =>
  seriesSize ? `series of ${seriesSize}` : volumes && `up to vol. ${volumes}`;

export const IMG_COLS = 12;
export const IMG_ROWS = 8;

export const supportsImages = () =>
  Boolean(process.stdout.isTTY) && (/ghostty|kitty/.test(process.env.TERM ?? "") || process.env.TERM_PROGRAM === "WezTerm");

// A cover is either a base64 PNG (kitty protocol) or rows of colored half-blocks (any truecolor terminal)
export type Cover = string | string[];

// Each text cell shows two vertically stacked pixels: top as foreground of "▀", bottom as background
export function blocksFromBmp(bmp: Buffer): string[] {
  const offset = bmp.readUInt32LE(10);
  const width = bmp.readInt32LE(18);
  const height = bmp.readInt32LE(22);
  const bytes = bmp.readUInt16LE(28) / 8;
  const stride = Math.ceil((width * bytes) / 4) * 4;
  const pixel = (x: number, y: number) => {
    const row = height < 0 ? y : Math.abs(height) - 1 - y; // positive height = stored bottom-up
    const i = offset + row * stride + x * bytes;
    return `${bmp[i + 2]};${bmp[i + 1]};${bmp[i]}`;
  };
  return Array.from({ length: Math.abs(height) / 2 }, (_, r) =>
    Array.from({ length: width }, (_, x) => `\x1b[38;2;${pixel(x, 2 * r)};48;2;${pixel(x, 2 * r + 1)}m▀`).join("") + "\x1b[0m",
  );
}

// shortcut: converts with macOS `sips`, other platforms get the colored placeholder; swap for a decoder to port
export async function fetchCover(url: string | null, mode: "png" | "blocks"): Promise<Cover | null> {
  if (!url || process.platform !== "darwin") return null;
  const dir = await mkdtemp(join(tmpdir(), "panelo-"));
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    await writeFile(join(dir, "in"), Buffer.from(await res.arrayBuffer()));
    const args =
      mode === "png"
        ? ["-s", "format", "png", "-Z", "300"]
        : ["-z", String(IMG_ROWS * 2), String(IMG_COLS), "-s", "format", "bmp"];
    await promisify(execFile)("sips", [...args, join(dir, "in"), "--out", join(dir, "out")]);
    const out = await readFile(join(dir, "out"));
    return mode === "png" ? out.toString("base64") : blocksFromBmp(out);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function kittyImage(b64: string): string {
  const chunks = b64.match(/.{1,4096}/g) ?? [];
  return chunks
    .map((c, i) => `\x1b_G${i ? "" : `a=T,f=100,c=${IMG_COLS},r=${IMG_ROWS},C=1,`}m=${i < chunks.length - 1 ? 1 : 0};${c}\x1b\\`)
    .join("");
}

export const formatLogo = () =>
  [
    ["magenta", "┏━┓┏━┓┏┓╻┏━╸╻  ┏━┓"],
    ["magenta", "┣━┛┣━┫┃┗┫┣╸ ┃  ┃ ┃"],
    ["cyan", "╹  ╹ ╹╹ ╹┗━╸┗━╸┗━┛"],
  ]
    .map(([color, row]) => ` ${styleText(["bold", color as "magenta"], row!)}`)
    .join("\n") + `\n ${styleText("dim", "comics, manga & graphic novels · one search, many catalogs")}\n`;

// Fallback for terminals without image support: a colored tile (hue from the title) with the initials
function placeholder(title: string): string[] {
  const hue = [...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (0.4 - 0.25 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  const bg = `\x1b[48;2;${f(0)};${f(8)};${f(4)}m`;
  const initials = title.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const mid = `${initials}`.padStart(Math.ceil((IMG_COLS + initials.length) / 2)).padEnd(IMG_COLS);
  return Array.from({ length: IMG_ROWS }, (_, i) => `${bg}\x1b[1;97m${i === 3 ? mid : " ".repeat(IMG_COLS)}\x1b[0m`);
}

export function formatResult(result: Result, index: number, cover: Cover | null = null): string {
  const room = (process.stdout.columns || 80) - IMG_COLS - 6;
  const cut = (text: string) => (process.stdout.isTTY && text.length > room ? `${text.slice(0, room - 1)}…` : text);
  const details = cut([result.authors.slice(0, 3).join(", "), result.publisher, result.year, result.languages.join("/"), seriesLabel(result)]
    .filter(Boolean)
    .join(" · "));
  const tags = [...new Set(result.sources.map((s) => SOURCE_LABELS[s.source]))].map((t) => styleText("cyan", `[${t}]`)).join(" ");
  const lines = [
    `${styleText("magenta", String(index + 1).padStart(2, "0"))} ${styleText(["bold", "white"], cut(result.title))}`,
    `   ${styleText("dim", details || "—")}`,
    `   ${tags}`,
  ];
  if (!process.stdout.isTTY) return lines.join("\n");
  if (typeof cover !== "string") {
    const tiles = cover ?? placeholder(result.title);
    return tiles.map((tile, i) => `${tile}  ${lines[i] ?? ""}`).join("\n");
  }
  const pad = `\x1b[${IMG_COLS + 2}C`;
  const body = Array.from({ length: IMG_ROWS }, (_, i) => `${pad}${lines[i] ?? ""}`);
  return `${kittyImage(cover)}${body.join("\n")}`;
}

export const formatFailure = (source: string, message: string) => styleText("yellow", `! ${source}: ${message}`);

export const formatFooter = (shown: number, total: number, ms: number) =>
  styleText("dim", `── ${shown === total ? total : `${shown} of ${total}`} results · ${Math.round(ms)} ms ──`);

export const formatPending = (pending: string[]) => (pending.length ? styleText("dim", `searching: ${pending.join(" ")}`) : "");
