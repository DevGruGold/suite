-- Create VSCO-workspace entity
INSERT INTO knowledge_entities (entity_name, entity_type, description, confidence_score, metadata)
VALUES ('VSCO-workspace', 'tool', 'Studio management CMS system for photography professionals. Manages jobs, contacts, events, products, and workflows.', 0.9, '{"category": "integration", "features": ["job_management", "contacts", "events", "products", "invoicing"]}'::jsonb);

-- Update party favor photo description
UPDATE knowledge_entities 
SET description = 'A photo booth service concept stored in relation to VSCO-workspace integration.',
    metadata = COALESCE(metadata, '{}'::jsonb) || '{"related_to": "VSCO-workspace", "stored_date": "2025-12-07"}'::jsonb
WHERE entity_name = 'party favor photo';

-- Create relationship between party favor photo and VSCO-workspace
INSERT INTO entity_relationships (source_entity_id, target_entity_id, relationship_type, strength)
SELECT 
  (SELECT id FROM knowledge_entities WHERE entity_name = 'party favor photo' LIMIT 1),
  (SELECT id FROM knowledge_entities WHERE entity_name = 'VSCO-workspace' LIMIT 1),
  'attached_to',
  0.9;