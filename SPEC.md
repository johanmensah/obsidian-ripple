# SPEC.md — Ripple v1 + v2 (first build session)

## What this is

A reflective micro-journal inside an Obsidian vault, in the spirit of Pile (UdaraJay/pile): one linked folder holds the journal; a main-pane feed shows posts newest-first; a composer writes new posts; replies thread under their parent; AI reflections arrive as threaded replies via the **AI Providers** plugin. Local-first; plain Markdown files in the journal folder remain the only source of truth.

**v1 = feed + composer (no AI). v2 = threads + highlights + AI reflections.** Both in one session if possible; v1 is a valid stopping point.

This repo copies the Inspire harness wholesale: esbuild config, dev-vault workflow, React-in-ItemView pattern, store acquire/release lifecycle, settings shape. Where this spec is silent, do what Inspire does.

## Non-goals for this session

No chat-across-the-journal, no search view, no insights/summaries, no embeddings, no import from the original Pile app, no attachments UI beyond what Obsidian gives us for free (paste/drag into the composer is fine if it costs nothing; a picker is not), no multiple journals (one linked folder), no canvas, no mobile-specific work (must not crash on mobile; feature parity not required). These are ROADMAP items — do not build ahead of the milestone.

## The linked folder

- One setting, `journalFolder`, default `Ripple/` — a neutral, vault-agnostic default; never hardcode a personal vault layout. Chosen via the existing FolderPicker modal pattern (users point it anywhere, e.g. `05 Journal/06 MicroJournal/`); created on first post if absent.
- The store scans `journalFolder` only, and vault event handlers ignore paths outside it. Normal journal writes stay inside this folder; an explicit thread export is the sole exception and creates a standalone note in Obsidian's configured new-note location.
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
- Exported thread notes carry `ripple_export: true` in frontmatter and are excluded from the feed if their destination lies inside the journal folder.

## Views

### Feed view (the core surface)

- Custom `ItemView`, registered type `ripple-feed`, opened in the **main workspace** as a tab titled "Ripple".
- Ribbon icon (`notebook-pen`, tooltip "Ripple") **toggles** exactly as Inspire's does — same choreography, same code shape (`main.ts` in Inspire is the reference): opening reveals the nav view in the left sidebar via `ensureSideLeaf`, replacing the file navigator as the visible tab and expanding a collapsed sidebar, and collapses the right sidebar after capturing its prior state; closing the last feed tab (or pressing the ribbon again) detaches the nav leaf and restores the right sidebar. Restore runs from the plugin's `layout-change` handler, never `View.onClose`, for the same unload-safety reason documented in Inspire. The command `Ripple: open journal` keeps plain open/reveal semantics.
- The view owns its entire pane: own background, typography, layout. Obsidian is the window frame only. Reading column max-width ~44rem, centred — this is a writing surface, not a gallery.
- **Composer** pinned at the top: an auto-growing `<textarea>` writing Markdown, placeholder "What's on your mind?", `Enter` posts, `Shift-Enter` starts a new line, and `Esc` clears focus. Posting creates the file per the naming scheme above and prepends it to the feed. On mobile, the main composer rests at one line, keeps text clear of the field edge, grows until long drafts scroll, and relies on the keyboard's Enter action rather than showing a Post button. Reply and edit composers retain their Cancel and submit controls. No preview pane; the posted card is the preview. (A CM6 composer using Obsidian's bundled `@codemirror/*` externals is a ROADMAP upgrade — propose before building.)
- **Feed** below: posts newest-first, grouped under transparent sticky day labels ("Today", "Yesterday", else "3 July 2026"). Each post card: rendered body, relative timestamp, tag chips (hash-coloured as in Inspire). Sort key `created`, else ctime.
- Post actions (native `Menu`): every persisted note offers **reply**, **reflect on this note**, **edit**, **name**, **open as note**, and **delete**. Non-terminal replies additionally offer **reflect on thread until this point**. Every terminal side-branch note offers **reflect on branch** and **export branch as note**, while the terminal main-thread note offers **reflect on whole thread** and **export thread as note**; both reflection scopes remain alongside standard note reflection. The chronologically newest note offers **highlight**; the visually last main-thread note also offers a confirmed **delete thread** action that moves every note in the thread to the trash. Replies offer **promote to parent note**. Fork origins offer separate **collapse branch**, which retains the established continuation, and **collapse notes below**, which hides every descendant; other descendant-bearing notes offer their context-appropriate collapse action. Fork origins also offer **flatten branch** choices. Every non-editing note has compact inline Reply and Reflect controls, revealed only by that row's hover or keyboard focus. Mobile keeps Reply inline on every note and keeps note plus thread or branch reflection controls inline only on terminal notes; reflection remains in every note's menu. Every reflection remains a child of the note holding its action. Editing swaps the rendered body for the composer textarea without the file's structural boundary line breaks; `Enter` saves, `Shift-Enter` starts a new line, and saving stamps `updated`.
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

