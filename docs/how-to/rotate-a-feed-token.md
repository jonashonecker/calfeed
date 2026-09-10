# Rotate a feed token

Replace a calendar's feed token, so the old subscribe URL stops working and a new one
takes its place. Rotate when a feed URL leaks, for example when you shared it with the
wrong person or committed it to a public repository.

## What you need

- The calendar `token` from when you created the calendar. It goes in the `Authorization`
  header as a Bearer token.
- The calendar `id`, which you also received when you created the calendar.
- The server's base URL, such as `http://localhost:8787`.

To create a calendar and get its token and `id`, see
[Create your first feed](/docs/tutorial/create-your-first-feed.md).

## Rotate the token

Send a `POST` to `/calendars/<id>/rotate-feed` with the calendar token:

```bash
curl -X POST http://localhost:8787/calendars/3f9a2b1c/rotate-feed \
  -H "Authorization: Bearer ***"
```

The server returns `200` with the new subscribe URLs:

```json
{
  "rotated": true,
  "subscribe_url": "http://localhost:8787/cal/9Xk3...new-token....ics",
  "webcal_url": "webcal://localhost:8787/cal/9Xk3...new-token....ics"
}
```

The old feed token no longer resolves, so any request to the previous subscribe URL
returns `404`.

## Re-subscribe with the new URL

Rotating the token breaks every existing subscription, because each subscriber still holds
the old URL. Send the new `subscribe_url` or `webcal_url` to everyone who needs the feed,
and have them subscribe again. On iOS, see
[Subscribe on iOS](/docs/how-to/subscribe-on-ios.md).

## Related

- To require a password instead of, or alongside, an unguessable URL, see
  [Protect a feed with a password](/docs/how-to/protect-a-feed-with-a-password.md).
- To understand the privacy model behind feed tokens, see
  [Feed privacy](/docs/explanation/feed-privacy.md).
