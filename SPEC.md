# SPEC.md — Ripple v1 + v2 (first build session)

## What this is

A reflective micro-journal inside an Obsidian vault, in the spirit of Pile (UdaraJay/pile): one linked folder holds the journal; a main-pane feed shows posts newest-first; a composer writes new posts; replies thread under their parent; AI reflections arrive as threaded replies via the **AI Providers** plugin. Local-first; plain Markdown files in the journal folder remain the only source of truth.

**v1 = feed + composer (no AI). v2 = threads + highlights + AI reflections.** Both in one session if possible; v1 is a valid stopping point.

This repo copies the Inspire harness wholesale: esbuild config, dev-vault workflow, React-in-ItemView pattern, store acquire/release lifecycle, settings shape. Where this spec is silent, do what Inspire does.

## Non-goals for this session

No chat-across-the-journal, no search view, no insights/summaries, no embeddings, no import from the original Pile app, no attachments UI beyond what Obsidian gives us for free (paste/drag into the composer is fine if it costs nothing; a picker is not), no multiple journals (one linked folder), no canvas, no mobile-specific work (must not crash on mobile; feature parity not required). These are ROADMAP items — do not build ahead of the milestone.

## The linked folder

- One setting, `journalFolder`, default `Ripple/` — a neutral, vault-agnostic default; never hardcode a personal vault layout. Chosen via the existing FolderPicker modal pattern (users point it anywhere, e.g. `05 Journal/06 MicroJournal/`); created on first post if absent.
- Everything the plugin reads and writes lives under this folder. The rest of the vault is invisible to Ripple: the store scans `journalFolder` only, and vault event handlers ignore paths outside it.
- Post files: `{journalFolder}/YYYY/MM/YYYYMMDD-HHmmss.md` (e.g. `Ripple/2026/07/20260705-193212.md`). Posts are titleless by design; the first line of the body is the de-facto title wherever one is needed (feed is body-first, like Pile).
- Files arriving in the folder by any other route (Finder, sync, scripts) appear in the feed — the folder is the API. A markdown file without our frontmatter renders as a plain post dated by file ctime.

## Frontmatter schema

```yaml
---
created: 2026-07-05T19:32:12+01:00   # ISO 8601 with local offset; sort key
updated: 2026-07-05T19:40:03+01:00   # only when edited after creation
highlight: sky                        # optional; one of a fixed palette (v2)
reply_to: "[[20260705-193212]]"      # replies only; wikilink to parent post (v2)
ai: true                              # AI-generated replies only (v2)
tags: []
---
```

- Threads are wired with `reply_to` wikilinks, not path arrays as in the original Pile: `fileManager.renameFile` keeps links valid, and `metadataCache.resolvedLinks` resolves the thread without our own index.
- Body is genuine Markdown rendered via `MarkdownRenderer` — a deliberate divergence from Pile, which stores TipTap HTML. Posts must be first-class notes: linkable, searchable, readable without the plugin.
- Frontmatter writes go through `fileManager.processFrontMatter`; preserve unknown fields.

## Views

### Feed view (the core surface)

