import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { CreateSessionRequest, Paginated, RepositoryInfo, SessionResponse } from "@/lib/devin/types";

// Plan §16.2: a scriptable Devin v3 server for integration tests. It only knows the paths
// lib/devin/client.ts uses, and it asserts every create request the way a reviewer would.

export type Behaviour =
  | { kind: "finish-with"; verdict: "ok" | "needs-work" | "blocked" | "complete"; output?: Record<string, unknown> }
  | { kind: "idle-without-output" }
  | { kind: "stay-working" }
  | { kind: "suspend"; detail: string }
  | { kind: "exit" }
  | { kind: "drop-create-response" }
  | { kind: "return-garbage" }
  | { kind: "rate-limit" };

export type FakeSession = {
  response: SessionResponse;
  request: CreateSessionRequest;
  behaviour: Behaviour;
  messages: string[];
  archived: boolean;
};

export type FakeDevinOptions = {
  orgId: string;
  apiKey: string;
  repos?: string[];
  /** Any repo owner other than these fails the request assertions. */
  allowedOwners?: string[];
};

export class FakeDevin {
  readonly sessions = new Map<string, FakeSession>();
  readonly creates: CreateSessionRequest[] = [];
  readonly violations: string[] = [];
  /** Behaviours to hand out to the next creates, in order. Defaults to `stay-working`. */
  readonly script: Behaviour[] = [];
  private server: Server | null = null;
  private seq = 0;
  private readonly repos: string[];
  private readonly allowedOwners: string[];

  constructor(private readonly opts: FakeDevinOptions) {
    this.repos = opts.repos ?? ["cr1m1/lalafo-stats"];
    this.allowedOwners = opts.allowedOwners ?? ["cr1m1"];
  }

