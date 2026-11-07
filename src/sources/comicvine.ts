import { z } from "zod";
import { parseComic, getJson, type Source } from "@/comic";

const ResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      start_year: z.string().nullable(),
      count_of_issues: z.number().nullable(),
      publisher: z.object({ name: z.string() }).nullable(),
      image: z.object({ small_url: z.string() }).nullable(),
    }),
  ),
});

// Comic Vine descrive serie, non singoli numeri: `count_of_issues` è la dimensione della serie
export const comicVine = (apiKey: string): Source => ({
  name: "comicvine",
  async search(query, by) {
    if (by === "author") return [];
    const url = new URL("https://comicvine.gamespot.com/api/search/");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("resources", "volume");
    url.searchParams.set("query", query);
    url.searchParams.set("limit", "20");
    url.searchParams.set("field_list", "id,name,start_year,count_of_issues,publisher,image");
    const { results } = ResponseSchema.parse(await getJson(url, { headers: { "user-agent": "panelo/0.1" } }));
    return results.flatMap((v) =>
      parseComic({
        source: "comicvine",
        sourceId: String(v.id),
        title: v.name,
        authors: [],
        publisher: v.publisher?.name ?? null,
        year: Number(v.start_year) || null,
        languages: ["eng"],
        isbn: null,
        cover: v.image?.small_url ?? null,
        seriesSize: v.count_of_issues || null,
      }),
    );
  },
});
