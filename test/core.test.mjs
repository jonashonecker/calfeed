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
  assert.match(subscribe_url, /\/cal\/[\w-]+\.ics$/);
  // Feed-Token ist lang und NICHT die kurze id (Stufe-2-Privacy)
  const feedToken = subscribe_url.match(/\/cal\/([\w-]+)\.ics$/)[1];
  assert.ok(feedToken.length >= 32, 'feed token should be long/unguessable');
  assert.notEqual(feedToken, id);

  // 3. Event mit Kalender-Token pushen → 201
  r = await req(base, 'POST', '/events', {
    token, body: { uid: 'linkedin', summary: 'LinkedIn', dtstart: '2026-09-10T17:00:00Z', dtend: '2026-09-10T17:30:00Z' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.updated, false);

  // 4. Event ohne Token → 401
  r = await req(base, 'POST', '/events', { body: { summary: 'X', dtstart: '2026-09-10T10:00:00Z' } });
  assert.equal(r.status, 401);

  // 5. .ics über feed_token abrufen → enthält das Event
  const ics = await fetch(`${base}/cal/${feedToken}.ics`);
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

// ── Privacy: Feed-Token-Rotation (Stufe 2) ────────────────────────
test('store: rotateFeedToken macht altes Token ungültig', () => {
  const s = memStore();
  const cal = s.createCalendar('X');
  const oldToken = cal.feed_token;
  assert.ok(s.getCalendarByFeedToken(oldToken), 'altes Token gültig vor Rotation');
  const newToken = s.rotateFeedToken(cal.id);
  assert.notEqual(newToken, oldToken);
  assert.equal(s.getCalendarByFeedToken(oldToken), null, 'altes Token tot nach Rotation');
  assert.ok(s.getCalendarByFeedToken(newToken), 'neues Token gültig');
});

test('http: rotate-feed — alte Abo-URL wird 404, neue funktioniert', async () => {
  process.env.CALFEED_ADMIN_TOKEN = 'admin123';
  const app = createApp(memStore());
  const srv = await listen(app);
  const base = `http://localhost:${srv.address().port}`;

  let r = await req(base, 'POST', '/calendars', { token: 'admin123', body: { name: 'P' } });
  const { id, token, subscribe_url } = r.body;
  const oldFeed = subscribe_url.match(/\/cal\/([\w-]+)\.ics$/)[1];

  // alte URL geht
  assert.equal((await fetch(`${base}/cal/${oldFeed}.ics`)).status, 200);

  // rotieren mit Kalender-Token
  r = await req(base, 'POST', `/calendars/${id}/rotate-feed`, { token });
  assert.equal(r.status, 200);
  const newFeed = r.body.subscribe_url.match(/\/cal\/([\w-]+)\.ics$/)[1];
  assert.notEqual(newFeed, oldFeed);

  // alte URL jetzt tot, neue lebt
  assert.equal((await fetch(`${base}/cal/${oldFeed}.ics`)).status, 404);
  assert.equal((await fetch(`${base}/cal/${newFeed}.ics`)).status, 200);

  // rotate mit falschem Token → 401
  r = await req(base, 'POST', `/calendars/${id}/rotate-feed`, { token: 'falsch' });
  assert.equal(r.status, 401);

  srv.close();
});

// ── Privacy: HTTP Basic Auth (Stufe 3) ────────────────────────────
test('http: feed-password aktiviert Basic Auth auf dem Feed', async () => {
  process.env.CALFEED_ADMIN_TOKEN = 'admin123';
  const app = createApp(memStore());
  const srv = await listen(app);
  const base = `http://localhost:${srv.address().port}`;

  let r = await req(base, 'POST', '/calendars', { token: 'admin123', body: { name: 'Secret' } });
  const { id, token, subscribe_url } = r.body;
  const feed = subscribe_url.match(/\/cal\/([\w-]+)\.ics$/)[1];

  // vor Passwort: öffentlich abrufbar
  assert.equal((await fetch(`${base}/cal/${feed}.ics`)).status, 200);

  // Passwort setzen (Kalender-Token)
  r = await req(base, 'PUT', `/calendars/${id}/feed-password`, { token, body: { password: 'geheim' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.protected, true);

  // ohne Credentials → 401 + WWW-Authenticate
  let resp = await fetch(`${base}/cal/${feed}.ics`);
  assert.equal(resp.status, 401);
  assert.match(resp.headers.get('www-authenticate') || '', /Basic/);

  // mit falschem Passwort → 401
  const wrong = 'Basic ' + Buffer.from('x:falsch').toString('base64');
  resp = await fetch(`${base}/cal/${feed}.ics`, { headers: { authorization: wrong } });
  assert.equal(resp.status, 401);

  // mit richtigem Passwort → 200
  const ok = 'Basic ' + Buffer.from('user:geheim').toString('base64');
  resp = await fetch(`${base}/cal/${feed}.ics`, { headers: { authorization: ok } });
  assert.equal(resp.status, 200);
  assert.match(await resp.text(), /BEGIN:VCALENDAR/);

  // Passwort wieder entfernen → wieder öffentlich
  r = await req(base, 'PUT', `/calendars/${id}/feed-password`, { token, body: { password: null } });
  assert.equal(r.body.protected, false);
  assert.equal((await fetch(`${base}/cal/${feed}.ics`)).status, 200);

  srv.close();
});
