// Live HydraDB smoke test. Run: node scripts/hydra-smoke.mjs
// Loads .env manually (no deps), exercises the endpoints throughline uses,
// and prints raw responses so we can confirm the envelope shapes.
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const BASE = process.env.HYDRA_DB_BASE_URL || "https://api.hydradb.com";
const KEY = process.env.HYDRA_DB_API_KEY;
const TENANT = process.env.HYDRA_DB_TENANT_ID || "throughline";
const SUB = "smoketest";

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

const show = (label, r) =>
  console.log(`\n### ${label} -> ${r.status}\n` + JSON.stringify(r.json, null, 2).slice(0, 1400));

console.log(`Base: ${BASE}\nTenant: ${TENANT}\nKey: ${KEY ? KEY.slice(0, 12) + "…" : "MISSING"}`);

// 1. infra status (does tenant exist?)
show("GET infra/status", await call("GET", `/tenants/infra/status?tenant_id=${TENANT}`));

// 2. create tenant (idempotent — may conflict if it exists)
show(
  "POST tenants/create",
  await call("POST", "/tenants/create", {
    tenant_id: TENANT,
    tenant_metadata_schema: [
      { name: "entry_date", data_type: "VARCHAR", enable_match: true, enable_dense_embedding: false, enable_sparse_embedding: false },
      { name: "sentiment_label", data_type: "VARCHAR", enable_match: true, enable_dense_embedding: false, enable_sparse_embedding: false },
      { name: "sentiment_score", data_type: "VARCHAR", enable_match: true, enable_dense_embedding: false, enable_sparse_embedding: false },
      { name: "dominant_emotion", data_type: "VARCHAR", enable_match: true, enable_dense_embedding: false, enable_sparse_embedding: false },
      { name: "emotions_json", data_type: "VARCHAR", enable_match: false, enable_dense_embedding: false, enable_sparse_embedding: false },
    ],
  }),
);

// 3. poll until ready (max ~90s)
let ready = false;
for (let i = 0; i < 30; i++) {
  const r = await call("GET", `/tenants/infra/status?tenant_id=${TENANT}`);
  const s = r.json || {};
  const ok =
    s.graph_status === true &&
    Array.isArray(s.vectorstore_status) &&
    s.vectorstore_status.every(Boolean) &&
    s.infra_status === "ready";
  process.stdout.write(`\rpoll ${i}: graph=${s.graph_status} vs=${JSON.stringify(s.vectorstore_status)} infra=${s.infra_status}     `);
  if (ok) {
    ready = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 3000));
}
console.log(`\nready: ${ready}`);
if (!ready) process.exit(0);

// 4. add a memory
show(
  "POST memories/add_memory",
  await call("POST", "/memories/add_memory", {
    tenant_id: TENANT,
    sub_tenant_id: SUB,
    memories: [
      {
        source_id: `entry_${SUB}_2026-06-21`,
        text: "A slow five miles at dawn with Dana. I feel most like myself out there. Priya said the presentation was clear.",
        infer: false,
        metadata: {
          entry_date: "2026-06-21",
          sentiment_label: "good",
          sentiment_score: "0.42",
          dominant_emotion: "calm",
          emotions_json: JSON.stringify({ joy: 0.6, calm: 0.7, hope: 0.5, gratitude: 0.4, sadness: 0.1, anxiety: 0.2, anger: 0.0, loneliness: 0.1 }),
        },
      },
    ],
  }),
);

await new Promise((r) => setTimeout(r, 1500));

// 5. list
show(
  "POST list/data",
  await call("POST", "/list/data", { tenant_id: TENANT, sub_tenant_id: SUB, kind: "memories", page: 1, page_size: 200 }),
);

// 6. recall
show(
  "POST recall/recall_preferences",
  await call("POST", "/recall/recall_preferences", {
    tenant_id: TENANT,
    sub_tenant_id: SUB,
    query: "what has this person been feeling lately and who matters to them",
    max_results: 12,
    mode: "thinking",
  }),
);
