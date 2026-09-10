# calfeed — self-contained, zero-dependency. Node 26 ships SQLite built in.
FROM node:26-slim

WORKDIR /app

# Nur Quellcode + Manifest. Keine Dependencies zu installieren (zero-dep).
COPY package.json ./
COPY src ./src

# Persistenz: die SQLite-DB liegt in /data (als Volume gemountet).
ENV CALFEED_DB=/data/calfeed.db
ENV PORT=8787
RUN mkdir -p /data

EXPOSE 8787

# Non-root für Sicherheit.
RUN chown -R node:node /app /data
USER node

CMD ["node", "src/server.mjs"]
