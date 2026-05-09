const crypto = require("node:crypto");
const http = require("node:http");
const fs = require("node:fs");
const { runtimePath } = require("../shared/paths");
const { ensureDir, writeJson } = require("../shared/json-file");
const path = require("node:path");

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        request.destroy(new Error("request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function send(response, statusCode, payload) {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
}

function authorized(request, token) {
  return request.headers.authorization === `Bearer ${token}`;
}

function startBridgeServer(handlers) {
  const token = crypto.randomBytes(24).toString("hex");
  const server = http.createServer(async (request, response) => {
    try {
      if (!authorized(request, token)) return send(response, 401, { error: "unauthorized" });
      if (request.method === "GET" && request.url === "/state") {
        return send(response, 200, handlers.getState());
      }
      if (request.method === "POST" && request.url === "/event") {
        const event = JSON.parse(await readBody(request));
        await handlers.onEvent(event);
        return send(response, 204);
      }
      if (request.method === "POST" && request.url === "/config") {
        const patch = JSON.parse(await readBody(request));
        return send(response, 200, handlers.onConfig(patch));
      }
      return send(response, 404, { error: "not found" });
    } catch (error) {
      return send(response, 500, { error: error.message || String(error) });
    }
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const runtime = {
        pid: process.pid,
        port: address.port,
        token,
        startedAt: new Date().toISOString()
      };
      ensureDir(path.dirname(runtimePath()));
      writeJson(runtimePath(), runtime);
      resolve({
        server,
        runtime,
        close() {
          server.close();
          try {
            fs.unlinkSync(runtimePath());
          } catch {
            // Runtime file is best-effort.
          }
        }
      });
    });
  });
}

module.exports = {
  startBridgeServer
};
