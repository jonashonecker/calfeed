/**
 * Storage-Layer — abstrahiert, damit der Wechsel zu Netlify Blobs / Turso klein bleibt.
 * Interface: createCalendar, getCalendar, addEvent, listEvents, findCalendarByToken.
 * Diese Implementierung nutzt node:sqlite (in Node 22+ eingebaut, hier Node 26).
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes } from 'node:crypto';

export class SqliteStore {
  constructor(path = 'calfeed.db') {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS calendars (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        token      TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
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
  }

  createCalendar(name) {
    const id = randomUUID().slice(0, 8);
    const token = randomBytes(24).toString('base64url');
    this.db.prepare(
      'INSERT INTO calendars (id, name, token, created_at) VALUES (?,?,?,?)'
    ).run(id, name, token, new Date().toISOString());
    return { id, name, token };
  }

  getCalendar(id) {
    return this.db.prepare('SELECT * FROM calendars WHERE id=?').get(id) ?? null;
  }

  findCalendarByToken(token) {
    return this.db.prepare('SELECT * FROM calendars WHERE token=?').get(token) ?? null;
  }

  /**
   * Event hinzufügen ODER aktualisieren (upsert per uid).
   * Idempotenz: derselbe uid überschreibt — Client kann gefahrlos re-pushen.
   */
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
