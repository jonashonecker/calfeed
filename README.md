# calfeed

<img src="docs/media/calfeed-logo.svg" alt="calfeed logo" width="120" align="right">

Serve subscribable, read-only calendar feeds. Clients push events over a small HTTP API,
and you subscribe to the resulting `.ics` feed in any calendar app, including the iOS
Calendar widget.

calfeed is a zero-dependency Node backend. It needs Node 22.13 or later and stores data
in SQLite through the built-in `node:sqlite` module.

Each feed lives at a long, unguessable feed token that you can rotate if a URL leaks, and
you can protect a feed with a password through HTTP Basic authentication. See
[Feed privacy](/docs/explanation/feed-privacy.md).

## 🌱 Tutorials

> Start here as a new user

- [Create your first feed](/docs/tutorial/create-your-first-feed.md)

## 🔧 How-to

> Practical step-by-step guides for the more experienced user

- [Subscribe on iOS](/docs/how-to/subscribe-on-ios.md)
- [Push events from a script](/docs/how-to/push-events-from-a-script.md)
- [Rotate a feed token](/docs/how-to/rotate-a-feed-token.md)
- [Protect a feed with a password](/docs/how-to/protect-a-feed-with-a-password.md)
- [Run the tests](/docs/how-to/run-the-tests.md)

## 🔍 Reference

> Technical reference material

- [API reference](/docs/reference/api.md)
- [Configuration](/docs/reference/configuration.md)

## 💡 Explanation

> Explanation and analysis of some key concepts

- [Why read-only feeds](/docs/explanation/why-read-only-feeds.md)
- [A token per calendar](/docs/explanation/token-per-calendar.md)
- [Feed privacy](/docs/explanation/feed-privacy.md)
