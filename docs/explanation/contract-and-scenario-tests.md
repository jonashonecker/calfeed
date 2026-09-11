# Contract and scenario tests

The calfeed test suite talks to a running server over HTTP only, in
language-independent [Hurl](https://hurl.dev) files. Because no test reaches into the
implementation, the suite survives refactors and even a rewrite in another language.
This page explains the file layout. To run the tests, see
[Run the tests](/docs/how-to/run-the-tests.md).

The suite splits into two kinds of files, because not every test has the same job.

## Contract tests: one file per endpoint

A contract test answers the question: does this endpoint keep its promise? For
`POST /events` that means: which token does it require, which fields are mandatory,
what happens with hostile input, and what does the response look like? These are many
small, independent checks that need no story, only a calendar as setup.

The payoff is auditability. `contract/events.hurl` contains everything the suite
asserts about `/events`, so you can hold the file next to the
[API reference](/docs/reference/api.md) and check them against each other line by
line: every documented status code should appear as an assertion. When an endpoint
gains a feature, its contract file is the one place to extend.

- `contract/calendars.hurl` covers `POST /calendars`.
- `contract/events.hurl` covers `POST /events` and `DELETE /events/:uid`.
- `contract/feed.hurl` covers `GET /cal/:feed_token.ics`, and closes with the full
  round trip: create, push, read, delete, empty feed.

## Scenario tests: one file per property

Some promises aren't a property of one endpoint but of an interplay. "Tenant B can't
reach tenant A's data" spans four endpoints in a specific order. "A rotated feed URL
dies, and a password survives the rotation" is a lifecycle. These tests must tell a
story, which is exactly what a Hurl file with captures does well. Splitting such a
story across endpoint files would tear it apart and rebuild the setup several times.

- `scenarios/feed-privacy.hurl` walks the privacy lifecycle: rotation, password
  challenge, rotation under password, removal.
- `scenarios/isolation.hurl` plays two tenants against each other.
- `scenarios/ical-format.hurl` checks the quality of the iCal output: escaping,
  folding, UTF-8, ordering, `DTEND`.

## Where a new test belongs

The rule of thumb:

> Does the test check **one request and its response**? Put it in the contract file
> of that endpoint. Does it check **a property across several requests**? Put it in
> the matching scenario file, or start a new one.

Some checks could live in either place. For example, the feed's `Content-Type` header
sits in the contract file because it's a single request-response promise, while the
correctness of the iCal body lives in the format scenario. When in doubt, prefer the
contract file: an auditable API surface is worth more than a perfectly sorted story.
