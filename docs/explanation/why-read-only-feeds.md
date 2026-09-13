# Why read-only feeds

calfeed serves calendars as read-only iCalendar feeds that you subscribe to. It doesn't let a
calendar app edit the events it shows. That's a deliberate split between who writes the data and who
reads it.

## One writer, many readers

Each calendar has one source of truth: the system that pushes events with the calendar token. A
script, a home server, or a bot owns the schedule and keeps it correct. Calendar apps only read the
feed. Because every calendar app treats a subscribed feed as read-only, nobody can change an event
on their phone and drift out of sync with the source.

## The feed always matches the source

Every event carries a `uid` that calfeed assigns at creation and never changes. The writer updates
an event with a `PUT` to that `uid`, which replaces the event's data in place instead of creating a
duplicate, so the feed always reflects the current state of the source. If the feed were editable,
an app could hold a stale or conflicting copy, and you'd need to reconcile two versions of the same
event. Read-only avoids that problem: the source writes, and every subscriber converges on the same
view.

## Subscribing is simple and standard

A subscribed `.ics` feed is a plain HTTP resource that every calendar app understands, including the
iOS Calendar app. There's no account to create in each app and no two-way sync protocol to
implement. The client fetches the feed on its own schedule and shows what it finds. calfeed stays
small because it only has to generate a correct feed, not mediate edits from many clients.

## When you want to change an event

To change what subscribers see, send a `PUT` with the event's `uid` from the source, or delete the
event. The tutorial [Create your first feed](/docs/tutorial/create-your-first-feed.md) walks through
exactly that loop. The change flows to every subscriber on their next refresh.
