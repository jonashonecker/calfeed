#!/usr/bin/env node
/**
 * The calfeed CLI, a thin client for the calfeed HTTP API.
 * One subcommand per endpoint; all domain validation stays on the server.
 *
 * Configuration (flags win over environment):
 *   --url    or CALFEED_URL          base URL (default http://localhost:8787)
 *   --token  or CALFEED_TOKEN        calendar token (push, delete, rotate, password)
 *   --token  or CALFEED_ADMIN_TOKEN  administrator token (create)
 */
import { parseArgs } from 'node:util';

const USAGE = `usage: calfeed <command> [options]

commands:
  create <name>                create a calendar (administrator token)
  push --summary S --dtstart D [--dtend D] [--uid U] [--description T] [--location L]
                               add or update an event (calendar token)
  delete <uid>                 delete an event (calendar token)
  rotate <calendar-id>         rotate the feed token (calendar token)
  password <calendar-id> --set <password> | --clear
                               set or clear the feed password (calendar token)
  feed <subscribe-url> [--password <password>]
                               fetch the .ics feed and print it
  help                         show this text

options:
  --url URL    server base URL (default: CALFEED_URL or http://localhost:8787)
  --token T    token to use (default: CALFEED_TOKEN; CALFEED_ADMIN_TOKEN for create)
  --json       print the raw JSON response instead of key: value lines
`;

function fail(message) {
  console.error(`calfeed: ${message}`);
  process.exit(1);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      token: { type: 'string' },
      json: { type: 'boolean', default: false },
      summary: { type: 'string' },
      dtstart: { type: 'string' },
      dtend: { type: 'string' },
      uid: { type: 'string' },
      description: { type: 'string' },
      location: { type: 'string' },
      set: { type: 'string' },
      clear: { type: 'boolean', default: false },
      password: { type: 'string' },
    },
  });
} catch (err) {
  fail(err.message);
}
const { values: flags, positionals } = parsed;

const BASE_URL = flags.url || process.env.CALFEED_URL || 'http://localhost:8787';

function requireToken(envVar) {
  const token = flags.token || process.env[envVar];
  if (!token) fail(`no token: pass --token or set ${envVar}`);
  return token;
}

// Sends one request and returns the response body as text. Any failure
// (unreachable server or a non-2xx status) prints the server's error and
// exits 1, so command handlers only deal with the success path.
async function request(method, path, { token, basicPassword, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (basicPassword !== undefined) {
    headers.Authorization = `Basic ${Buffer.from(`calfeed:${basicPassword}`).toString('base64')}`;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    // new URL(path, base) keeps absolute URLs (the feed command) intact.
    res = await fetch(new URL(path, BASE_URL), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    fail(`cannot reach ${BASE_URL} (${err.cause?.code || err.message})`);
  }
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = JSON.parse(text).error ?? text;
    } catch {
      // Not JSON: report the raw body.
    }
    fail(`${message} (HTTP ${res.status})`);
  }
  return text;
}

function printResponse(text) {
  if (flags.json) {
    console.log(text);
    return;
  }
  for (const [key, value] of Object.entries(JSON.parse(text))) {
    console.log(`${key}: ${value}`);
  }
}

const command = positionals[0];

switch (command) {
  case 'create': {
    const name = positionals[1];
    if (!name) fail('usage: calfeed create <name>');
    const token = requireToken('CALFEED_ADMIN_TOKEN');
    printResponse(await request('POST', '/calendars', { token, body: { name } }));
    break;
  }

  case 'push': {
    const token = requireToken('CALFEED_TOKEN');
    const body = {};
    for (const field of ['summary', 'dtstart', 'dtend', 'uid', 'description', 'location']) {
      if (flags[field] !== undefined) body[field] = flags[field];
    }
    printResponse(await request('POST', '/events', { token, body }));
    break;
  }

  case 'delete': {
    const uid = positionals[1];
    if (!uid) fail('usage: calfeed delete <uid>');
    const token = requireToken('CALFEED_TOKEN');
    printResponse(await request('DELETE', `/events/${encodeURIComponent(uid)}`, { token }));
    break;
  }

  case 'rotate': {
    const id = positionals[1];
    if (!id) fail('usage: calfeed rotate <calendar-id>');
    const token = requireToken('CALFEED_TOKEN');
    printResponse(
      await request('POST', `/calendars/${encodeURIComponent(id)}/rotate-feed`, { token }),
    );
    break;
  }

  case 'password': {
    const id = positionals[1];
    const hasSet = flags.set !== undefined;
    // Exactly one of --set and --clear.
    if (!id || hasSet === flags.clear) {
      fail('usage: calfeed password <calendar-id> --set <password> | --clear');
    }
    const token = requireToken('CALFEED_TOKEN');
    printResponse(
      await request('PUT', `/calendars/${encodeURIComponent(id)}/feed-password`, {
        token,
        body: { password: hasSet ? flags.set : null },
      }),
    );
    break;
  }

  case 'feed': {
    const feedUrl = positionals[1];
    if (!feedUrl) fail('usage: calfeed feed <subscribe-url> [--password <password>]');
    process.stdout.write(await request('GET', feedUrl, { basicPassword: flags.password }));
    break;
  }

  case 'help':
    console.log(USAGE);
    break;

  case undefined:
    console.error(USAGE);
    process.exit(1);
    break;

  default:
    fail(`unknown command '${command}' (try: calfeed help)`);
}
