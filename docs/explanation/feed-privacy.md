# Feed privacy

calfeed serves calendar feeds that any calendar app can subscribe to. This page explains how calfeed
keeps a feed private, the levels of protection you can choose, and the honest limit that
subscribable feeds place on confidentiality.

## The feed token hides the feed

Every calendar has a long, random feed token, around 43 characters of base64url. The token lives in
the subscribe URL, `GET /cal/:feed_token.ics`, and nothing links back to it from a listing or a
guessable identifier. This is security by obscurity: the feed is reachable only by someone who has
the URL, much like Google Calendar's secret iCal address. The token is long enough that guessing it
isn't practical.

Because the feed token is separate from the calendar `id` and the calendar token, sharing a
subscribe URL never exposes the ability to write events or manage the calendar.

## Rotation contains a leak

Subscribe URLs travel through chat messages, email, and sometimes a public repository, so treat any
one as possible to leak. When a URL leaks, rotate the feed token: calfeed generates a new token, and
the old URL stops resolving. Every subscriber has to re-subscribe with the new URL, which is the
cost of cutting off whoever held the old one. To try a rotation hands-on, see
[Keep your feed private](/docs/tutorial/keep-your-feed-private.md).

## A password adds real authentication

For a feed where an unguessable URL isn't enough, set a feed password. The feed then requires HTTP
Basic authentication: without the right password, the server answers `401` and won't return the
calendar. This moves the feed from "hard to find" to "closed unless you have the password." For the
endpoint contract, see the [API reference](/docs/reference/api.md).

Send the password over HTTPS so it isn't readable in transit. Basic authentication puts the password
in a request header on every fetch, so plain HTTP would expose it.

## The honest limit

A subscribable feed can't offer absolute confidentiality, and it helps to be clear about why. A
calendar app subscribes by handing the feed URL, and any credentials, to a server you don't control,
such as Apple's. That server fetches the feed on its own schedule and caches the result so the
calendar stays available. The events therefore leave your server and sit on a server you don't run,
outside your reach.

Given that, the levels build on each other rather than reaching perfect secrecy:

| Level         | Protection                                                | Good for                               |
| ------------- | --------------------------------------------------------- | -------------------------------------- |
| Feed token    | The URL is unguessable but public to anyone who holds it. | Casual privacy for everyday calendars. |
| Rotation      | Invalidates a leaked URL on demand.                       | Recovering after a URL gets out.       |
| Feed password | Requires Basic authentication to read the feed.           | Feeds you want closed by default.      |

Basic authentication over HTTPS is the strongest protection a subscribable feed can offer. For
events that must never reach a third-party server, a subscribable feed isn't the right tool at all.

## Related

- To see the endpoints and status codes involved, see [API reference](/docs/reference/api.md).
- To understand why calfeed scopes the write token per calendar, see
  [A token per calendar](/docs/explanation/token-per-calendar.md).
