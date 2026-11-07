import { z } from "zod";

export const SourceName = z.enum(["openlibrary", "bnf", "sbn", "anilist", "comicvine"]);
export type SourceName = z.infer<typeof SourceName>;

const HttpsUrl = z.url({ protocol: /^https$/ });

export const ComicSchema = z.object({
  source: SourceName,
  sourceId: z.string().min(1),
  title: z.string().min(1),
  authors: z.array(z.string()),
  publisher: z.string().nullable(),
  year: z.number().int().nullable(),
  languages: z.array(z.string()),
  isbn: z.string().nullable(),
  cover: HttpsUrl.nullable(),
  seriesSize: z.number().int().positive().nullable().default(null),
});
export type Comic = z.infer<typeof ComicSchema>;

export const ResultSchema = z.object({
  title: z.string().min(1),
  authors: z.array(z.string()),
  publisher: z.string().nullable(),
  year: z.number().int().nullable(),
  languages: z.array(z.string()),
  isbn: z.string().nullable(),
  cover: HttpsUrl.nullable(),
  volumes: z.number().int().positive().nullable(),
  seriesSize: z.number().int().positive().nullable(),
  sources: z.array(z.object({ source: SourceName, id: z.string().min(1) })).min(1),
});
export type Result = z.infer<typeof ResultSchema>;

export type SearchBy = "any" | "author";
export type Source = { name: SourceName; search: (query: string, by: SearchBy) => Promise<Comic[]> };

const TIMEOUT_MS = 8000;

export async function fetchWithTimeout(url: string | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

export const getJson = async (url: string | URL, init?: RequestInit): Promise<unknown> =>
  (await fetchWithTimeout(url, init)).json();

export const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// Un record malformato scarta solo se stesso, non l'intera fonte
export function parseComic(raw: unknown): Comic[] {
  const parsed = ComicSchema.safeParse(raw);
  return parsed.success ? [parsed.data] : [];
}

// Ricerca "mentre scrivi": l'ultima parola diventa un prefisso (joj -> joj*)
export const withPrefix = (query: string) => query.trim().replace(/(\S{3,})$/, "$1*").replaceAll('"', "");
