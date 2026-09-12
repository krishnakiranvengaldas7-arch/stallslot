# Connect the private trial

Status: implementation complete; hosted Supabase Auth and database integration are not yet connected or verified. Keep the public demo available until the checks below pass. No payment processing is included.

## Owner setup (no secrets in GitHub or chat)

1. Create a new Supabase project named StallSlot in a **Free** organisation, ideally in a nearby India region if offered. Save the database password privately. Do not upgrade or enter billing information.
2. In the project's SQL Editor, run `001_trial.sql` once. It creates a fictional 24-stall event with requests **closed**. Migration changes are transactional. Do not rerun against a populated installation.
3. In Authentication settings, disable public signups. This application has no signup endpoint or self-assigned roles, and the database also rejects users without event membership.
4. Create dedicated practice accounts through Authentication → Users → Add user, using email/password. Use separate organiser and vendor accounts you control for the initial test. Keep passwords private. Do not create real vendors or send invitations during this setup.
5. Run the query below in SQL Editor after replacing the two email placeholders with those exact practice-account addresses. The query refuses to proceed if either account is missing. No password belongs in this SQL.
6. Copy the project URL and **publishable** key (or legacy **anon** key) into `dist/config.js`. These two settings are intended to be public. Never put a database password, secret key or `service_role` key in any browser file.
7. Run the build and checks, publish the configured branch to Render, then complete the hosted acceptance checks below before opening a real trial.

```sql
do $$
declare event_uuid uuid; organiser_uuid uuid; vendor_uuid uuid;
begin
 select id into event_uuid from public.events where slug='courtyard-trial';
 select id into organiser_uuid from auth.users where lower(email)=lower('REPLACE_ORGANISER_EMAIL');
 select id into vendor_uuid from auth.users where lower(email)=lower('REPLACE_VENDOR_EMAIL');
 if event_uuid is null or organiser_uuid is null or vendor_uuid is null or organiser_uuid=vendor_uuid then
  raise exception 'Create two distinct practice accounts and replace the email placeholders first.';
 end if;
 insert into public.event_members(event_id,user_id,role) values
 (event_uuid,organiser_uuid,'organiser'),(event_uuid,vendor_uuid,'vendor');
 update public.events set is_open=true where id=event_uuid;
end $$;
```

## Hosted acceptance checks

- Sign in as vendor, request a stall with fictional details, refresh, then sign in from another browser and confirm the same request is still there.
- Sign in as organiser, approve it, record a **simulated** deposit, and confirm the vendor sees Booked after refreshing.
- A second vendor must not see the first vendor's name, business or booking ID.
- A vendor must not be able to call `change_booking` successfully, even by calling the API directly. Another event's organiser must also fail.
- Two separate vendor accounts submitting the same available stall must produce exactly one active request. Local PostgreSQL contention testing exists in `tests/concurrency.cjs`; repeat against hosted infrastructure.
- Test sign-out, invalid passwords, expired sessions, loss of connection, failed refresh after a successful write, and keyboard/mobile form use.
- Confirm public signup is disabled, and verify anonymous/direct table operations fail. Authenticated membership does not grant direct booking-table access; the three RPCs are the supported interface.

## Before a real event

- Replace the fictional event name/layout/date assumptions and agree an actual cancellation/deposit policy with the organiser. This implementation supports the fixed 24-stall courtyard only; it is not an event layout editor.
- Set up a supported invitation and password recovery flow. Supabase's default mail service restricts recipients and is not a general production mail service. This version relies on owner-created practice accounts and manual owner-assisted account recovery; external vendor onboarding is not ready.
- Confirm an export/backup process and free-tier capacity. Free Supabase projects may pause after one week of inactivity; availability is not guaranteed for a live event. Do not work around pausing with fake traffic.
- No automated notifications, payment collection, refunds, expiry of holds or vendor cancellation are implemented. Organisers can decline/release pending requests or holds; confirmed bookings cannot be released through this interface.

Official references checked 12 September 2026:
- https://supabase.com/pricing
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/auth/auth-smtp
