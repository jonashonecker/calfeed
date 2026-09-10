import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildICal } from '../src/ical.mjs';
import { SqliteStore } from '../src/store.mjs';
import { createApp } from '../src/server.mjs';

// ── iCal-Generator ────────────────────────────────────────────────
test('buildICal: valides Grundgerüst mit CRLF', () => {
  const ics = buildICal({ name: 'Test' }, []);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /VERSION:2\.0\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  // Alle Zeilenenden müssen CRLF sein
  assert.equal(ics.includes('\n'), true);
  assert.equal(/[^\r]\n/.test(ics), false, 'jedes \\n muss ein \\r davor haben');
});

test('buildICal: Event mit UTC-Datum und Escaping', () => {
  const ics = buildICal({ name: 'C' }, [{
    uid: 'abc', summary: 'Meeting; wichtig, sehr', dtstart: '2026-09-10T17:00:00Z',
    dtend: '2026-09-10T17:30:00Z', location: 'Büro',
  }]);
  assert.match(ics, /DTSTART:20260910T170000Z/);
  assert.match(ics, /DTEND:20260910T173000Z/);
  assert.match(ics, /SUMMARY:Meeting\\; wichtig\\, sehr/); // ; und , escaped
  assert.match(ics, /UID:abc@calfeed/);
});

test('buildICal: Umlaute in SUMMARY bleiben erhalten', () => {
  const ics = buildICal({ name: 'C' }, [{
    uid: 'x', summary: 'Über Ölmühlen', dtstart: '2026-09-10T10:00:00Z',
  }]);
  assert.match(ics, /SUMMARY:Über Ölmühlen/);
});

test('buildICal: lange SUMMARY wird gefaltet (RFC 5545, <=75 Oktette)', () => {
  const long = 'A'.repeat(200);
  const ics = buildICal({ name: 'C' }, [{ uid: 'x', summary: long, dtstart: '2026-09-10T10:00:00Z' }]);
  const rawLines = ics.split('\r\n');
  for (const line of rawLines) {
    assert.ok(Buffer.from(line, 'utf8').length <= 75, `Zeile zu lang: ${line.length}`);
  }
});

// ── Storage ───────────────────────────────────────────────────────
function memStore() { return new SqliteStore(':memory:'); }

test('store: Kalender anlegen liefert id + token', () => {
  const s = memStore();
  const cal = s.createCalendar('Fokus');
  assert.ok(cal.id.length >= 6);
  assert.ok(cal.token.length >= 20);
  assert.equal(s.getCalendar(cal.id).name, 'Fokus');
});

test('store: findCalendarByToken', () => {
  const s = memStore();
  const cal = s.createCalendar('X');
  assert.equal(s.findCalendarByToken(cal.token).id, cal.id);
  assert.equal(s.findCalendarByToken('falsch'), null);
});

test('store: addEvent + listEvents', () => {
  const s = memStore();
  const cal = s.createCalendar('X');
  s.addEvent(cal.id, { uid: 'e1', summary: 'A', dtstart: '2026-09-10T10:00:00Z' });
  const evs = s.listEvents(cal.id);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].summary, 'A');
});

test('store: addEvent ist idempotent per uid (upsert)', () => {
  const s = memStore();
  const cal = s.createCalendar('X');
  s.addEvent(cal.id, { uid: 'same', summary: 'v1', dtstart: '2026-09-10T10:00:00Z' });
  const r = s.addEvent(cal.id, { uid: 'same', summary: 'v2', dtstart: '2026-09-10T11:00:00Z' });
  assert.equal(r.updated, true);
  const evs = s.listEvents(cal.id);
  assert.equal(evs.length, 1, 'kein Duplikat');
  assert.equal(evs[0].summary, 'v2', 'überschrieben');
});

// ── HTTP end-to-end ───────────────────────────────────────────────
function listen(app) {
  return new Promise(res => { const srv = app.listen(0, () => res(srv)); });
}
async function req(base, method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';
  const r = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
}

test('http: voller Flow — Kalender anlegen, Event pushen, .ics abrufen', async () => {
  process.env.CALFEED_ADMIN_TOKEN = 'admin123';
  const app = createApp(memStore());
  const srv = await listen(app);
  const base = `http://localhost:${srv.address().port}`;

  // 1. ohne Admin-Token → 401
  let r = await req(base, 'POST', '/calendars', { body: { name: 'Fokus' } });
  assert.equal(r.status, 401);

  // 2. mit Admin-Token → 201 + token + subscribe_url
  r = await req(base, 'POST', '/calendars', { token: 'admin123', body: { name: 'Fokus' } });
  assert.equal(r.status, 201);
  const { id, token, subscribe_url } = r.body;
  assert.ok(subscribe_url.endsWith(`/cal/${id}.ics`));

  // 3. Event mit Kalender-Token pushen → 201
  r = await req(base, 'POST', '/events', {
    token, body: { uid: 'linkedin', summary: 'LinkedIn', dtstart: '2026-09-10T17:00:00Z', dtend: '2026-09-10T17:30:00Z' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.updated, false);

  // 4. Event ohne Token → 401
  r = await req(base, 'POST', '/events', { body: { summary: 'X', dtstart: '2026-09-10T10:00:00Z' } });
  assert.equal(r.status, 401);

  // 5. .ics öffentlich abrufen → enthält das Event
  const ics = await fetch(`${base}/cal/${id}.ics`);
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get('content-type'), /text\/calendar/);
  const body = await ics.text();
  assert.match(body, /SUMMARY:LinkedIn/);
  assert.match(body, /DTSTART:20260910T170000Z/);

  // 6. Re-push selber uid → 200 updated, kein Duplikat
  r = await req(base, 'POST', '/events', {
    token, body: { uid: 'linkedin', summary: 'LinkedIn (updated)', dtstart: '2026-09-10T18:00:00Z' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.updated, true);

  srv.close();
});

test('http: unbekannter Kalender → 404', async () => {
  const app = createApp(memStore());
  const srv = await listen(app);
  const base = `http://localhost:${srv.address().port}`;
  const r = await fetch(`${base}/cal/doesnotexist.ics`);
  assert.equal(r.status, 404);
  srv.close();
});
