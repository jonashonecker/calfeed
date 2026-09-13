# Contract test for GET /cal/:feed_token.ics, closing with the end-to-end
# round trip: create → push → read → delete → empty feed.
# Variables: base, admin_token

# ── Setup: a calendar with one event ──────────────────────────────
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
  "name": "Feed Contract"
}
HTTP 201
[Captures]
cal_id: jsonpath "$.id"
cal_token: jsonpath "$.token"
feed_url: jsonpath "$.subscribe_url"

POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "summary": "Team meeting",
  "dtstart": "2026-09-11T09:00:00Z",
  "dtend": "2026-09-11T09:30:00Z"
}
HTTP 201
[Captures]
event_uid: jsonpath "$.uid"

# ── The feed answers with iCalendar and cache headers ─────────────
GET {{feed_url}}
HTTP 200
[Asserts]
header "Content-Type" contains "text/calendar"
header "Cache-Control" contains "max-age"
body contains "BEGIN:VCALENDAR"
body contains "VERSION:2.0"
body contains "END:VCALENDAR"
body contains "SUMMARY:Team meeting"
# the UID line carries the bare server UUID, no product suffix (RFC 7986)
body contains "UID:{{event_uid}}"
body not contains "@calfeed"
body split "BEGIN:VEVENT" count == 2

# ── An unknown feed token is not found ────────────────────────────
GET {{base}}/cal/nonexistenttokenthatislongenough1234567890.ics
HTTP 404

# ── The short calendar id does not work as a feed token ──────────
GET {{base}}/cal/{{cal_id}}.ics
HTTP 404

# ── After deleting the event the feed is empty but valid ─────────
DELETE {{base}}/events/{{event_uid}}
Authorization: Bearer {{cal_token}}
HTTP 200

GET {{feed_url}}
HTTP 200
[Asserts]
body contains "BEGIN:VCALENDAR"
body not contains "BEGIN:VEVENT"
