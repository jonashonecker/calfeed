<img src="docs/media/calfeed-logo.svg" alt="calfeed logo" width="120" align="right">

**calfeed** serves subscribable, read-only calendar feeds. Clients push events over a small HTTP API, and you subscribe to the resulting `.ics` feed in any calendar app. Each feed lives at a long, unguessable URL that you can rotate if it leaks. For sensitive calendars, add a password through HTTP Basic authentication.

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
- [Contract and scenario tests](/docs/explanation/contract-and-scenario-tests.md)
