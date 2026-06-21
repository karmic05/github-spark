// HydraDB REST client. Called only from server functions, so the API key never
// reaches the browser. We hit the REST API with plain fetch (portable, no SDK).

const BASE_URL = process.env.HYDRA_DB_BASE_URL || "https://api.hydradb.com";

export function hydraTenantId(): string {
  return process.env.HYDRA_DB_TENANT_ID || "throughline";
}

function apiKey(): string {
  const key = process.env.HYDRA_DB_API_KEY;
  if (!key) {
    throw new Error(
      "HYDRA_DB_API_KEY is not set. Add it as a backend secret (Cloud → Secrets) or in .env",
    );
  }
  return key;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
  };
}

async function call<T = unknown>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown } = { method: "GET" },
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init.method,
    headers: headers(),
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const raw = await res.text();
  let parsed: unknown = undefined;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }
  if (!res.ok) {
    // Don't leak the auth header; surface enough to debug.
    throw new Error(
      `HydraDB ${init.method} ${path} -> ${res.status}: ${
        typeof parsed === "string" ? parsed : JSON.stringify(parsed)
      }`,
    );
  }
  return parsed as T;
}

// --- Tenant lifecycle -------------------------------------------------------

const METADATA_SCHEMA = [
  {
    name: "entry_date",
    data_type: "VARCHAR",
    enable_match: true,
    enable_dense_embedding: false,
    enable_sparse_embedding: false,
  },
  {
    name: "sentiment_label",
    data_type: "VARCHAR",
    enable_match: true,
    enable_dense_embedding: false,
    enable_sparse_embedding: false,
  },
  {
    name: "sentiment_score",
    data_type: "VARCHAR",
    enable_match: true,
    enable_dense_embedding: false,
    enable_sparse_embedding: false,
  },
  {
    name: "dominant_emotion",
    data_type: "VARCHAR",
    enable_match: true,
    enable_dense_embedding: false,
    enable_sparse_embedding: false,
  },
  {
    name: "emotions_json",
    data_type: "VARCHAR",
    enable_match: false,
    enable_dense_embedding: false,
    enable_sparse_embedding: false,
  },
];

export async function createTenant(): Promise<void> {
  await call("/tenants/create", {
    method: "POST",
    body: {
      tenant_id: hydraTenantId(),
      tenant_metadata_schema: METADATA_SCHEMA,
    },
  });
}

// The live API nests the readiness flags under `infra` and has no
// `infra_status: "ready"` string — ready means graph + both vectorstores up.
export interface InfraStatus {
  tenant_id?: string;
  infra?: {
    scheduler_status?: boolean;
    graph_status?: boolean;
    vectorstore_status?: boolean[];
  };
  message?: string;
}

export async function infraStatus(): Promise<InfraStatus> {
  return call<InfraStatus>(
    `/tenants/infra/status?tenant_id=${encodeURIComponent(hydraTenantId())}`,
    { method: "GET" },
  );
}

export function isReady(status: InfraStatus): boolean {
  const i = status.infra;
  return (
    !!i &&
    i.graph_status === true &&
    Array.isArray(i.vectorstore_status) &&
    i.vectorstore_status.length >= 2 &&
    i.vectorstore_status.every(Boolean)
  );
}

/** Create the tenant if needed, then poll until infra is ready. Idempotent. */
export async function ensureTenantReady(timeoutMs = 120_000): Promise<boolean> {
  // Creating an existing tenant is fine — we swallow the conflict and poll.
  try {
    const status = await infraStatus();
    if (isReady(status)) return true;
  } catch {
    // tenant likely doesn't exist yet
  }
  try {
    await createTenant();
  } catch (err) {
    // Already exists / async creation in flight — ignore and poll below.
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const status = await infraStatus();
      if (isReady(status)) return true;
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

// --- Memories ---------------------------------------------------------------

export interface MemoryMetadata {
  entry_date: string;
  sentiment_label: string;
  sentiment_score: string;
  dominant_emotion: string;
  emotions_json: string;
}

export interface MemoryItem {
  source_id: string;
  text: string;
  infer: boolean;
  metadata: MemoryMetadata;
}

export async function addMemories(subTenantId: string, memories: MemoryItem[]): Promise<void> {
  await call("/memories/add_memory", {
    method: "POST",
    body: {
      tenant_id: hydraTenantId(),
      sub_tenant_id: subTenantId,
      memories,
    },
  });
}

export interface RecallResult {
  text: string;
  score?: number;
  metadata?: Partial<MemoryMetadata> & Record<string, unknown>;
}

interface RecallChunk {
  chunk_content?: string;
  source_id?: string;
  relevancy_score?: number;
  metadata?: Partial<MemoryMetadata> & Record<string, unknown>;
}

export async function recall(
  subTenantId: string,
  query: string,
  opts: { maxResults?: number; mode?: "thinking" | "fast" } = {},
): Promise<RecallResult[]> {
  const body = {
    tenant_id: hydraTenantId(),
    sub_tenant_id: subTenantId,
    query,
    max_results: opts.maxResults ?? 12,
    mode: opts.mode ?? "thinking",
  };
  // The live API returns { chunks, sources, graph_context, ... }.
  const res = await call<{ chunks?: RecallChunk[] }>("/recall/recall_preferences", {
    method: "POST",
    body,
  });
  return (res?.chunks ?? []).map((c) => ({
    text: c.chunk_content ?? "",
    score: c.relevancy_score,
    metadata: c.metadata,
  }));
}

// list/data returns only { memory_id, memory_content, inferred_content } per
// item — no metadata. The date is recovered from memory_id (= source_id) and
// the analysis is decoded from a sidecar embedded in the stored text.
export interface RawMemory {
  memory_id: string;
  memory_content: string;
  inferred_content?: string;
}

export async function listMemories(subTenantId: string, pageSize = 100): Promise<RawMemory[]> {
  const all: RawMemory[] = [];
  let page = 1;
  for (;;) {
    const res = await call<{
      user_memories?: RawMemory[];
      pagination?: { has_next?: boolean };
    }>("/list/data", {
      method: "POST",
      body: {
        tenant_id: hydraTenantId(),
        sub_tenant_id: subTenantId,
        kind: "memories",
        page,
        page_size: Math.min(pageSize, 100), // API caps page_size at 100
      },
    });
    const batch = res?.user_memories ?? [];
    all.push(...batch);
    if (!res?.pagination?.has_next || batch.length === 0) break;
    page++;
    if (page > 50) break; // safety stop
  }
  return all;
}
