# Blackbox contract test: iCal escaping, folding, UTF-8, and optional dtend (GAP B).
# Variables: base, admin_token

# ── Create a calendar for iCal rendering checks ──────────────────
POST {{base}}/calendars
Authorization: Bearer {{admin_token}}
{
  "name": "iCal Checks"
}
HTTP 201
[Captures]
cal_token: jsonpath "$.token"
feed_url: jsonpath "$.subscribe_url"

# ── Special characters in summary must be escaped ────────────────
POST {{base}}/events
Authorization: Bearer {{cal_token}}
{
  "uid": "special",
  "summary": "a, b; c \\ d",
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

# ── The feed renders all of them correctly ───────────────────────
GET {{feed_url}}
HTTP 200
[Asserts]
header "Content-Type" contains "text/calendar"
# escaping: comma, semicolon, backslash all backslash-escaped
body contains "SUMMARY:a\\, b\\; c \\\\ d"
# UTF-8 preserved
body contains "Grüße"
body contains "🎉"
# dtend event has DTSTART but the block has no DTEND for it
body contains "DTSTART:20260916T090000Z"
# long summary text survives (folded lines rejoin around a CRLF + space)
body contains "deliberately very long summary"
# feed stays structurally valid with all four events
body contains "BEGIN:VCALENDAR"
body contains "END:VCALENDAR"
body split "BEGIN:VEVENT" count == 5

# ── DTEND only appears for events that set it (none here) ─────────
GET {{feed_url}}
HTTP 200
[Asserts]
body not contains "DTEND:"
