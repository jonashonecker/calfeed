# Blackbox contract test: cross-tenant isolation (GAP A).
# Two calendars A and B, each with its own token. B must not be able to touch
# A's events, feed token, or feed password. Same uid in both calendars is fine.
# Variables: base, admin_token

# ── Create calendar A ─────────────────────────────────────────────
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
  "name": "Tenant A"
}
HTTP 201
[Captures]
a_id: jsonpath "$.id"
a_token: jsonpath "$.token"
a_feed: jsonpath "$.subscribe_url"

# ── Create calendar B ─────────────────────────────────────────────
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
  "name": "Tenant B"
}
HTTP 201
[Captures]
b_id: jsonpath "$.id"
b_token: jsonpath "$.token"
b_feed: jsonpath "$.subscribe_url"

# ── A pushes an event uid=secret ──────────────────────────────────
POST {{base}}/events
Authorization: Bearer {{a_token}}
{
  "uid": "secret",
  "summary": "A private meeting",
  "dtstart": "2026-09-12T09:00:00Z"
}
HTTP 201

# ── B tries to delete A's event by uid → not found for B ─────────
DELETE {{base}}/events/secret
Authorization: Bearer {{b_token}}
HTTP 404
[Asserts]
jsonpath "$.deleted" == false

# ── A's feed still has the event ──────────────────────────────────
GET {{a_feed}}
HTTP 200
[Asserts]
body contains "SUMMARY:A private meeting"
body split "BEGIN:VEVENT" count == 2

# ── B pushes its own event with the same uid=secret ──────────────
POST {{base}}/events
Authorization: Bearer {{b_token}}
{
  "uid": "secret",
  "summary": "B own meeting",
  "dtstart": "2026-09-13T09:00:00Z"
}
HTTP 201
[Asserts]
jsonpath "$.updated" == false

# ── B's feed shows only B's event ─────────────────────────────────
GET {{b_feed}}
HTTP 200
[Asserts]
body contains "SUMMARY:B own meeting"
body not contains "SUMMARY:A private meeting"
body split "BEGIN:VEVENT" count == 2

# ── A's feed is unchanged, still A's own event ───────────────────
GET {{a_feed}}
HTTP 200
[Asserts]
body contains "SUMMARY:A private meeting"
body not contains "SUMMARY:B own meeting"
body split "BEGIN:VEVENT" count == 2

# ── B cannot rotate A's feed token ────────────────────────────────
POST {{base}}/calendars/{{a_id}}/rotate-feed
Authorization: Bearer {{b_token}}
HTTP 401

# ── A's feed URL is unchanged after B's failed rotate ────────────
GET {{a_feed}}
HTTP 200
[Asserts]
body contains "SUMMARY:A private meeting"

# ── B cannot set a password on A's feed ──────────────────────────
PUT {{base}}/calendars/{{a_id}}/feed-password
Authorization: Bearer {{b_token}}
{
  "password": "hijack"
}
HTTP 401

# ── A's feed is still open (no password got set by B) ────────────
GET {{a_feed}}
HTTP 200
[Asserts]
body contains "BEGIN:VCALENDAR"
