# Blackbox contract test: feed privacy — token rotation and Basic authentication.
# Variables: base, admin_token

# ── Set up a calendar to protect ──────────────────────────────────
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
  "name": "Private"
}
HTTP 201
[Captures]
cal_id: jsonpath "$.id"
cal_token: jsonpath "$.token"
old_feed: jsonpath "$.subscribe_url"

# ── The feed is reachable before rotation ─────────────────────────
GET {{old_feed}}
HTTP 200

# ── Rotation needs a valid calendar token ─────────────────────────
POST {{base}}/calendars/{{cal_id}}/rotate-feed
Authorization: Bearer wrong-token
HTTP 401

# ── Rotate the feed token ─────────────────────────────────────────
POST {{base}}/calendars/{{cal_id}}/rotate-feed
Authorization: Bearer {{cal_token}}
HTTP 200
[Asserts]
jsonpath "$.rotated" == true
jsonpath "$.subscribe_url" matches /\/cal\/[\w-]{32,}\.ics$/
[Captures]
new_feed: jsonpath "$.subscribe_url"

# ── The old URL is dead, the new one works ────────────────────────
GET {{old_feed}}
HTTP 404

GET {{new_feed}}
HTTP 200

# ── Enabling a password needs the calendar token ─────────────────
PUT {{base}}/calendars/{{cal_id}}/feed-password
Authorization: Bearer wrong-token
{
  "password": "s3cret"
}
HTTP 401

# ── Enable Basic authentication on the feed ───────────────────────
PUT {{base}}/calendars/{{cal_id}}/feed-password
Authorization: Bearer {{cal_token}}
{
  "password": "s3cret"
}
HTTP 200
[Asserts]
jsonpath "$.protected" == true

# ── Without credentials the feed challenges the client ────────────
GET {{new_feed}}
HTTP 401
[Asserts]
header "WWW-Authenticate" contains "Basic"

# ── A wrong password stays unauthorized ───────────────────────────
GET {{new_feed}}
[BasicAuth]
user: wrong
HTTP 401

# ── The correct password unlocks the feed ─────────────────────────
GET {{new_feed}}
[BasicAuth]
user: s3cret
HTTP 200
[Asserts]
body contains "BEGIN:VCALENDAR"

# ── Rotating a protected feed keeps the password requirement ─────
POST {{base}}/calendars/{{cal_id}}/rotate-feed
Authorization: Bearer {{cal_token}}
HTTP 200
[Captures]
rotated_feed: jsonpath "$.subscribe_url"

# ── The pre-rotation URL is dead ──────────────────────────────────
GET {{new_feed}}
HTTP 404

# ── The rotated URL still challenges without credentials ─────────
GET {{rotated_feed}}
HTTP 401
[Asserts]
header "WWW-Authenticate" contains "Basic"

# ── The rotated URL still accepts the password ────────────────────
GET {{rotated_feed}}
[BasicAuth]
user: s3cret
HTTP 200

# ── Removing the password makes the feed open again ───────────────
PUT {{base}}/calendars/{{cal_id}}/feed-password
Authorization: Bearer {{cal_token}}
{
  "password": null
}
HTTP 200
[Asserts]
jsonpath "$.protected" == false

GET {{rotated_feed}}
HTTP 200

# ── An empty password also removes protection ────────────────────
PUT {{base}}/calendars/{{cal_id}}/feed-password
Authorization: Bearer {{cal_token}}
{
  "password": "temporary"
}
HTTP 200
[Asserts]
jsonpath "$.protected" == true

PUT {{base}}/calendars/{{cal_id}}/feed-password
Authorization: Bearer {{cal_token}}
{
  "password": ""
}
HTTP 200
[Asserts]
jsonpath "$.protected" == false

GET {{rotated_feed}}
HTTP 200