- **Reply** on any persisted note opens a composer directly below that note; the reply file gets `reply_to` linking that exact parent. Every reflection uses its action note as the pending and persisted placement anchor.
- The feed shows only top-level posts. A parent's chronologically oldest child is its established continuation and stays on the same vertical lane. Each later sibling starts a parallel lane one step to the right; its first-child chain remains on that lane rather than becoming an indentation staircase. Ancestor lanes continue vertically beside the complete side branch, with no horizontal connector. Siblings remain newest-first, each branch stays contiguous, and the lane step contracts on mobile when nesting is deep. Replies render as slimmer cards; AI replies are visually distinct (left accent border, provider name in the byline, no avatar art).
- A composer or pending reflection is the target's newest child, so it appears immediately below the target and stays there when persisted. It continues the target's lane when it is the first child, or starts a side lane when an established continuation already exists.
- A fork offers two levels of collapse. Clicking the origin circle on the existing lane, or choosing **Collapse branch**, hides every side-branch root from that note and their complete subtrees while retaining the established continuation. Choosing **Collapse notes below** at the same origin hides the established continuation and every side branch. Clicking the first circle inside a side branch keeps that first note visible and hides its descendants. Any otherwise inactive circle with descendants hides that complete descendant subtree. A stronger outer ring matching the circle colour, including the reflection accent, marks every collapsed state without text or chevrons. Replying, reflecting, or editing within hidden content expands the relevant branch automatically. Collapse state is view-only and never changes Markdown or `reply_to` links.
- **Flatten branch** is a view-only fork-origin menu action. It hides the established continuation below that origin and shifts the chosen side branch one lane left so it reads like the main line; other sibling forks remain side lanes. **Restore main branch** reverses it. The chosen notes remain a side branch in storage and semantics, including branch-only reflection.
- **Promote to parent note** removes only that reply's `reply_to`. It becomes a new top-level thread and any descendants remain linked beneath it.
- Every persisted note exposes the common thread and note actions from its menu and its own row-scoped inline Reply and Reflect controls. The terminal main-thread note owns inline whole-thread reflection and whole-thread export, every terminal side-branch note owns inline branch reflection and branch export, and the chronologically newest note owns highlight. A pending reflection or unsaved reply composer does not replace any persisted note's controls.

## Thread export

- **Export thread as note**, offered by the visually terminal main-thread note, reads every currently revealed persisted file in the tree before writing anything, then creates one standalone Markdown note in Obsidian's configured new-note location and opens it in a new tab. Notes hidden by any collapsed branch or subtree are omitted.
- **Export branch as note**, offered by every terminal side-branch note even when that branch is flattened, exports the currently revealed direct ancestry from the journal root to that terminal. It excludes collapsed notes, the established main continuation, sibling forks, and their descendants.
- The export preserves the root note's frontmatter, adds `ripple_export: true`, and combines every included persisted note in the branch-aware conversation order shown in the feed. Each note becomes one Markdown list row; body whitespace and line breaks are collapsed to spaces. The configurable line template supports `{{date}}`, `{{time}}`, `{{speaker}}`, and `{{text}}`, defaulting to `- **{{date}} · {{time}}** — **{{speaker}}:** {{text}}`. Human notes use the configurable user name and AI notes use the configurable reflection name, defaulting to `User` and `Reflection`.
- Note dates and times use separate configurable Moment formats, defaulting to `D MMM YYYY` and `HH:mm`. Main-lane rows are unindented. Each semantic branch lane adds one tab before the list marker, so a branch of a branch adds a second tab. This structural depth is retained when a branch is visually flattened.
- Export filenames use a configurable template with `{{datetime}}`, `{{root}}`, and `{{type}}` tokens. The default `{{datetime}}` uses the export time in `YYYY-MM-DD HHmmss` format. An optional setting prompts with the generated filename before each thread or branch export. Names gain a numeric suffix rather than overwriting an existing note. If the configured new-note location is inside the journal folder, the vault root is used instead.