- Custom `ItemView`, registered type `ripple-feed`, opened in the **main workspace** as a tab titled "Ripple".
- Ribbon icon (`notebook-pen`, tooltip "Ripple") **toggles** exactly as Inspire's does — same choreography, same code shape (`main.ts` in Inspire is the reference): opening reveals the nav view in the left sidebar via `ensureSideLeaf`, replacing the file navigator as the visible tab and expanding a collapsed sidebar, and collapses the right sidebar after capturing its prior state; closing the last feed tab (or pressing the ribbon again) detaches the nav leaf and restores the right sidebar. Restore runs from the plugin's `layout-change` handler, never `View.onClose`, for the same unload-safety reason documented in Inspire. The command `Ripple: open journal` keeps plain open/reveal semantics.
- The view owns its entire pane: own background, typography, layout. Obsidian is the window frame only. Reading column max-width ~44rem, centred — this is a writing surface, not a gallery.
- **Composer** pinned at the top: an auto-growing `<textarea>` writing Markdown, placeholder "What's on your mind?", `Cmd/Ctrl-Enter` posts, `Esc` clears focus. Posting creates the file per the naming scheme above and prepends it to the feed. No preview pane; the posted card is the preview. (A CM6 composer using Obsidian's bundled `@codemirror/*` externals is a ROADMAP upgrade — propose before building.)
- **Feed** below: posts newest-first, grouped under sticky day headers ("Today", "Yesterday", else "3 July 2026"). Each post card: rendered body, relative timestamp, tag chips (hash-coloured as in Inspire). Sort key `created`, else ctime.
- Post actions (hover/focus menu, native `Menu`): **edit** (swap rendered body for the composer textarea in place, `Cmd/Ctrl-Enter` saves and stamps `updated`), **delete** (confirm via the existing ConfirmModal; `app.fileManager.trashFile`), **open as note** (`o` or Cmd/Ctrl-click opens the file in a normal Obsidian tab), and in v2 **reply**, **highlight**, **reflect**.
- Virtualise the feed if a large journal stutters; propose the library first per dependency policy.
- Live updates: register vault `create`/`modify`/`delete`/`rename` scoped to `journalFolder`, so external edits appear without refresh. One store shared by nav and feed views, acquire/release-refcounted exactly as Inspire's LibraryStore.

### Nav view (left sidebar)

- View type `ripple-nav`, styled to match Obsidian's native navigation, same pattern as Inspire's Sidebar:
  - **Timeline** (all posts, count) — default selection.
  - **Months**: collapsible year → month rows with counts; clicking filters the feed to that month and scrolls to top.
  - **Highlights** (v2): one row per palette colour with count; click toggles a filter.
  - **Tags**: as in Inspire — counts, click toggles, no `#` prefix.
- Rows drive filters on the shared store; clicking a row with no feed open opens one.

## Threads (v2)

- **Reply** on a post opens an indented composer beneath it; the reply file gets `reply_to` linking the parent.
- The feed shows only top-level posts; a post with replies shows a thread line and its replies nested beneath, oldest-first (a conversation reads downward). Replies render as slimmer cards; AI replies are visually distinct (left accent border, provider name in the byline, no avatar art).
- One level of nesting only, as in Pile: a reply to a reply attaches to the thread root.

## Highlights (v2)

- Fixed palette of six colours (names, not hexes, in frontmatter: `sky`, `amber`, `rose`, `lime`, `violet`, `slate`), mapped to CSS variables that respect light/dark themes.
- Set/clear from the post action menu; shown as a thin left border on the card; nav view filters by colour.

## AI reflections (v2)

- **Dependency**: the AI Providers plugin (`pfrankov/obsidian-ai-providers`) via `@obsidian-ai-providers/sdk`. This is the sanctioned exception to the zero-dependency posture: Ripple does no provider management, no API keys, no model lists — AI Providers owns all of it. The SDK is a compile-time dependency; at runtime we `waitForAI()` and degrade.
- If AI Providers is not installed or no provider is configured: the **reflect** action and AI settings render disabled with the hint "Install and configure the AI Providers plugin to enable reflections." Nothing else changes; the journal is fully usable without AI. No bundled fallback client.
- **Reflect** on a post: builds a prompt from the reflection system prompt (setting, with a sensible default in Pile's voice: a thoughtful, terse interlocutor, not a cheerleader), the post body, and its existing thread; calls `aiProviders.execute({ provider, prompt, onProgress, abortController })`; streams into a pending reply card. On completion, writes the reply file with `ai: true` and `reply_to`. On abort or error, nothing is written — no file until there is a final text.
- The pending card has a visible stop affordance wired to the `AbortController`.
- Settings: provider (picked from `aiProviders.providers`, stored by id; if the stored id disappears, fall back to disabled state with a notice), reflection system prompt (multiline).
- Never send content outside `journalFolder`; the prompt contains only the post, its thread, and the system prompt.

## Settings

- Journal folder (FolderPicker; default `Ripple/`).
- AI provider + reflection prompt (v2, as above).
- UI state (active filter, collapsed nav sections) persists via the same debounced `ui` block pattern as Inspire's settings, not as separate settings fields.

## Keyboard

- `n` or `c` focuses the composer; `Cmd/Ctrl-Enter` posts/saves; `Esc` blurs or cancels an in-place edit.
- `j`/`k` or arrows move post selection; `Enter` edits; `r` replies (v2); `h` cycles highlight (v2); `t` names the note (rename via `fileManager`, thread links preserved); `o` opens as note.

## Acceptance criteria

v1:
1. Ribbon toggles the full choreography: feed in main pane, nav replaces file navigator, right sidebar collapses; closing restores both sidebars.
2. Posting from the composer creates `{journalFolder}/YYYY/MM/YYYYMMDD-HHmmss.md` with `created` frontmatter and the body verbatim; the post appears at the top of the feed under "Today".
3. Editing in place stamps `updated` and changes nothing else in the file; deleting trashes the file after confirmation.
4. A markdown file dropped into the journal folder externally appears in the feed within a second, dated correctly; files elsewhere in the vault never appear.
5. Month and tag rows in the nav filter the feed; counts are live.
6. Plugin loads on mobile without crashing; feed and composer are usable.

v2:
7. Replies nest under their parent; renaming a post file does not orphan its thread.
8. With AI Providers configured, reflect streams a reply and persists it with `ai: true` on completion; aborting writes nothing.
9. Without AI Providers, reflect is disabled with the hint and everything else works.

## Pre-release checklist additions

- Manifest name "Ripple", id `ripple`. Community guidelines forbid "Obsidian" in the plugin name and id — the repo may be called Obsidian Ripple, the manifest may not. Check the community registry for collisions before submission.
- Credit UdaraJay/pile prominently in README as the design source.
