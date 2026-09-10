# API reference

calfeed exposes a small HTTP API. An administrator creates calendars. Clients push and delete events, and calendar apps read the feed.

## Base URL

The server listens on the port from `PORT`, which defaults to `8787`. The examples use
`http://localhost:8787`. See [Configuration](/docs/reference/configuration.md).

## Authentication

calfeed uses two kinds of Bearer token in the `Authorization` header.

| Token | Set by | Grants |
|---|---|---|
| Administrator token | `CALFEED_ADMIN_TOKEN` | Creating calendars. |
| Calendar token | Returned when you create a calendar | Writing to the calendar, deleting from it, rotating its feed token, and setting its feed password. |

The feed at `GET /cal/:feed_token.ics` needs no Bearer token. The long, unguessable
`feed_token` in the URL controls who can reach it. If the calendar has a feed password,
the feed also requires HTTP Basic authentication. See
[Feed privacy](/docs/explanation/feed-privacy.md).

## Endpoints

### Create a calendar

`POST /calendars`

Create a calendar. Requires the administrator token.

Request body:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Display name of the calendar. |

Returns `201` with:

| Field | Description |
|---|---|
| `id` | Calendar identifier used with the calendar token to manage the calendar. |
| `name` | The name you sent. |
| `token` | Calendar token for writing and management. Keep it private. |
| `subscribe_url` | `http` or `https` URL of the feed, containing the feed token. |
| `webcal_url` | Same URL with the `webcal` scheme, for iOS. |

### Add or update an event

`POST /events`

Add or update an event. Requires the calendar token. calfeed keys events on `uid` within
a calendar: a repeated `uid` updates the existing event in place, an operation known as an
upsert.

Request body:

| Field | Type | Required | Description |
|---|---|---|---|
| `summary` | string | Yes | Event title. |
| `dtstart` | string | Yes | Start time in ISO 8601, such as `2026-09-10T17:00:00Z`. |
| `dtend` | string | No | End time in ISO 8601. |
| `uid` | string | No | Stable identifier. calfeed generates one if you omit it. |
| `description` | string | No | Longer text for the event. |
| `location` | string | No | Where the event happens. |

Returns `201` with `{ "id", "uid", "updated": false }` for a new event, or `200` with
`{ "updated": true }` when you update an existing `uid`.

### Delete an event

`DELETE /events/:uid`

Delete an event by `uid`. Requires the calendar token.

Returns `200` with `{ "deleted": true }` if the event existed, or `404` with
`{ "deleted": false }` if no event in the calendar has that `uid`.

### Rotate the feed token

`POST /calendars/:id/rotate-feed`

Generate a new feed token for the calendar. Requires the calendar token, and the `:id` in
the path must match that token's calendar. Use this when a subscribe URL leaks: the new
token replaces the old one, so the previous subscribe URL returns `404`.

Returns `200` with:

| Field | Description |
|---|---|
| `rotated` | Always `true` on success. |
| `subscribe_url` | New `http` or `https` feed URL with the new feed token. |
| `webcal_url` | Same URL with the `webcal` scheme. |

To walk through a rotation, see
[Rotate a feed token](/docs/how-to/rotate-a-feed-token.md).

### Set or clear the feed password

`PUT /calendars/:id/feed-password`

Turn HTTP Basic authentication on or off for the feed. Requires the calendar token, and
the `:id` in the path must match that token's calendar.

Request body:

| Field | Type | Required | Description |
|---|---|---|---|
| `password` | string or null | Yes | A string turns on Basic authentication. `null` turns it off. |

Returns `200` with:

| Field | Description |
|---|---|
| `protected` | `true` if the feed now requires a password, `false` if it doesn't. |

To walk through the setup, see
[Protect a feed with a password](/docs/how-to/protect-a-feed-with-a-password.md).

### Read the feed

`GET /cal/:feed_token.ics`

Fetch the calendar feed by its feed token. Returns `200` with `Content-Type:
text/calendar` and the calendar in the iCalendar format defined by RFC 5545. The response
carries a `Cache-Control: private, max-age=300` header, so clients can cache the feed for
300 seconds.

If the calendar has a feed password, the feed requires HTTP Basic authentication. Send the
password with any username. Without valid credentials, the server returns `401` with a
`WWW-Authenticate: Basic` header. Calendar apps that support credentials in the URL accept
the form `webcal://user:password@host/cal/:feed_token.ics`.

## Status codes

| Code | Meaning |
|---|---|
| `200` | Success: event updated, event deleted, feed returned, token rotated, or password changed. |
| `201` | The server created a calendar or a new event. |
| `400` | A required field is missing: `name`, or `summary` and `dtstart`. |
| `401` | The token is missing or wrong for the requested action, or the feed needs Basic authentication and the password is missing or wrong. |
| `404` | Unknown feed token, unknown calendar, unknown event on delete, or unknown route. |
| `500` | The server hit an unexpected error. |

## Dates

Send dates in ISO 8601. calfeed converts them to iCalendar Coordinated Universal Time (UTC)
in the feed, so `2026-09-10T17:00:00Z` becomes `20260910T170000Z`. An unparseable
date produces a `500`.