  async start(): Promise<string> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => this.server!.close((e) => (e ? reject(e) : resolve())));
    this.server = null;
  }

  /** Queue behaviours for upcoming creates (first in, first served). */
  plan(...behaviours: Behaviour[]): void {
    this.script.push(...behaviours);
  }

  /** Re-script an existing session, e.g. to let a `stay-working` session finish later. */
  set(sessionId: string, behaviour: Behaviour): void {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`unknown session ${sessionId}`);
    s.behaviour = behaviour;
    s.response = this.render(s);
  }

  byTag(tag: string): FakeSession[] {
    return [...this.sessions.values()].filter((s) => s.response.tags.includes(tag));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://fake");
    if (req.headers.authorization !== `Bearer ${this.opts.apiKey}`) return send(res, 401, { detail: "bad key" });
    const m = /^\/(v3|v3beta1)\/organizations\/([^/]+)(\/.*)$/.exec(url.pathname);
    if (!m || m[2] !== this.opts.orgId) return send(res, 403, { detail: "wrong organization" });
    const path = m[3];
    const body = req.method === "POST" ? await readJson(req) : null;

    if (m[1] === "v3beta1" && path === "/repositories" && req.method === "GET") {
      const items: RepositoryInfo[] = this.repos.map((repo_path) => ({
        repo_path,
        repo_name: repo_path.split("/")[1],
        repo_description: null,
        repo_language: "TypeScript",
        git_connection_host: "github.com",
        last_updated_at: null,
      }));
      return send(res, 200, page(items));
    }

    if (path === "/sessions" && req.method === "POST") return this.create(body as CreateSessionRequest, res);

    if (path === "/sessions" && req.method === "GET") {
      const tag = url.searchParams.get("tags");
      const items = tag ? this.byTag(tag).map((s) => s.response) : [...this.sessions.values()].map((s) => s.response);
      return send(res, 200, page(items));
    }

    const sm = /^\/sessions\/(devin-[^/]+)(\/messages|\/archive)?$/.exec(path);
    if (sm) {
      const s = this.sessions.get(sm[1]);
      if (!s) return send(res, 404, { detail: "session not found" });
      if (!sm[2] && req.method === "GET") return send(res, 200, s.response);
      if (sm[2] === "/messages" && req.method === "POST") {
        s.messages.push(String((body as { message?: unknown } | null)?.message ?? ""));
        return send(res, 200, { ok: true });
      }
      if (sm[2] === "/archive" && req.method === "POST") {
        s.archived = true;
        s.response = { ...s.response, is_archived: true };
        return send(res, 200, { ok: true });
      }
    }
    return send(res, 404, { detail: `no route for ${req.method} ${path}` });
  }

  private create(req: CreateSessionRequest, res: ServerResponse): void {
    this.creates.push(req);
    this.assertCreate(req);
    const behaviour = this.script.shift() ?? { kind: "stay-working" };
    if (behaviour.kind === "rate-limit") return send(res, 429, { detail: "rate limited" });
    if (behaviour.kind === "drop-create-response") {
      // The Session exists server-side but the client never hears about it (§11.2).
      this.register(req, { kind: "stay-working" });
      res.destroy();
      return;
    }
    const s = this.register(req, behaviour);
    send(res, 200, s.response);
  }

  private register(req: CreateSessionRequest, behaviour: Behaviour): FakeSession {
    const id = `devin-${(++this.seq).toString(16).padStart(8, "0")}`;
    const now = Math.floor(Date.now() / 1000);
    const session: FakeSession = {
      request: req,
      behaviour,
      messages: [],
      archived: false,
      response: {
        session_id: id,
        url: `https://app.devin.ai/sessions/${id.slice(6)}`,
        title: req.title ?? null,
        status: "running",
        status_detail: "working",
        structured_output: null,
        pull_requests: [],
        acus_consumed: 0.5,
        tags: req.tags ?? [],
        created_at: now,
        updated_at: now,
        is_archived: false,
        playbook_id: req.playbook_id ?? null,
      },
    };
    session.response = this.render(session);
    this.sessions.set(id, session);
    return session;
  }

  private render(s: FakeSession): SessionResponse {
    const base = { ...s.response, status: "running" as const, status_detail: "working" as const, structured_output: null, is_archived: s.archived };
    switch (s.behaviour.kind) {
      case "finish-with": {
        const output = {
          verdict: s.behaviour.verdict,
          summary: `${s.behaviour.verdict} from fake devin`,
          report_md: `# ${s.request.title ?? "report"}\n\n${s.behaviour.verdict}.`,
          ...s.behaviour.output,
        };
        const prs = (output as { pull_requests?: { url: string }[] }).pull_requests ?? [];
        return { ...base, status_detail: "finished", structured_output: output, pull_requests: prs.map((p) => ({ pr_url: p.url, pr_state: "open" })) };
      }
      case "idle-without-output":
        return { ...base, status_detail: "waiting_for_user" };
      case "suspend":
        return { ...base, status: "suspended", status_detail: s.behaviour.detail as SessionResponse["status_detail"] };
      case "exit":
        return { ...base, status: "exit", status_detail: null };
      case "return-garbage":
        return { ...base, status_detail: "finished", structured_output: { verdict: "maybe", summary: 42 } };
      default:
        return base;
    }
  }

  private assertCreate(req: CreateSessionRequest): void {
    const fail = (why: string) => this.violations.push(`${req.title ?? "?"}: ${why}`);
    if (!req.structured_output_schema) fail("missing structured_output_schema");
    if (typeof req.max_acu_limit !== "number") fail("missing max_acu_limit");
    if (req.resumable !== false) fail("resumable must be false");
    if (!Array.isArray(req.secret_ids) || req.secret_ids.length) fail("secret_ids must be []");
    if (!req.repos || req.repos.length !== 1) fail("exactly one repo expected");
    for (const r of req.repos ?? []) if (!this.allowedOwners.includes(r.split("/")[0])) fail(`repo ${r} is not under an allowed owner`);
    const tags = req.tags ?? [];
    if (tags.length !== 3 || tags[0] !== "overnight" || !tags[1]?.startsWith("run:") || !tags[2]?.startsWith("stage:")) fail(`bad tags ${JSON.stringify(tags)}`);
    const stageTag = tags.find((t) => t.startsWith("stage:"));
    // A retry after a 429 is fine (nothing was created); a second create once a Session exists is not.
    if (stageTag && this.byTag(stageTag).length > 0) fail(`second create for ${stageTag}`);
  }
}

const page = <T>(items: T[]): Paginated<T> => ({ items, end_cursor: null, has_next_page: false, total: items.length });

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c: Buffer) => (data += c.toString()));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : null);
      } catch {
        resolve(null);
      }
    });
  });
}
