/**
 * calfeed HTTP-Server — der Kern.
 * Endpunkte:
 *   POST /calendars            {name}                        → {id, token, subscribe_url}  (Admin-Token nötig)
 *   POST /events               {calendar_id?, summary, ...}  → {uid, updated}   (Kalender-Token im Bearer)
 *   GET  /cal/:id.ics                                        → text/calendar    (öffentlich, das abonniert iOS)
 *   DELETE /events/:uid        (Kalender-Token im Bearer)                        → {deleted}
 *
 * Auth-Modell:
 *   - Kalender anlegen: ADMIN_TOKEN (env) — nur du.
 *   - Events schreiben: der pro-Kalender-Token (Bearer). Ein Client kann NUR seinen Kalender füllen.
 *   - .ics lesen: öffentlich (unratbare id), read-only. Das ist der webcal-Feed.
 */
import { createServer } from 'node:http';
import { SqliteStore } from './store.mjs';
import { buildICal } from './ical.mjs';

export function createApp(store = new SqliteStore()) {
  // Zur Laufzeit lesen (nicht beim Import), damit Tests/Deploy die Env sauber setzen können.
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

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, BASE_URL);
      const path = url.pathname;

      // GET /cal/:id.ics — öffentlicher Feed
      if (req.method === 'GET' && path.startsWith('/cal/') && path.endsWith('.ics')) {
        const id = path.slice('/cal/'.length, -'.ics'.length);
        const cal = store.getCalendar(id);
        if (!cal) return send(res, 404, { error: 'calendar not found' });
        const events = store.listEvents(id);
        const ics = buildICal(cal, events);
        return send(res, 200, ics, {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        });
      }

      // POST /calendars — Admin legt Kalender an
      if (req.method === 'POST' && path === '/calendars') {
        if (bearer(req) !== ADMIN_TOKEN) return send(res, 401, { error: 'admin token required' });
        const body = await readJson(req);
        if (!body.name) return send(res, 400, { error: 'name required' });
        const cal = store.createCalendar(body.name);
        return send(res, 201, {
          id: cal.id,
          name: cal.name,
          token: cal.token,
          subscribe_url: `${BASE_URL}/cal/${cal.id}.ics`,
          webcal_url: `${BASE_URL.replace(/^https?/, 'webcal')}/cal/${cal.id}.ics`,
        });
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

// Direkt-Start (nicht beim Testen)
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 8787;
  createApp().listen(port, () => console.log(`calfeed listening on :${port}`));
}
