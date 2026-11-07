import { styleText } from "node:util";
import sharp from "sharp";
import type { Result, SourceName } from "@/comic";

const SOURCE_LABELS: Record<SourceName, string> = { openlibrary: "ol", bnf: "bnf", sbn: "sbn", anilist: "ani", comicvine: "cv" };

const seriesLabel = ({ seriesSize, volumes }: Result) =>
  seriesSize ? `series of ${seriesSize}` : volumes && `up to vol. ${volumes}`;

export const IMG_COLS = 16;
export const IMG_ROWS = 11;

export const supportsImages = () =>
  Boolean(process.stdout.isTTY) && (/ghostty|kitty/.test(process.env.TERM ?? "") || process.env.TERM_PROGRAM === "WezTerm");

// A cover is either a base64 PNG (kitty protocol) or rows of colored half-blocks (any truecolor terminal)
export type Cover = string | string[];

// Each text cell shows two vertically stacked pixels: top as foreground of "▀", bottom as background
export async function coverFromBuffer(image: Buffer, mode: "png" | "blocks"): Promise<Cover> {
  if (mode === "png") return (await sharp(image).resize({ width: 300, withoutEnlargement: true }).png().toBuffer()).toString("base64");
  const [w, h] = [IMG_COLS, IMG_ROWS * 2];
  const data = await sharp(image).resize(w, h, { fit: "fill" }).flatten({ background: "#000" }).raw().toBuffer();
  const px = (x: number, y: number) => `${data[(y * w + x) * 3]};${data[(y * w + x) * 3 + 1]};${data[(y * w + x) * 3 + 2]}`;
  return Array.from({ length: IMG_ROWS }, (_, r) =>
    Array.from({ length: w }, (_, x) => `\x1b[38;2;${px(x, 2 * r)};48;2;${px(x, 2 * r + 1)}m▀`).join("") + "\x1b[0m",
  );
}

export async function fetchCover(url: string | null, mode: "png" | "blocks"): Promise<Cover | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok ? await coverFromBuffer(Buffer.from(await res.arrayBuffer()), mode) : null;
  } catch {
    return null;
  }
}

function kittyImage(b64: string): string {
  const chunks = b64.match(/.{1,4096}/g) ?? [];
  return chunks
    .map((c, i) => `\x1b_G${i ? "" : `a=T,f=100,c=${IMG_COLS},r=${IMG_ROWS},C=1,`}m=${i < chunks.length - 1 ? 1 : 0};${c}\x1b\\`)
    .join("");
}

const LOGO = [
  "██████╗  █████╗ ███╗   ██╗███████╗██╗      ██████╗ ",
  "██╔══██╗██╔══██╗████╗  ██║██╔════╝██║     ██╔═══██╗",
  "██████╔╝███████║██╔██╗ ██║█████╗  ██║     ██║   ██║",
  "██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║     ██║   ██║",
  "██║     ██║  ██║██║ ╚████║███████╗███████╗╚██████╔╝",
  "╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝ ╚═════╝ ",
];

// Rows fade from magenta to cyan; narrow terminals get a plain word instead of the banner
export function formatLogo(): string {
  const tagline = styleText("dim", "comics, manga & graphic novels · one search, many catalogs");
  if ((process.stdout.columns || 80) < 54) return `${styleText(["bold", "magenta"], "panelo")}\n${tagline}\n`;
  const rows = LOGO.map((row, i) => {
    const t = i / (LOGO.length - 1);
    return `\x1b[38;2;${Math.round(255 - 195 * t)};${Math.round(80 + 120 * t)};${Math.round(200 + 55 * t)}m${row}\x1b[0m`;
  });
  return `${rows.join("\n")}\n${tagline}\n`;
}

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
