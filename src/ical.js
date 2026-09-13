/**
 * iCalendar (RFC 5545) generator. Deliberately minimal but standards-conformant:
 * - CRLF line endings (mandatory)
 * - line folding at >75 octets
 * - escaping of , ; \ and newlines in TEXT values
 * - VTIMEZONE omitted: UTC (Z suffix) is unambiguous and iOS-compatible
 */

function escapeText(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// RFC 5545 caps lines at 75 octets; longer lines "fold" with CRLF + space.
function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let start = 0;
  // first line 75 octets, continuation lines 74 (the leading space counts)
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // never cut inside a multibyte character
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74;
  }
  return parts.join('\r\n ');
}

// Date → iCal UTC format: 20260910T170000Z
function toICalDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) throw new Error(`invalid date: ${iso}`);
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

export function buildICal(calendar, events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//calfeed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendar.name)}`,
  ];

  const stamp = toICalDate(new Date().toISOString());

  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    // Bare server UUID, no product suffix (RFC 7986 discourages embedding
    // host or product names). Defense in depth: the generator owns the
    // format and never emits control characters onto the UID line (rows
    // from old databases bypass today's server-side generation).
    lines.push(`UID:${String(ev.uid).replace(/[^A-Za-z0-9._@-]/g, '')}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${toICalDate(ev.dtstart)}`);
    if (ev.dtend) lines.push(`DTEND:${toICalDate(ev.dtend)}`);
    lines.push(`SUMMARY:${escapeText(ev.summary)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
