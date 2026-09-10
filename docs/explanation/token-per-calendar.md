# A token per calendar

calfeed gives every calendar its own write token, separate from the admin token that
creates calendars. This page explains why the tokens are split that way.

## Two levels of trust

Creating a calendar is a privileged act, so it needs the admin token that only you hold.
Writing events is routine and happens from many places: a script on a server, a home
automation, a bot. Each of those needs to write to one calendar and nothing else. A
per-calendar token matches that need. You hand a client the token for the calendar it
owns, and it can't touch any other calendar.

## Containing a leaked token

Tokens end up in scripts, environment files, and logs, so treat any one of them as
possible to leak. Scoping each token to a single calendar limits the damage: a leaked
calendar token exposes only that calendar's events, not the whole server and not the
ability to create calendars. To rotate a compromised calendar, create a fresh one and
point the writer at the new token.

## The reader needs no token at all

The feed is public and read-only, so subscribing needs no token. That keeps the calendar
`id` and the write token in separate roles: the `id` is shareable and safe to put in a
subscription URL, while the token stays private to the writer. The `id` is a short,
unguessable value, so the feed stays effectively private without a login step in the
calendar app.

## Related

- Create a calendar and get its token: [Create your first feed](/docs/tutorial/create-your-first-feed.md)
- How the tokens appear in requests: [API reference](/docs/reference/api.md)
