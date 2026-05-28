import { describe, test, expect } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleMcpRequest, resolveMcpHttpPort, DEFAULT_MCP_HTTP_PORT, isStdioMode, isHttpMode } from "../src/http";
import { createServer } from "../src/mcp-server";

describe("assistants MCP HTTP transport", () => {
  test("default port is 8849; --port overrides; --stdio detected", () => {
    expect(DEFAULT_MCP_HTTP_PORT).toBe(8849);
    expect(resolveMcpHttpPort([])).toBe(8849);
    expect(resolveMcpHttpPort(["--port", "9001"])).toBe(9001);
    expect(isStdioMode(["--stdio"])).toBe(true);
    expect(isStdioMode([])).toBe(false);
    expect(isHttpMode(["--http"])).toBe(true);
  });

  test("MCP HTTP round-trip: /health + initialize + listTools", async () => {
    const httpServer = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/health" && req.method === "GET") {
          return Response.json({ status: "ok", name: "assistants" });
        }
        if (url.pathname === "/mcp") {
          return handleMcpRequest(req, () => createServer());
        }
        return new Response("Not Found", { status: 404 });
      },
    });
    try {
      const port = httpServer.port!;
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok", name: "assistants" });

      const client = new Client({ name: "assistants-http-test", version: "0.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
      await client.connect(transport);
      const result = await client.listTools();
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);
      await client.close();
    } finally {
      httpServer.stop();
    }
  });
});
