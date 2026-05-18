<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:announcements-protocol -->
# Announcements protocol (read this before posting to the feed)

This repository ships a public Announcements feed at `public/announcements.html` that reads `public/announcements.json`. The feed is curated by the user. **This section is the only place where the entry format lives.** It is intentionally not exposed on the public site, because that spec is proprietary. Any AI agent that adds an entry must work from the rules below.

## Trigger

Only update `public/announcements.json` when the user explicitly asks for a new entry. Example asks: "add this to announcements", "post this to the announcements page", "announce this", "make an announcement about X". If the user describes a change but does not ask you to post about it, do **not** touch `announcements.json`. Do not add an entry automatically when you make a change.

## Entry shape

Prepend a new object (latest first) to the `entries` array in `public/announcements.json` using this exact shape:

```json
{
  "id": "YYYY-MM-DD-short-kebab-slug",
  "author": "Waystar Learning",
  "date": "YYYY-MM-DD",
  "title": "<one short English sentence>",
  "body": "<paragraph one>\n\n<paragraph two>"
}
```

## Field rules

1. `author` is always the literal string `"Waystar Learning"`. Never change it. Never attribute to an AI, never attribute to a person.
2. `date` is today's calendar date in ISO `YYYY-MM-DD`. The page renders it as `May 11, 2026`.
3. `id` is `<date>-<short kebab slug describing the change>`, lowercase ASCII only (a to z, 0 to 9, hyphens).
4. `title` is one short English sentence summarizing the change, and it must end with a period.
5. `body` is exactly two short English paragraphs, separated by a single blank line in the JSON string (`\n\n` between them). Each paragraph is one to three sentences. The first paragraph says what changed in user-visible terms. The second paragraph explains how a regular site visitor benefits, or adds the most concrete supporting detail. No bullet lists, no links, no code, no marketing fluff.
6. Do not include a `commit` field. Earlier entries may still have one; do not add it to new entries.

## Forbidden punctuation in `title` and `body`

Do not use the em dash character (`U+2014`). Do not use the en dash character (`U+2013`) as a sentence break. Use commas, periods, parentheses, or semicolons instead. Before saving the file, scan the new `title` and `body` once more for the literal characters at `U+2014` and `U+2013` and rewrite any sentence that contains either one. Treat their presence as a failed write.

## Deterministic procedure

When the trigger condition is met:

1. Make the requested code change first, so you know what actually shipped.
2. Open `public/announcements.json`.
3. Construct the new entry per the schema above. Write the two paragraphs of `body` and join them with `\n\n` inside the JSON string.
4. Scan `title` and `body` for `U+2014` and `U+2013`. If either appears, rewrite the offending sentence and rescan. Repeat until clean.
5. Prepend the new entry to `entries` (top of the array; the page sorts by date descending and ties break by array order).
6. Save the file.
7. Continue with the rest of the response (summary, commit, push, etc.) only after step 6.

## Reference AI prompt (use this if invoking a sub-agent)

If you delegate the writing to another chatbot or sub-agent, hand it this prompt verbatim:

> You are writing one announcement entry for the EduFinder by Waystar website. Produce exactly one JSON object in the shape below, with no surrounding prose, ready to be appended to the "entries" array of public/announcements.json (the feed sorts latest first).
>
> Shape:
> `{ "id": "YYYY-MM-DD-short-kebab-slug", "author": "Waystar Learning", "date": "YYYY-MM-DD", "title": "<one short English sentence>", "body": "<paragraph one>\n\n<paragraph two>" }`
>
> Hard rules:
> 1. `author` is the literal string `"Waystar Learning"`. Never change it.
> 2. `date` is today in ISO YYYY-MM-DD format.
> 3. `id` is `<date>-<short kebab slug>` using a to z, 0 to 9, and hyphens only.
> 4. Write `title` and `body` in English. `title` is one sentence and must end with a period.
> 5. `body` is exactly two paragraphs separated by `\n\n` inside the JSON string. Each paragraph is one to three sentences. Paragraph one says what changed in user-visible terms; paragraph two says how a regular site visitor benefits.
> 6. Forbidden characters in `title` and `body`: the em dash (the character at codepoint U+2014) and the en dash (U+2013) used as a sentence break. Use commas, periods, parentheses, or semicolons instead.
> 7. Before you finish, scan your `title` and `body` for U+2014 and U+2013 and rewrite any sentence that contains either character. Treat their presence as a failed answer.
> 8. Output the JSON object only. No prose around it, no markdown code fence, no commentary.
>
> The change to announce:
> `<<< paste a short description of what changed here >>>`
<!-- END:announcements-protocol -->
