import { test } from "node:test";
import assert from "node:assert/strict";
import { parseComic, withPrefix, type Comic, type Source } from "@/comic";
import { cleanAuthor, collapseSeries, mergeComics } from "@/merge";
import { rank, search, searchStream } from "@/search";

const comic = (over: Partial<Comic>): Comic => ({
  source: "openlibrary", sourceId: "1", title: "Batman", authors: [], publisher: null,
  year: 1988, languages: [], isbn: null, cover: null, seriesSize: null, ...over,
});

test("prefix is added only to the last long word", () => {
  assert.equal(withPrefix("joj"), "joj*");
  assert.equal(withPrefix("dylan dog"), "dylan dog*");
  assert.equal(withPrefix("x"), "x");
});

test("authors are written in natural order", () => {
  assert.equal(cleanAuthor("Morris-Dumoulin, Gilles"), "Gilles Morris-Dumoulin");
  assert.equal(cleanAuthor("Frank Miller"), "Frank Miller");
});

test("the same work from several sources becomes one result", () => {
  const [only, ...others] = mergeComics([
    comic({ title: "Dylan Dog", authors: ["Tiziano Sclavi"], year: 1991, languages: ["ita"], cover: "https://x.test/c.jpg" }),
    comic({ source: "sbn", sourceId: "a", title: "Dylan Dog", year: 1990, publisher: "Bonelli" }),
    comic({ source: "bnf", sourceId: "b", title: "Dylan Dog", authors: ["Sclavi, Tiziano"], year: 2001 }),
  ]);
  assert.equal(others.length, 0);
  assert.equal(only!.sources.length, 3);
  assert.equal(only!.year, 1990);
  assert.equal(only!.publisher, "Bonelli");
  assert.equal(only!.cover, "https://x.test/c.jpg");
  assert.deepEqual(only!.languages, ["it"]);
});

test("same title with different authors stays separate", () => {
  const results = mergeComics([comic({ authors: ["Alan Moore"] }), comic({ authors: ["Frank Miller"] })]);
  assert.equal(results.length, 2);
});

test("implausible years are ignored", () => {
  const [r] = mergeComics([comic({ year: 1200 }), comic({ source: "bnf", year: 2005 })]);
  assert.equal(r!.year, 2005);
});

test("rank drops results missing a word and puts title matches first", () => {
  const list = mergeComics([
    comic({ title: "Altro", authors: ["Olivier Hagué"] }),
    comic({ title: "Il mondo di Dylan Dog", authors: ["Sclavi"] }),
    comic({ title: "Dylan Dog 442", authors: ["Barbato"] }),
  ]);
  assert.deepEqual(rank(list, "dylan dog").map((r) => r.title), ["Dylan Dog 442", "Il mondo di Dylan Dog"]);
  assert.deepEqual(rank(list, "sclavi dylan").map((r) => r.title), ["Il mondo di Dylan Dog"]);
});

test("author search trusts the sources instead of filtering on words", () => {
  const list = mergeComics([comic({ source: "sbn", title: "Dylan Dog" })]);
  assert.equal(rank(list, "sclavi", "author").length, 1);
  assert.equal(rank(list, "sclavi").length, 0);
});

test("a failing source does not hide the others", async () => {
  const ok: Source = { name: "bnf", search: async () => [comic({})] };
  const ko: Source = { name: "anilist", search: async () => { throw new Error("HTTP 500"); } };
  const r = await search("batman", "any", [ok, ko]);
  assert.equal(r.results.length, 1);
  assert.deepEqual(r.failures, [{ source: "anilist", message: "HTTP 500" }]);
});

test("streaming emits a snapshot as each source answers", async () => {
  const after = (ms: number, name: Source["name"], title: string): Source => ({
    name,
    search: () => new Promise((resolve) => setTimeout(() => resolve([comic({ source: name, title })]), ms)),
  });
  const snapshots: { count: number; pending: string[] }[] = [];
  for await (const p of searchStream("batman", "any", [after(40, "bnf", "Batman Dark"), after(1, "sbn", "Batman")])) {
    snapshots.push({ count: p.results.length, pending: p.pending });
  }
  assert.deepEqual(snapshots, [{ count: 1, pending: ["bnf"] }, { count: 2, pending: [] }]);
});

test("numbered volumes collapse into one series, single numbers do not", () => {
  const volumes = mergeComics([
    comic({ title: "Persepolis 1", authors: ["Marjane Satrapi"] }),
    comic({ title: "Persepolis 3 & 4", authors: ["Marjane Satrapi"] }),
    comic({ title: "Persepolis I and II", authors: ["Marjane Satrapi"] }),
    comic({ source: "sbn", sourceId: "s", title: "Persepolis" }),
    comic({ title: "Fahrenheit 451", authors: ["Ray Bradbury"] }),
  ]);
  const titles = collapseSeries(volumes).map((r) => [r.title, r.volumes]);
  assert.deepEqual(titles, [["Fahrenheit 451", null], ["Persepolis", 4]]);
  assert.equal(collapseSeries(volumes).at(-1)!.sources.length, 4);
});

test("the largest known series size wins and survives collapsing", () => {
  const volumes = mergeComics([
    comic({ title: "Berserk 1", authors: ["Kentaro Miura"] }),
    comic({ title: "Berserk 2", authors: ["Kentaro Miura"] }),
    comic({ source: "anilist", sourceId: "a", title: "Berserk", authors: ["Kentaro Miura"], seriesSize: 41 }),
  ]);
  const [series] = collapseSeries(volumes);
  assert.equal(series!.seriesSize, 41);
  assert.equal(series!.volumes, 2);
});

test("a malformed record is dropped instead of failing the whole source", () => {
  assert.deepEqual(parseComic({ source: "anilist", sourceId: "1", title: null }), []);
  assert.equal(parseComic(comic({})).length, 1);
});
