import { fold, type Comic, type Result, type SearchBy, type Source } from "@/comic";
import { collapseSeries, mergeComics } from "@/merge";
import { aniList } from "@/sources/anilist";
import { bnf } from "@/sources/bnf";
import { openLibrary } from "@/sources/openlibrary";
import { comicVine } from "@/sources/comicvine";
import { sbn } from "@/sources/sbn";

const comicVineKey = process.env.COMIC_VINE_API_KEY;
const SOURCES: Source[] = [openLibrary, bnf, sbn, aniList, ...(comicVineKey ? [comicVine(comicVineKey)] : [])];


// Le fonti cercano in largo (note, editori): resta solo chi contiene ogni parola cercata
// 3 = titolo che inizia con la ricerca, 2 = tutte le parole nel titolo, 1 = parole sparse tra titolo, autori ed editore
function relevance(result: Result, words: string[]): number {
  const title = fold(result.title);
  const haystack = `${title} ${fold(result.authors.join(" "))} ${fold(result.publisher ?? "")}`;
  if (!words.every((w) => haystack.includes(w))) return 0;
  if (title.startsWith(words.join(" "))) return 3;
  return words.every((w) => title.includes(w)) ? 2 : 1;
}

// Per autore ci si fida delle fonti (SBN non restituisce gli autori): il filtro sulle parole varrebbe a scartarla
export function rank(results: Result[], query: string, by: SearchBy = "any"): Result[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return results
    .map((result) => ({ result, score: by === "author" ? 1 : relevance(result, words) }))
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.result.sources.length - a.result.sources.length ||
        Number(b.result.cover !== null) - Number(a.result.cover !== null),
    )
    .map((r) => r.result);
}

// Cercando "dylan dog 442" si vuole proprio quel volume, non la serie
const groupVolumes = (results: Result[], query: string) => (/\d/.test(query) ? results : collapseSeries(results));

export type SearchProgress = {
  results: Result[];
  failures: { source: string; message: string }[];
  pending: string[];
};

// Le fonti sono indipendenti: ogni volta che una risponde (o cade) si emette lo stato aggiornato
export async function* searchStream(
  query: string,
  by: SearchBy = "any",
  sources: Source[] = SOURCES,
): AsyncGenerator<SearchProgress> {
  const comics: Comic[] = [];
  const failures: SearchProgress["failures"] = [];
  const running = new Map(
    sources.map((source, index) => [
      index,
      source.search(query, by).then(
        (found) => ({ index, found, error: null }),
        (error: unknown) => ({ index, found: [], error: error instanceof Error ? error.message : String(error) }),
      ),
    ]),
  );

  while (running.size) {
    const { index, found, error } = await Promise.race(running.values());
    running.delete(index);
    if (error) failures.push({ source: sources[index]!.name, message: error });
    comics.push(...found);
    yield {
      results: rank(groupVolumes(mergeComics(comics), query), query, by),
      failures: [...failures],
      pending: [...running.keys()].map((i) => sources[i]!.name),
    };
  }
}
