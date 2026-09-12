# Subscribe on iOS

Subscribe to a calfeed feed on an iPhone or iPad, so its events show in the Calendar app and on the
calendar widget.

## Get the webcal URL

When you create a calendar, the response includes a `webcal_url`, such as
`webcal://calfeed.example.com/cal/9Xk3...token....ics`. The URL carries the calendar's long feed
token. iOS treats a `webcal://` link as a subscription, so this is the value you need. To create a
calendar, see [Create your first feed](/docs/tutorial/create-your-first-feed.md).

If you only have the `subscribe_url`, an `http://` or `https://` link, swap its scheme for
`webcal://`. The rest of the URL stays the same.

If the feed has a password, put the username and password in the URL, in the form
`webcal://user:password@host/cal/<feed_token>.ics`. calfeed accepts any username. To set a feed
password, see the [API reference](/docs/reference/api.md).

## Open the link on the device

The quickest path is to open the `webcal://` URL on the device itself. Message or email the link to
yourself, then tap it. iOS recognizes the scheme and offers to add the calendar.

If tapping the link doesn't work, add it by hand:

1. Open **Settings** and go to **Calendar** > **Accounts** > **Add Account**.
2. Tap **Other**, then **Add Subscribed Calendar**.
3. Paste the feed URL into **Server** and tap **Next**, then **Save**.

## Confirm the subscription

Open the Calendar app and look for the calendar under your subscribed calendars. Its events appear
alongside your own. When you push new events to the feed, iOS picks them up on its next refresh.

## Control how often iOS refreshes

iOS refreshes subscribed calendars on its own schedule. To set the interval, go to **Settings** >
**Calendar** > **Accounts** > **Subscribed Calendars**, open the account, and choose a value under
**Fetch New Data**. A shorter interval shows new events sooner and uses more battery.

## Related

- To push events to the feed, read
  [Create your first feed](/docs/tutorial/create-your-first-feed.md).
- To learn why the feed stays read-only, read
  [Why read-only feeds](/docs/explanation/why-read-only-feeds.md).
- To understand how feed tokens and passwords protect a feed, read
  [Feed privacy](/docs/explanation/feed-privacy.md).
