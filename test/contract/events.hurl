# Contract test for POST /events and DELETE /events/:uid: authentication,
# validation (field types, dates, JSON, body size), the server-assigned
# uid, and deletion.
# Variables: base, admin_token

# ── Setup: one calendar ───────────────────────────────────────────
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
  "name": "Events Contract"
}
HTTP 201
[Captures]
cal_token: jsonpath "$.token"
feed_url: jsonpath "$.subscribe_url"

# ── Pushing an event needs a valid calendar token ─────────────────
POST {{base}}/events
{
  "summary": "No token",
  "dtstart": "2026-09-11T09:00:00Z"
}
HTTP 401

# ── The admin token cannot push events ────────────────────────────
POST {{base}}/events
Authorization: Bearer {{admin_token}}
{
  "summary": "Wrong token class",
  "dtstart": "2026-09-11T09:00:00Z"
}
HTTP 401

# ── An empty Bearer is unauthorized ───────────────────────────────
POST {{base}}/events
Authorization: Bearer
{
  "summary": "No token value",
  "dtstart": "2026-09-11T09:00:00Z"
}
HTTP 401

# ── There is no GET on /events ────────────────────────────────────
GET {{base}}/events
HTTP 404

# ── summary and dtstart are required ──────────────────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "summary": "No start date"
}
HTTP 400

# ── Creating an event returns the server-assigned uid ────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "summary": "First event",
  "dtstart": "2026-09-11T09:00:00Z",
  "dtend": "2026-09-11T09:30:00Z"
}
HTTP 201
[Asserts]
# the uid is a server-generated UUID and the event's only identifier
jsonpath "$.uid" matches /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
jsonpath "$.id" not exists
jsonpath "$.updated" not exists
[Captures]
first_uid: jsonpath "$.uid"

# ── Clients cannot choose the uid ─────────────────────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "my-own-name",
  "summary": "Not allowed",
  "dtstart": "2026-09-11T09:00:00Z"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "uid is assigned by the server"

# ── Field types are enforced, not only presence ──────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "summary": true,
  "dtstart": "2026-09-11T09:00:00Z"
}
HTTP 400

POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "summary": "Typed fields",
  "description": 5,
  "dtstart": "2026-09-11T09:00:00Z"
}
HTTP 400

# ── A JSON-null body is a client error, not a crash ──────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
```
null
```
HTTP 400

# ── An invalid dtstart is rejected at write time ─────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "summary": "Broken date",
  "dtstart": "not-a-date"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "invalid dtstart"

# ── An invalid dtend is rejected too ──────────────────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "summary": "Broken end",
  "dtstart": "2026-09-11T09:00:00Z",
  "dtend": "also-not-a-date"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "invalid dtend"

# ── A numeric dtstart must not poison the feed ───────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "summary": "Numeric date",
  "dtstart": 1757577600000
}
HTTP 400
[Asserts]
jsonpath "$.error" == "invalid dtstart"

# ── Dates without an explicit timezone are rejected ──────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "summary": "No timezone",
  "dtstart": "2026-09-11T09:00:00"
}
HTTP 400

POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "summary": "Locale date",
  "dtstart": "Sep 10 2026"
}
HTTP 400

# ── The feed still renders, nothing slipped in ────────────────────
GET {{feed_url}}
HTTP 200
[Asserts]
body contains "BEGIN:VCALENDAR"
# only the one created event survived all rejected attempts
body split "BEGIN:VEVENT" count == 2

# ── An explicit offset is accepted and canonicalized to UTC ──────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "summary": "Offset input",
  "dtstart": "2026-09-19T11:00:00+02:00"
}
HTTP 201
[Captures]
offset_uid: jsonpath "$.uid"

GET {{feed_url}}
HTTP 200
[Asserts]
body contains "DTSTART:20260919T090000Z"

# ── Malformed JSON yields 400, not 500 ────────────────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
```
{kaputt
```
HTTP 400
[Asserts]
jsonpath "$.error" == "invalid JSON"

# ── An oversized body is refused with 413 ─────────────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
file,fixtures/big.json;
HTTP 413
[Asserts]
jsonpath "$.error" == "payload too large"

# ── A normal-sized body still works ───────────────────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "summary": "Under the limit",
  "dtstart": "2026-09-11T11:00:00Z"
}
HTTP 201

# ── PUT needs a valid calendar token ──────────────────────────────
PUT {{base}}/events/{{first_uid}}
{
  "summary": "No token",
  "dtstart": "2026-09-11T10:00:00Z"
}
HTTP 401

# ── PUT updates an existing event in place ────────────────────────
PUT {{base}}/events/{{first_uid}}
Authorization: Bearer {{cal_token}}
{
  "summary": "First event (moved)",
  "dtstart": "2026-09-11T10:00:00Z"
}
HTTP 200
[Asserts]
# the uid never changes across updates (RFC 5545)
jsonpath "$.uid" == "{{first_uid}}"

# ── The feed reflects the update, no duplicate ────────────────────
GET {{feed_url}}
HTTP 200
[Asserts]
body contains "SUMMARY:First event (moved)"
body contains "DTSTART:20260911T100000Z"
# three events: first (moved), offset input, under the limit
body split "BEGIN:VEVENT" count == 4

# ── PUT on an unknown uid is not found ────────────────────────────
PUT {{base}}/events/00000000-0000-0000-0000-000000000000
Authorization: Bearer {{cal_token}}
{
  "summary": "Ghost",
  "dtstart": "2026-09-11T10:00:00Z"
}
HTTP 404
[Asserts]
jsonpath "$.error" == "event not found"

# ── PUT validates the body like POST ──────────────────────────────
PUT {{base}}/events/{{first_uid}}
Authorization: Bearer {{cal_token}}
{
  "summary": "No start date"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "summary and dtstart required"

# ── PUT rejects a uid in the body too ─────────────────────────────
PUT {{base}}/events/{{first_uid}}
Authorization: Bearer {{cal_token}}
{
  "uid": "renamed",
  "summary": "Rename attempt",
  "dtstart": "2026-09-11T10:00:00Z"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "uid is assigned by the server"

# ── Malformed percent-encoding on PUT is a client error ──────────
PUT {{base}}/events/%zz
Authorization: Bearer {{cal_token}}
{
  "summary": "Broken path",
  "dtstart": "2026-09-11T10:00:00Z"
}
HTTP 400

# ── Deleting an event by its uid ──────────────────────────────────
DELETE {{base}}/events/{{offset_uid}}
Authorization: Bearer {{cal_token}}
HTTP 200
[Asserts]
jsonpath "$.deleted" == true

# ── Deleting a missing event reports not found ────────────────────
DELETE {{base}}/events/does-not-exist
Authorization: Bearer {{cal_token}}
HTTP 404
[Asserts]
jsonpath "$.deleted" == false

# ── Malformed percent-encoding in the uid path is a client error ─
DELETE {{base}}/events/%zz
Authorization: Bearer {{cal_token}}
HTTP 400
