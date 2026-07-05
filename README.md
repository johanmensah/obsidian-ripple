# Ripple

A micro-journal inside your Obsidian vault, in the spirit of [Pile](https://github.com/UdaraJay/pile) by Udara Jay: one folder of plain Markdown posts, a feed with a composer, threaded replies, and AI reflections. Local-first; the journal folder remains the only source of truth.

AI reflections are optional and arrive via the [AI Providers](https://github.com/pfrankov/obsidian-ai-providers) plugin — Ripple holds no API keys and talks to no provider directly.

## Development

```
npm install
npm run fixtures   # seeds dev-vault/ with sample posts; symlinks the plugin
npm run dev        # watch build
```

Open `dev-vault/` as a vault in Obsidian, turn off restricted mode, and enable Ripple. Never point the build at a real vault.
