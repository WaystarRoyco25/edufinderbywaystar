<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:announcements-protocol -->
# Announcements are user-curated, not automatic

This repository ships a public Announcements feed at `public/announcements.html` that reads `public/announcements.json`. The feed is curated by the user. Do **not** add entries automatically when you make changes.

Only update `public/announcements.json` when the user explicitly asks for a new entry (for example: "add this to announcements", "post this to the announcements page"). When the user does ask, follow the formula displayed at the bottom of `public/announcements.html` (the collapsible "How a new post is written" card). The formula is the source of truth for entry shape, language, and forbidden punctuation. In particular:

- `author` is always the literal string `"Waystar Education"`.
- `title` and `body` are written in English.
- The em dash (`U+2014`) and the en dash (`U+2013`) used as a sentence break are forbidden in `title` and `body`. Use commas, periods, parentheses, or semicolons instead.

If the user describes a change but does not ask you to post about it, do not write to `announcements.json`.
<!-- END:announcements-protocol -->
