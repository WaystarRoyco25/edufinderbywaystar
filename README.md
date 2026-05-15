# EduFinder by Waystar Learning

A Next.js 16 + Supabase site combining a **static HTML marketing surface** (in `public/`) with **authenticated, AI-pipeline-backed features** (in `src/app/`). The same Next.js server hosts both: the HTML pages are served as static files via rewrites, the dynamic features run as App Router pages and API routes.

If you are new to the codebase, read this file, then `AGENTS.md` (the announcements-feed protocol that all AI agents must follow).

## Folder map

| Path | What lives here |
|---|---|
| `public/` | The user-visible site: `index.html`, `prediction.html`, `genius.html`, `challenge.html`, `reviews.html`, `who-we-are.html`, `announcements.html`, plus SVG logos/icons, the `announcements.json` feed data, and the generated `genius-tailwind.css`. |
| `src/app/` | Next.js App Router. Authenticated pages (Challenge dashboard, module, review) and the API routes that back the Challenge, Genius, and Insight Report pipelines. Components are colocated with their pages. |
| `src/lib/` | Server-only library code, grouped by domain: `supabase/` (DB clients), `genius/` (essay AI board pipeline), `report/` (admission insight pipeline), plus `blueprint.ts` (SAT question-type selection). |
| `src/proxy.ts` | Standalone request/response forwarding utility. Lives at the `src/` root rather than under `src/lib/` for historical reasons. |
| `db/` | Supabase schema and RLS policy snapshots. Applied manually via the Supabase SQL editor; not part of the build. See [`db/README.md`](db/README.md). |
| `scripts/` | Build tooling. Currently just `build-genius-tailwind.mjs`. |
| `tests/` | `node --test` suite covering `src/lib/genius/` and `src/lib/report/`. |
| `AGENTS.md` | The announcements-feed protocol, required reading for AI agents. |
| `CLAUDE.md` | Points to `AGENTS.md`. |

## The hybrid architecture

The marketing pages are plain HTML files in `public/`, served at clean URLs via Next.js rewrites in [`next.config.ts`](next.config.ts):

- `/` → `public/index.html`
- `/prediction` → `public/prediction.html`
- `/genius` → `public/genius.html`
- `/challenge` is special — it cannot use a rewrite because `src/app/challenge/` intercepts it first. Instead, [`src/app/challenge/route.ts`](src/app/challenge/route.ts) reads `public/challenge.html` and serves it directly.

`/who-we-are.html`, `/reviews.html`, `/announcements.html` are served straight from `public/` by Next.js static-file handling.

**Rule of thumb:** if the page is marketing/content and doesn't need a login, add it to `public/`. If it needs Supabase auth or hits an AI pipeline, add it under `src/app/`.

## Pipelines

There are three feature pipelines:

- **Challenge** (`src/app/challenge/`) — SAT practice modules. Authenticated flow: login → dashboard → take a 32-minute module → submit → review. Server is authoritative for the timer (`expires_at`) and grading (`module_answer_keys`).
- **Genius Editor** (`src/lib/genius/` + `src/app/genius/api/`) — AI essay-brainstorming board. Students answer 39 questions; the pipeline produces a deterministic signal profile and a Gemini-generated set of essay angles with evidence citations.
- **Insight Report** (`src/lib/report/` + `src/app/prediction/`) — Admission-chance reports. Async job queue (`start` → `worker` → `status`) that drafts and verifies per-school chance bands via Gemini/xAI.

Both AI pipelines share the same shape: `intake.ts` → `pipeline.ts` → `provider-client.ts`, with `types.ts`, `schema.ts`, `access.ts`, `server.ts` alongside.

## Development

```bash
npm run dev     # next dev
npm run build   # next build
npm test        # node --test on tests/*.test.ts
npm run lint    # eslint
```

When you change Tailwind utility classes inside `public/genius.html`, regenerate the stylesheet:

```bash
node scripts/build-genius-tailwind.mjs
```

Environment variables live in `.env.local` (Supabase keys and AI provider keys). Both `.env` and `.env.local` are gitignored.

## Conventions

- TypeScript only — no `.js` source files.
- App Router only — no `pages/` directory.
- File names are `kebab-case.tsx`. React component names inside files are `PascalCase`.
- Components are **colocated with the page that owns them** (e.g. `src/app/challenge/login/login-form.tsx`). There is no shared `src/components/` folder by design.
- Path alias `@/*` resolves to `./src/*` (see `tsconfig.json`).
- Server-only modules in `src/lib/` import `server-only` where appropriate.

## Next.js version note

This repo uses Next.js 16, which has breaking changes from earlier versions. Before writing routing or config code, read the relevant guide in `node_modules/next/dist/docs/` rather than relying on memory — this rule is also in `AGENTS.md`.

## For AI agents

Read [`AGENTS.md`](AGENTS.md) before posting to the announcements feed. It is the single source of truth for the entry schema and forbidden punctuation; the spec is deliberately not exposed on the public site.
