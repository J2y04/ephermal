-- Auren (AI chat) authorization gate: any tool call that would create or change
-- something on a 3rd-party platform (Meta, Google) must be staged here first and
-- wait for a genuine, separately-authenticated user action before it executes.
-- The model's own text/tool-call output is never trusted as an authorization
-- signal -- only a real row here, created by a real approve_action HTTP call
-- carrying the caller's own verified Clerk JWT, can cause a write to actually run.

CREATE TABLE ai_pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  conversation_id text NOT NULL,
  tool_name text NOT NULL,
  tool_input jsonb NOT NULL DEFAULT '{}'::jsonb,
  label text NOT NULL,
  platform text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'executed', 'failed')),
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '20 minutes'),
  resolved_at timestamptz
);
CREATE INDEX idx_ai_pending_actions_user_status ON ai_pending_actions(user_id, status);

-- "Allow for this chat" grants -- scoped to (user, conversation, tool), never global
-- and never permanent. A fresh page load gets a fresh conversation_id, so these
-- grants naturally expire when the Auren panel is closed/reloaded, matching "this
-- chat" as the user actually means it, not "forever".
CREATE TABLE ai_chat_tool_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  conversation_id text NOT NULL,
  tool_name text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 minutes'),
  UNIQUE (user_id, conversation_id, tool_name)
);
CREATE INDEX idx_ai_chat_tool_approvals_lookup ON ai_chat_tool_approvals(user_id, conversation_id, tool_name, expires_at);

-- Both tables are only ever touched by the ai-assistant edge function via the
-- service-role key. No anon/authenticated policy is intentional: a direct client
-- query (bypassing ai-assistant's own logic) must never be able to read, forge, or
-- pre-approve a pending action -- the approval decision is made entirely server-side.
ALTER TABLE ai_pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_tool_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_pending_actions FROM anon, authenticated;
REVOKE ALL ON ai_chat_tool_approvals FROM anon, authenticated;
GRANT ALL ON ai_pending_actions TO service_role;
GRANT ALL ON ai_chat_tool_approvals TO service_role;
