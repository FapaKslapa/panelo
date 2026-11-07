# comics_cli

A command-line tool that searches comics, manga and graphic novels across several public catalogs at once and shows one merged list of results.

## What it does

- Queries multiple sources in parallel: Open Library, BnF (French national library), SBN (Italian library catalog), AniList (manga) and, optionally, Comic Vine.
- Merges duplicate entries coming from different sources into a single result and records which sources found it.
- Ranks results by relevance (title match first, then matches in authors or publisher), then by how many sources agree and whether a cover is available.
- Collapses volumes of the same series into one entry, unless the query contains a number (for example `dylan dog 442`), in which case the specific volume is returned.
- Shows results as they arrive, with a progress indicator on stderr, and reports sources that failed without aborting the search.
- Renders cover images inline in terminals that support images.

## Requirements

- Node.js
- pnpm

## Setup

```sh
pnpm install
```

Comic Vine is only used when an API key is set:

```sh
export COMIC_VINE_API_KEY=your_key
```

## Usage

```sh
pnpm mael search "<title>" [--author] [--limit 15] [--json]
```

| Option | Description |
| --- | --- |
| `--author` | Treat the query as an author name instead of a free-text search |
| `--limit N` | Maximum number of results to show (default 15) |
| `--json` | Print results as JSON instead of formatted text |

Examples:

```sh
pnpm mael search "berserk"
pnpm mael search "Zerocalcare" --author --limit 5
pnpm mael search "dylan dog 442" --json
```

The exit code is 0 when at least one result is found, 1 otherwise.

## Development

```sh
pnpm test        # run tests
pnpm typecheck   # TypeScript check
```

## Notes

- SBN does not return authors, ISBNs or covers in its search, only title and publication data.
- Comic Vine describes series rather than single issues.

## License

Apache License 2.0, see [LICENSE](LICENSE).
