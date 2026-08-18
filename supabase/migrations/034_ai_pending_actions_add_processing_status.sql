-- Adds a 'processing' status so approve_action can atomically claim a pending row
-- (UPDATE ... WHERE status='pending' ... RETURNING) before executing the live
-- Meta/Google call, closing a TOCTOU race where two concurrent approve_action
-- requests for the same action_id could both pass a plain read-then-write check
-- and both execute a non-idempotent write (e.g. scale_meta_budget applied twice).

ALTER TABLE ai_pending_actions DROP CONSTRAINT ai_pending_actions_status_check;
ALTER TABLE ai_pending_actions ADD CONSTRAINT ai_pending_actions_status_check
  CHECK (status IN ('pending', 'processing', 'denied', 'expired', 'executed', 'failed'));
