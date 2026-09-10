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
import { randomUUID, randomBytes } from 'node:crypto';

const newFeedToken = () => randomBytes(32).toString('base64url');

export class SqliteStore {
  constructor(path = process.env.CALFEED_DB || 'calfeed.db') {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS calendars (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        token         TEXT NOT NULL UNIQUE,
        feed_token    TEXT UNIQUE,
        feed_password TEXT,
        created_at    TEXT NOT NULL
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
    // Index auf feed_token ERST nach der Migration (Spalte existiert dann sicher).
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_cal_feedtoken ON calendars(feed_token);`);
  }

  // Backward-kompatible Migration: alte Kalender ohne feed_token bekommen eins.
  _migrate() {
    const cols = this.db.prepare(`PRAGMA table_info(calendars)`).all().map(c => c.name);
    if (!cols.includes('feed_token')) {
      this.db.exec(`ALTER TABLE calendars ADD COLUMN feed_token TEXT`);
    }
    if (!cols.includes('feed_password')) {
      this.db.exec(`ALTER TABLE calendars ADD COLUMN feed_password TEXT`);
    }
    const missing = this.db.prepare(
      `SELECT id FROM calendars WHERE feed_token IS NULL`
    ).all();
    for (const row of missing) {
      this.db.prepare(`UPDATE calendars SET feed_token=? WHERE id=?`)
        .run(newFeedToken(), row.id);
    }
  }

  createCalendar(name) {
    const id = randomUUID().slice(0, 8);
    const token = randomBytes(24).toString('base64url');
    const feedToken = newFeedToken();
    this.db.prepare(
      'INSERT INTO calendars (id, name, token, feed_token, created_at) VALUES (?,?,?,?,?)'
    ).run(id, name, token, feedToken, new Date().toISOString());
    return { id, name, token, feed_token: feedToken };
  }

  getCalendar(id) {
    return this.db.prepare('SELECT * FROM calendars WHERE id=?').get(id) ?? null;
  }

  // Feed wird über das feed_token aufgelöst, NICHT über die interne id.
  getCalendarByFeedToken(feedToken) {
    if (!feedToken) return null;
    return this.db.prepare('SELECT * FROM calendars WHERE feed_token=?').get(feedToken) ?? null;
  }

  findCalendarByToken(token) {
    if (!token) return null;
    return this.db.prepare('SELECT * FROM calendars WHERE token=?').get(token) ?? null;
  }

  // Feed-Token rotieren: neues Token, alte Abo-URL wird ungültig.
  rotateFeedToken(id) {
    const feedToken = newFeedToken();
    const r = this.db.prepare('UPDATE calendars SET feed_token=? WHERE id=?').run(feedToken, id);
    return r.changes > 0 ? feedToken : null;
  }

  // Feed-Passwort setzen (Basic Auth aktivieren) oder mit null löschen.
  setFeedPassword(id, password) {
    const r = this.db.prepare('UPDATE calendars SET feed_password=? WHERE id=?')
      .run(password ?? null, id);
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
