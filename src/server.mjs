/**
 * calfeed HTTP-Server — der Kern.
 * Endpunkte:
 *   POST   /calendars                  {name}          → Kalender anlegen (Admin-Token)
 *   POST   /events                     {summary, ...}  → Event upsert (Kalender-Token)
 *   DELETE /events/:uid                                → Event löschen (Kalender-Token)
 *   POST   /calendars/:id/rotate-feed                  → Feed-Token neu (Kalender-Token)
 *   PUT    /calendars/:id/feed-password {password|null}→ Basic Auth setzen/löschen (Kalender-Token)
 *   GET    /cal/:feed_token.ics                        → Feed (öffentlich ODER Basic Auth)
 *
 * Feed-Privatsphäre:
 *   Stufe 2: langes feed_token in der URL, rotierbar.
 *   Stufe 3: optionales feed_password → Feed verlangt HTTP Basic Auth.
 */
import { createServer } from 'node:http';
import { timingSafeEqual, scryptSync } from 'node:crypto';
import { SqliteStore } from './store.mjs';
import { buildICal } from './ical.mjs';

// Maximale Body-Größe beim Einlesen (Schutz vor Memory-DoS).
const MAX_BODY_BYTES = 262144; // 256 KB

// uid-Whitelist: nur alphanumerisch plus - _ . @ — verhindert CRLF-Injection
// in die iCal-UID-Zeile.
const UID_RE = /^[A-Za-z0-9._@-]+$/;

