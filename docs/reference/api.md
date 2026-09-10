# API reference

calfeed exposes a small HTTP API. An administrator creates calendars. Clients push and delete events, and calendar apps read the public feed.

## Base URL

The server listens on the port from `PORT`, which defaults to `8787`. The examples use
`http://localhost:8787`. See [Configuration](/docs/reference/configuration.md).

## Authentication

calfeed uses two kinds of Bearer token in the `Authorization` header.

| Token | Set by | Grants |
|---|---|---|
| Administrator token | `CALFEED_ADMIN_TOKEN` | Creating calendars. |
| Calendar token | Returned when you create a calendar | Writing to and deleting from that one calendar. |

The public feed at `GET /cal/:id.ics` needs no token.

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
| `id` | Public calendar identifier used in the feed URL. |
| `name` | The name you sent. |
| `token` | Calendar token for pushing events. Keep it private. |
| `subscribe_url` | `http` or `https` URL of the feed. |
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

### Read the feed

`GET /cal/:id.ics`

Fetch the calendar feed. Public, no token. Returns `200` with `Content-Type:
text/calendar` and the calendar in the iCalendar format defined by RFC 5545. The response
carries a `Cache-Control: public, max-age=300` header, so clients can cache the feed for
300 seconds.

## Status codes

| Code | Meaning |
|---|---|
| `200` | Success: event updated, event deleted, or feed returned. |
| `201` | The server created a calendar or a new event. |
| `400` | A required field is missing: `name`, or `summary` and `dtstart`. |
| `401` | The token is missing or wrong for the requested action. |
| `404` | Unknown calendar, unknown event on delete, or unknown route. |
| `500` | The server hit an unexpected error. |

## Dates

Send dates in ISO 8601. calfeed converts them to iCalendar Coordinated Universal Time (UTC)
in the feed, so `2026-09-10T17:00:00Z` becomes `20260910T170000Z`. An unparseable
date produces a `500`.
