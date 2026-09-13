# StallSlot

An interactive venue-map and stall-booking prototype for independent market organisers.

Live demo: https://stallslot.onrender.com/

## Try it

Choose an available stall, submit the sample request, switch to Organiser view, approve the request, and simulate verifying its deposit. The venue map then marks the stall as booked.

This is a fictional demo. State exists only in the current browser page and resets on reload. No real payments, authentication, saved bookings or cross-user allocation are connected. Do not use it to manage a live event yet.

## Files

- `dist/index.html`: document and navigation
- `dist/styles.css`: responsive visual styling
- `dist/domain.js`: validated sample booking model
- `dist/app.js`: vendor map and organiser interactions

## Hosting

Render Static Site, publishing `dist` with build command `true` and `SKIP_INSTALL_DEPS=true`. There are no build dependencies. Automatic deployment is disabled; publish changes explicitly through Render. Static sites count against workspace bandwidth and build allowances.

## Local preview

Run `python3 -m http.server 8000 --directory dist` and open http://localhost:8000.

## Verification

On 12 September 2026 the public Render demo was checked through a complete sample request, approval, simulated deposit confirmation and map update for stall B09.

## Private trial implementation (connected; account setup pending)

`dist/trial.html` adds an invitation-only workspace alongside the existing public demo. Its public configuration points to the StallSlot Supabase project in Mumbai. The migration has been applied and hosted database permission checks passed on 13 September 2026. The event remains closed, with no members or bookings, until practice accounts are created and sign-in is verified. Do not describe this as a live booking service yet.

- Persistent requests, approval, deposit acknowledgement and retained released-booking history in PostgreSQL.
- Vendor/organiser roles assigned by the project owner per event. No browser-controlled role assignment.
- Atomic stall requests, one active request per stall and per vendor, and transitions tied to a booking UUID to reject stale approvals.
- Other vendors see availability only; private names and booking identifiers are returned only to the request owner or event organiser.
- Action audit records and a read-only fallback when database settings are missing.

See [Supabase setup and acceptance checks](supabase/SETUP.md). Account onboarding and hosted Auth/browser testing are still pending. This is a practice trial, not ready for a paid event.

### Build and tests

Node 22+, then `npm ci`, `npm run build`, `npm run check`, `npm test`. The bundled client is committed so the existing Render static configuration can still publish `dist` without building. Rebuild `dist/backend.js` after changing `src/backend.js` or upgrading dependencies.

`npm test` executes the real migration in PGlite and checks role restrictions, private-data filtering, duplicate constraints, transitions, audit records and persistence after restart. PGlite serialises queries; it does not prove contention between two PostgreSQL connections.

`npm run test:concurrency` launches a disposable native PostgreSQL instance and verifies that a second connection waits on a held stall lock, then fails after the winning transaction commits. It requires a non-root user and native PostgreSQL support. GitHub Actions runs both test groups. A cloud/browser end-to-end pass is still required after configuring Supabase.

`tests/hosted-check.sql` passed against the hosted Supabase database, checking the request-to-confirmation flow, anonymous and vendor permission denial, private detail filtering, duplicate rejection and audit records. Its test data was rolled back; the project contains only the closed fictional event and 24 empty stalls. This SQL test does not simulate a real Auth sign-in.
