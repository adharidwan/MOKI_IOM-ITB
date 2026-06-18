-- Deduplicate qr_issued events: when the same instance emits qr_issued
-- consecutively, update the existing row instead of inserting a new one.
-- This prevents infinite row growth when no device connects for a long time.

-- Step 1: Clean up existing duplicate qr_issued rows (keep only the latest per instance)
DELETE FROM whatsapp_instance_events
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY whatsapp_instance_id, event_type
             ORDER BY created_at DESC
           ) AS rn
    FROM whatsapp_instance_events
    WHERE event_type = 'qr_issued'
  ) ranked
  WHERE rn > 1
);

-- Step 2: Create deduplication trigger
CREATE OR REPLACE FUNCTION before_insert_whatsapp_instance_event()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_type = 'qr_issued' THEN
    UPDATE whatsapp_instance_events
    SET message = NEW.message,
        metadata = NEW.metadata,
        created_at = NEW.created_at
    WHERE id = (
      SELECT id FROM whatsapp_instance_events
      WHERE whatsapp_instance_id = NEW.whatsapp_instance_id
      ORDER BY created_at DESC
      LIMIT 1
    )
    AND event_type = 'qr_issued';

    IF FOUND THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deduplicate_qr_issued ON whatsapp_instance_events;

CREATE TRIGGER trg_deduplicate_qr_issued
  BEFORE INSERT ON whatsapp_instance_events
  FOR EACH ROW
  EXECUTE FUNCTION before_insert_whatsapp_instance_event();
