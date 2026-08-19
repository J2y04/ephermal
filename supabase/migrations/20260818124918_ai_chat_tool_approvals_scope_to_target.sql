-- "Allow for this chat" was scoped to (user, conversation, tool_name) only -- meaning a
-- grant for e.g. pause_meta_campaign on ONE campaign silently covered pause_meta_campaign
-- on ANY campaign for the rest of the chat. Narrowing to also require the same target
-- campaign_id closes that gap: the grant now means exactly what the UI copy says, "won't
-- ask again for this in this chat" -- this specific target, not the whole tool class.
ALTER TABLE ai_chat_tool_approvals DROP CONSTRAINT ai_chat_tool_approvals_user_id_conversation_id_tool_name_key;
ALTER TABLE ai_chat_tool_approvals ADD COLUMN target_key text NOT NULL DEFAULT '';
ALTER TABLE ai_chat_tool_approvals ADD CONSTRAINT ai_chat_tool_approvals_scope_key
  UNIQUE (user_id, conversation_id, tool_name, target_key);