## Highlights (v2)

- Fixed palette of six colours (names, not hexes, in frontmatter: `sky`, `amber`, `rose`, `lime`, `violet`, `slate`), mapped to CSS variables that respect light/dark themes.
- Set/clear from the post action menu; shown as a thin left border on the card; nav view filters by colour.

## AI reflections (v2)

- **Dependency**: the AI Providers plugin (`pfrankov/obsidian-ai-providers`) via `@obsidian-ai-providers/sdk`. This is the sanctioned exception to the zero-dependency posture: Ripple does no provider management, no API keys, no model lists — AI Providers owns all of it. The SDK is a compile-time dependency; at runtime we `waitForAI()` and degrade.
- If AI Providers is not installed or no provider is configured: the **reflect** action and AI settings render disabled with the hint "Install and configure the AI Providers plugin to enable reflections." Nothing else changes; the journal is fully usable without AI. Enabling AI Providers after Ripple has loaded refreshes the provider setting and reflection controls without a reload. No bundled fallback client.
- **Reflect** sends only the selected note. **Reflect on thread until this point** sends the root and every persisted note or reflection appearing before or at the selected row in the feed's branch-aware visual order. **Reflect on branch** sends the direct ancestry from the journal root through the selected terminal branch note, excluding unrelated continuations and sibling forks. **Reflect on whole thread** includes every branch regardless of where the newest note appears. Prompts number each entry with its time and parent relationship so chronology and branches remain explicit. Every pending card and saved reflection anchors to the action note. The in-progress run belongs to the plugin rather than one mounted view, so its streamed text and Stop control return when Ripple is reopened. On completion, the reply file gets `ai: true` and `reply_to` linking its placement anchor. On abort or error, nothing is written — no file until there is a final text.
- The pending card has a visible stop affordance wired to the `AbortController`.
- Settings: provider (picked from `aiProviders.providers`, stored by id; if the stored id disappears, fall back to disabled state with a notice), a refresh control that reacquires the current provider list, and the reflection system prompt (multiline). AI Providers remains responsible for discovering Ollama models.
- Never send content outside `journalFolder`; the prompt contains only the explicitly selected note or thread scope and the system prompt.

## Settings

- Journal folder (FolderPicker; default `Ripple/`).
- Export filename template and Moment format, optional naming prompt, user and reflection speaker names, transcript line template, and note date and time formats (as above).
- AI provider + reflection prompt (v2, as above).
- Restore defaults resets every Ripple setting except the journal folder.
- UI state (active filter, collapsed nav sections) persists via the same debounced `ui` block pattern as Inspire's settings, not as separate settings fields.

## Keyboard

- `n` or `c` focuses the composer; `Enter` posts/saves, `Shift-Enter` starts a new line, and `Esc` blurs or cancels an in-place edit.
- `j`/`k` or arrows move thread selection; `Enter` edits the newest persisted note; `r` replies (v2); `h` cycles that note's highlight (v2); `t` names that note (rename via `fileManager`, thread links preserved); `o` opens it as a note.

## Acceptance criteria

