# Keep your feed private

In this tutorial you'll use calfeed's two privacy levers on a real feed: you'll rotate a feed token
to cut off a leaked URL, and you'll put a password on a feed and read it with credentials. By the
end you'll know exactly what to do when a feed URL falls into the wrong hands.

## Before you start

Finish [Create your first feed](/docs/tutorial/create-your-first-feed.md) once. This tutorial
assumes the server is running on port `8787` with the administrator token `my-secret-admin-token`,
and that a second terminal is open in the repository folder.

## Create a calendar to protect

Start with a fresh calendar, so you can experiment without touching your first one:

```bash
curl -X POST http://localhost:8787/calendars \
  -H "Authorization: Bearer my-secret-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"name":"Private"}'
```

From the response, export the `token` and keep the `id` and `subscribe_url` at hand:

```bash
export CALFEED_TOKEN=Yy8Qb...redacted...
```

Look closely at the `subscribe_url`. The long random part is the feed token, and right now it's the
only thing protecting the feed. Anyone who has the URL can read the calendar:

```bash
curl http://localhost:8787/cal/9Xk3...feed-token....ics
```

The response is your empty calendar, with no credentials asked:

```text
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//calfeed//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Private
END:VCALENDAR
```

## Rotate a leaked token

Suppose you pasted the URL into the wrong chat. The fix is rotation: the calendar gets a new feed
token, and the old URL dies. Send the rotation with your calendar token and the calendar `id` from
the create step:

```bash
curl -X POST http://localhost:8787/calendars/3f9a2b1c/rotate-feed \
  -H "Authorization: Bearer $CALFEED_TOKEN"
```

The response carries the new URLs:

```json
{
  "rotated": true,
  "subscribe_url": "http://localhost:8787/cal/7Wq2...new-token....ics",
  "webcal_url": "webcal://localhost:8787/cal/7Wq2...new-token....ics"
}
```

Now read the old `subscribe_url` again. The leaked URL is dead:

```json
{ "error": "calendar not found" }
```

Read the new `subscribe_url` from the rotation response: your calendar is there. Notice what just
happened: whoever holds the old URL lost access the moment you rotated, and nothing else about the
calendar changed. Rotation also logs out every legitimate subscriber, so after a real rotation you
send the new URL to the people who should keep reading.

## Add a password

An unguessable URL is the first lever. The second is a password, for calendars where a URL alone
shouldn't be enough. Turn it on:

```bash
curl -X PUT http://localhost:8787/calendars/3f9a2b1c/feed-password \
  -H "Authorization: Bearer $CALFEED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password":"s3cret"}'
```

The response confirms the protection:

```json
{ "protected": true }
```

Read the new `subscribe_url` again, without credentials. The feed now challenges you:

```json
{ "error": "authentication required" }
```

Read it once more, this time with the password:

```bash
curl -u calfeed:s3cret http://localhost:8787/cal/7Wq2...new-token....ics
```

The calendar is back. Notice that the username doesn't matter, only the password counts. Pick any
username you like when an app asks for one.

## Subscribe with the password

A calendar app subscribes to a protected feed the same way you just did. Most apps ask for a
username and password when you add the subscription. Apps that take credentials in the URL accept
the form `webcal://calfeed:s3cret@localhost:8787/cal/...`. For the steps on an iPhone, see
[Subscribe on iOS](/docs/how-to/subscribe-on-ios.md).

## Remove the password again

Protection is reversible. Send `null` to turn the password off:

```bash
curl -X PUT http://localhost:8787/calendars/3f9a2b1c/feed-password \
  -H "Authorization: Bearer $CALFEED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password":null}'
```

The response reports `{ "protected": false }`, and the feed answers without credentials again.

You now command both privacy levers: rotate when a URL leaks, and add a password when a URL alone
isn't enough. Used together, a rotated URL plus a fresh password locks out everyone you didn't
invite back.

## Clean up

Delete the practice calendar, so the experiment leaves nothing behind:

```bash
curl -X DELETE http://localhost:8787/calendars/3f9a2b1c \
  -H "Authorization: Bearer my-secret-admin-token"
```

The response reports `{ "deleted": true }`, and the rotated feed URL stops resolving.

## Where to go next

- To understand the model behind the two levers, see
  [Feed privacy](/docs/explanation/feed-privacy.md).
- For the exact request and response contracts of both endpoints, see the
  [API reference](/docs/reference/api.md).
