import { z } from "zod";
import { parseComic, getJson, withPrefix, type Source } from "@/comic";

const ResponseSchema = z.object({
  docs: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      author_name: z.array(z.string()).default([]),
      publisher: z.array(z.string()).default([]),
      first_publish_year: z.number().optional(),
      language: z.array(z.string()).default([]),
      isbn: z.array(z.string()).default([]),
      cover_i: z.number().optional(),
      subject: z.array(z.string()).default([]),
    }),
  ),
});

// Il filtro per soggetto è l'unico modo di escludere i libri non fumetto
const COMICS_ONLY = '(subject:comics OR subject:"graphic novels" OR subject:fumetti OR subject:"bandes dessinées" OR subject:manga OR subject:quadrinhos OR subject:"histórias em quadrinhos" OR subject:"história em quadrinhos" OR subject:gibis)';

// Saggi e studi sui fumetti portano il soggetto "history and criticism": non sono fumetti
const ABOUT_COMICS = /history and criticism|literary criticism|study and teaching|bibliograph/i;

export const openLibrary: Source = {
  name: "openlibrary",
  async search(query, by) {
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("q", `${by === "author" ? `author:(${withPrefix(query)})` : withPrefix(query)} AND ${COMICS_ONLY}`);
    url.searchParams.set("limit", "20");
    url.searchParams.set("fields", "key,title,author_name,publisher,first_publish_year,language,isbn,cover_i,subject");
    const { docs } = ResponseSchema.parse(await getJson(url));
    return docs.filter((d) => !ABOUT_COMICS.test(d.subject.join("|"))).flatMap((d) =>
      parseComic({
        source: "openlibrary",
        sourceId: d.key,
        title: d.title,
        authors: d.author_name.slice(0, 4),
        publisher: d.publisher[0] ?? null,
        year: d.first_publish_year ?? null,
        languages: d.language,
        isbn: d.isbn.find((i) => i.length === 13) ?? null,
        cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
      }),
    );
  },
};
