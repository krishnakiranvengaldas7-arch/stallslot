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
