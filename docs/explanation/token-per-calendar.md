# A token per calendar

calfeed gives every calendar its own write token, separate from the administrator token that creates
calendars. This page explains why calfeed splits the tokens that way.

## Two levels of trust

Creating a calendar is a privileged act, so it needs the administrator token that only you hold.
Writing events is routine and happens from many places: a script on a server, a home automation, a
bot. Each of those needs to write to one calendar and nothing else. A per-calendar token matches
that need. You hand a client the token for the calendar it owns, and it can't reach any other
calendar.

## Containing a leaked token

Tokens end up in scripts, environment files, and logs, so treat any one of them as possible to leak.
Scoping each token to a single calendar limits the damage: a leaked calendar token exposes only that
calendar's events, not the whole server, and not the ability to create calendars. To rotate a
compromised calendar, create a fresh one and point the writer at the new token.

## The reader needs no token at all

The feed only serves data, so subscribing needs no calendar token. Instead, the feed lives at a
long, unguessable feed token in the subscribe URL, separate from both the calendar `id` and the
write token. The `id` and the write token stay private to the writer, while the feed token is the
only value a subscriber needs. You can rotate the feed token if a URL leaks, or add a password for
stronger protection. See [Feed privacy](/docs/explanation/feed-privacy.md).

## Related

- To create a calendar and get its token, read
  [Create your first feed](/docs/tutorial/create-your-first-feed.md).
- To see how the tokens appear in requests, read [API reference](/docs/reference/api.md).
- To understand how the feed token and password keep a feed private, read
  [Feed privacy](/docs/explanation/feed-privacy.md).
- To understand why calfeed can never show a token twice, read
  [Why tokens appear only once](/docs/explanation/why-tokens-appear-only-once.md).
