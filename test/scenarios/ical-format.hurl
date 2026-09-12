# Scenario test: iCal output quality — escaping, line folding, UTF-8,
# event ordering, and DTEND handling.
# Variables: base, admin_token

# ── Create a calendar; its name needs escaping in the feed ───────
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
  "name": "iCal Checks, v2; draft"
}
HTTP 201
[Captures]
cal_token: jsonpath "$.token"
feed_url: jsonpath "$.subscribe_url"

# ── Special characters in text fields must be escaped ────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "special",
  "summary": "a, b; c \\ d",
  "description": "line1\nline2, x",
  "location": "Room 1; Wing A",
  "dtstart": "2026-09-14T09:00:00Z"
}
HTTP 201

# ── UTF-8 umlauts and emoji in summary ───────────────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "utf8",
  "summary": "Grüße 🎉 Über",
  "dtstart": "2026-09-15T09:00:00Z"
}
HTTP 201

# ── Event with only dtstart (no dtend) ───────────────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "nodtend",
  "summary": "Open ended",
  "dtstart": "2026-09-16T09:00:00Z"
}
HTTP 201

# ── Event with a very long summary (>75 chars) ───────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "longsummary",
  "summary": "This is a deliberately very long summary line that exceeds seventy five octets so the iCal folding logic has to split it across multiple physical lines",
  "dtstart": "2026-09-17T09:00:00Z"
}
HTTP 201

# ── An event pushed last but starting first (ordering check) ─────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "earliest",
  "summary": "Pushed last starts first",
  "dtstart": "2026-09-13T09:00:00Z"
}
HTTP 201

# ── The feed renders all of them correctly ───────────────────────
# The Content-Type header contract lives in contract/feed.hurl; this file
# checks only the body.
GET {{feed_url}}
HTTP 200
[Asserts]
# calendar name: comma and semicolon escaped in X-WR-CALNAME
body contains "X-WR-CALNAME:iCal Checks\\, v2\\; draft"
# escaping: comma, semicolon, backslash all backslash-escaped
body contains "SUMMARY:a\\, b\\; c \\\\ d"
# description: newline becomes a literal \n, comma escaped
body contains "DESCRIPTION:line1\\nline2\\, x"
# location: semicolon escaped
body contains "LOCATION:Room 1\\; Wing A"
# UTF-8 preserved
body contains "Grüße"
body contains "🎉"
# dtend event has DTSTART but the block has no DTEND for it
body contains "DTSTART:20260916T090000Z"
# long summary text survives (folded lines rejoin around a CRLF + space)
body contains "deliberately very long summary"
# events come sorted by dtstart, not by push order
body matches /DTSTART:20260913T090000Z[\s\S]*DTSTART:20260914T090000Z/
# feed stays structurally valid with all five events
body contains "BEGIN:VCALENDAR"
body contains "END:VCALENDAR"
body split "BEGIN:VEVENT" count == 6

# ── DTEND only appears for events that set it (none so far) ──────
GET {{feed_url}}
HTTP 200
[Asserts]
body not contains "DTEND:"

# ── An event with dtend renders a DTEND line ─────────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "withend",
  "summary": "Has an end",
  "dtstart": "2026-09-18T09:00:00Z",
  "dtend": "2026-09-18T10:00:00Z"
}
HTTP 201

GET {{feed_url}}
HTTP 200
[Asserts]
body contains "DTSTART:20260918T090000Z"
body contains "DTEND:20260918T100000Z"
body split "BEGIN:VEVENT" count == 7