// Fehler mit HTTP-Status, damit readJson-Fehler nicht im generischen 500 landen.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.httpStatus = status;
  }
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Prüft ein Klartext-Passwort gegen einen gespeicherten "salt:hash" (base64, scrypt).
function verifyFeedPassword(stored, candidate) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [saltB64, hashB64] = stored.split(':');
  let salt, expected;
  try {
    salt = Buffer.from(saltB64, 'base64');
    expected = Buffer.from(hashB64, 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(String(candidate), salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function createApp(store = new SqliteStore()) {
  const ADMIN_TOKEN = process.env.CALFEED_ADMIN_TOKEN || 'dev-admin-token';
  const BASE_URL = process.env.CALFEED_BASE_URL || 'http://localhost:8787';

  async function readJson(req) {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        // Über dem Limit: nichts mehr puffern, aber weiter lesen (verwerfen),
        // damit die Verbindung sauber drainiert und der Client die 413 lesen kann.
        tooLarge = true;
        chunks.length = 0;
        continue;
      }
      if (!tooLarge) chunks.push(c);
    }
    if (tooLarge) throw new HttpError(413, 'payload too large');
    if (!chunks.length) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new HttpError(400, 'invalid JSON');
    }
  }

  function send(res, status, body, headers = {}) {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(payload);
  }

  function bearer(req) {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return null;
    const t = h.slice(7).trim();
    return t.length ? t : null;
  }

  // HTTP Basic Auth aus dem Header lesen → {user, pass} oder null.
  function basicAuth(req) {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Basic ')) return null;
    const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    if (i < 0) return null;
    return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
  }

  function subscribeUrls(cal) {
    return {
      subscribe_url: `${BASE_URL}/cal/${cal.feed_token}.ics`,
      webcal_url: `${BASE_URL.replace(/^https?/, 'webcal')}/cal/${cal.feed_token}.ics`,
    };
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, BASE_URL);
      const path = url.pathname;

      // GET /cal/:feed_token.ics — öffentlicher/geschützter Feed
      if (req.method === 'GET' && path.startsWith('/cal/') && path.endsWith('.ics')) {
        const feedToken = path.slice('/cal/'.length, -'.ics'.length);
        const cal = store.getCalendarByFeedToken(feedToken);
        if (!cal) return send(res, 404, { error: 'calendar not found' });

        // Stufe 3: wenn feed_password gesetzt → Basic Auth verlangen
        if (cal.feed_password) {
          const creds = basicAuth(req);
          if (!creds || !verifyFeedPassword(cal.feed_password, creds.pass)) {
            return send(res, 401, { error: 'authentication required' }, {
              'WWW-Authenticate': 'Basic realm="calfeed"',
            });
          }
        }

        const events = store.listEvents(cal.id);
        const ics = buildICal(cal, events);
        return send(res, 200, ics, {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Cache-Control': 'private, max-age=300',
        });
      }

      // POST /calendars — Admin legt Kalender an
      if (req.method === 'POST' && path === '/calendars') {
        if (!safeEqual(bearer(req) ?? '', ADMIN_TOKEN)) {
          return send(res, 401, { error: 'admin token required' });
        }
        const body = await readJson(req);
        if (!body.name) return send(res, 400, { error: 'name required' });
        const cal = store.createCalendar(body.name);
        return send(res, 201, {
          id: cal.id, name: cal.name, token: cal.token, ...subscribeUrls(cal),
        });
      }

      // POST /calendars/:id/rotate-feed — Feed-Token neu (Kalender-Token)
      let m = path.match(/^\/calendars\/([^/]+)\/rotate-feed$/);
      if (req.method === 'POST' && m) {
        const cal = store.findCalendarByToken(bearer(req));
        if (!cal || cal.id !== m[1]) return send(res, 401, { error: 'valid calendar token required' });
        store.rotateFeedToken(cal.id);
        const updated = store.getCalendar(cal.id);
        return send(res, 200, { rotated: true, ...subscribeUrls(updated) });
      }

      // PUT /calendars/:id/feed-password — Basic Auth setzen/löschen (Kalender-Token)
      m = path.match(/^\/calendars\/([^/]+)\/feed-password$/);
      if (req.method === 'PUT' && m) {
        const cal = store.findCalendarByToken(bearer(req));
        if (!cal || cal.id !== m[1]) return send(res, 401, { error: 'valid calendar token required' });
        const body = await readJson(req);
        // password: string → aktivieren; null/leer → deaktivieren
        const pw = body.password ? String(body.password) : null;
        store.setFeedPassword(cal.id, pw);
        return send(res, 200, { protected: pw !== null });
      }

      // POST /events — Client pusht ein Event (Kalender-Token)
      if (req.method === 'POST' && path === '/events') {
        const cal = store.findCalendarByToken(bearer(req));
        if (!cal) return send(res, 401, { error: 'valid calendar token required' });
        const body = await readJson(req);
        if (!body.summary || !body.dtstart) {
          return send(res, 400, { error: 'summary and dtstart required' });
        }
        // uid (falls angegeben) muss der Whitelist entsprechen → keine iCal-Injection.
        if (body.uid != null && !UID_RE.test(String(body.uid))) {
          return send(res, 400, { error: 'invalid uid' });
        }
        // Datumsfelder serverseitig validieren, damit kein kaputtes Datum in die DB
        // gelangt und später den ganzen Feed vergiftet.
        if (isNaN(new Date(body.dtstart).getTime())) {
          return send(res, 400, { error: 'invalid dtstart' });
        }
        if (body.dtend != null && isNaN(new Date(body.dtend).getTime())) {
          return send(res, 400, { error: 'invalid dtend' });
        }
        const result = store.addEvent(cal.id, body);
        return send(res, result.updated ? 200 : 201, result);
      }

      // DELETE /events/:uid — Client löscht ein Event
      if (req.method === 'DELETE' && path.startsWith('/events/')) {
        const cal = store.findCalendarByToken(bearer(req));
        if (!cal) return send(res, 401, { error: 'valid calendar token required' });
        const uid = decodeURIComponent(path.slice('/events/'.length));
        const deleted = store.deleteEvent(cal.id, uid);
        return send(res, deleted ? 200 : 404, { deleted });
      }

      return send(res, 404, { error: 'not found' });
    } catch (err) {
      // Bekannte Client-Fehler (Body zu groß, kaputtes JSON) sauber melden.
      if (err instanceof HttpError) {
        return send(res, err.httpStatus, { error: err.message });
      }
      // Unerwartete Fehler: serverseitig loggen, dem Client nur generisch melden.
      console.error('calfeed internal error:', err);
      return send(res, 500, { error: 'internal server error' });
    }
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Fail-fast: kein stiller funktionierender Default-Admin-Token im echten Start.
  const t = process.env.CALFEED_ADMIN_TOKEN;
  if (!t || t === 'dev-admin-token' || t === 'change-me') {
    console.error(
      'FATAL: CALFEED_ADMIN_TOKEN must be set to a non-default value. ' +
      'Refusing to start with a missing or well-known token.'
    );
    process.exit(1);
  }
  const port = process.env.PORT || 8787;
  createApp().listen(port, () => console.log(`calfeed listening on :${port}`));
}
