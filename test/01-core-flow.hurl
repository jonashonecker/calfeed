# Blackbox contract test: calendar creation, event push, feed retrieval.
# Language-independent — talks to the server only over HTTP. Survives rewrites.
#
# Requires two variables (pass with --variable):
#   base       e.g. http://localhost:8787
#   admin_token   the CALFEED_ADMIN_TOKEN the server runs with

# ── Creating a calendar requires the admin token ──────────────────
POST {{base}}/calendars
{
  "name": "Contract Test"
}
HTTP 401

# ── With the admin token, creation succeeds ───────────────────────
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
  "name": "Contract Test"
}
HTTP 201
[Asserts]
jsonpath "$.id" exists
jsonpath "$.token" exists
jsonpath "$.subscribe_url" matches /\/cal\/[\w-]+\.ics$/
# feed token in the URL is long and unguessable, not the short id
jsonpath "$.subscribe_url" matches /\/cal\/[\w-]{32,}\.ics$/
[Captures]
cal_id: jsonpath "$.id"
cal_token: jsonpath "$.token"
feed_url: jsonpath "$.subscribe_url"

# ── Missing name is rejected ──────────────────────────────────────
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
}
HTTP 400

# ── Pushing an event needs a valid calendar token ─────────────────
POST {{base}}/events
{
  "summary": "No token",
  "dtstart": "2026-09-11T09:00:00Z"
}
HTTP 401

# ── Push an event with the calendar token ─────────────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "meeting-1",
  "summary": "Team meeting",
  "dtstart": "2026-09-11T09:00:00Z",
  "dtend": "2026-09-11T09:30:00Z",
  "location": "Room A"
}
HTTP 201
[Asserts]
jsonpath "$.uid" == "meeting-1"
jsonpath "$.updated" == false

# ── Missing required fields are rejected ──────────────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "summary": "No start date"
}
HTTP 400

# ── Re-pushing the same uid updates in place (upsert) ─────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "meeting-1",
  "summary": "Team meeting (moved)",
  "dtstart": "2026-09-11T10:00:00Z"
}
HTTP 200
[Asserts]
jsonpath "$.updated" == true

# ── The feed returns valid iCalendar with the event ───────────────
GET {{feed_url}}
HTTP 200
[Asserts]
header "Content-Type" contains "text/calendar"
body contains "BEGIN:VCALENDAR"
body contains "VERSION:2.0"
body contains "END:VCALENDAR"
body contains "SUMMARY:Team meeting (moved)"
body contains "DTSTART:20260911T100000Z"
# upsert left exactly one event, not a duplicate
body split "BEGIN:VEVENT" count == 2

# ── Deleting an event ─────────────────────────────────────────────
DELETE {{base}}/events/meeting-1
Authorization: Bearer {{cal_token}}
HTTP 200
[Asserts]
jsonpath "$.deleted" == true

# ── Deleting a missing event reports not found ────────────────────
DELETE {{base}}/events/does-not-exist
Authorization: Bearer {{cal_token}}
HTTP 404

# ── After deletion the feed has no events ─────────────────────────
GET {{feed_url}}
HTTP 200
[Asserts]
body not contains "BEGIN:VEVENT"

# ── An unknown feed token is not found ────────────────────────────
GET {{base}}/cal/nonexistenttokenthatislongenough1234567890.ics
HTTP 404
