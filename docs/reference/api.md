# API reference

calfeed exposes a small HTTP API: an admin creates calendars, a client pushes and deletes
events, and a calendar app reads the public feed.

## Base URL

The server listens on the port from `PORT` (default `8787`). The examples use
`http://localhost:8787`. See [Configuration](/docs/reference/configuration.md).

## Authentication

calfeed uses two kinds of Bearer token in the `Authorization` header.

| Token | Set by | Grants |
|---|---|---|
| Admin token | `CALFEED_ADMIN_TOKEN` | Creating calendars. |
| Calendar token | Returned when a calendar is created | Writing to and deleting from that one calendar. |

The public feed (`GET /cal/:id.ics`) needs no token.

## Endpoints

### POST /calendars

Create a calendar. Requires the admin token.

Request body:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Display name of the calendar. |

Returns `201` with:

| Field | Description |
|---|---|
| `id` | Public calendar identifier used in the feed URL. |
| `name` | The name you sent. |
| `token` | Calendar token for pushing events. Keep it private. |
| `subscribe_url` | `http` or `https` URL of the feed. |
| `webcal_url` | Same URL with the `webcal` scheme, for iOS. |

### POST /events

Add or update an event. Requires the calendar token. calfeed keys events on `uid` within
a calendar: a repeated `uid` updates the existing event (upsert).

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
`{ "updated": true }` when an existing `uid` is updated.

### DELETE /events/:uid

Delete an event by `uid`. Requires the calendar token.

Returns `200` with `{ "deleted": true }` if the event existed, or `404` with
`{ "deleted": false }` if no event in the calendar has that `uid`.

### GET /cal/:id.ics

Fetch the calendar feed. Public, no token. Returns `200` with `Content-Type:
text/calendar` and the calendar in iCalendar (RFC 5545) format. The response carries a
`Cache-Control: public, max-age=300` header, so clients can cache the feed for 300
seconds.

## Status codes

| Code | Meaning |
|---|---|
| `200` | Success: event updated, event deleted, or feed returned. |
| `201` | A calendar or a new event was created. |
| `400` | A required field is missing (`name`, or `summary` and `dtstart`). |
| `401` | The token is missing or wrong for the requested action. |
| `404` | Unknown calendar, unknown event on delete, or unknown route. |
| `500` | The server hit an unexpected error. |

## Dates

Send dates in ISO 8601. calfeed converts them to iCalendar UTC in the feed, so
`2026-09-10T17:00:00Z` becomes `20260910T170000Z`. An unparseable date produces a `500`.
