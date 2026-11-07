import { fold, ResultSchema, type Comic, type Result } from "@/comic";

const ISO_639_2: Record<string, string> = { fre: "fr", ita: "it", eng: "en", jpn: "ja", spa: "es", ger: "de" };
const ARTICLES = /^(le|la|les|l|un|une|il|lo|gli|i|the|a|an|el|los|las|der|die|das)\s+/;
const OLDEST_YEAR = 1800;
// "Persepolis 3", "Thorgal, tome 7", "Dylan Dog vol. 9", "Persepolis 1 & 2", "Persepolis I and II"
const NUMBER = String.raw`(\d{1,3}|[IVXL]{1,5})`;
const VOLUME = new RegExp(
  String.raw`^(.+?)[\s,:.\-]+(?:(?:[Vv]ol(?:ume)?\.?|[Tt]ome|[Tt]omo|[Nn][°o]\.?|#)\s*)?${NUMBER}(?:\s*(?:&|-|and|et|e)\s*${NUMBER})?$`,
);
const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };

const trimTrailingPunctuation = (s: string) => s.replace(/\s*[/:;,.\-–]+\s*$/, "").trim();
const trimmed = (s: string | null) => (s ? trimTrailingPunctuation(s) : null);
const cleanTitle = (title: string) => trimTrailingPunctuation(title.replace(/\s+/g, " ").replace(/'\s+/g, "'"));

// "Morris-Dumoulin, Gilles" e "Gilles Morris-Dumoulin" sono la stessa persona
export const cleanAuthor = (name: string) => {
  const [surname, given, ...rest] = name.split(",").map((p) => p.trim());
  return given && !rest.length ? `${given} ${surname}` : name.trim();
};

const titleKey = (title: string) =>
  fold(title.split(/\s[:/–-]\s/)[0] ?? title)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(ARTICLES, "");

const authorTokens = (authors: string[]) =>
  new Set(fold(authors.join(" ")).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2));

type Titled = { title: string; authors: string[] };

// Titoli uguali ma autori diversi sono opere diverse (Batman di Moore e di Miller)
function sameWork(a: Titled, b: Titled): boolean {
  if (titleKey(a.title) !== titleKey(b.title)) return false;
  if (!a.authors.length || !b.authors.length) return true;
  const known = authorTokens(a.authors);
  return [...authorTokens(b.authors)].some((t) => known.has(t));
}

function cluster<T extends Titled>(items: T[]): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    const group = groups.find((g) => sameWork(g[0]!, item));
    if (group) group.push(item);
    else groups.push([item]);
  }
  return groups;
}

const maxOf = (values: (number | null)[]): number | null => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? Math.max(...known) : null;
};
const firstDefined = <T>(values: (T | null | undefined)[]): T | null => values.find((v) => v != null) ?? null;
const withAuthorsFirst = <T extends Titled>(items: T[]) =>
  [...items].sort((a, b) => Number(b.authors.length > 0) - Number(a.authors.length > 0));

function combine(group: Comic[]): Result {
  const thisYear = new Date().getFullYear();
  const years = group.map((c) => c.year).filter((y): y is number => y !== null && y >= OLDEST_YEAR && y <= thisYear);
  return ResultSchema.parse({
    title: cleanTitle(group[0]!.title),
    authors: [...new Set((group.find((c) => c.authors.length)?.authors ?? []).map(cleanAuthor))],
    publisher: trimmed(firstDefined(group.map((c) => c.publisher))),
    year: years.length ? Math.min(...years) : null,
    languages: [...new Set(group.flatMap((c) => c.languages).flatMap((l) => ISO_639_2[l] ?? []))],
    isbn: firstDefined(group.map((c) => c.isbn)),
    cover: firstDefined(group.map((c) => c.cover)),
    volumes: null,
    seriesSize: maxOf(group.map((c) => c.seriesSize)),
    sources: group.map((c) => ({ source: c.source, id: c.sourceId })),
  });
}

// Le schede con autori vanno per prime: quelle senza autori (SBN) si agganciano alla prima opera con lo stesso titolo
export const mergeComics = (comics: Comic[]): Result[] => cluster(withAuthorsFirst(comics)).map(combine);

const toNumber = (token: string) =>
  /^\d+$/.test(token)
    ? Number(token)
    : [...token].reduce((sum, ch, i, all) => {
        const value = ROMAN[ch]!;
        return sum + (value < (ROMAN[all[i + 1] ?? ""] ?? 0) ? -value : value);
      }, 0);

const volumeOf = (title: string) => {
  const match = VOLUME.exec(title);
  if (!match) return null;
  const first = toNumber(match[2]!);
  return { series: cleanTitle(match[1]!), first, last: match[3] ? toNumber(match[3]) : first };
};

type Volume = Titled & { original: Result; first: number; last: number };

function mergeSeries(volumes: Volume[]): Result {
  const members = [...volumes].sort((a, b) => a.first - b.first);
  const parts = members.map((m) => m.original);
  const years = parts.map((p) => p.year).filter((y): y is number => y !== null);
  return ResultSchema.parse({
    title: members[0]!.title,
    authors: parts.find((p) => p.authors.length)?.authors ?? [],
    publisher: firstDefined(parts.map((p) => p.publisher)),
    year: years.length ? Math.min(...years) : null,
    languages: [...new Set(parts.flatMap((p) => p.languages))],
    isbn: null,
    cover: firstDefined(parts.map((p) => p.cover)),
    volumes: Math.max(...members.map((m) => m.last)),
    seriesSize: maxOf(parts.map((p) => p.seriesSize)),
    sources: parts.flatMap((p) => p.sources),
  });
}

// Servono almeno due volumi diversi per parlare di serie ("Fahrenheit 451" da solo resta com'è); `volumes` è il numero più alto visto, non il totale reale
export function collapseSeries(results: Result[]): Result[] {
  const numbered = results.flatMap((original) => {
    const parsed = volumeOf(original.title);
    return parsed ? [{ original, title: parsed.series, authors: original.authors, first: parsed.first, last: parsed.last }] : [];
  });
  const absorbed = new Set<Result>();
  const series: Result[] = [];
  for (const group of cluster(withAuthorsFirst(numbered))) {
    if (new Set(group.map((v) => v.first)).size < 2) continue;
    group.forEach((v) => absorbed.add(v.original));
    series.push(mergeSeries(group));
  }
  const rest = results.filter((r) => !absorbed.has(r));
  const standalone = rest.filter((r) => {
    const parent = series.find((s) => sameWork(s, r));
    if (parent) {
      parent.sources.push(...r.sources);
      parent.seriesSize = maxOf([parent.seriesSize, r.seriesSize]);
    }
    return !parent;
  });
  return [...standalone, ...series];
}
