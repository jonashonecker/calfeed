# Create your first feed

In this tutorial you'll start the calfeed server, create a calendar, push an event to it,
fetch the calendar as an `.ics` file, and subscribe to it in a calendar app. By the end
you'll have a live, subscribable feed that updates whenever you push a new event.

## Before you start

Install Node 26 or later, since calfeed uses the built-in `node:sqlite` module. calfeed
has no other dependencies. Clone the calfeed repository and open a terminal in its root
folder. Make sure `curl` is available so you can talk to the server.

## Start the server

calfeed reads an administrator token from the environment. Pick a value you control and
start the server on the default port `8787`:

```bash
CALFEED_ADMIN_TOKEN=my-secret-admin-token node src/server.mjs
```

The server prints `calfeed listening on :8787` and keeps running. Leave it running and
open a second terminal for the rest of the tutorial.

For every environment variable calfeed reads, see
[Configuration](/docs/reference/configuration.md).

## Create a calendar

Only you can create calendars, so this call needs the administrator token. Ask the server
for a new calendar named `Family`:

```bash
curl -X POST http://localhost:8787/calendars \
  -H "Authorization: Bearer my-secret-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"name":"Family"}'
```

The response is a JSON object:

```json
{
  "id": "3f9a2b1c",
  "name": "Family",
  "token": "Yy8Qb...redacted...",
  "subscribe_url": "http://localhost:8787/cal/3f9a2b1c.ics",
  "webcal_url": "webcal://localhost:8787/cal/3f9a2b1c.ics"
}
```

Copy the `token` and the `id`. The `token` is the only credential that can write to this
calendar, so keep it private. To learn why each calendar has its own token, see
[A token per calendar](/docs/explanation/token-per-calendar.md).

## Push an event

Use the calendar `token` from the previous step to add an event. Dates use ISO 8601,
such as `2026-09-10T17:00:00Z`:

```bash
curl -X POST http://localhost:8787/events \
  -H "Authorization: Bearer Yy8Qb...redacted..." \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "Dinner with Sam",
    "dtstart": "2026-09-10T17:00:00Z",
    "dtend": "2026-09-10T19:00:00Z",
    "location": "Trattoria Rossi"
  }'
```

The server returns `201` with the stored event:

```json
{ "id": "a1b2c3d4e5f6", "uid": "…", "updated": false }
```

To push events from a script and update them later, see
[Push events from a script](/docs/how-to/push-events-from-a-script.md).

## Fetch the feed

The feed is public and needs no token, because that's what a calendar app subscribes to.
Fetch it with the calendar `id`:

```bash
curl http://localhost:8787/cal/3f9a2b1c.ics
```

The response is `text/calendar` and contains your event:

```text
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//calfeed//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Family
BEGIN:VEVENT
UID:…@calfeed
DTSTART:20260910T170000Z
DTEND:20260910T190000Z
SUMMARY:Dinner with Sam
LOCATION:Trattoria Rossi
END:VEVENT
END:VCALENDAR
```

The ISO 8601 date you sent becomes iCalendar Coordinated Universal Time (UTC), so
`2026-09-10T17:00:00Z` appears as `20260910T170000Z`.

## Subscribe in a calendar app

Any calendar app can subscribe to the feed. On a computer, add a subscription calendar
and paste the `subscribe_url` from the create-calendar step. The app polls the feed and
shows your event.

On an iPhone, use the `webcal_url` instead. See
[Subscribe on iOS](/docs/how-to/subscribe-on-ios.md).

## Push another event

With the calendar subscribed, push a second event the same way you pushed the first:

```bash
curl -X POST http://localhost:8787/events \
  -H "Authorization: Bearer Yy8Qb...redacted..." \
  -H "Content-Type: application/json" \
  -d '{"summary":"Team standup","dtstart":"2026-09-11T08:00:00Z"}'
```

The next time your calendar app refreshes the feed, the new event appears. You now have a
working calfeed feed that stays in sync as you push events.
