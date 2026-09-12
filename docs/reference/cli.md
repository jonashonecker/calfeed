# CLI reference

The `calfeed` CLI is a thin client for the [HTTP API](/docs/reference/api.md): one command per
endpoint, no logic of its own. All validation happens on the server, and the CLI works against any
local or remote calfeed server you can reach.

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

Only `create` uses the administrator token. Every other authenticated command uses the calendar
token.

## Commands

| Command                                     | Calls                              |
| ------------------------------------------- | ---------------------------------- |
| `create <name>`                             | `POST /calendars`                  |
| `push --summary S --dtstart D [...]`        | `POST /events`                     |
| `delete <uid>`                              | `DELETE /events/:uid`              |
| `rotate <calendar-id>`                      | `POST /calendars/:id/rotate-feed`  |
| `password <calendar-id> --set P \| --clear` | `PUT /calendars/:id/feed-password` |
| `feed <subscribe-url> [--password P]`       | `GET /cal/:feed_token.ics`         |
| `help`                                      | Prints usage.                      |

### `create`

```bash
CALFEED_ADMIN_TOKEN=... node src/cli.js create "Family"
```

Prints the new calendar's `id`, `token`, `subscribe_url`, and `webcal_url`. Store the `token`: it
authorizes every later command for this calendar.

### `push`

```bash
node src/cli.js push --summary "Dinner" --dtstart 2026-09-20T17:00:00Z
```

Optional flags: `--dtend`, `--uid`, `--description`, `--location`. Dates use ISO 8601 with an
explicit offset, as the API requires. Repeating a `--uid` updates the event in place.

### `delete`

```bash
node src/cli.js delete dinner-1
```

### `rotate`

```bash
node src/cli.js rotate 3f9a2b1c
```

Prints the new `subscribe_url`. The old feed URL stops working immediately.

### `password`

```bash
node src/cli.js password 3f9a2b1c --set s3cret
node src/cli.js password 3f9a2b1c --clear
```

### `feed`

```bash
node src/cli.js feed http://localhost:8787/cal/<feed-token>.ics --password s3cret
```

Prints the raw `.ics` feed. `--password` sends HTTP Basic authentication for protected feeds.

## Output and exit codes

Successful commands print the response as `key: value` lines. Add `--json` to print the raw JSON
body instead, for example to capture fields in a script. `feed` always prints the raw `.ics`.

The exit code is `0` on success and `1` on any error. Server errors pass through with their status,
such as `calfeed: invalid dtstart (HTTP 400)`.
