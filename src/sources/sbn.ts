import { z } from "zod";
import { parseComic, getJson, withPrefix, type SearchBy, type Source } from "@/comic";

const ResponseSchema = z.object({
  briefRecords: z.array(z.object({ codiceIdentificativo: z.string(), titolo: z.string(), pubblicazione: z.string().default("") })),
});

// Il filtro per soggetto è esatto e senza wildcard: "fumetti" e "fumetto" sono due soggetti distinti nel catalogo
const SUBJECTS = ["fumetti", "fumetto"];

async function bySubject(query: string, by: SearchBy, subject: string) {
  const url = new URL("https://opac.sbn.it/opacmobilegw/search.json");
  url.searchParams.set(by === "author" ? "author" : "any", withPrefix(query));
  url.searchParams.set("subject", subject);
  url.searchParams.set("rows", "20");
  return ResponseSchema.parse(await getJson(url)).briefRecords;
}

// shortcut: il catalogo SBN non restituisce autori, ISBN né copertine nella ricerca, solo titolo e "luogo : editore, anno"
export const sbn: Source = {
  name: "sbn",
  async search(query, by) {
    const records = (await Promise.all(SUBJECTS.map((s) => bySubject(query, by, s)))).flat();
    return records.flatMap((r) =>
      parseComic({
        source: "sbn",
        sourceId: r.codiceIdentificativo,
        title: r.titolo.split(" / ")[0]?.trim() || r.titolo,
        authors: [],
        publisher: r.pubblicazione.match(/ : ([^,;]+)/)?.[1]?.trim() ?? null,
        year: Number(r.pubblicazione.match(/(\d{4})\D*$/)?.[1]) || null,
        languages: [],
        isbn: null,
        cover: null,
      }),
    );
  },
};
