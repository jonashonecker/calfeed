/**
 * Storage-Layer — abstrahiert, damit der Wechsel zu anderen Backends klein bleibt.
 * Nutzt node:sqlite (in Node 22+ eingebaut).
 *
 * Privacy-Modell für Feeds:
 *  - feed_token: langes Zufallstoken, steht in der Abo-URL (/cal/:feed_token.ics).
 *    Nicht erratbar, rotierbar (bei Leak neues Token → alte URL tot).
 *  - feed_password: optional. Wenn gesetzt, verlangt der Feed HTTP Basic Auth.
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, scryptSync, createHash } from 'node:crypto';

const newFeedToken = () => randomBytes(32).toString('base64url');

// Token werden NICHT im Klartext gespeichert, sondern als SHA-256-Hash.
// Grund: (a) schützt gegen Timing-Seitenkanal beim Lookup (fixe Hash-Länge,
// Vergleich über SQL-Index) und (b) ein geleaktes .db-File enthält nur wertlose
// Hashes. SHA-256 (schnell) ist bewusst gewählt: Token haben volle Zufalls-
// entropie (randomBytes), daher ist kein scrypt-Brute-Force-Schutz nötig.
const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');

export class SqliteStore {
  constructor(path = process.env.CALFEED_DB || 'calfeed.db') {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS calendars (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        token_hash      TEXT NOT NULL UNIQUE,
        feed_token_hash TEXT UNIQUE,
        feed_password   TEXT,
        created_at      TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id           TEXT PRIMARY KEY,
        calendar_id  TEXT NOT NULL REFERENCES calendars(id),
        uid          TEXT NOT NULL,
        summary      TEXT NOT NULL,
        description  TEXT,
        location     TEXT,
        dtstart      TEXT NOT NULL,
        dtend        TEXT,
        created_at   TEXT NOT NULL,
        UNIQUE(calendar_id, uid)
      );
      CREATE INDEX IF NOT EXISTS idx_events_cal ON events(calendar_id);
    `);
    this._migrate();
    // Index auf feed_token_hash ERST nach der Migration (Spalte existiert dann sicher).
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_cal_feedtoken ON calendars(feed_token_hash);`);
  }

  // Migration: neue Kalender-DB nutzt token_hash/feed_token_hash. Fehlende
  // Spalten werden ergänzt; Kalender ohne feed_token_hash bekommen einen.
  _migrate() {
    const cols = this.db.prepare(`PRAGMA table_info(calendars)`).all().map(c => c.name);
    if (!cols.includes('feed_token_hash')) {
      this.db.exec(`ALTER TABLE calendars ADD COLUMN feed_token_hash TEXT`);
    }
    if (!cols.includes('feed_password')) {
      this.db.exec(`ALTER TABLE calendars ADD COLUMN feed_password TEXT`);
    }
    const missing = this.db.prepare(
      `SELECT id FROM calendars WHERE feed_token_hash IS NULL`
    ).all();
    for (const row of missing) {
      this.db.prepare(`UPDATE calendars SET feed_token_hash=? WHERE id=?`)
        .run(hashToken(newFeedToken()), row.id);
    }
  }

  createCalendar(name) {
    const id = randomUUID().slice(0, 8);
    const token = randomBytes(24).toString('base64url');
    const feedToken = newFeedToken();
    // Gespeichert wird jeweils nur der Hash; Klartext-Werte gehen an den Client.
    this.db.prepare(
      'INSERT INTO calendars (id, name, token_hash, feed_token_hash, created_at) VALUES (?,?,?,?,?)'
    ).run(id, name, hashToken(token), hashToken(feedToken), new Date().toISOString());
    return { id, name, token, feed_token: feedToken };
  }

  getCalendar(id) {
    return this.db.prepare('SELECT * FROM calendars WHERE id=?').get(id) ?? null;
  }

  // Feed wird über das feed_token aufgelöst, NICHT über die interne id.
  // Das eingehende Klartext-Token wird gehasht und gegen feed_token_hash gesucht.
  getCalendarByFeedToken(feedToken) {
    if (!feedToken) return null;
    return this.db.prepare('SELECT * FROM calendars WHERE feed_token_hash=?')
      .get(hashToken(feedToken)) ?? null;
  }

  findCalendarByToken(token) {
    if (!token) return null;
    return this.db.prepare('SELECT * FROM calendars WHERE token_hash=?')
      .get(hashToken(token)) ?? null;
  }

  // Feed-Token rotieren: neues Klartext-Token, gespeichert wird der Hash,
  // zurückgegeben wird das KLARTEXT-Token (server.mjs baut daraus die Abo-URL).
  rotateFeedToken(id) {
    const feedToken = newFeedToken();
    const r = this.db.prepare('UPDATE calendars SET feed_token_hash=? WHERE id=?')
      .run(hashToken(feedToken), id);
    return r.changes > 0 ? feedToken : null;
  }

  // Feed-Passwort setzen (Basic Auth aktivieren) oder mit null löschen.
  // Gespeichert wird nie Klartext, sondern "salt:hash" (beides base64, scrypt).
  setFeedPassword(id, password) {
    let stored = null;
    if (password != null && String(password).length > 0) {
      const salt = randomBytes(16);
      const hash = scryptSync(String(password), salt, 64);
      stored = `${salt.toString('base64')}:${hash.toString('base64')}`;
    }
    const r = this.db.prepare('UPDATE calendars SET feed_password=? WHERE id=?')
      .run(stored, id);
    return r.changes > 0;
  }

  addEvent(calendarId, { uid, summary, description, location, dtstart, dtend }) {
    const eventUid = uid || randomUUID();
    const existing = this.db.prepare(
      'SELECT id FROM events WHERE calendar_id=? AND uid=?'
    ).get(calendarId, eventUid);

    if (existing) {
      this.db.prepare(`
        UPDATE events SET summary=?, description=?, location=?, dtstart=?, dtend=?
        WHERE calendar_id=? AND uid=?
      `).run(summary, description ?? null, location ?? null, dtstart, dtend ?? null, calendarId, eventUid);
      return { id: existing.id, uid: eventUid, updated: true };
    }
    const id = randomUUID().slice(0, 12);
    this.db.prepare(`
      INSERT INTO events (id, calendar_id, uid, summary, description, location, dtstart, dtend, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(id, calendarId, eventUid, summary, description ?? null, location ?? null,
           dtstart, dtend ?? null, new Date().toISOString());
    return { id, uid: eventUid, updated: false };
  }

  listEvents(calendarId) {
    return this.db.prepare(
      'SELECT * FROM events WHERE calendar_id=? ORDER BY dtstart'
    ).all(calendarId);
  }

  deleteEvent(calendarId, uid) {
    const r = this.db.prepare('DELETE FROM events WHERE calendar_id=? AND uid=?').run(calendarId, uid);
    return r.changes > 0;
  }
}
