/**
 * iCalendar (RFC 5545) Generator. Bewusst minimal, aber standardkonform:
 * - CRLF Zeilenenden (Pflicht)
 * - Line-Folding bei >75 Oktetten
 * - Escaping von , ; \ und Newlines in TEXT-Werten
 * - VTIMEZONE weggelassen: wir nutzen UTC (Z-Suffix), das ist eindeutig und iOS-kompatibel
 */

function escapeText(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// RFC 5545: Zeilen dürfen max 75 Oktette lang sein, dann "folding" mit CRLF + Space.
function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let start = 0;
  // erste Zeile 75, Folgezeilen 74 (führendes Space zählt)
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // nicht mitten in ein Multibyte-Zeichen schneiden
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74;
  }
  return parts.join('\r\n ');
}

// Datum → iCal UTC-Format: 20260910T170000Z
function toICalDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) throw new Error(`invalid date: ${iso}`);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
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
    lines.push(`UID:${ev.uid}@calfeed`);
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
