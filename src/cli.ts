import { parseArgs } from "node:util";
import type { SearchBy } from "@/comic";
import { fetchCover, formatFailure, formatFooter, formatPending, formatResult, supportsImages } from "@/format";
import { searchStream, type SearchProgress } from "@/search";

const USAGE = 'Usage: pnpm panelo search "<title>" [--author] [--limit 15] [--json]';

const DEFAULT_LIMIT = 15;

async function collect(query: string, by: SearchBy): Promise<SearchProgress> {
  let last: SearchProgress = { results: [], failures: [], pending: [] };
  for await (const progress of searchStream(query, by)) {
    last = progress;
    if (process.stderr.isTTY) process.stderr.write(`\r\x1b[K${formatPending(progress.pending)}`);
  }
  return last;
}

async function runSearch(query: string, by: SearchBy, limit: number, json: boolean): Promise<number> {
  const started = performance.now();
  const { results, failures } = await collect(query, by);
  const shown = results.slice(0, limit);

  if (json) console.log(JSON.stringify(shown, null, 2));
  else {
    const covers = await Promise.all(shown.map((r) => (supportsImages() ? fetchCover(r.cover) : null)));
    console.log(shown.map((r, i) => formatResult(r, i, covers[i])).join("\n\n"));
    if (shown.length) console.log();
  }
  for (const f of failures) console.error(formatFailure(f.source, f.message));
  console.error(formatFooter(shown.length, results.length, performance.now() - started));
  return results.length ? 0 : 1;
}

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      author: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      limit: { type: "string", default: String(DEFAULT_LIMIT) },
    },
  });
  const [command, ...rest] = positionals;
  const limit = Number(values.limit);

  if (command === "search" && rest.length && Number.isInteger(limit) && limit > 0) {
    return runSearch(rest.join(" "), values.author ? "author" : "any", limit, values.json);
  }

  console.error(USAGE);
  return 1;
}

process.exitCode = await main();
