# Protect a feed with a password

Turn on HTTP Basic authentication for a calendar feed, so a subscriber needs a password on top of
the feed URL. Use this when the unguessable feed token alone isn't enough, for example for a feed
with sensitive events.

## What you need

- The calendar `token` from when you created the calendar. It goes in the `Authorization` header as
  a Bearer token.
- The calendar `id`, which you also received when you created the calendar.
- The server's base URL, such as `http://localhost:8787`.

To create a calendar and get its token and `id`, see
[Create your first feed](/docs/tutorial/create-your-first-feed.md).

## Set a feed password

Send a `PUT` to `/calendars/<id>/feed-password` with the calendar token and the password in the
body:

```bash
curl -X PUT http://localhost:8787/calendars/3f9a2b1c/feed-password \
  -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{"password":"grape-otter-9134"}'
```

The server returns `200` with `{ "protected": true }`. From now on, the feed requires Basic
authentication.

## Fetch a protected feed

The feed now returns `401` without credentials. Send the password with any username. With `curl`,
use the `-u` flag:

```bash
curl -u any:grape-otter-9134 \
  http://localhost:8787/cal/9Xk3...token....ics
```

calfeed checks the password and ignores the username, so `any` works as well as any other value.

## Subscribe on iOS with a password

iOS and Apple Calendar accept credentials inside the `webcal` URL, in the form
`webcal://user:password@host/cal/<feed_token>.ics`. Take the `webcal_url` from when you created the
calendar and add the username and password before the host:

```text
webcal://any:grape-otter-9134@localhost:8787/cal/9Xk3...token....ics
```

Open that link on the device to subscribe. For the rest of the iOS steps, see
[Subscribe on iOS](/docs/how-to/subscribe-on-ios.md).

## Remove the password

To turn Basic authentication back off, send `null` as the password:

```bash
curl -X PUT http://localhost:8787/calendars/3f9a2b1c/feed-password \
  -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{"password":null}'
```

The server returns `200` with `{ "protected": false }`, and the feed is reachable with the feed
token alone again.

## Related

- To learn what a password does and doesn't protect, see
  [Feed privacy](/docs/explanation/feed-privacy.md).
- To replace a leaked feed URL, see [Rotate a feed token](/docs/how-to/rotate-a-feed-token.md).
