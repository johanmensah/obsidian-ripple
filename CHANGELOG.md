# Changelog

## 0.2.0

- Add terminal actions that export either the revealed thread tree or one direct root-to-terminal branch to a standalone Markdown note in Obsidian's configured new-note location.
- Omit notes hidden by collapsed branches or subtrees from thread and branch exports.
- Replace headed Markdown exports with configurable timestamped transcript rows and user and reflection speakers, preserving nested branch depth as a Markdown list.
- Default export filenames to their export timestamp, with configurable filename templates, an optional naming prompt, collision-safe suffixes, and a restore-defaults action that preserves the journal folder.
- Add reply, reflect, edit, and name actions to every persisted note, with row-scoped hover and focus controls, highlight on the newest note, and export on the appropriate main or branch terminal.
- Place each new reply or scoped reflection directly below its selected note, with an action to promote a reply to a top-level note without detaching its descendants.
- Indent reply branches by their `reply_to` depth and remove generated boundary blank lines from the edit field.
- Make Enter submit composers, Shift-Enter insert a new line, and keep the mobile main composer compact with unclipped text and no Post button.
- Keep Reply inline on every mobile note while limiting inline reflection controls to terminal notes.
- Fix AI Providers detection so reflection controls and settings recover when it becomes available after Ripple starts, with a manual provider refresh control.
- Add note-only, visual thread-to-here, terminal-branch, and whole-thread reflection scopes.
- Keep reflection progress across view changes, place whole-thread actions and results at the visual bottom, include note times in thread prompts, and remove the sticky day-label backing.
- Add a confirmed Delete thread action to the visually last note of each multi-note thread.
- Show later replies as parallel branch lanes with consistent continuation indentation and descendant-aware circle collapsing.
- Separate fork-origin actions for collapsing side branches and collapsing every note below the origin.
- Add view-only fork flattening while preserving branch identity and terminal reflection semantics.
- Preserve post, reply, and edit drafts when a journal write fails, and retry timestamp filename collisions safely.

## 0.1.2

- Node's own module list replaces the builtin-modules dependency; the composer's action row no longer needs :has.

## 0.1.1

- Release assets carry GitHub build-provenance attestations; releases ship with notes.

## 0.1.0

- Scaffold from the Inspire harness: esbuild, strict TypeScript, React-in-ItemView, dev vault workflow.
- Journal store over one linked folder and a read-only feed with day grouping.
- Composer, in-place editing, delete, and feed keyboard navigation.
- Left-sidebar navigation (timeline, months, tags) and the ribbon toggle choreography.
- Threaded replies wired with reply_to wikilinks.
- Six-colour highlights with nav filtering.
- AI reflections as threaded replies via the AI Providers plugin, streaming with stop.
- Dev vault receives build copies instead of a recursive repo symlink.
- Full-bleed pane on desktop, active-filter bar with clear chips, and a new post command.
- Pile-inspired anatomy: ball-and-thread-line rail (highlight = ball colour, dotted line and pulse for AI), meta above the body, hover reply/reflect actions, card composer.
- Name note action (menu and `t`): opt-in human filenames per post, first-words suggestion, thread links preserved through the rename.
- Timeline scrubber: a dot per month on the feed's edge; click to glide, active month tracks the scroll.
