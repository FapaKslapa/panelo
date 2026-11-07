import { z } from "zod";
import { parseComic, getJson, type Source } from "@/comic";

const VolumeSchema = z.object({
  id: z.string(),
  volumeInfo: z.object({
    title: z.string(),
    authors: z.array(z.string()).default([]),
    publisher: z.string().optional(),
    publishedDate: z.string().optional(),
    language: z.string().optional(),
    industryIdentifiers: z.array(z.object({ type: z.string(), identifier: z.string() })).default([]),
    imageLinks: z.object({ thumbnail: z.string().optional() }).optional(),
  }),
});
const ResponseSchema = z.object({ items: z.array(VolumeSchema).default([]) });

export const fromVolume = (v: z.infer<typeof VolumeSchema>) =>
  parseComic({
    source: "googlebooks",
    sourceId: v.id,
    title: v.volumeInfo.title,
    authors: v.volumeInfo.authors,
    publisher: v.volumeInfo.publisher ?? null,
    year: Number(v.volumeInfo.publishedDate?.slice(0, 4)) || null,
    languages: v.volumeInfo.language ? [v.volumeInfo.language] : [],
    isbn: v.volumeInfo.industryIdentifiers.find((i) => i.type === "ISBN_13")?.identifier ?? null,
    cover: v.volumeInfo.imageLinks?.thumbnail?.replace(/^http:/, "https:") ?? null,
  });

// Strong on Portuguese and Spanish editions, which the other catalogs barely cover
export const googleBooks = (apiKey: string): Source => ({
  name: "googlebooks",
  async search(query, by) {
    const url = new URL("https://www.googleapis.com/books/v1/volumes");
    url.searchParams.set("q", `${by === "author" ? "inauthor" : "intitle"}:${query} subject:"Comics & Graphic Novels"`);
    url.searchParams.set("maxResults", "20");
    url.searchParams.set("printType", "books");
    url.searchParams.set("key", apiKey);
    return ResponseSchema.parse(await getJson(url)).items.flatMap(fromVolume);
  },
});
