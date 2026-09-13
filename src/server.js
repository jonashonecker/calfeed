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
import { timingSafeEqual, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { SqliteStore } from './store.js';
import { buildICal } from './ical.js';

const scryptAsync = promisify(scrypt);

// Maximum request body size (guards against memory exhaustion).
const MAX_BODY_BYTES = 262144; // 256 KB

// Bound on password inputs, so a single request can't feed scrypt
// arbitrarily large material.
const MAX_PASSWORD_LENGTH = 1024;

// Date inputs must be ISO 8601 WITH an explicit offset (Z or ±hh:mm).
// Offset-less strings would silently shift with the server's timezone.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

// Returns the canonical ISO-UTC form of a date input, or null if the input
// isn't an ISO 8601 string with an explicit offset. Storing the canonical
// form keeps rendering timezone-independent and the dtstart sort correct.
function canonicalDate(v) {
  if (typeof v !== 'string' || !ISO_DATE_RE.test(v)) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

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
// Deliberately asynchronous: the derivation runs on the libuv threadpool,
// so unauthenticated requests can't stall the event loop with scrypt work.
async function verifyFeedPassword(stored, candidate) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  if (String(candidate).length > MAX_PASSWORD_LENGTH) return false;
  const [saltB64, hashB64] = stored.split(':');
  let salt, expected;
  try {
    salt = Buffer.from(saltB64, 'base64');
    expected = Buffer.from(hashB64, 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = await scryptAsync(String(candidate), salt, expected.length);
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
    let parsed;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new HttpError(400, 'invalid JSON');
    }
    // Handlers dereference the body, so null/arrays/scalars are client errors.
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new HttpError(400, 'body must be a JSON object');
    }
    return parsed;
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

  // Resolves the calendar for the request's Bearer token. With an expectedId,
  // the token must also OWN that calendar: every id-scoped route needs this,
  // or any valid token could act on another tenant's calendar.
  function requireCalendar(req, res, expectedId) {
    const cal = store.findCalendarByToken(bearer(req));
    if (!cal || (expectedId !== undefined && cal.id !== expectedId)) {
      send(res, 401, { error: 'valid calendar token required' });
      return null;
    }
    return cal;
  }

  // Validates the writable event fields (presence, types, date rules) and
  // returns them with canonical ISO-UTC dates, or sends the 400 and returns
  // null. Shared by the create and update routes.
  function validateEventFields(body, res) {
    if (!body.summary || !body.dtstart) {
      send(res, 400, { error: 'summary and dtstart required' });
      return null;
    }
    // Types matter, not only presence: a boolean summary would pass the
    // presence check and blow up at the SQLite binding as a 500.
    if (typeof body.summary !== 'string') {
      send(res, 400, { error: 'invalid summary' });
      return null;
    }
    if (body.description != null && typeof body.description !== 'string') {
      send(res, 400, { error: 'invalid description' });
      return null;
    }
    if (body.location != null && typeof body.location !== 'string') {
      send(res, 400, { error: 'invalid location' });
      return null;
    }
    // The write boundary canonicalizes dates to ISO-UTC, so a broken or
    // ambiguous date never reaches the database and poisons the feed or
    // shifts with the server's timezone.
    const dtstart = canonicalDate(body.dtstart);
    if (!dtstart) {
      send(res, 400, { error: 'invalid dtstart' });
      return null;
    }
    let dtend = null;
    if (body.dtend != null) {
      dtend = canonicalDate(body.dtend);
      if (!dtend) {
        send(res, 400, { error: 'invalid dtend' });
        return null;
      }
    }
    return {
      summary: body.summary,
      description: body.description,
      location: body.location,
      dtstart,
      dtend,
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
          if (!creds || !(await verifyFeedPassword(cal.feed_password, creds.pass))) {
            return send(
              res,
              401,
              { error: 'authentication required' },
              {
                'WWW-Authenticate': 'Basic realm="calfeed"',
              },
            );
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
        if (typeof body.name !== 'string' || body.name.length === 0) {
          return send(res, 400, { error: 'name required' });
        }
        const cal = store.createCalendar(body.name);
        return send(res, 201, {
          id: cal.id,
          name: cal.name,
          token: cal.token,
          ...subscribeUrls(cal.feed_token),
        });
      }

      // POST /calendars/:id/rotate-feed: new feed token (calendar token)
      let m = path.match(/^\/calendars\/([^/]+)\/rotate-feed$/);
      if (req.method === 'POST' && m) {
        const cal = requireCalendar(req, res, m[1]);
        if (!cal) return;
        const newFeedToken = store.rotateFeedToken(cal.id);
        return send(res, 200, { rotated: true, ...subscribeUrls(newFeedToken) });
      }

      // PUT /calendars/:id/feed-password: set or clear Basic Auth (calendar token)
      m = path.match(/^\/calendars\/([^/]+)\/feed-password$/);
      if (req.method === 'PUT' && m) {
        const cal = requireCalendar(req, res, m[1]);
        if (!cal) return;
        const body = await readJson(req);
        // password: non-empty string → protect the feed; null or "" → remove
        // protection. Anything else is a client error: a falsy non-string
        // (0, false) must never silently unprotect the feed.
        if (body.password != null && typeof body.password !== 'string') {
          return send(res, 400, { error: 'invalid password' });
        }
        if (typeof body.password === 'string' && body.password.length > MAX_PASSWORD_LENGTH) {
          return send(res, 400, { error: 'password too long' });
        }
        const pw = body.password ? body.password : null;
        store.setFeedPassword(cal.id, pw);
        return send(res, 200, { protected: pw !== null });
      }

      // POST /events: a client creates an event (calendar token)
      if (req.method === 'POST' && path === '/events') {
        const cal = requireCalendar(req, res);
        if (!cal) return;
        const body = await readJson(req);
        // The server assigns the uid (a UUID); clients never choose it.
        if (body.uid !== undefined) {
          return send(res, 400, { error: 'uid is assigned by the server' });
        }
        const fields = validateEventFields(body, res);
        if (!fields) return;
        return send(res, 201, store.createEvent(cal.id, fields));
      }

      // PUT /events/:uid: a client updates an event (calendar token)
      if (req.method === 'PUT' && path.startsWith('/events/')) {
        const cal = requireCalendar(req, res);
        if (!cal) return;
        let uid;
        try {
          uid = decodeURIComponent(path.slice('/events/'.length));
        } catch {
          return send(res, 400, { error: 'invalid uid encoding' });
        }
        const body = await readJson(req);
        // Creation fixes the uid once; it never changes across updates.
        if (body.uid !== undefined) {
          return send(res, 400, { error: 'uid is assigned by the server' });
        }
        const fields = validateEventFields(body, res);
        if (!fields) return;
        if (!store.updateEvent(cal.id, uid, fields)) {
          return send(res, 404, { error: 'event not found' });
        }
        return send(res, 200, { uid });
      }

      // DELETE /events/:uid: a client deletes an event
      if (req.method === 'DELETE' && path.startsWith('/events/')) {
        const cal = requireCalendar(req, res);
        if (!cal) return;
        let uid;
        try {
          uid = decodeURIComponent(path.slice('/events/'.length));
        } catch {
          // Malformed percent-encoding is a client error, not a 500.
          return send(res, 400, { error: 'invalid uid encoding' });
        }
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
        'Refusing to start with a missing or well-known token.',
    );
    process.exit(1);
  }
  const port = process.env.PORT || 8787;
  createApp().listen(port, () => console.log(`calfeed listening on :${port}`));
}
