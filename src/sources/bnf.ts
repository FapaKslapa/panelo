import { load } from "cheerio";
import { parseComic, fetchWithTimeout, withPrefix, type Source } from "@/comic";

// 741.5 = classificazione Dewey di fumetti e bande dessinée: esclude i libri non fumetto
const dewey = "741.5";

export const bnf: Source = {
  name: "bnf",
  async search(query, by) {
    const term = `"${withPrefix(query)}"`;
    const title = `bib.title all ${term}`;
    const author = `bib.author all ${term}`;
    const url = new URL("https://catalogue.bnf.fr/api/SRU");
    url.searchParams.set("version", "1.2");
    url.searchParams.set("operation", "searchRetrieve");
    url.searchParams.set("query", `${by === "author" ? author : `(${title} or ${author})`} and bib.dewey all "${dewey}"`);
    url.searchParams.set("recordSchema", "dublincore");
    url.searchParams.set("maximumRecords", "20");
    const $ = load(await (await fetchWithTimeout(url)).text(), { xml: true });
    return $("oai_dc\\:dc")
      .map((_, el) => {
        const all = (tag: string) => $(el).find(tag).map((_, e) => $(e).text().trim()).get();
        const ark = all("dc\\:identifier").find((i) => i.includes("/ark:/"));
        const title = all("dc\\:title")[0]?.split(" / ")[0]?.trim();
        if (!ark || !title) return [];
        return parseComic({
          source: "bnf",
          sourceId: ark.slice(ark.indexOf("ark:/")),
          title,
          authors: all("dc\\:contributor").map((c) => c.replace(/\s*\(.*$/, "").replace(/\.\s*[^.]*$/, "")),
          publisher: all("dc\\:publisher")[0] ?? null,
          year: Number(all("dc\\:date")[0]?.match(/\d{4}/)?.[0]) || null,
          languages: all("dc\\:language"),
          isbn: all("dc\\:identifier").find((i) => /^(ISBN )?\d{13}$/.test(i))?.replace("ISBN ", "") ?? null,
          cover: null,
        });
      })
      .get();
  },
};
