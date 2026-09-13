# Deploy on your own server

Run calfeed on a Linux server with `systemd`, behind the [Caddy](https://caddyserver.com) web server
for automatic HTTPS. Because calfeed has no dependencies, deploying is a `git clone` and updating is
a `git pull`: there is nothing to install beyond Node itself.

## What you need

- A Debian or Ubuntu server you can reach over SSH as root.
- A domain with an A record pointing at the server, such as `calfeed.app` in the examples.
- Ports 80 and 443 open in your firewall. Port 8787 stays closed: only Caddy talks to calfeed.

## Install the runtime

calfeed needs Node 22.13 or later. Install it from the NodeSource repository:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
```

## Get the code and create the service user

The code lives in `/opt/calfeed`, the database in `/var/lib/calfeed`, owned by a system user that
can't log in:

```bash
git clone https://github.com/jonashonecker/calfeed.git /opt/calfeed
useradd --system --home /var/lib/calfeed --shell /usr/sbin/nologin calfeed
mkdir -p /var/lib/calfeed
chown calfeed:calfeed /var/lib/calfeed
```

## Configure the environment

Put the configuration in `/etc/calfeed/env`, readable by root only. Generate the administrator token
instead of inventing one:

```bash
mkdir -p /etc/calfeed
cat > /etc/calfeed/env <<EOF
CALFEED_ADMIN_TOKEN=$(openssl rand -hex 32)
CALFEED_BASE_URL=https://calfeed.app
CALFEED_DB=/var/lib/calfeed/calfeed.db
PORT=8787
EOF
chmod 600 /etc/calfeed/env
```

`CALFEED_BASE_URL` must be the public HTTPS address: it becomes part of every `subscribe_url` the
server hands out.

## Create the service

Write `/etc/systemd/system/calfeed.service`:

```ini
[Unit]
Description=calfeed
After=network-online.target
Wants=network-online.target

[Service]
User=calfeed
Group=calfeed
EnvironmentFile=/etc/calfeed/env
ExecStart=/usr/bin/node /opt/calfeed/src/server.js
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/calfeed
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Then start it and check the log:

```bash
systemctl daemon-reload
systemctl enable --now calfeed
journalctl -u calfeed -n 5
```

The log should end with `calfeed listening on :8787`. The service restarts on failure and starts on
boot.

## Set up HTTPS in front

Caddy terminates HTTPS with certificates it obtains and renews automatically, and it redirects HTTP
to HTTPS, which also keeps `webcal://` clients working. Install it from the official repository:

```bash
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
```

Replace `/etc/caddy/Caddyfile` with:

```text
calfeed.app {
	reverse_proxy 127.0.0.1:8787
}
```

Reload Caddy and try the domain:

```bash
systemctl reload caddy
curl -i https://calfeed.app/cal/probe.ics
```

A `404` with `{"error":"calendar not found"}` is the correct answer: the certificate works, calfeed
answers, and the probe token doesn't exist.

## Back up the database

The database is a single file, but it's the only place your calendars exist, and it holds the tokens
only as hashes that nobody can reissue. Write `/etc/cron.daily/calfeed-backup`:

```bash
#!/bin/sh
mkdir -p /var/backups/calfeed
sqlite3 /var/lib/calfeed/calfeed.db ".backup /var/backups/calfeed/calfeed-$(date +%F).db"
find /var/backups/calfeed -name 'calfeed-*.db' -mtime +14 -delete
```

Make it executable and install the `sqlite3` tool it uses:

```bash
apt-get install -y sqlite3
chmod +x /etc/cron.daily/calfeed-backup
```

This keeps two weeks of daily snapshots. For real safety, also copy them to another machine, for
example with `rsync` from your laptop.

## Create your first calendar

From your own machine, with the administrator token from `/etc/calfeed/env`:

```bash
curl -X POST https://calfeed.app/calendars \
  -H "Authorization: Bearer <your-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Family"}'
```

The `subscribe_url` in the response now carries your real domain. From here, the
[tutorial](/docs/tutorial/create-your-first-feed.md) applies unchanged: only the base URL differs.

## Update calfeed

Updating is the whole zero-dependency payoff:

```bash
cd /opt/calfeed && git pull && systemctl restart calfeed
```

Database migrations run automatically on startup.
