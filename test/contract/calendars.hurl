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

# ── There is no DELETE on /calendars ──────────────────────────────
DELETE {{base}}/calendars
Authorization: Bearer {{cal_token}}
HTTP 404
