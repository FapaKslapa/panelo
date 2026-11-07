# comics_cli

A command-line tool that searches comics, manga and graphic novels across several public catalogs at once and shows one merged list of results.

## What it does

- Queries multiple sources in parallel: Open Library, BnF (French national library), SBN (Italian library catalog), AniList (manga) and, optionally, Comic Vine and Google Books.
- Merges duplicate entries coming from different sources into a single result and records which sources found it.
- Ranks results by relevance (title match first, then matches in authors or publisher), then by how many sources agree and whether a cover is available.
- Collapses volumes of the same series into one entry, unless the query contains a number (for example `dylan dog 442`), in which case the specific volume is returned.
- Shows results as they arrive, with a progress indicator on stderr, and reports sources that failed without aborting the search.
- Shows covers in the terminal: full-resolution images in kitty-protocol terminals (Kitty, Ghostty, WezTerm), a version drawn with colored half-blocks (16x22 pixels) in any other true-color terminal, and a colored tile with the initials when no cover is available.

## Requirements

- Node.js 22 or newer
- pnpm

## Setup

```sh
pnpm install
```

Comic Vine and Google Books are only used when their API keys are set (`COMIC_VINE_API_KEY`, `GOOGLE_BOOKS_API_KEY`), for example:

```sh
export COMIC_VINE_API_KEY=your_key
```

or put the variables in a `.env` file at the project root (git-ignored, loaded by `pnpm panelo`).

## Usage

```sh
pnpm panelo search "<title>" [--author] [--limit 15] [--json]
```

| Option | Description |
| --- | --- |
| `--author` | Treat the query as an author name instead of a free-text search |
| `--limit N` | Maximum number of results to show (default 15) |
| `--json` | Print results as JSON instead of formatted text |

Examples:

```sh
pnpm panelo search "berserk"
pnpm panelo search "Zerocalcare" --author --limit 5
pnpm panelo search "dylan dog 442" --json
```

The exit code is 0 when at least one result is found, 1 otherwise.

## Development

```sh
pnpm test        # run tests
pnpm typecheck   # TypeScript check
```

## Notes

- Cover images are decoded with `sharp`, which ships prebuilt binaries for Linux, macOS and Windows. CI runs the tests on all three.
- SBN does not return authors, ISBNs or covers in its search, only title and publication data.
- Comic Vine describes series rather than single issues.

## License

Apache License 2.0, see [LICENSE](LICENSE).
