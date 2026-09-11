# Contract test for PUT /calendars/:id/feed-password: authentication and
# the password field's type rules. The full protect/challenge/remove
# lifecycle lives in scenarios/feed-privacy.hurl.
# Variables: base, admin_token

# ── Setup: one calendar ───────────────────────────────────────────
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
  "name": "Password Contract"
}
HTTP 201
[Captures]
cal_id: jsonpath "$.id"
cal_token: jsonpath "$.token"
feed_url: jsonpath "$.subscribe_url"

# ── Setting a password needs the owning calendar token ───────────
PUT {{base}}/calendars/{{cal_id}}/feed-password
{
  "password": "s3cret"
}
HTTP 401

# ── A string password protects the feed ───────────────────────────
PUT {{base}}/calendars/{{cal_id}}/feed-password
Authorization: Bearer {{cal_token}}
{
  "password": "s3cret"
}
HTTP 200
[Asserts]
jsonpath "$.protected" == true

GET {{feed_url}}
HTTP 401

# ── Non-string passwords are rejected, they must not unprotect ───
PUT {{base}}/calendars/{{cal_id}}/feed-password
Authorization: Bearer {{cal_token}}
{
  "password": 0
}
HTTP 400

PUT {{base}}/calendars/{{cal_id}}/feed-password
Authorization: Bearer {{cal_token}}
{
  "password": false
}
HTTP 400

# ── An overlong password is rejected ──────────────────────────────
PUT {{base}}/calendars/{{cal_id}}/feed-password
Authorization: Bearer {{cal_token}}
{
  "password": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
HTTP 400

# ── The feed is still protected after the rejected attempts ──────
GET {{feed_url}}
HTTP 401
[Asserts]
header "WWW-Authenticate" contains "Basic"

# ── null removes protection ───────────────────────────────────────
PUT {{base}}/calendars/{{cal_id}}/feed-password
Authorization: Bearer {{cal_token}}
{
  "password": null
}
HTTP 200
[Asserts]
jsonpath "$.protected" == false

GET {{feed_url}}
HTTP 200
