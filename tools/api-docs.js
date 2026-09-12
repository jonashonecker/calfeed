#!/usr/bin/env node
/**
 * Serves the OpenAPI description in Swagger UI on localhost.
 * Zero dependencies: node:http serves a small HTML shell that loads
 * Swagger UI from a CDN in the browser, plus the spec itself. Every
 * request reads the spec from disk, so a browser refresh shows the
 * current state of the file.
 *
 * Usage: npm run docs:api  (port via DOCS_PORT, default 8080)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SPEC_PATH = fileURLToPath(new URL('../docs/reference/openapi.yaml', import.meta.url));
const PORT = process.env.DOCS_PORT || 8080;

const PAGE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>calfeed API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({
        url: '/openapi.yaml',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout',
      });
    </script>
  </body>
</html>
`;

createServer(async (req, res) => {
  if (req.url === '/openapi.yaml') {
    try {
      const spec = await readFile(SPEC_PATH);
      res.writeHead(200, { 'Content-Type': 'application/yaml' });
      return res.end(spec);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end(`cannot read ${SPEC_PATH}: ${err.message}`);
    }
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(PAGE);
}).listen(PORT, () => {
  console.log(`calfeed API docs on http://localhost:${PORT} (Ctrl-C to stop)`);
});
