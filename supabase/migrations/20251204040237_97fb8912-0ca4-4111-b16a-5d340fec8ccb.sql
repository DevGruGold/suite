-- Clean up stale xAI record from api_key_health
DELETE FROM api_key_health WHERE service_name = 'xai';