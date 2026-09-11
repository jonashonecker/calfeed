/**
 * The calfeed HTTP server.
 * Endpoints:
 *   POST   /calendars                  {name}          → create a calendar (administrator token)
 *   POST   /events                     {event fields}  → upsert an event (calendar token)
 *   DELETE /events/:uid                                → delete an event (calendar token)
 *   POST   /calendars/:id/rotate-feed                  → new feed token (calendar token)
 *   PUT    /calendars/:id/feed-password {password|null}→ set or clear Basic Auth (calendar token)
 *   GET    /cal/:feed_token.ics                        → the feed (public OR Basic Auth)
 *
 * Feed privacy:
 *   Level 2: long feed_token in the URL, rotatable.
 *   Level 3: optional feed_password → the feed requires HTTP Basic Auth.
 */
import { createServer } from 'node:http';
import { timingSafeEqual, scryptSync } from 'node:crypto';
import { SqliteStore } from './store.js';
import { buildICal } from './ical.js';

// Maximum request body size (guards against memory exhaustion).
const MAX_BODY_BYTES = 262144; // 256 KB

// The uid allowlist (alphanumeric plus - _ . @) prevents CRLF injection
// into the iCal UID line.
const UID_RE = /^[A-Za-z0-9._@-]+$/;

// Error with an HTTP status, so readJson failures don't end up as a generic 500.
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

// Checks a plaintext password against a stored "salt:hash" (base64, scrypt).
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
        // Over the limit: stop buffering but keep reading (and discarding) so
        // the connection drains cleanly and the client can read the 413.
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

  // Read HTTP Basic Auth from the header → {user, pass} or null.
  function basicAuth(req) {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Basic ')) return null;
    const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    if (i < 0) return null;
    return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
  }

  // Builds the subscribe URLs from the PLAINTEXT feed_token. The database only
  // holds the hash, so the caller (create/rotate) must pass the plaintext token.
  function subscribeUrls(feedToken) {
    return {
      subscribe_url: `${BASE_URL}/cal/${feedToken}.ics`,
      webcal_url: `${BASE_URL.replace(/^https?/, 'webcal')}/cal/${feedToken}.ics`,
    };
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, BASE_URL);
      const path = url.pathname;

      // GET /cal/:feed_token.ics: public or protected feed
      if (req.method === 'GET' && path.startsWith('/cal/') && path.endsWith('.ics')) {
        const feedToken = path.slice('/cal/'.length, -'.ics'.length);
        const cal = store.getCalendarByFeedToken(feedToken);
        if (!cal) return send(res, 404, { error: 'calendar not found' });

        // Level 3: calendars with a feed_password require Basic Auth
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

      // POST /calendars: the administrator creates a calendar
      if (req.method === 'POST' && path === '/calendars') {
        if (!safeEqual(bearer(req) ?? '', ADMIN_TOKEN)) {
          return send(res, 401, { error: 'admin token required' });
        }
        const body = await readJson(req);
        if (!body.name) return send(res, 400, { error: 'name required' });
        const cal = store.createCalendar(body.name);
        return send(res, 201, {
          id: cal.id, name: cal.name, token: cal.token, ...subscribeUrls(cal.feed_token),
        });
      }

      // POST /calendars/:id/rotate-feed: new feed token (calendar token)
      let m = path.match(/^\/calendars\/([^/]+)\/rotate-feed$/);
      if (req.method === 'POST' && m) {
        const cal = store.findCalendarByToken(bearer(req));
        if (!cal || cal.id !== m[1]) return send(res, 401, { error: 'valid calendar token required' });
        const newFeedToken = store.rotateFeedToken(cal.id);
        return send(res, 200, { rotated: true, ...subscribeUrls(newFeedToken) });
      }

      // PUT /calendars/:id/feed-password: set or clear Basic Auth (calendar token)
      m = path.match(/^\/calendars\/([^/]+)\/feed-password$/);
      if (req.method === 'PUT' && m) {
        const cal = store.findCalendarByToken(bearer(req));
        if (!cal || cal.id !== m[1]) return send(res, 401, { error: 'valid calendar token required' });
        const body = await readJson(req);
        // password: string → protect the feed; null or empty → remove protection
        const pw = body.password ? String(body.password) : null;
        store.setFeedPassword(cal.id, pw);
        return send(res, 200, { protected: pw !== null });
      }

      // POST /events: a client pushes an event (calendar token)
      if (req.method === 'POST' && path === '/events') {
        const cal = store.findCalendarByToken(bearer(req));
        if (!cal) return send(res, 401, { error: 'valid calendar token required' });
        const body = await readJson(req);
        if (!body.summary || !body.dtstart) {
          return send(res, 400, { error: 'summary and dtstart required' });
        }
        // uid (when given) must match the allowlist → no iCal injection.
        if (body.uid != null && !UID_RE.test(String(body.uid))) {
          return send(res, 400, { error: 'invalid uid' });
        }
        // Validate date fields server-side so a broken date never reaches the
        // database and poisons the whole feed later.
        if (isNaN(new Date(body.dtstart).getTime())) {
          return send(res, 400, { error: 'invalid dtstart' });
        }
        if (body.dtend != null && isNaN(new Date(body.dtend).getTime())) {
          return send(res, 400, { error: 'invalid dtend' });
        }
        const result = store.addEvent(cal.id, body);
        return send(res, result.updated ? 200 : 201, result);
      }

      // DELETE /events/:uid: a client deletes an event
      if (req.method === 'DELETE' && path.startsWith('/events/')) {
        const cal = store.findCalendarByToken(bearer(req));
        if (!cal) return send(res, 401, { error: 'valid calendar token required' });
        const uid = decodeURIComponent(path.slice('/events/'.length));
        const deleted = store.deleteEvent(cal.id, uid);
        return send(res, deleted ? 200 : 404, { deleted });
      }

      return send(res, 404, { error: 'not found' });
    } catch (err) {
      // Report known client errors (body too large, broken JSON) cleanly.
      if (err instanceof HttpError) {
        return send(res, err.httpStatus, { error: err.message });
      }
      // Unexpected errors: log server-side, give the client only a generic message.
      console.error('calfeed internal error:', err);
      return send(res, 500, { error: 'internal server error' });
    }
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Fail fast: no silently working default administrator token on a real start.
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
