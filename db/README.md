# Database schema

Supabase Postgres schema and RLS policies for the production database. These files are **not** part of the Next.js build — they are applied manually via the Supabase SQL editor.

## Files

| File | What it sets up |
|---|---|
| [security.sql](security.sql) | Core schema: `modules`, `module_answer_keys`, `questions`, prediction report drafts. Row-level security policies that keep browser clients out of answer keys and module internals. Service-role-owned writes for the Next.js server. |
| [feedback_auth.sql](feedback_auth.sql) | `public.feedback` table plus the trigger that ties each submission to the authenticated `auth.users` id. |
| [purchases.sql](purchases.sql) | `public.purchases` table recording captured PayPal payments for Challenge! Series test packages. Service-role-only RLS, like `modules`. |
| [report_purchases.sql](report_purchases.sql) | `public.report_purchases` table recording captured PayPal payments for the Insight! Report. One unused row is one report credit. Service-role-only RLS, like `modules`. |
| [genius_purchases.sql](genius_purchases.sql) | `public.genius_purchases` table recording captured PayPal payments for the Genius! Editor. One unused row is one editor-run credit. Service-role-only RLS, like `modules`. |

## Applying

Run in the Supabase SQL editor in this order, when bootstrapping a fresh project or syncing a staging database:

1. `security.sql`
2. `feedback_auth.sql`
3. `purchases.sql`
4. `report_purchases.sql`
5. `genius_purchases.sql`

All scripts are idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`), so re-running on an already-migrated database is safe.
