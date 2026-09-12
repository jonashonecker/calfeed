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

const USAGE = `usage: calfeed <resource> <action> [options]

commands:
  calendar create <name>        create a calendar (administrator token)
  event push --summary S --dtstart D [--dtend D] [--uid U] [--description T] [--location L]
                                add or update an event (calendar token)
  event delete <uid>            delete an event (calendar token)
  feed show <subscribe-url> [--password <password>]
                                fetch the .ics feed and print it
  feed rotate <calendar-id>     rotate the feed token (calendar token)
  feed protect <calendar-id> --password <password>
                                require Basic authentication on the feed (calendar token)
  feed unprotect <calendar-id>  remove the feed password (calendar token)
  help                          show this text

options:
  --url URL    server base URL (default: CALFEED_URL or http://localhost:8787)
  --token T    token to use (default: CALFEED_TOKEN; CALFEED_ADMIN_TOKEN for calendar create)
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

// Docker-style dispatch: the first positional names the resource and the
// second the action, giving commands like `calendar create` or `feed rotate`.
const command = positionals.slice(0, 2).join(' ');

switch (command) {
  case 'calendar create': {
    const name = positionals[2];
    if (!name) fail('usage: calfeed calendar create <name>');
    const token = requireToken('CALFEED_ADMIN_TOKEN');
    printResponse(await request('POST', '/calendars', { token, body: { name } }));
    break;
  }

  case 'event push': {
    const token = requireToken('CALFEED_TOKEN');
    const body = {};
    for (const field of ['summary', 'dtstart', 'dtend', 'uid', 'description', 'location']) {
      if (flags[field] !== undefined) body[field] = flags[field];
    }
    printResponse(await request('POST', '/events', { token, body }));
    break;
  }

  case 'event delete': {
    const uid = positionals[2];
    if (!uid) fail('usage: calfeed event delete <uid>');
    const token = requireToken('CALFEED_TOKEN');
    printResponse(await request('DELETE', `/events/${encodeURIComponent(uid)}`, { token }));
    break;
  }

  case 'feed show': {
    const feedUrl = positionals[2];
    if (!feedUrl) fail('usage: calfeed feed show <subscribe-url> [--password <password>]');
    process.stdout.write(await request('GET', feedUrl, { basicPassword: flags.password }));
    break;
  }

  case 'feed rotate': {
    const id = positionals[2];
    if (!id) fail('usage: calfeed feed rotate <calendar-id>');
    const token = requireToken('CALFEED_TOKEN');
    printResponse(
      await request('POST', `/calendars/${encodeURIComponent(id)}/rotate-feed`, { token }),
    );
    break;
  }

  case 'feed protect': {
    const id = positionals[2];
    if (!id || flags.password === undefined) {
      fail('usage: calfeed feed protect <calendar-id> --password <password>');
    }
    const token = requireToken('CALFEED_TOKEN');
    printResponse(
      await request('PUT', `/calendars/${encodeURIComponent(id)}/feed-password`, {
        token,
        body: { password: flags.password },
      }),
    );
    break;
  }

  case 'feed unprotect': {
    const id = positionals[2];
    if (!id) fail('usage: calfeed feed unprotect <calendar-id>');
    const token = requireToken('CALFEED_TOKEN');
    printResponse(
      await request('PUT', `/calendars/${encodeURIComponent(id)}/feed-password`, {
        token,
        body: { password: null },
      }),
    );
    break;
  }

  case 'help':
    console.log(USAGE);
    break;

  case '':
    console.error(USAGE);
    process.exit(1);
    break;

  default:
    if (positionals.length === 1) {
      fail(`'${positionals[0]}' needs an action (try: calfeed help)`);
    }
    fail(`unknown command '${command}' (try: calfeed help)`);
}
