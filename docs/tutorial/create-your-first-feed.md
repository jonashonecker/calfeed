# Create your first feed

In this tutorial you'll start the calfeed server, create a calendar, push and list events, read the
calendar as an `.ics` feed, and subscribe to it in a calendar app. By the end you'll have a live,
subscribable feed that updates whenever you push a new event, and you'll have used every part of
calfeed you need for daily work.

## Before you start

Install Node 22.13 or later, since calfeed uses the built-in `node:sqlite` module. calfeed has no
other dependencies. Clone the calfeed repository and open a terminal in its root folder. Make sure
`curl` is available so you can talk to the server.

## Start the server

calfeed reads an administrator token from the environment. Pick a value you control and start the
server on the default port `8787`:

```bash
CALFEED_ADMIN_TOKEN=my-secret-admin-token node src/server.js
```

The server prints `calfeed listening on :8787` and keeps running. Leave it running and open a second
terminal in the same folder for the rest of the tutorial.

For every environment variable calfeed reads, see [Configuration](/docs/reference/configuration.md).

## Create a calendar

Only you can create calendars, so this command needs the administrator token. In your second
terminal, ask the server for a new calendar named `Family`:

```bash
curl -X POST http://localhost:8787/calendars \
  -H "Authorization: Bearer my-secret-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"name":"Family"}'
```

The response should look like this, with your own values:

```json
{
  "id": "3f9a2b1c",
  "name": "Family",
  "token": "Yy8Qb...redacted...",
  "subscribe_url": "http://localhost:8787/cal/9Xk3...feed-token....ics",
  "webcal_url": "webcal://localhost:8787/cal/9Xk3...feed-token....ics"
}
```

Notice that you received two different secrets. The `token` is the only credential that can write to
this calendar, so keep it private. The `subscribe_url` and `webcal_url` carry the calendar's long
feed token, which is what a calendar app subscribes to. To learn why each calendar has its own
token, see [A token per calendar](/docs/explanation/token-per-calendar.md).

Export the `token` from your response so the next commands can use it:

```bash
export CALFEED_TOKEN=Yy8Qb...redacted...
```

## Push an event

Now push a first event into the calendar. Dates use ISO 8601 with an explicit offset, such as the
`Z` for Coordinated Universal Time (UTC) in the example. calfeed rejects a date without an offset,
so the event can never shift with a server's timezone:

```bash
curl -X POST http://localhost:8787/events \
  -H "Authorization: Bearer $CALFEED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "Dinner with Sam",
    "dtstart": "2027-01-15T17:00:00Z",
    "dtend": "2027-01-15T19:00:00Z",
    "location": "Trattoria Rossi"
  }'
```

The response confirms the stored event:

```json
{ "uid": "9d1f2e3a-..." }
```

The `uid` is the event's identifier: calfeed assigns it once, and you need it to update or delete
the event later. You'll use it in a moment.

## Read the feed

The feed itself needs no token, because that's what a calendar app subscribes to. Read it with the
`subscribe_url` from the create-calendar step:

```bash
curl http://localhost:8787/cal/9Xk3...feed-token....ics
```

The response is your calendar in the iCalendar format, and your event is in it:

```text
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//calfeed//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Family
BEGIN:VEVENT
UID:9d1f2e3a-...
DTSTAMP:...
DTSTART:20270115T170000Z
DTEND:20270115T190000Z
SUMMARY:Dinner with Sam
LOCATION:Trattoria Rossi
END:VEVENT
END:VCALENDAR
```

Notice that the date you sent appears as `20270115T170000Z`: calfeed always serves dates in UTC,
whatever offset you pushed them with.

## Subscribe in a calendar app

Any calendar app can subscribe to the feed. On a computer, add a subscription calendar and paste the
`subscribe_url` from the create-calendar step. On an iPhone, use the `webcal_url` instead and see
[Subscribe on iOS](/docs/how-to/subscribe-on-ios.md).

Jump to January 15, 2027 in the app. Your dinner with Sam is there, served from your own feed.

## Push another event

With the calendar subscribed, push a second event:

```bash
curl -X POST http://localhost:8787/events \
  -H "Authorization: Bearer $CALFEED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"summary":"Team standup","dtstart":"2027-01-16T08:00:00Z"}'
```

This time, keep the `uid` from the response. Export it, like you exported the token:

```bash
export STANDUP_UID=9f091bf8-...
```

The next time your calendar app refreshes the feed, the new event appears on January 16 without you
touching the app.

## List what's in the calendar

You now have two events. Ask the server for the calendar's contents:

```bash
curl http://localhost:8787/events \
  -H "Authorization: Bearer $CALFEED_TOKEN"
```

The response lists both events, sorted by start time:

```json
{
  "events": [
    {
      "uid": "9d1f2e3a-...",
      "summary": "Dinner with Sam",
      "description": null,
      "location": "Trattoria Rossi",
      "dtstart": "2027-01-15T17:00:00.000Z",
      "dtend": "2027-01-15T19:00:00.000Z"
    },
    {
      "uid": "9f091bf8-...",
      "summary": "Team standup",
      "description": null,
      "location": null,
      "dtstart": "2027-01-16T08:00:00.000Z",
      "dtend": null
    }
  ]
}
```

This list is your safety net. If you ever lose an event's `uid`, or a retried push created a
duplicate, this is where you find it again.

## Move the event

The standup shifts to half past eight. Send the new state with `PUT` to the event's `uid`:

```bash
curl -X PUT http://localhost:8787/events/$STANDUP_UID \
  -H "Authorization: Bearer $CALFEED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"summary":"Team standup","dtstart":"2027-01-16T08:30:00Z"}'
```

The response returns the same `uid`, because it never changes:

```json
{ "uid": "9f091bf8-..." }
```

A `PUT` replaces the event's data while the `uid` stays stable, so the feed updates in place instead
of growing a duplicate, and your calendar app moves the existing entry. That's the whole pattern
behind automating a feed: create once, keep the `uid`, send the current state whenever it changes.
To understand why calfeed works this way, see
[Why read-only feeds](/docs/explanation/why-read-only-feeds.md).

## Delete an event

The standup got cancelled after all. Delete the event by its `uid`:

```bash
curl -X DELETE http://localhost:8787/events/$STANDUP_UID \
  -H "Authorization: Bearer $CALFEED_TOKEN"
```

The response confirms the deletion:

```json
{ "deleted": true }
```

Refresh your calendar app or read the feed again: the standup has vanished and the dinner remains.
That's the whole loop. Anything that can send HTTP can now put events on your calendar, and take
them off again.

## Clean up

The practice calendar has served its purpose. Delete it with the administrator token and the `id`
from the create-calendar response:

```bash
curl -X DELETE http://localhost:8787/calendars/3f9a2b1c \
  -H "Authorization: Bearer my-secret-admin-token"
```

The response confirms it:

```json
{ "deleted": true }
```

The feed URL died with the calendar, so also remove the subscription from your calendar app.

## Where to go next

You created a calendar, pushed, listed, moved, and deleted events, subscribed to the feed, and
cleaned up after yourself. From here:

- Continue with the second tutorial and learn the privacy model by using it:
  [Keep your feed private](/docs/tutorial/keep-your-feed-private.md).
- Everything a script needs to automate your feed is in the [API reference](/docs/reference/api.md).
- For day-to-day work without curl, see
  [Explore the API with Bruno](/docs/how-to/explore-the-api-with-bruno.md): the collection remembers
  tokens and identifiers for you.
