ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS scene_context TEXT;
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS equipment_context JSONB;
