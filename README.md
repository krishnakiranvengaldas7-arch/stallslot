# StallSlot

An interactive venue-map and stall-booking prototype for independent market organisers.

Live demo: https://stallslot.onrender.com/

## Try it

Choose an available stall, submit the sample request, switch to Organiser view, approve the request, and simulate verifying its deposit. The venue map then marks the stall as booked.

This is a fictional demo. State exists only in the current browser page and resets on reload. No real payments, authentication, saved bookings or cross-user allocation are connected. Do not use it to manage a live event yet.

## Files

- `dist/index.html`: document and navigation
- `dist/styles.css`, `dist/trial.css`, `dist/experience.css`: shared responsive visual styling
- `dist/domain.js`: validated sample booking model
- `dist/demo-backend.js`: account-free, page-memory demo adapter; never connects to Supabase
- `dist/trial.js`: shared event, map/list, request/review, booking and organiser interface
- `dist/app.js`: retained legacy demo implementation, no longer loaded by either page

The public demo uses the same booking screens as the private workspace. A clearly labelled role switch lets visitors request a space, approve it as the organiser and simulate deposit confirmation. The demo starts fresh on reload and does not contact real organisers. On phones, stall browsing defaults to a list with a sticky selection summary; Map remains available. The sample has 24 stalls; private organisers can configure 1–100.

## Hosting

Render Static Site, publishing `dist` with build command `true` and `SKIP_INSTALL_DEPS=true`. There are no build dependencies. Automatic deployment is disabled; publish changes explicitly through Render. Static sites count against workspace bandwidth and build allowances.

## Local preview

Run `python3 -m http.server 8000 --directory dist` and open http://localhost:8000.

## Verification

On 12 September 2026 the public Render demo was checked through a complete sample request, approval, simulated deposit confirmation and map update for stall B09.

## Private trial workspace

`dist/trial.html` is the invitation-only workspace alongside the public demo. Its public configuration points to the StallSlot Supabase project in Mumbai. The live two-account browser flow passed on 13 September 2026: the vendor requested B09, the organiser approved it and recorded a simulated deposit, and both accounts saw the saved booking after refresh. Requests were closed again afterward. This is a practice trial, not a live paid event.

- Persistent requests, approval, deposit acknowledgement and retained released-booking history in PostgreSQL.
- Vendor/organiser roles assigned by the project owner per event. No browser-controlled role assignment.
- Atomic stall requests, one active request per stall and per vendor, and transitions tied to a booking UUID to reject stale approvals.
- Other vendors see availability only; private names and booking identifiers are returned only to the request owner or event organiser.
- Action audit records and a read-only fallback when database settings are missing.

The vendor experience has Event, Choose stall and My booking navigation, zone/availability filters, a details-and-review flow, and booking progress. The organiser's Layout tab supports 1–100 stalls, individual prices, dimensions, electricity, vendor categories, zones, and X/Y positions. Grid generation is available when no stall has booking history. Maps are schematic rather than scaled venue or safety plans. There is no public event directory or automatic payment collection.

Layout saves require organiser membership and closed requests. They reject overlaps, invalid input and stale revisions. Stalls with any booking history cannot be changed or removed; unrelated unbooked stalls remain editable. Vendor requests include the reviewed layout revision so changed terms require a new review. The existing 24-stall event is preserved rather than replaced by a generated layout.

Hosted layout verification passed in a rollback-only transaction: the organiser saved a 25th stall and read revision 2 through the workspace API; rollback retained the original 24 stalls and booked B09. Security advisors report the existing RPC-only tables as informational (no direct client grants), and warn that leaked-password protection is disabled. That feature requires Supabase Pro; the project remains on the requested free plan. [Password protection documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Apply `supabase/001_trial.sql` followed by files in `supabase/migrations/` in order for a new database. For the existing hosted database, apply only new migrations. See [Supabase setup and acceptance checks](supabase/SETUP.md).

### Build and tests

Node 22+, then `npm ci`, `npm run build`, `npm run check`, `npm test`. The bundled client is committed so the existing Render static configuration can still publish `dist` without building. Rebuild `dist/backend.js` after changing `src/backend.js` or upgrading dependencies.

`npm test` executes the real migration in PGlite and checks role restrictions, private-data filtering, duplicate constraints, transitions, audit records and persistence after restart. PGlite serialises queries; it does not prove contention between two PostgreSQL connections.

`npm run test:concurrency` launches a disposable native PostgreSQL instance and verifies that a second connection waits on a held stall lock, then fails after the winning transaction commits. It requires a non-root user and native PostgreSQL support. GitHub Actions runs both test groups against every migration. `tests/layout.test.cjs` checks configurable layouts, role boundaries, stale revisions and preservation of booking terms.

`tests/hosted-check.sql` previously passed against the hosted Supabase database with its test data rolled back. The later real Auth/browser test retained the fictional B09 booking. Do not rerun fixtures as migrations or delete retained sample history to test layout replacement.
