#!/bin/sh
# Seeds dev-vault/ with sample journal posts and symlinks the plugin in.
# Pure sh; idempotent; safe to re-run.
set -eu
cd "$(dirname "$0")/.."
ROOT="$PWD"
VAULT="$ROOT/dev-vault"
JOURNAL="$VAULT/Ripple"

PLUGIN="$VAULT/.obsidian/plugins/ripple"

mkdir -p "$VAULT/.obsidian/plugins" \
	"$JOURNAL/2026/04" "$JOURNAL/2026/05" "$JOURNAL/2026/06" "$JOURNAL/2026/07"

# Copies, never a symlink: the repo contains the dev vault, so linking the
# repo in recurses forever. The build's copy-to-vault step keeps these fresh.
[ -L "$PLUGIN" ] && rm "$PLUGIN"
mkdir -p "$PLUGIN"
for f in main.js manifest.json styles.css; do
	[ -f "$ROOT/$f" ] && cp "$ROOT/$f" "$PLUGIN/$f"
done
[ -f "$PLUGIN/data.json" ] || cat > "$PLUGIN/data.json" <<'EOF'
{
	"journalFolder": "Ripple",
	"aiProviderId": "ollama-local"
}
EOF
[ -f "$VAULT/.obsidian/community-plugins.json" ] || printf '["ripple"]' > "$VAULT/.obsidian/community-plugins.json"
[ -f "$VAULT/.obsidian/app.json" ] || printf '{}' > "$VAULT/.obsidian/app.json"

# --- July 2026 ---

cat > "$JOURNAL/2026/07/20260705-081500.md" <<'EOF'
---
created: 2026-07-05T08:15:00+01:00
tags: [mood]
---
Woke up before the alarm for once. There is a particular quiet before anyone else is up that I keep forgetting exists.
EOF

cat > "$JOURNAL/2026/07/20260704-221012.md" <<'EOF'
---
created: 2026-07-04T22:10:12+01:00
tags: [reading, work]
---
## Notes on deep work

Three things kept coming up today:

- long blocks beat clever scheduling
- the phone in another room actually works
- see [[20260612-091500]] for the argument that started this

Worth trying a full week of it.
EOF

cat > "$JOURNAL/2026/07/20260703-093000.md" <<'EOF'
A bare note with no frontmatter at all, dropped in by some other tool. It should still appear in the feed, dated by file time.
EOF

cat > "$JOURNAL/2026/07/20260702-190001.md" <<'EOF'
---
created: 2026-07-02T19:00:01+01:00
highlight: amber
tags: [work]
---
Shipped the thing. Not perfectly, but shipped. Marking this one so I can find it when the impostor feelings come back.
EOF

# --- June 2026: a thread (root + human reply + AI reply) ---

cat > "$JOURNAL/2026/06/20260612-091500.md" <<'EOF'
---
created: 2026-06-12T09:15:00+01:00
tags: [reading]
---
Started Deep Work on the train. The claim that focus is a skill you train, not a mood you wait for, is either obvious or profound and I cannot tell which.
EOF

cat > "$JOURNAL/2026/06/20260612-102030.md" <<'EOF'
---
created: 2026-06-12T10:20:30+01:00
reply_to: "[[20260612-091500]]"
---
Coming back to this an hour later: it is profound precisely because everyone treats it as obvious and nobody acts on it.
EOF

cat > "$JOURNAL/2026/06/20260612-110000.md" <<'EOF'
---
created: 2026-06-12T11:00:00+01:00
reply_to: "[[20260612-091500]]"
ai: true
---
You seem drawn to the idea that discipline could replace waiting for the right mood. What would this week look like if you assumed the skill framing was true?
EOF

cat > "$JOURNAL/2026/06/20260620-083000.md" <<'EOF'
---
created: 2026-06-20T08:30:00+01:00
---
Rain all morning. Wrote nothing, thought plenty. That still counts.
EOF

# --- May 2026 ---

cat > "$JOURNAL/2026/05/20260515-140000.md" <<'EOF'
---
created: 2026-05-15T14:00:00+01:00
highlight: rose
tags: [mood]
---
Argument with J about nothing, which means it was about something else. Flagging to revisit when calmer.
EOF

cat > "$JOURNAL/2026/05/20260501-070707.md" <<'EOF'
---
created: 2026-05-01T07:07:07+01:00
tags: [work, reading]
---
May resolution: one page of notes per paper instead of highlighting everything and remembering nothing.
EOF

# --- April 2026 ---

cat > "$JOURNAL/2026/04/20260412-213500.md" <<'EOF'
---
created: 2026-04-12T21:35:00+01:00
tags: [mood]
---
Long walk after dinner. The evenings are stretching out again.
EOF

cat > "$JOURNAL/2026/04/20260401-120000.md" <<'EOF'
---
created: 2026-04-01T12:00:00+01:00
---
Starting a journal again, attempt number who knows. Keeping entries small this time; that is the whole point.
EOF

echo "Seeded $(find "$JOURNAL" -name '*.md' | wc -l | tr -d ' ') posts into $JOURNAL and copied the plugin into .obsidian/plugins/ripple"
