/**
 * Storage layer, abstracted so a switch to another backend stays small.
 * Uses node:sqlite (built into Node 22.13+).
 *
 * Privacy model for feeds:
 *  - feed_token: long random token, part of the subscribe URL (/cal/:feed_token.ics).
 *    Not guessable, rotatable (after a leak, a new token kills the old URL).
 *  - feed_password: optional. When set, the feed requires HTTP Basic Auth.
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, scryptSync, createHash } from 'node:crypto';

const newFeedToken = () => randomBytes(32).toString('base64url');

// The store never keeps plaintext tokens, only their SHA-256 hash. Two
// reasons: (a) it protects against a timing side channel during lookup
// (fixed hash length, comparison through the SQL index) and (b) a leaked
// .db file contains only worthless hashes. SHA-256 (fast) is a deliberate
// choice: tokens carry full random entropy (randomBytes), so scrypt-style
// brute-force protection is unnecessary.
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
        uid          TEXT PRIMARY KEY,
        calendar_id  TEXT NOT NULL REFERENCES calendars(id),
        summary      TEXT NOT NULL,
        description  TEXT,
        location     TEXT,
        dtstart      TEXT NOT NULL,
        dtend        TEXT,
        created_at   TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_cal ON events(calendar_id);
    `);
    this._migrate();
    // Create the index on feed_token_hash only after the migration, when the
    // column certainly exists.
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_cal_feedtoken ON calendars(feed_token_hash);`);
  }

  // Migration: a fresh database uses token_hash/feed_token_hash. Missing
  // columns get added; calendars without a feed_token_hash get one.
  _migrate() {
    const cols = this.db
      .prepare(`PRAGMA table_info(calendars)`)
      .all()
      .map((c) => c.name);
    if (!cols.includes('feed_token_hash')) {
      this.db.exec(`ALTER TABLE calendars ADD COLUMN feed_token_hash TEXT`);
    }
    if (!cols.includes('feed_password')) {
      this.db.exec(`ALTER TABLE calendars ADD COLUMN feed_password TEXT`);
    }
    const missing = this.db.prepare(`SELECT id FROM calendars WHERE feed_token_hash IS NULL`).all();
    for (const row of missing) {
      this.db
        .prepare(`UPDATE calendars SET feed_token_hash=? WHERE id=?`)
        .run(hashToken(newFeedToken()), row.id);
    }

    // Legacy events tables carried a separate id column next to the uid.
    // The uid is the primary key now, so rebuild the table (the standard
    // SQLite migration pattern) and carry the rows over. Old uids were only
    // unique per calendar; a cross-calendar collision gets a fresh UUID.
    const eventCols = this.db
      .prepare(`PRAGMA table_info(events)`)
      .all()
      .map((c) => c.name);
    if (eventCols.includes('id')) {
      const rows = this.db.prepare(`SELECT * FROM events`).all();
      this.db.exec(`
        CREATE TABLE events_new (
          uid          TEXT PRIMARY KEY,
          calendar_id  TEXT NOT NULL REFERENCES calendars(id),
          summary      TEXT NOT NULL,
          description  TEXT,
          location     TEXT,
          dtstart      TEXT NOT NULL,
          dtend        TEXT,
          created_at   TEXT NOT NULL
        );
      `);
      const insert = this.db.prepare(`
        INSERT INTO events_new (uid, calendar_id, summary, description, location, dtstart, dtend, created_at)
        VALUES (?,?,?,?,?,?,?,?)
      `);
      const seen = new Set();
      for (const r of rows) {
        const uid = seen.has(r.uid) ? randomUUID() : r.uid;
        seen.add(uid);
        insert.run(
          uid,
          r.calendar_id,
          r.summary,
          r.description,
          r.location,
          r.dtstart,
          r.dtend,
          r.created_at,
        );
      }
      this.db.exec(`
        DROP TABLE events;
        ALTER TABLE events_new RENAME TO events;
        CREATE INDEX IF NOT EXISTS idx_events_cal ON events(calendar_id);
      `);
    }
  }

  createCalendar(name) {
    const id = randomUUID().slice(0, 8);
    const token = randomBytes(24).toString('base64url');
    const feedToken = newFeedToken();
    // The row holds only the hashes; the plaintext values go to the client.
    this.db
      .prepare(
        'INSERT INTO calendars (id, name, token_hash, feed_token_hash, created_at) VALUES (?,?,?,?,?)',
      )
      .run(id, name, hashToken(token), hashToken(feedToken), new Date().toISOString());
    return { id, name, token, feed_token: feedToken };
  }

  getCalendar(id) {
    return this.db.prepare('SELECT * FROM calendars WHERE id=?').get(id) ?? null;
  }

  // The feed resolves through the feed_token, not the internal id. Hash the
  // incoming plaintext token and look it up against feed_token_hash.
  getCalendarByFeedToken(feedToken) {
    if (!feedToken) return null;
    return (
      this.db
        .prepare('SELECT * FROM calendars WHERE feed_token_hash=?')
        .get(hashToken(feedToken)) ?? null
    );
  }

  findCalendarByToken(token) {
    if (!token) return null;
    return (
      this.db.prepare('SELECT * FROM calendars WHERE token_hash=?').get(hashToken(token)) ?? null
    );
  }

  // Rotate the feed token: generates a new plaintext token, stores its hash,
  // and returns the PLAINTEXT token (server.js builds the subscribe URL from it).
  rotateFeedToken(id) {
    const feedToken = newFeedToken();
    const r = this.db
      .prepare('UPDATE calendars SET feed_token_hash=? WHERE id=?')
      .run(hashToken(feedToken), id);
    return r.changes > 0 ? feedToken : null;
  }

  // Set the feed password (turn on Basic Auth) or clear it with null.
  // Never stores plaintext, only "salt:hash" (both base64, scrypt).
  setFeedPassword(id, password) {
    let stored = null;
    if (password != null && String(password).length > 0) {
      const salt = randomBytes(16);
      const hash = scryptSync(String(password), salt, 64);
      stored = `${salt.toString('base64')}:${hash.toString('base64')}`;
    }
    const r = this.db.prepare('UPDATE calendars SET feed_password=? WHERE id=?').run(stored, id);
    return r.changes > 0;
  }

  // Creates an event and assigns its uid: a server-generated UUID, the
  // event's only identifier (and its primary key).
  createEvent(calendarId, { summary, description, location, dtstart, dtend }) {
    const uid = randomUUID();
    this.db
      .prepare(
        `
      INSERT INTO events (uid, calendar_id, summary, description, location, dtstart, dtend, created_at)
      VALUES (?,?,?,?,?,?,?,?)
    `,
      )
      .run(
        uid,
        calendarId,
        summary,
        description ?? null,
        location ?? null,
        dtstart,
        dtend ?? null,
        new Date().toISOString(),
      );
    return { uid };
  }

  listEvents(calendarId) {
    return this.db
      .prepare('SELECT * FROM events WHERE calendar_id=? ORDER BY dtstart')
      .all(calendarId);
  }

  deleteEvent(calendarId, uid) {
    const r = this.db
      .prepare('DELETE FROM events WHERE calendar_id=? AND uid=?')
      .run(calendarId, uid);
    return r.changes > 0;
  }
}