v1:
1. Ribbon toggles the full choreography: feed in main pane, nav replaces file navigator, right sidebar collapses; closing restores both sidebars.
2. Posting from the composer creates `{journalFolder}/YYYY/MM/YYYYMMDD-HHmmss.md` with `created` frontmatter; surrounding body whitespace is normalised while interior Markdown is preserved, and the post appears at the top of the feed under "Today". The sticky day label follows the feed without masking or blocking the full reading column.
3. Opening an LF, CRLF, or frontmatter-free note for editing shows no artificial blank row before or after the body. Saving stamps `updated`, preserves interior Markdown and unknown frontmatter fields, and introduces no boundary blank lines. Deleting trashes the file after confirmation.
4. A markdown file dropped into the journal folder externally appears in the feed within a second, dated correctly; files elsewhere in the vault never appear.
5. Month and tag rows in the nav filter the feed; counts are live.
6. Plugin loads on mobile without crashing; the feed is usable, the main composer rests at a compact one-line height with unclipped text, Enter posts without a visible Post button, and long drafts remain scrollable.

v2:
7. Replying to a root, middle note with descendants, or leaf links that exact note. A first child continues its parent's lane; a later sibling and its first-child chain occupy one parallel indented lane. Siblings stay newest-first, each branch remains contiguous, no horizontal connector is drawn, and renaming a parent preserves the branch. Circle controls collapse the context-appropriate descendant set without changing any note. Flattening a fork hides its main continuation and moves the chosen side branch onto that lane until restored, without changing `reply_to`.
8. With AI Providers configured, Reflect sends the selected body and no other thread body. Thread reflection on an earlier note includes that row and every visually preceding thread row and excludes rows below it. Branch reflection on a terminal side-branch note includes only its direct root-to-terminal ancestry. Whole-thread reflection on the terminal main-thread note includes every row even when the chronologically newest note appears earlier. A flattened terminal remains branch-scoped. Every scope persists under its action note, prompt entries retain numbered times and parent relationships, leaving and reopening Ripple restores the same streamed pending card and Stop control, and aborting writes nothing.
9. Without AI Providers, reflect is disabled with the hint and everything else works; enabling it later refreshes Ripple's provider setting and reflection controls without a reload, while the manual refresh control reacquires changed provider entries.
10. Every persisted note exposes reply, note-only reflect, edit, name, open, and delete actions. Non-terminal replies offer thread-to-here reflection, the main terminal offers whole-thread reflection and whole-thread export, and every side-branch terminal offers branch reflection and branch export even while flattened. Clicking a fork origin hides or restores its complete side branch while preserving the established continuation; its menu can instead hide or restore every note below it. Clicking the first note within a side branch hides or restores only its descendants; every other descendant-bearing circle folds its complete subtree. The controlling circle gains a colour-matched outer ring with no visible disclosure label. The main terminal can delete the whole thread only after a confirmation naming the note count; every file is moved to the trash. On desktop, controls belong only to the hovered or keyboard-focused row. Mobile keeps touch-sized Reply inline everywhere, shows inline note and scoped reflection only on terminal notes, and retains all reflection actions in each dot menu. A child can be promoted to a top-level parent without losing its descendants, while highlight remains on the chronologically newest note regardless of branch position.
11. Whole-thread export creates one collision-safe standalone note containing the currently revealed persisted tree in the feed's branch-aware conversation order, omitting notes hidden by collapsed branches or subtrees. Branch export contains only the currently revealed direct root-to-terminal ancestry and excludes collapsed notes, unrelated continuations, and forks. The default filename is the export date and time; its template and Moment format are configurable, and enabling the naming prompt allows the generated name to be changed before export. Neither exported note appears as another journal post.
12. Every exported note occupies one timestamped Markdown list row. Human and AI notes use their configured speaker names; the line template and note date and time formats control the row; body line breaks collapse to spaces; and each semantic branch level adds one tab even when the branch is visually flattened.
13. Restore defaults returns every setting except the journal folder to its declared default, leaving the current journal source unchanged.

## Pre-release checklist additions

- Manifest name "Ripple", id `ripple`. Community guidelines forbid "Obsidian" in the plugin name and id — the repo may be called Obsidian Ripple, the manifest may not. Check the community registry for collisions before submission.
- Credit UdaraJay/pile prominently in README as the design source.
