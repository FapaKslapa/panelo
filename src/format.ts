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

const IMG_COLS = 10;
const IMG_ROWS = 7;

export const supportsImages = () =>
  Boolean(process.stdout.isTTY) && (/ghostty|kitty/.test(process.env.TERM ?? "") || process.env.TERM_PROGRAM === "WezTerm");

// shortcut: converts with macOS `sips` (kitty protocol needs PNG), swap for a decoder when porting off macOS
export async function fetchCover(url: string | null): Promise<string | null> {
  if (!url) return null;
  const dir = await mkdtemp(join(tmpdir(), "mael-"));
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    await writeFile(join(dir, "in"), Buffer.from(await res.arrayBuffer()));
    await promisify(execFile)("sips", ["-s", "format", "png", "-Z", "300", join(dir, "in"), "--out", join(dir, "out.png")]);
    return (await readFile(join(dir, "out.png"))).toString("base64");
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

export function formatResult(result: Result, index: number, cover: string | null = null): string {
  const details = [result.authors.slice(0, 3).join(", "), result.publisher, result.year, result.languages.join("/"), seriesLabel(result)]
    .filter(Boolean)
    .join(" · ");
  const tags = [...new Set(result.sources.map((s) => SOURCE_LABELS[s.source]))].map((t) => styleText("cyan", `[${t}]`)).join(" ");
  const lines = [
    `${styleText("magenta", String(index + 1).padStart(2, "0"))} ${styleText(["bold", "white"], result.title)}`,
    `   ${styleText("dim", details || "—")}`,
    `   ${tags}`,
  ];
  if (!cover) return lines.join("\n");
  const pad = `\x1b[${IMG_COLS + 2}C`;
  const body = Array.from({ length: IMG_ROWS }, (_, i) => `${pad}${lines[i] ?? ""}`);
  return `${kittyImage(cover)}${body.join("\n")}`;
}

export const formatFailure = (source: string, message: string) => styleText("yellow", `! ${source}: ${message}`);

export const formatFooter = (shown: number, total: number, ms: number) =>
  styleText("dim", `── ${shown === total ? total : `${shown} of ${total}`} results · ${Math.round(ms)} ms ──`);

export const formatPending = (pending: string[]) => (pending.length ? styleText("dim", `searching: ${pending.join(" ")}`) : "");
