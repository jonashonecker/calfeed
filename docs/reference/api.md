# API reference

calfeed exposes a small HTTP API. An administrator creates calendars. Clients push and delete
events, and calendar apps read the feed.

A machine-readable [OpenAPI description](/docs/reference/openapi.yaml) of the same contract sits
next to this page. Run `npm run docs:api` to browse it in Swagger UI on `localhost:8080`, or
generate a client from it.

## Base URL

The server listens on the port from `PORT`, which defaults to `8787`. The examples use
`http://localhost:8787`. See [Configuration](/docs/reference/configuration.md).

## Authentication

calfeed uses two kinds of Bearer token in the `Authorization` header.

| Token               | Set by                              | Grants                                                                                             |
| ------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| Administrator token | `CALFEED_ADMIN_TOKEN`               | Creating calendars.                                                                                |
| Calendar token      | Returned when you create a calendar | Writing to the calendar, deleting from it, rotating its feed token, and setting its feed password. |

The feed at `GET /cal/:feed_token.ics` needs no Bearer token. The long, unguessable `feed_token` in
the URL controls who can reach it. If the calendar has a feed password, the feed also requires HTTP
Basic authentication. See [Feed privacy](/docs/explanation/feed-privacy.md).

## Endpoints

### Create a calendar

`POST /calendars`

Create a calendar. Requires the administrator token.

Request body:

| Field  | Type   | Required | Description                   |
| ------ | ------ | -------- | ----------------------------- |
| `name` | string | Yes      | Display name of the calendar. |

Returns `201` with:

| Field           | Description                                                              |
| --------------- | ------------------------------------------------------------------------ |
| `id`            | Calendar identifier used with the calendar token to manage the calendar. |
| `name`          | The name you sent.                                                       |
| `token`         | Calendar token for writing and management. Keep it private.              |
| `subscribe_url` | `http` or `https` URL of the feed, containing the feed token.            |
| `webcal_url`    | Same URL with the `webcal` scheme, for iOS.                              |

### Create an event

`POST /events`

Create an event. Requires the calendar token. calfeed assigns the event's `uid`: a random,
universally unique identifier that stays stable for the event's whole life. It identifies the event
in this API and on the feed's `UID` line, where RFC 5545 requires that stability so subscribed apps
recognize updates as updates. Store the `uid`: updating and deleting go through it.

Request body:

| Field         | Type   | Required | Description                                                                                                    |
| ------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| `summary`     | string | Yes      | Event title.                                                                                                   |
| `dtstart`     | string | Yes      | Start time in ISO 8601 with an explicit offset, such as `2026-09-10T17:00:00Z` or `2026-09-10T19:00:00+02:00`. |
| `dtend`       | string | No       | End time, same format as `dtstart`.                                                                            |
| `description` | string | No       | Longer text for the event.                                                                                     |
| `location`    | string | No       | Where the event happens.                                                                                       |

Returns `201` with `{ "uid": "<uuid>" }`. A `uid` in the request body returns `400` with
`{ "error": "uid is assigned by the server" }`. Clients never choose it.

calfeed validates the request before it stores anything, and every field must have the listed type.
A `dtstart` or `dtend` value that isn't an ISO 8601 string with an explicit offset returns `400`
with `{ "error": "invalid dtstart" }` or `{ "error": "invalid dtend" }`. A request body larger than
256&nbsp;KB returns `413` with `{ "error": "payload too large" }`, a body that fails to parse as
JSON returns `400` with `{ "error": "invalid JSON" }`, and a body that isn't a JSON object returns
`400` with `{ "error": "body must be a JSON object" }`.

### List events

`GET /events`

List the calendar's events, sorted by `dtstart` like the feed. Requires the calendar token.

Returns `200` with `{ "events": [ ... ] }`, where each entry carries `uid`, `summary`,
`description`, `location`, `dtstart`, and `dtend`. Use the list to recover a lost `uid`, or to find
and delete the extra copy after a retried create.

