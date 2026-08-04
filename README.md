# Ripple

![The Ripple feed](docs/feed.png)

A micro-journal inside your Obsidian vault, in the spirit of [Pile](https://github.com/UdaraJay/pile) by Udara Jay: one folder of plain Markdown posts, a feed with a composer, threaded replies, highlights, and AI reflections. Local-first; the journal folder remains the only source of truth.

Ripple is an independent project inspired by Pile; it is not affiliated with or endorsed by Pile or Udara Jay.

- **One linked folder** (default `Ripple/`, changeable in settings): posts land as `YYYY/MM/YYYYMMDD-HHmmss.md` with a small frontmatter block. Files dropped in by any other route appear in the feed — the folder is the API.
- **Feed**: newest-first under day headers, composer pinned on top, a month scrubber on the edge. In a composer, `Enter` posts or saves and `Shift-Enter` starts a new line. With the feed focused, `n` opens the composer, `j`/`k` move between threads, `Enter` edits the newest note, `r` replies to it, `h` cycles its highlight, `t` names it, and `o` opens it normally.
- **Threads**: new replies and scoped reflections appear directly beneath the note they target, backed by `reply_to` wikilinks. The original continuation stays on its parent's vertical lane; a later reply opens a parallel indented branch whose continuations keep that same indentation. Clicking the fork's origin circle hides the complete side branch, while clicking the side branch's first circle keeps that note and hides the rest. Any other note circle with descendants folds everything beneath that note. At a fork origin, the menu separates **Collapse branch**, which retains the main continuation, from **Collapse notes below**, which hides every descendant. The same menu can temporarily flatten one side branch onto the main lane and hide the established continuation without changing `reply_to`. Renames never orphan a thread, and a reply can be promoted to a top-level note without detaching its descendants. Every persisted note has its full menu and reveals its own inline Reply and Reflect controls on hover or keyboard focus. On mobile, Reply stays inline everywhere while note and thread or branch reflection controls stay inline only on terminal notes; every reflection action remains available from the dot menu. Highlight stays with the newest note, whole-thread export belongs to the visually terminal main note, and branch export belongs to each terminal branch note. The visually last main-thread note can move an entire multi-note thread to the trash after confirmation.
- **Export**: the visually terminal main note combines the currently revealed tree into a standalone Markdown note in Obsidian's configured new-note location; notes hidden by collapsed branches are omitted. A terminal branch note can instead export its currently revealed direct root-to-terminal ancestry, excluding collapsed notes, unrelated continuations, and sibling forks. Each note becomes a timestamped Markdown list row, with a configurable line template, date and time formats, and names for the user and reflections; branch depth is preserved with nested list indentation, including visually flattened branches. Export filenames default to the date and time of export, remain collision-safe, and can use a custom template or an optional naming prompt. Settings can be restored to their defaults without changing the journal folder.
- **Reflections**: optional AI replies via the [AI Providers](https://github.com/pfrankov/obsidian-ai-providers) plugin — reflect on one note, the visually ordered thread through an earlier note, the ancestry ending at a terminal side branch, or the whole tree from the terminal main-thread note. A flattened fork remains a branch and keeps Reflect on branch. Prompts include each note's time and parent relationship. Ripple holds no API keys and talks to no provider directly. Streaming progress survives leaving and reopening the Ripple view; reflections are saved beneath the note that launched them (marked `ai: true`) only on completion, and stopping one writes nothing. Without AI Providers everything else works and reflect stays disabled; enabling it later is detected without reloading Ripple, and the provider setting has a manual refresh.
- **Navigation**: opening Ripple swaps the left sidebar to its own navigation — Timeline, months, highlights, tags — and gives the feed the whole pane; closing it restores your layout.

## Development

```
npm install
npm run fixtures   # creates dev-vault/ and seeds it with sample posts
npm run dev        # watch build; every rebuild lands in dev-vault automatically
```

Open `dev-vault/` as a vault in Obsidian and choose "Trust author and enable plugins" — Ripple is live; reload Obsidian after changes. `npm run build` typechecks and bundles for production, and `npm run lint` must stay clean.

To try reflections while developing, install the AI Providers plugin in the dev vault and configure any provider (a local Ollama works well). The dev vault is gitignored and disposable; never point the build at a real vault.
