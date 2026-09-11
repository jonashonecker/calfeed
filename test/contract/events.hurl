# Contract test for POST /events and DELETE /events/:uid: authentication,
# validation (uid allowlist, dates, JSON, body size), upsert semantics,
# and deletion.
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

# ── A uid with CRLF must not inject iCal lines ────────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "x\r\nSUMMARY:injected\r\nBEGIN:VALARM",
  "summary": "Legit",
  "dtstart": "2026-09-11T09:00:00Z"
}
HTTP 400
[Asserts]
jsonpath "$.error" exists

# ── Other invalid uid characters are rejected too ────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "bad uid with spaces",
  "summary": "Legit",
  "dtstart": "2026-09-11T09:00:00Z"
}
HTTP 400

# ── A clean uid with allowed characters works ─────────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "ok-uid_1.2@host",
  "summary": "Fine",
  "dtstart": "2026-09-11T09:00:00Z"
}
HTTP 201

# ── The feed carries no injected SUMMARY/VALARM lines ─────────────
GET {{feed_url}}
HTTP 200
[Asserts]
body not contains "SUMMARY:injected"
body not contains "BEGIN:VALARM"
body contains "SUMMARY:Fine"
# exactly one event survived (the clean one)
body split "BEGIN:VEVENT" count == 2

# ── Pushing without a uid lets the server generate one ───────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "summary": "No uid supplied",
  "dtstart": "2026-09-11T12:00:00Z"
}
HTTP 201
[Asserts]
jsonpath "$.uid" matches /^[A-Za-z0-9-]{8,}$/
jsonpath "$.updated" == false
[Captures]
generated_uid: jsonpath "$.uid"

# ── The generated uid works for deletion ─────────────────────────
DELETE {{base}}/events/{{generated_uid}}
Authorization: Bearer {{cal_token}}
HTTP 200
[Asserts]
jsonpath "$.deleted" == true

# ── An invalid dtstart is rejected at write time ─────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "baddate",
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
  "uid": "baddtend",
  "summary": "Broken end",
  "dtstart": "2026-09-11T09:00:00Z",
  "dtend": "also-not-a-date"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "invalid dtend"

# ── The feed still renders (no poisoned date got in) ─────────────
GET {{feed_url}}
HTTP 200
[Asserts]
body contains "BEGIN:VCALENDAR"

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
  "uid": "normal-size",
  "summary": "Under the limit",
  "dtstart": "2026-09-11T11:00:00Z"
}
HTTP 201

# ── Re-pushing the same uid updates in place (upsert) ─────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "upsert-1",
  "summary": "First version",
  "dtstart": "2026-09-11T10:00:00Z"
}
HTTP 201
[Asserts]
jsonpath "$.updated" == false

POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "upsert-1",
  "summary": "First version (moved)",
  "dtstart": "2026-09-11T13:00:00Z"
}
HTTP 200
[Asserts]
jsonpath "$.updated" == true

# ── The upsert left one updated event, not a duplicate ────────────
GET {{feed_url}}
HTTP 200
[Asserts]
body contains "SUMMARY:First version (moved)"
body contains "DTSTART:20260911T130000Z"
# three events total: the clean uid, normal-size, and upsert-1
body split "BEGIN:VEVENT" count == 4

# ── Deleting an event ─────────────────────────────────────────────
DELETE {{base}}/events/upsert-1
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

# ── A JSON-null body is a client error, not a crash ──────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
```
null
```
HTTP 400

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

# ── A non-string uid is rejected, not silently replaced ──────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": 0,
  "summary": "Numeric uid",
  "dtstart": "2026-09-11T09:00:00Z"
}
HTTP 400
[Asserts]
jsonpath "$.error" == "invalid uid"

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
# two events remain: the clean uid and normal-size
body split "BEGIN:VEVENT" count == 3

# ── An explicit offset is accepted and canonicalized to UTC ──────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "tzoffset",
  "summary": "Offset input",
  "dtstart": "2026-09-19T11:00:00+02:00"
}
HTTP 201

GET {{feed_url}}
HTTP 200
[Asserts]
body contains "DTSTART:20260919T090000Z"

DELETE {{base}}/events/tzoffset
Authorization: Bearer {{cal_token}}
HTTP 200

# ── Malformed percent-encoding in the uid path is a client error ─
DELETE {{base}}/events/%zz
Authorization: Bearer {{cal_token}}
HTTP 400
