# CLI reference

The `calfeed` CLI is a thin client for the [HTTP API](/docs/reference/api.md): commands follow a
`calfeed <resource> <action>` shape, one action per endpoint, no logic of its own. All validation
happens on the server, and the CLI works against any local or remote calfeed server you can reach.

Run it directly from a checkout:

```bash
node src/cli.js help
```

Or install the `calfeed` command on your PATH with `npm link` from the repository root.

## Configuration

The CLI reads its defaults from the environment. Flags override them per call.

| Setting             | Flag      | Environment variable  | Default                 |
| ------------------- | --------- | --------------------- | ----------------------- |
| Server base URL     | `--url`   | `CALFEED_URL`         | `http://localhost:8787` |
| Calendar token      | `--token` | `CALFEED_TOKEN`       | none                    |
| Administrator token | `--token` | `CALFEED_ADMIN_TOKEN` | none                    |

Only `calendar create` uses the administrator token. Every other authenticated command uses the
calendar token.

## Commands

| Command                                    | Calls                              |
| ------------------------------------------ | ---------------------------------- |
| `calendar create <name>`                   | `POST /calendars`                  |
| `event push --summary S --dtstart D [...]` | `POST /events`                     |
| `event delete <uid>`                       | `DELETE /events/:uid`              |
| `feed show <subscribe-url> [--password P]` | `GET /cal/:feed_token.ics`         |
| `feed rotate <calendar-id>`                | `POST /calendars/:id/rotate-feed`  |
| `feed protect <calendar-id> --password P`  | `PUT /calendars/:id/feed-password` |
| `feed unprotect <calendar-id>`             | `PUT /calendars/:id/feed-password` |
| `help`                                     | Prints usage.                      |

## The `calendar` resource

### `calendar create`

```bash
CALFEED_ADMIN_TOKEN=... node src/cli.js calendar create "Family"
```

Prints the new calendar's `id`, `token`, `subscribe_url`, and `webcal_url`. Store the `token`: it
authorizes every later command for this calendar.

## The `event` resource

### `event push`

```bash
node src/cli.js event push --summary "Dinner" --dtstart 2026-09-20T17:00:00Z
```

Optional flags: `--dtend`, `--uid`, `--description`, `--location`. Dates use ISO 8601 with an
explicit offset, as the API requires. Repeating a `--uid` updates the event in place.

### `event delete`

```bash
node src/cli.js event delete dinner-1
```

## The `feed` resource

### `feed show`

```bash
node src/cli.js feed show http://localhost:8787/cal/<feed-token>.ics --password s3cret
```

Prints the raw `.ics` feed. `--password` sends HTTP Basic authentication for protected feeds.

### `feed rotate`

```bash
node src/cli.js feed rotate 3f9a2b1c
```

Prints the new `subscribe_url`. The old feed URL stops working immediately.

### `feed protect` and `feed unprotect`

```bash
node src/cli.js feed protect 3f9a2b1c --password s3cret
node src/cli.js feed unprotect 3f9a2b1c
```

`protect` requires HTTP Basic authentication on the feed from now on. `unprotect` removes it.

## Output and exit codes

Successful commands print the response as `key: value` lines. Add `--json` to print the raw JSON
body instead, for example to capture fields in a script. `feed show` always prints the raw `.ics`.

The exit code is `0` on success and `1` on any error. Server errors pass through with their status,
such as `calfeed: invalid dtstart (HTTP 400)`.
