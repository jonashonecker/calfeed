# Run the tests

calfeed's test suite is a set of language-independent black-box tests written in
[Hurl](https://hurl.dev). They talk to a running server over HTTP only, so they keep working across
refactors and rewrites in any language.

## What you need

- [Hurl](https://hurl.dev/docs/installation.html), for example through `brew install hurl`.
- Node 22.13 or later, the same requirement as the server itself.

## Run the whole suite

```bash
npm test
```

The script behind the command, `test/run.sh`, starts calfeed on port `8799` with a throwaway SQLite
database, waits until the server answers, runs every `.hurl` file in `test/`, and shuts the server
down afterward.

## Run a single file

Every `.hurl` file is self-contained and creates the calendars it needs, so you can run one file on
its own. Start a server. `CALFEED_BASE_URL` must point at the test port, because some tests follow
the `subscribe_url` the server hands out:

```bash
CALFEED_DB=/tmp/calfeed-dev.db \
CALFEED_ADMIN_TOKEN=dev-token-1234 \
CALFEED_BASE_URL=http://localhost:8799 \
PORT=8799 node src/server.js
```

Then point Hurl at the file, passing the two variables every test expects. `--file-root test` lets
tests in the subdirectories find `test/fixtures/`:

```bash
hurl --test \
  --file-root test \
  --variable base=http://localhost:8799 \
  --variable admin_token=dev-token-1234 \
  test/contract/events.hurl
```

## What the suite covers

`test/contract/` holds one contract test per endpoint, `test/scenarios/` one scenario test per
cross-cutting property. For the reasoning behind that split, see
[Contract and scenario tests](/docs/explanation/contract-and-scenario-tests.md).

- `contract/calendars.hurl`: the `POST /calendars` contract.
- `contract/events.hurl`: the `/events` contracts: create, list, update, and delete.
- `contract/feed.hurl`: the `GET /cal/:feed_token.ics` contract and the full round trip.
- `contract/feed-password.hurl`: the `PUT /calendars/:id/feed-password` contract.
- `scenarios/feed-privacy.hurl`: rotation and password lifecycle.
- `scenarios/isolation.hurl`: cross-tenant isolation between calendars.
- `scenarios/ical-format.hurl`: iCal escaping, line folding, UTF-8, ordering, and `DTEND`.

## Continuous integration

The GitHub Actions workflow in `.github/workflows/ci.yml` runs the same suite on every push and pull
request.

## Related

- To see the endpoints the tests exercise, see [API reference](/docs/reference/api.md).
- To understand the split between contract and scenario files, see
  [Contract and scenario tests](/docs/explanation/contract-and-scenario-tests.md).
