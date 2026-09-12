# Create your first feed

In this tutorial you'll start the calfeed server, create a calendar, push an event to it, read the
calendar as an `.ics` feed, and subscribe to it in a calendar app. By the end you'll have a live,
subscribable feed that updates whenever you push a new event, and you'll have used every part of
calfeed you need for daily work.

## Before you start

Install Node 22.13 or later, since calfeed uses the built-in `node:sqlite` module. calfeed has no
other dependencies. Clone the calfeed repository and open a terminal in its root folder. You'll use
the bundled [CLI](/docs/reference/cli.md) for every step, so there is nothing else to install.

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
CALFEED_ADMIN_TOKEN=my-secret-admin-token node src/cli.js calendar create Family
```

The output should look like this, with your own values:

```text
id: 3f9a2b1c
name: Family
token: Yy8Qb...redacted...
subscribe_url: http://localhost:8787/cal/9Xk3...feed-token....ics
webcal_url: webcal://localhost:8787/cal/9Xk3...feed-token....ics
```

Notice that you received two different secrets. The `token` is the only credential that can write to
this calendar, so keep it private. The `subscribe_url` and `webcal_url` carry the calendar's long
feed token, which is what a calendar app subscribes to. To learn why each calendar has its own
token, see [A token per calendar](/docs/explanation/token-per-calendar.md).

Export the `token` from your output so the next commands can use it:

```bash
export CALFEED_TOKEN=Yy8Qb...redacted...
```

## Push an event

Now push a first event into the calendar. Dates use ISO 8601 with an explicit offset, such as the
`Z` for Coordinated Universal Time (UTC) in the example. calfeed rejects a date without an offset,
so the event can never shift with a server's timezone:

```bash
node src/cli.js event push \
  --summary "Dinner with Sam" \
  --dtstart 2027-01-15T17:00:00Z \
  --dtend 2027-01-15T19:00:00Z \
  --location "Trattoria Rossi"
```

The output confirms the stored event:

```text
id: a1b2c3d4e5f6
uid: 9d1f2e3a-...
updated: false
```

calfeed generated the `uid` because you didn't send one. To push events from a script and update
them in place later, see [Push events from a script](/docs/how-to/push-events-from-a-script.md).

## Read the feed

The feed itself needs no token, because that's what a calendar app subscribes to. Read it with the
`subscribe_url` from the create-calendar step:

```bash
node src/cli.js feed show http://localhost:8787/cal/9Xk3...feed-token....ics
```

The output is your calendar in the iCalendar format, and your event is in it:

```text
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//calfeed//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Family
BEGIN:VEVENT
UID:9d1f2e3a-...@calfeed
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

With the calendar subscribed, push a second event the same way you pushed the first:

```bash
node src/cli.js event push --summary "Team standup" --dtstart 2027-01-16T08:00:00Z
```

The next time your calendar app refreshes the feed, the new event appears on January 16 without you
touching the app. That's the whole loop: anything that can run the CLI, or send HTTP, can now put
events on your calendar.

## Where to go next

You created a calendar, pushed events, read the feed, and subscribed to it. From here:

- Automate pushes from your own tools:
  [Push events from a script](/docs/how-to/push-events-from-a-script.md).
- Protect the feed before sharing its URL:
  [Protect a feed with a password](/docs/how-to/protect-a-feed-with-a-password.md).
- Replace a leaked URL: [Rotate a feed token](/docs/how-to/rotate-a-feed-token.md).
