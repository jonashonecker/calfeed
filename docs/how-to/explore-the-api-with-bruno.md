# Explore the API with Bruno

Use the Bruno collection in the repository's `bruno/` folder as an interactive client for the
calfeed API: one request per endpoint, and the collection remembers tokens and identifiers, so you
never copy them by hand.

## What you need

- [Bruno](https://www.usebruno.com), the open source API client. The collection is a folder of plain
  text files, so there is no import step and no account.
- A running calfeed server: either the local one from
  [Create your first feed](/docs/tutorial/create-your-first-feed.md) or your own deployment.

## Open the collection

In Bruno, choose **Open Collection** and select the `bruno/` folder of the repository. You get three
groups that mirror the [API reference](/docs/reference/api.md): `calendars`, `events`, and `feed`.

## Pick an environment

The collection ships two environments. Select one in the environment picker:

- **local** points at `http://localhost:8787` and already carries the administrator token from the
  tutorial (`my-secret-admin-token`), so it works immediately against a tutorial server.
- **prod** points at your deployed server. Its `admin_token` is a secret variable: enter the
  administrator token your server runs with once, and Bruno keeps the value on your machine. Secrets
  never end up in the repository.

## Let the variables do the work

Send **calendars → Create calendar** first. Its post-response script saves the new calendar's
`token`, `id`, and `subscribe_url` as runtime variables, and **events → Create event** saves the
`uid` of the event it creates. From then on, every other request just works: list, update, delete,
read the feed, rotate, protect. After a rotation, the `subscribe_url` variable updates itself.

Runtime variables live only in memory for the current session. Bruno never writes them to disk,
which also keeps captured tokens out of the repository. To keep working with an existing calendar
across sessions, add its `calendar_token` yourself as a secret variable in the environment: secrets
stay on your machine.

## Be careful against production

The requests are real. With the `prod` environment selected, **Delete calendar** removes a live
calendar and every subscriber loses it, and **Rotate feed token** kills a subscribe URL your apps
may already use. Check the environment picker before you send anything destructive: the safest habit
is to keep `local` selected and switch to `prod` deliberately, one request at a time.

## Related

- The request and response contracts behind every request: [API reference](/docs/reference/api.md).
- The privacy levers you can drive from the `feed` folder:
  [Feed privacy](/docs/explanation/feed-privacy.md).
