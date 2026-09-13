# Contract test for POST /calendars: authentication, validation, and the
# response shape every client relies on.
#
# Requires two variables (pass with --variable):
#   base         e.g. http://localhost:8787
#   admin_token  the CALFEED_ADMIN_TOKEN the server runs with

# ── Without a token, creation is unauthorized ─────────────────────
POST {{base}}/calendars
{
  "name": "Calendars Contract"
}
HTTP 401

# ── A wrong token is unauthorized ─────────────────────────────────
POST {{base}}/calendars
Authorization: Bearer wrong-token
{
  "name": "Calendars Contract"
}
HTTP 401

# ── With the admin token, creation returns the full shape ─────────
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
  "name": "Calendars Contract"
}
HTTP 201
[Asserts]
jsonpath "$.id" exists
jsonpath "$.name" == "Calendars Contract"
# the calendar token is usable plaintext, not a hash placeholder
jsonpath "$.token" matches /^[A-Za-z0-9_-]+$/
# the feed token in the URL is long and unguessable, not the short id
jsonpath "$.subscribe_url" matches /\/cal\/[\w-]{32,}\.ics$/
jsonpath "$.webcal_url" startsWith "webcal://"
[Captures]
cal_token: jsonpath "$.token"

# ── Missing name is rejected ──────────────────────────────────────
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
}
HTTP 400

# ── A non-string name is rejected ─────────────────────────────────
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
  "name": {}
}
HTTP 400

# ── A JSON-null body is a client error, not a crash ──────────────
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
```
null
```
HTTP 400

# ── A calendar token cannot create calendars ─────────────────────
POST {{base}}/calendars
Authorization: Bearer {{cal_token}}
{
  "name": "Wrong token class"
}
HTTP 401

# ── The collection itself has no DELETE, only /calendars/:id ─────
DELETE {{base}}/calendars
Authorization: Bearer {{cal_token}}
HTTP 404

# ── Deleting a calendar needs the admin token ─────────────────────
DELETE {{base}}/calendars/some-id
HTTP 401

# ── A calendar token cannot delete calendars ─────────────────────
DELETE {{base}}/calendars/some-id
Authorization: Bearer {{cal_token}}
HTTP 401
[Asserts]
jsonpath "$.error" == "admin token required"

# ── Deleting an unknown calendar is not found ─────────────────────
DELETE {{base}}/calendars/ffffffff
Authorization: Bearer {{admin_token}}
HTTP 404
[Asserts]
jsonpath "$.deleted" == false

# ── Deleting a calendar kills its feed and only its own events ───
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
  "name": "Doomed"
}
HTTP 201
[Captures]
doomed_id: jsonpath "$.id"
doomed_token: jsonpath "$.token"
doomed_feed: jsonpath "$.subscribe_url"

POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
  "name": "Survivor"
}
HTTP 201
[Captures]
survivor_token: jsonpath "$.token"
survivor_feed: jsonpath "$.subscribe_url"

POST {{base}}/events
Authorization: Bearer {{doomed_token}}
{
  "summary": "Doomed event",
  "dtstart": "2026-09-14T09:00:00Z"
}
HTTP 201

POST {{base}}/events
Authorization: Bearer {{survivor_token}}
{
  "summary": "Survivor event",
  "dtstart": "2026-09-14T10:00:00Z"
}
HTTP 201

DELETE {{base}}/calendars/{{doomed_id}}
Authorization: Bearer {{admin_token}}
HTTP 200
[Asserts]
jsonpath "$.deleted" == true

# ── The deleted calendar's feed is gone ───────────────────────────
GET {{doomed_feed}}
HTTP 404

# ── The other calendar keeps its feed and its events ─────────────
GET {{survivor_feed}}
HTTP 200
[Asserts]
body contains "SUMMARY:Survivor event"
body split "BEGIN:VEVENT" count == 2

# ── Deleting the same calendar twice reports not found ───────────
DELETE {{base}}/calendars/{{doomed_id}}
Authorization: Bearer {{admin_token}}
HTTP 404
[Asserts]
jsonpath "$.deleted" == false
