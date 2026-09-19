import type { CreateSessionRequest, Paginated, RepositoryInfo, SessionResponse } from "./types";

// Plan §9 / ADR-0003. The ONLY module that knows Devin v3 paths or reads DEVIN_* env vars.
// Transport rules §9.5: 10 s timeout (20 s create); retries only on reads/messages; create is never retried.

export class DevinApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly path: string,
  ) {
    super(`Devin API ${status} on ${path}: ${detail}`);
  }
  get isRateLimit() {
    return this.status === 429;
  }
  get isClientError() {
    return this.status >= 400 && this.status < 500 && this.status !== 429;
  }
}

/** Thrown when a create call's outcome is unknown (timeout / connection lost after send). */
export class DevinUnknownOutcomeError extends Error {}

type Creds = { apiKey: string; orgId: string; base: string };

function creds(): Creds {
  const apiKey = process.env.DEVIN_API_KEY;
  const orgId = process.env.DEVIN_ORG_ID;
  if (!apiKey) throw new Error("DEVIN_API_KEY is not set");
  if (!orgId) throw new Error("DEVIN_ORG_ID is not set");
  return { apiKey, orgId, base: (process.env.DEVIN_API_BASE ?? "https://api.devin.ai").replace(/\/$/, "") };
}

const devinId = (sessionId: string) => (sessionId.startsWith("devin-") ? sessionId : `devin-${sessionId}`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type CallOpts = { method?: "GET" | "POST" | "DELETE"; body?: unknown; timeoutMs?: number; retries?: number; versionPrefix?: string };

async function call<T>(path: string, opts: CallOpts = {}): Promise<T> {
  const { apiKey, orgId, base } = creds();
  const method = opts.method ?? "GET";
  const url = `${base}/${opts.versionPrefix ?? "v3"}/organizations/${orgId}${path}`;
  const retries = opts.retries ?? 0;
  const backoff = [1000, 3000, 9000];

  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 10_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: ac.signal,
        cache: "no-store",
      });
    } catch (e) {
      clearTimeout(timer);
      log(method, path, "ERR", Date.now() - started);
      if (attempt < retries) {
        await sleep(backoff[Math.min(attempt, backoff.length - 1)] * (0.8 + Math.random() * 0.4));
        continue;
      }
      throw e;
    }
    clearTimeout(timer);
    log(method, path, res.status, Date.now() - started);

    if (res.ok) return (await res.json()) as T;

    const detail = await safeDetail(res);
    if (res.status >= 500 && attempt < retries) {
      await sleep(backoff[Math.min(attempt, backoff.length - 1)] * (0.8 + Math.random() * 0.4));
      continue;
    }
    throw new DevinApiError(res.status, detail, path);
  }
}

async function safeDetail(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: unknown; title?: unknown };
    return String(j.detail ?? j.title ?? res.statusText);
  } catch {
    return res.statusText;
  }
}

function log(method: string, path: string, status: number | string, ms: number) {
  // One line per call. Never the prompt, the key, or bodies (§9.5).
  console.log(JSON.stringify({ devin: true, method, path: path.replace(/devin-[a-f0-9]+/g, "devin-…"), status, ms }));
}

// ---- Public surface -------------------------------------------------------------------------

export async function startSession(req: CreateSessionRequest): Promise<SessionResponse> {
  try {
    return await call<SessionResponse>("/sessions", { method: "POST", body: req, timeoutMs: 20_000, retries: 0 });
  } catch (e) {
    if (e instanceof DevinApiError) throw e; // definite answer from the server
    throw new DevinUnknownOutcomeError(e instanceof Error ? e.message : String(e)); // reconcile by tag (§11.2)
  }
}

export function getSession(sessionId: string): Promise<SessionResponse> {
  return call<SessionResponse>(`/sessions/${devinId(sessionId)}`, { retries: 2 });
}

export async function findSessionsByTag(tag: string): Promise<SessionResponse[]> {
  const q = new URLSearchParams({ tags: tag, first: "10" });
  const page = await call<Paginated<SessionResponse>>(`/sessions?${q}`, { retries: 2 });
  return page.items;
}

export function messageSession(sessionId: string, message: string): Promise<unknown> {
  return call(`/sessions/${devinId(sessionId)}/messages`, { method: "POST", body: { message }, retries: 2 });
}

export function archiveSession(sessionId: string): Promise<unknown> {
  return call(`/sessions/${devinId(sessionId)}/archive`, { method: "POST", retries: 1 });
}

/** All repositories the org's git connections can reach (v3beta1, paginated). */
export async function listRepositories(): Promise<RepositoryInfo[]> {
  const out: RepositoryInfo[] = [];
  let after: string | null = null;
  for (let i = 0; i < 20; i++) {
    const q = after ? `?after=${encodeURIComponent(after)}` : "";
    const page: Paginated<RepositoryInfo> = await call<Paginated<RepositoryInfo>>(`/repositories${q}`, { versionPrefix: "v3beta1", retries: 2 });
    out.push(...page.items);
    if (!page.has_next_page || !page.end_cursor) break;
    after = page.end_cursor;
  }
  return out;
}

export const devinConfigured = () => Boolean(process.env.DEVIN_API_KEY && process.env.DEVIN_ORG_ID);
