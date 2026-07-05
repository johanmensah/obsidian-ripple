# CLAUDE.md — Ripple

Obsidian plugin. A micro-journal over one vault folder, in the spirit of Pile
(UdaraJay/pile): a feed of posts, threaded replies, AI reflections. Local-first.

## Language and tone

- TypeScript, `strict: true`. No `any` without a comment justifying it.
- Strict British English in all documentation, comments, commit messages, and UI strings (organise, colour, licence).
- No emojis anywhere: code, comments, commits, docs, UI.

## Reference codebases

Match the conventions of these repositories. When in doubt, do what they do.

1. **Inspire** (`../Obsidian Inspire`) — the sibling plugin this harness was copied from: React mounted in an ItemView, refcounted shared store with `useSyncExternalStore`, service layer between UI and vault API, sidebar choreography in `main.ts`.
2. **Notebook Navigator** (johansan/notebook-navigator) — Inspire's own architecture reference.
3. **obsidian-sample-plugin** (obsidianmd) — scaffold, build setup, manifest conventions, release layout.

## Dependency policy

- Default posture: zero runtime dependencies beyond the `obsidian` API.
- Sanctioned exceptions, already approved: `react`, `react-dom` (view layer, carried over from Inspire) and `@obsidian-ai-providers/sdk` (all AI goes through the AI Providers plugin — Ripple never manages providers, API keys, or model lists itself).
- Before adding ANY other library: stop, present pros and cons versus building the needed subset from scratch, and wait for explicit approval. One library per proposal.
- Never add a dependency for something the Obsidian API already provides (`requestUrl`, `MarkdownRenderer`, native `Menu`).

## Sanctioned APIs only

- Published Obsidian plugin API only. No Electron internals, no `require('electron')`, no Node APIs that break mobile without a documented desktop-only guard.
- Never write to `metadataCache` or monkey-patch Obsidian internals. Reads are fine.
- All file moves and renames go through `app.fileManager.renameFile` so links are preserved.
- Register all listeners and intervals via `this.registerEvent` / `this.registerInterval` so they are cleaned up on unload.
- The plugin must load and be usable on mobile even if some features are desktop-only; guard with `Platform.isDesktop`, never crash.

## Data rules (non-negotiable)

- **Truth lives in user-visible files**: post frontmatter and Markdown bodies inside the journal folder. Any index or cache is derived, disposable, and rebuildable.
- **The journal folder is the boundary.** Ripple reads and writes nothing outside `settings.journalFolder`, and nothing from the journal ever leaves the machine except the single post/thread sent to the user's chosen AI provider on an explicit reflect action.
- **Never modify a user's file except as the direct result of an explicit user action** (post, edit, highlight, delete, reflect). No background rewrites, no silent renames.
- Frontmatter writes go through `processFrontMatter` and must preserve unknown fields and key order where practical.
- AI reply files are written only after a reflection completes; an aborted or failed stream writes nothing.

## Vault constants (defaults, exposed in settings)

- Journal folder: `Ripple/` (neutral default; users point it anywhere via the settings folder picker — never hardcode a personal vault layout).
- Post files: `{journalFolder}/YYYY/MM/YYYYMMDD-HHmmss.md`, titleless, frontmatter per SPEC.md.

## Code style

- Comments only where intent is not obvious from the code. Never narrate ("loop through the items").
- No wrapper functions with a single call site. No options parameters nothing uses. No speculative abstraction, no "for future extensibility".
- No `utils.ts` dumping ground; small modules named for what they do.
- Errors: fail loudly in dev (console.error with context), degrade gracefully in UI (a post that cannot render shows plain text, never a blank or a crash; reflect without AI Providers shows a disabled action with a hint).
- UI text sentence case, terse, British.

## Workflow

- Plan mode first for each milestone. Implement one component per approved plan step.
- Small diffs. Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`), no adjectives, no emoji.
- Development happens against a throwaway dev vault; never point the build at the real vault. `minAppVersion: 1.12.7`.
- After each milestone: a review pass — "flag anything that looks generated, over-abstracted, or non-idiomatic versus Inspire/Notebook Navigator conventions, then fix it."

## Definition of done (per milestone)

Builds clean, loads in the dev vault with no console errors, acceptance criteria in SPEC.md pass manually, README updated in one or two terse sentences, CHANGELOG line added.

## Pre-release checklist (before anything public)

- Manifest name "Ripple", id `ripple` — no "Obsidian" in either, per community guidelines. Search the registry for collisions before submission.
- Credit UdaraJay/pile prominently in README as the design source.
- Licence: MIT.
- Strip any personal vault paths from defaults and screenshots.
