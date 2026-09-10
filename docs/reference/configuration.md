# Configuration

calfeed reads its configuration from environment variables at startup. None are strictly
required to start, but you should set the administrator token in any real deployment.

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `CALFEED_ADMIN_TOKEN` | Bearer token that authorizes creating calendars. | `dev-admin-token` |
| `CALFEED_BASE_URL` | Base URL calfeed uses to build `subscribe_url` and `webcal_url`. | `http://localhost:8787` |
| `PORT` | Port the server listens on. | `8787` |

## The administrator token

The `CALFEED_ADMIN_TOKEN` value guards `POST /calendars`. The default `dev-admin-token` is
only for local development. Set your own value before exposing the server, so nobody else
can create calendars:

```bash
CALFEED_ADMIN_TOKEN=a-long-random-string node src/server.mjs
```

## The base URL

calfeed reads the `CALFEED_BASE_URL` value to build the feed URLs it returns. The
`webcal_url` is the same URL with the scheme replaced by `webcal`. Set it to the address
clients reach, including the scheme:

```bash
CALFEED_BASE_URL=https://calfeed.example.com node src/server.mjs
```

With that value, a new calendar returns
`https://calfeed.example.com/cal/<id>.ics` and
`webcal://calfeed.example.com/cal/<id>.ics`.

## The listening port

The `PORT` value sets the listening port. `CALFEED_BASE_URL` and `PORT` are independent, so
behind a reverse proxy the server can listen on one port while clients reach it at a
different public URL:

```bash
CALFEED_ADMIN_TOKEN=a-long-random-string PORT=9000 node src/server.mjs
```

## Storage

calfeed stores calendars and events in a SQLite database file named `calfeed.db` in the
working directory, created on first run. Back up that file to keep your calendars and
events.
