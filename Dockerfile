# calfeed — self-contained, zero-dependency. Node 26 ships SQLite built in.
FROM node:26-slim

WORKDIR /app

# Source and manifest only. No dependencies to install (zero-dep).
COPY package.json ./
COPY src ./src

# Persistence: the SQLite database lives in /data (mounted as a volume).
ENV CALFEED_DB=/data/calfeed.db
ENV PORT=8787
RUN mkdir -p /data

EXPOSE 8787

# Run as non-root for security.
RUN chown -R node:node /app /data
USER node

CMD ["node", "src/server.js"]
