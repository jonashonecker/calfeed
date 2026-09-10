# Push events from a script

Add and update events in a calfeed calendar from a script, so an external system keeps the
feed in sync.

## What you need

- The calendar `token` from when you created the calendar. It goes in the `Authorization`
  header as a Bearer token and grants write access to that one calendar.
- The server's base URL, such as `http://localhost:8787`.

To create a calendar and get its token, see
[Create your first feed](/docs/tutorial/create-your-first-feed.md).

## Push a new event

Send a `POST` to `/events` with at least a `summary` and a `dtstart` in ISO 8601:

```bash
curl -X POST http://localhost:8787/events \
  -H "Authorization: Bearer $CALFEED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "Release 2.0",
    "dtstart": "2026-10-01T09:00:00Z",
    "dtend": "2026-10-01T10:00:00Z",
    "description": "Ship the new version",
    "location": "Online"
  }'
```

The server returns `201` with the stored event:

```json
{ "id": "a1b2c3d4e5f6", "uid": "9d1f…", "updated": false }
```

calfeed generated a `uid` because you didn't send one. Store that `uid` if you want to
update or delete the event later.

## Set your own uid for repeatable pushes

If your script already has a stable identifier for the event, send it as `uid`. calfeed
keys events on `uid` within a calendar, so sending the same `uid` again updates the
existing event instead of creating a duplicate:

```bash
curl -X POST http://localhost:8787/events \
  -H "Authorization: Bearer $CALFEED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "release-2.0",
    "summary": "Release 2.0 (moved)",
    "dtstart": "2026-10-02T09:00:00Z"
  }'
```

Because `release-2.0` already exists, the server returns `200` with `"updated": true`,
and the feed reflects the new time. This upsert behavior makes a re-push safe: run your
script as often as you like without creating duplicates. For the reasoning behind it, see
[Why read-only feeds](/docs/explanation/why-read-only-feeds.md).

## Delete an event

To remove an event, send a `DELETE` to `/events/<uid>` with the same calendar token:

```bash
curl -X DELETE http://localhost:8787/events/release-2.0 \
  -H "Authorization: Bearer $CALFEED_TOKEN"
```

If the event existed, the server returns `200` with `{ "deleted": true }`. If no event in
this calendar has that `uid`, it returns `404` with `{ "deleted": false }`.

## Handle errors

- `400`: the request is missing `summary` or `dtstart`. Check the body you sent.
- `401`: the token is missing or wrong. Confirm you sent the calendar token as a Bearer
  token.

For the full list of endpoints and status codes, see
[API reference](/docs/reference/api.md).
