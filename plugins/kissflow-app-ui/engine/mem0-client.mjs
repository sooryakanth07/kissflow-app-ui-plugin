// mem0-client.mjs — thin REST client for a Mem0 server (self-hosted or hosted). Uses global fetch.
//   base : MEM0_BASE_URL (default http://localhost:8000)  ·  key: MEM0_API_KEY (optional)
// The contract below matches the local mock and maps 1:1 to the Mem0 self-host REST API; if your
// Mem0 version uses /v1/memories(/search), set MEM0_ADD_PATH / MEM0_SEARCH_PATH to override.
export function mem0Client(opts = {}) {
  const base = (opts.base || process.env.MEM0_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
  const key = opts.key || process.env.MEM0_API_KEY || "";
  const addPath = opts.addPath || process.env.MEM0_ADD_PATH || "/memories";
  const searchPath = opts.searchPath || process.env.MEM0_SEARCH_PATH || "/search";
  const headers = { "Content-Type": "application/json", ...(key ? { Authorization: `Token ${key}` } : {}) };
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    if (r.status >= 300) throw new Error(`mem0 ${method} ${path} → ${r.status} ${typeof j === "object" ? JSON.stringify(j).slice(0, 160) : j}`);
    return j;
  };
  return {
    // add a memory. scoping via user_id (org), agent_id (agent), metadata (scope/tier/app…).
    add: ({ text, org = "shared", agent = "", app = "", metadata = {} }) =>
      call("POST", addPath, { messages: [{ role: "user", content: text }], text, user_id: org, agent_id: agent, metadata: { app, ...metadata } }),
    // top-K relevant memories for a query, scoped.
    search: ({ query, org = "shared", agent = "", top_k = 20, filters = {} }) =>
      call("POST", searchPath, { query, user_id: org, agent_id: agent, top_k, filters }).then((r) => r.results || r || []),
    health: () => call("GET", "/health").catch(() => ({ status: "down" })),
  };
}
