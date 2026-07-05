# ROADMAP — Ripple

Deferred by design in SPEC.md; do not build ahead of a milestone the user has asked for.

- **Chat across the journal**: a conversation view over the whole pile, provider via AI Providers. The reflect plumbing (thread text, streaming, abort) is the base.
- **Search**: a search field over the journal folder only; likely plain scan first, index only if it stutters.
- **Insights/summaries**: periodic AI summaries (weekly, monthly) as ordinary posts in the folder.
- **Import from Pile**: map a Pile app folder (`YYYY/MMM/*.md`, HTML-ish bodies, `replies` path arrays) into Ripple's schema.
- **CM6 composer**: replace the textarea with Obsidian's bundled `@codemirror/*` externals for live Markdown affordances. Propose before building.
- **Feed virtualisation**: only if a large journal stutters; propose the library first per the dependency policy.
- **Attachments UI**: paste/drag images into the composer with an attachments-folder setting.
- **Multiple journals**: several linked folders with a switcher, as Pile had piles.
- **Embeddings/retrieval**: AI Providers exposes `embed` and retrieval; relevant only once chat exists.
