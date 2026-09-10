# Deploy to Fly.io

This guide takes you from the calfeed repository to a public, HTTPS-served feed on
[Fly.io](https://fly.io). By the end, other people's calendar apps can subscribe to your
feeds over a secure connection.

## Before you start

Install the [Fly command-line tool](https://fly.io/docs/flyctl/install/) and sign in with
`fly auth login`. The repository already contains a `fly.toml` and a `Dockerfile`, so you
deploy the container as it's built.

## Pick an app name

Open `fly.toml` and change the `app` value to a name that's free on Fly. The name becomes
part of your public URL, for example `https://your-name.fly.dev`.

## Create the app and its volume

Register the app without deploying yet:

```bash
fly launch --no-deploy --copy-config --name your-name
```

The database lives on a persistent volume mounted at `/data`. Create it once:

```bash
fly volumes create calfeed_data --region fra --size 1
```

## Set the administrator token

calfeed refuses to start without a real administrator token, so set one as a secret before
the first deploy. Generate a long random value and store it:

```bash
fly secrets set CALFEED_ADMIN_TOKEN="$(openssl rand -base64 24)"
```

Fly never displays a secret again after you set it, so save the value in your password
manager now. You need it to create calendars.

## Set the public base URL

The subscribe URLs that calfeed returns must point to your public host. Set it to your
Fly URL:

```bash
fly secrets set CALFEED_BASE_URL="https://your-name.fly.dev"
```

## Deploy

```bash
fly deploy
```

Fly builds the `Dockerfile`, starts the container, and routes HTTPS traffic to it. The
`force_https` setting in `fly.toml` redirects any plain HTTP request to HTTPS, which keeps
tokens and passwords off the wire in clear text.

## Create your first calendar

With the app live, create a calendar using the administrator token you set earlier:

```bash
curl -X POST https://your-name.fly.dev/calendars \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My calendar"}'
```

The response holds the calendar token and the subscribe URL. From here, follow
[Create your first feed](/docs/tutorial/create-your-first-feed.md) to push events, and
[Subscribe on iOS](/docs/how-to/subscribe-on-ios.md) to read the feed on your phone.

## A note on cold starts

The `fly.toml` lets the machine stop when no requests arrive and start again on the next
request. A calendar app that refreshes a feed waits a second or two for that first
request, which is fine for calendar data. To keep the machine always on, set
`min_machines_running` to `1` in `fly.toml`.
