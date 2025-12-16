import http from "node:http";

import { sum } from "@atomicnexus/common";

const SERVICE = "api";
const port = Number(process.env.PORT ?? 8080);

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, service: SERVICE }));
    return;
  }

  res.statusCode = 200;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(`AtomicNexus ${SERVICE} skeleton (sum(2,3)=${sum(2, 3)})\n`);
});

server.listen(port, () => {
  console.log(`[${SERVICE}] listening on http://localhost:${port}`);
});

process.on("SIGINT", () => server.close());
process.on("SIGTERM", () => server.close());

