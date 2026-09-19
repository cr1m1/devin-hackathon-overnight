// Devin v3 shapes, verified in docs/api-notes.md. Only what we read.

export const SESSION_STATUSES = ["new", "claimed", "running", "exit", "error", "suspended", "resuming"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const RUNNING_DETAILS = ["working", "waiting_for_user", "waiting_for_approval", "finished"] as const;
export const SUSPENDED_CREDIT_DETAILS = [
  "usage_limit_exceeded",
  "out_of_credits",
  "out_of_quota",
  "no_quota_allocation",
  "payment_declined",
  "org_usage_limit_exceeded",
  "user_usage_limit_exceeded",
  "total_session_limit_exceeded",
] as const;
export const SUSPENDED_OTHER_DETAILS = ["inactivity", "user_request", "error"] as const;

export type SessionStatusDetail = (typeof RUNNING_DETAILS)[number] | (typeof SUSPENDED_CREDIT_DETAILS)[number] | (typeof SUSPENDED_OTHER_DETAILS)[number];

export type SessionPullRequest = { pr_url: string; pr_state: string | null };

export type SessionResponse = {
  session_id: string;
  url: string;
  title: string | null;
  status: SessionStatus;
  status_detail: SessionStatusDetail | null;
  structured_output: Record<string, unknown> | null;
  pull_requests: SessionPullRequest[];
  acus_consumed: number;
  tags: string[];
  created_at: number; // unix seconds
  updated_at: number; // unix seconds
  is_archived: boolean;
  playbook_id: string | null;
};

export type CreateSessionRequest = {
  prompt: string;
  title?: string;
  tags?: string[];
  repos?: string[];
  structured_output_schema?: Record<string, unknown>;
  max_acu_limit?: number;
  resumable?: boolean;
  secret_ids?: string[];
  playbook_id?: string;
};

export type Paginated<T> = { items: T[]; end_cursor: string | null; has_next_page: boolean; total: number | null };

export type RepositoryInfo = {
  repo_path: string; // owner/name
  repo_name: string;
  repo_description: string | null;
  repo_language: string | null;
  git_connection_host: string;
  last_updated_at: number | null;
};
