# Why calfeed never stores tokens

When you create a calendar or rotate a feed token, the response carries the token in plaintext, and
that response is the only place it ever exists outside your hands. There is no call that shows a
token again, and there never can be. This page explains the storage model behind that.

## Fingerprints, not secrets

calfeed never writes a token to disk. The database stores only a hash of each token: a fixed-length
fingerprint computed with a one-way function. Computing the fingerprint from the token is instant.
Computing the token from the fingerprint is practically impossible. The column names say it plainly:
`token_hash` and `feed_token_hash`, never `token`.

Authentication still works, because recognizing a secret doesn't require storing it. When a request
arrives with a Bearer token, the server hashes the incoming value and looks that fingerprint up in
the database. A match proves the caller holds the original, which the server itself never kept.

## What a stolen database is worth

The payoff shows when things go wrong. If someone obtains the database file, say through a leaked
backup or a compromised server, plaintext storage would hand them every write token and every secret
feed URL at once. With hashes, they hold a list of fingerprints: none of them can authenticate a
single request, because the server demands the original that only you have. The feed password gets
the same treatment with an extra twist: passwords are human-chosen and guessable, so they get a
salted, deliberately slow hash instead of the fast one that suits high-entropy random tokens.

## The price: reissue instead of recovery

A one-way function binds the server as much as the attacker: calfeed can't show you a stored token,
ever. Losing one always means issuing a new one, never recovering the old:

- A lost or leaked feed token: rotate it. The calendar gets a new subscribe URL, the old one dies.
- A lost calendar write token: create a fresh calendar and point your writer at it. There is nothing
  to recover.
- A lost feed password: set a new one.

The same trade runs every serious login system: a "forgot password" flow never mails your old
password back, it lets you set a new one. calfeed applies that discipline to every secret it
handles. In exchange, the database is worthless to anyone who steals it.

## Related

- Which token guards what: [A token per calendar](/docs/explanation/token-per-calendar.md).
- The feed-side levers, rotation and password: [Feed privacy](/docs/explanation/feed-privacy.md).
- Where the tokens appear in responses: [API reference](/docs/reference/api.md).
