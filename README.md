# calfeed

<img src="docs/media/calfeed-logo.svg" alt="calfeed logo" width="120" align="right">

Serve subscribable, read-only calendar feeds. Clients push events over a small HTTP API,
and you subscribe to the resulting `.ics` feed in any calendar app, including the iOS
Calendar widget.

calfeed is a zero-dependency Node backend. It runs on Node 26 and stores data in SQLite
through the built-in `node:sqlite` module.

Each feed lives at a long, unguessable feed token that you can rotate if a URL leaks, and
you can protect a feed with a password through HTTP Basic authentication. See
[Feed privacy](/docs/explanation/feed-privacy.md).

## Quickstart

Start the server with an administrator token:

```bash
CALFEED_ADMIN_TOKEN=my-secret-admin-token node src/server.js
```

Create a calendar, push an event, and read the feed:

```bash
# Create a calendar (administrator token)
curl -X POST http://localhost:8787/calendars \
  -H "Authorization: Bearer my-secret-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"name":"Family"}'

# Push an event (calendar token from the response above)
curl -X POST http://localhost:8787/events \
  -H "Authorization: Bearer <calendar-token>" \
  -H "Content-Type: application/json" \
  -d '{"summary":"Dinner","dtstart":"2026-09-10T17:00:00Z"}'

# Read the feed (the subscribe_url from the create response carries the feed token)
curl http://localhost:8787/cal/<feed-token>.ics
```

Then subscribe to the feed in your calendar app. For the full walk-through, see
[Create your first feed](/docs/tutorial/create-your-first-feed.md).

## 🌱 Tutorials
>
> Start here as a new user

- [Create your first feed](/docs/tutorial/create-your-first-feed.md)

## 🔧 How-to
>
> Practical step-by-step guides for the more experienced user

- [Subscribe on iOS](/docs/how-to/subscribe-on-ios.md)
- [Push events from a script](/docs/how-to/push-events-from-a-script.md)
- [Rotate a feed token](/docs/how-to/rotate-a-feed-token.md)
- [Protect a feed with a password](/docs/how-to/protect-a-feed-with-a-password.md)
- [Deploy to Fly.io](/docs/how-to/deploy-to-fly.md)

## 🔍 Reference
>
> Technical reference material

- [API reference](/docs/reference/api.md)
- [Configuration](/docs/reference/configuration.md)

## 💡 Explanation
>
> Explanation and analysis of some key concepts

- [Why read-only feeds](/docs/explanation/why-read-only-feeds.md)
- [A token per calendar](/docs/explanation/token-per-calendar.md)
- [Feed privacy](/docs/explanation/feed-privacy.md)

## Tests

The test suite is a set of language-independent black-box tests written in
[Hurl](https://hurl.dev). They talk to a running server over HTTP only, so they
keep working across refactors and rewrites in any language. Run them with:

```bash
npm test
```

The script starts calfeed with a throwaway database, runs every `.hurl` file in
`test/`, and shuts the server down afterward.