### Update an event

`PUT /events/:uid`

Replace an event's data. Requires the calendar token. The body follows the same rules as
`POST /events`, and the `uid` never changes, so subscribed apps keep treating it as the same event.
An unknown `uid` returns `404` with `{ "error": "event not found" }`.

Returns `200` with `{ "uid" }`.

### Delete an event

`DELETE /events/:uid`

Delete an event by `uid`. Requires the calendar token.

Returns `200` with `{ "deleted": true }` if the event existed, or `404` with `{ "deleted": false }`
if no event in the calendar has that `uid`.

### Rotate the feed token

`POST /calendars/:id/rotate-feed`

Generate a new feed token for the calendar. Requires the calendar token, and the `:id` in the path
must match that token's calendar. Use this when a subscribe URL leaks: the new token replaces the
old one, so the previous subscribe URL returns `404`.

Returns `200` with:

| Field           | Description                                             |
| --------------- | ------------------------------------------------------- |
| `rotated`       | Always `true` on success.                               |
| `subscribe_url` | New `http` or `https` feed URL with the new feed token. |
| `webcal_url`    | Same URL with the `webcal` scheme.                      |

To walk through a rotation, see [Keep your feed private](/docs/tutorial/keep-your-feed-private.md).

### Set or clear the feed password

`PUT /calendars/:id/feed-password`

Turn HTTP Basic authentication on or off for the feed. Requires the calendar token, and the `:id` in
the path must match that token's calendar.

Request body:

| Field      | Type           | Required | Description                                                                                                                             |
| ---------- | -------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `password` | string or null | Yes      | A non-empty string of at most 1024 characters turns on Basic authentication. `null` or `""` turns it off. Any other type returns `400`. |

Returns `200` with:

| Field       | Description                                                        |
| ----------- | ------------------------------------------------------------------ |
| `protected` | `true` if the feed now requires a password, `false` if it doesn't. |

To walk through the setup, see [Keep your feed private](/docs/tutorial/keep-your-feed-private.md).

### Read the feed

`GET /cal/:feed_token.ics`

Fetch the calendar feed by its feed token. Returns `200` with `Content-Type: text/calendar` and the
calendar in the iCalendar format defined by RFC 5545. The response carries a
`Cache-Control: private, max-age=300` header, so clients can cache the feed for 300 seconds.

If the calendar has a feed password, the feed requires HTTP Basic authentication. Send the password
with any username. Without valid credentials, the server returns `401` with a
`WWW-Authenticate: Basic` header. Calendar apps that support credentials in the URL accept the form
`webcal://user:password@host/cal/:feed_token.ics`.

## Status codes

| Code  | Meaning                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `200` | Success: events listed, event updated, event deleted, feed returned, token rotated, or password changed.                                                                              |
| `201` | The server created a calendar or a new event.                                                                                                                                         |
| `400` | A required field such as `name`, `summary`, or `dtstart` is missing, a field has the wrong type, a date lacks its offset, the body carries a `uid`, or the body holds malformed JSON. |
| `401` | The token is missing or wrong for the requested action, or the feed needs Basic authentication and the password is missing or wrong.                                                  |
| `404` | Unknown feed token, unknown calendar, unknown event on update or delete, or unknown route.                                                                                            |
| `413` | The request body is larger than the 256&nbsp;KB limit.                                                                                                                                |
| `500` | The server hit an unexpected error.                                                                                                                                                   |

## Dates

Send dates in ISO 8601 with an explicit offset: `Z` for Coordinated Universal Time (UTC), or
`+hh:mm`/`-hh:mm`. calfeed stores and serves every date in UTC, so `2026-09-10T19:00:00+02:00`
becomes `20260910T170000Z` in the feed. calfeed rejects a date without an offset at write time with
a `400`, because it would otherwise change meaning with the server's timezone. Any other unparseable
date gets the same `400`, so a bad date never reaches the feed.
