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
import { timingSafeEqual } from 'node:crypto';
import { SqliteStore } from './store.mjs';
import { buildICal } from './ical.mjs';

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function createApp(store = new SqliteStore()) {
  const ADMIN_TOKEN = process.env.CALFEED_ADMIN_TOKEN || 'dev-admin-token';
  const BASE_URL = process.env.CALFEED_BASE_URL || 'http://localhost:8787';

  async function readJson(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (!chunks.length) return {};
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }

  function send(res, status, body, headers = {}) {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(payload);
  }

  function bearer(req) {
    const h = req.headers.authorization || '';
    return h.startsWith('Bearer ') ? h.slice(7) : null;
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
          if (!creds || !safeEqual(creds.pass, cal.feed_password)) {
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
        const newToken = store.rotateFeedToken(cal.id);
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
      return send(res, 500, { error: String(err.message || err) });
    }
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 8787;
  createApp().listen(port, () => console.log(`calfeed listening on :${port}`));
}
