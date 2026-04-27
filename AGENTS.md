# AGENTS.md

## Big picture
- `logbook` is a mobile-first Next.js 16 App Router PWA for a personal climbing logbook. `/` redirects to `/input` (`app/page.tsx`), and the fixed bottom nav exposes `/input` and `/dashboard` (`components/bottom-nav.tsx`).
- Runtime is intentionally client-heavy: `app/input/page.tsx`, `app/review/page.tsx`, and `app/dashboard/page.tsx` are client pages with `dynamic = "force-dynamic"`, and they call Supabase directly from the browser through `lib/db.ts` + `lib/supabase.ts`.
- There are no API routes or server actions. If you change data access, trace all current callsites that expect direct client-side Supabase reads/writes.

## Core data model and invariants
- The `climbs` table in `supabase/schema.sql` must stay aligned with `lib/types.ts` (`Climb`, `NewClimb`, `Pitch`).
- `ascent_result` is **derived**, not user-authored. Keep `deriveAscentResult()` in `lib/types.ts`, the write wrapper in `lib/db.ts`, and the SQL backfill in `supabase/migrations/2026-04-14-add-ascent-result.sql` synchronized.
- `lib/db.ts` strips `_importHints` before writes. That field is review-only metadata for imported rows; do not persist it.
- Grades are stored in both systems when possible. Use `normalizeGrade()` from `lib/grades.ts`; do not hand-roll NO/FR conversion.

## Main flows
- Manual logging: `app/input/page.tsx` → `components/entry-form.tsx` → `insertClimb()`.
- Review unreviewed rows: `app/review/page.tsx` in `db` mode → `getUnreviewedClimbs()` / `updateClimb()`.
- Excel/CSV import: `components/file-drop.tsx` → `parseExcelFile()` in `lib/excel.ts` → upload queue in `app/review/page.tsx` persisted in `sessionStorage` key `klatredagbok_upload_queue` → `insertClimb()` one row at a time.
- Analytics/edit/export: `app/dashboard/page.tsx` loads all climbs once with `getAllClimbs()` and computes filters, KPIs, charts, export, inline edit, and delete entirely client-side.

## Project-specific patterns
- `EntryForm` is the central editing surface for create, review, upload confirmation, and dashboard edit. Reuse it instead of duplicating climb fields.
- `EntryForm` auto-fills empty fields from previous ascents of the same route via `getRouteHistory()`; inspect the `autofilledRouteKeyRef` logic before changing route/crag behavior.
- Route history and dashboard KPIs depend on the `Send` vs `Working` split; changes to ascent style/detail semantics ripple into `components/route-history.tsx` and `app/dashboard/page.tsx`.
- Multi-pitch climbs store per-pitch data in `pitches` JSON and auto-sum total length (`components/pitch-list.tsx`, `components/entry-form.tsx`). Preserve that derived-length behavior.
- UI copy is mostly Norwegian, but `Send` / `Working attempt` labels intentionally remain English (`RESULT_LABEL` in `lib/types.ts`).

## Imports and exports
- The importer is tuned for Norwegian spreadsheets: header aliases, month names, and style/protection mapping live in `lib/excel.ts`. Extend those mappings there instead of patching review UI logic.
- Imported values that cannot be mapped are surfaced as `_importHints` and shown inline in `EntryForm`; that is the intended remediation path.
- Dashboard export buttons intentionally export either `filtered` rows or a full backup (`allClimbs`). Preserve that distinction if you touch export UX.

## Conventions and dependencies
- Use `@/*` imports (`tsconfig.json`) and shared UI primitives from `components/ui/*`; styling is Tailwind + `cn()` from `lib/utils.ts` with shadcn-style config in `components.json`.
- `app/layout.tsx` adds `pb-20` because of the fixed bottom nav. Keep that in mind when adding fixed/floating UI.
- PWA metadata lives in `app/layout.tsx` and `public/manifest.json`.
- Supabase access requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; `lib/supabase.ts` throws if they are absent.
- Current security model is intentionally lax: `schema.sql` enables anon read/write for all rows. There is no user isolation/auth layer yet.

## Developer workflow
- Install/run: `npm install`, `npm run dev`; production build: `npm run build`, `npm start`.
- There are currently no `test` or `lint` scripts in `package.json`, so the safest regression check after edits is a full `npm run build` plus manual checks of `/input`, `/review`, and `/dashboard`.
- When changing schema-related behavior, update both `supabase/schema.sql` (fresh installs) and `supabase/migrations/*` (existing installs).

## Before changing...
- Form fields or validation: inspect `components/entry-form.tsx`, `lib/types.ts`, `lib/grades.ts`, and `lib/db.ts` together.
- Import parsing: inspect `components/file-drop.tsx`, `lib/excel.ts`, and upload-mode logic in `app/review/page.tsx`.
- Stats/KPIs/filter semantics: inspect `app/dashboard/page.tsx` for the filtered-vs-all-climbs split before refactoring.
- Route autofill/history behavior: inspect `getDistinctRoutes()`, `getRouteHistory()` in `lib/db.ts` and `components/route-history.tsx`.
