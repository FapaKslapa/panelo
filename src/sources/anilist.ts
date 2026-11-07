import { z } from "zod";
import { parseComic, getJson, type Source } from "@/comic";

const MEDIA_FIELDS = `id volumes title{romaji english} startDate{year} coverImage{large} staff(perPage:3){edges{node{name{full}}}}`;

const BY_TITLE = `query($q:String){Page(perPage:20){media(search:$q,type:MANGA,sort:SEARCH_MATCH){${MEDIA_FIELDS}}}}`;
const BY_AUTHOR = `query($q:String){Page(perPage:1){staff(search:$q){staffMedia(type:MANGA,perPage:20,sort:POPULARITY_DESC){nodes{${MEDIA_FIELDS}}}}}}`;

const MediaSchema = z.object({
  id: z.number(),
  volumes: z.number().nullable(),
  title: z.object({ romaji: z.string().nullable(), english: z.string().nullable() }),
  startDate: z.object({ year: z.number().nullable() }),
  coverImage: z.object({ large: z.string().nullable() }),
  staff: z.object({ edges: z.array(z.object({ node: z.object({ name: z.object({ full: z.string() }) }) })) }),
});

const ResponseSchema = z.object({
  data: z.object({
    Page: z.object({
      media: z.array(MediaSchema).optional(),
      staff: z.array(z.object({ staffMedia: z.object({ nodes: z.array(MediaSchema) }) })).optional(),
    }),
  }),
});

export const aniList: Source = {
  name: "anilist",
  async search(query, by) {
    const json = await getJson("https://graphql.anilist.co", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: by === "author" ? BY_AUTHOR : BY_TITLE, variables: { q: query } }),
    });
    const { data } = ResponseSchema.parse(json);
    const media = data.Page.media ?? data.Page.staff?.[0]?.staffMedia.nodes ?? [];
    return media.flatMap((m) =>
      parseComic({
        source: "anilist",
        sourceId: String(m.id),
        title: m.title.english ?? m.title.romaji,
        authors: m.staff.edges.map((e) => e.node.name.full),
        publisher: null,
        year: m.startDate.year,
        languages: ["jpn"],
        isbn: null,
        cover: m.coverImage.large,
        seriesSize: m.volumes || null,
      }),
    );
  },
};
