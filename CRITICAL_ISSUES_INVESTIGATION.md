# Critical Issues Investigation & Fixes
**Date**: January 29, 2026  
**Status**: Partial Fix Applied - Server-side Issues Require Further Investigation

## ✅ Issues FIXED (Client-Side)

### 1. 🚨 Gemini Image Generation Error - FIXED ✅
**Problem**: Client code was calling deprecated `gemini-1.5-flash` model causing 404 errors.

**Root Cause**: Multiple services using outdated Gemini model name that was deprecated by Google.

**Files Fixed**:
- `src/services/multimodalGeminiService.ts`
- `src/services/geminiTTSService.ts`
- `src/services/geminiImageService.ts`
- `src/services/conversationSummarizationService.ts`
- `src/services/consolidatedAIService.ts`
- `src/services/apiKeyManager.ts`

**Solution**: Replaced all instances of `gemini-1.5-flash` with `gemini-2.0-flash-exp` (current stable model).

**Verification**: After deployment, check browser console for image generation errors - they should be gone.

---

### 2. 🚨 Multiple GoTrueClient Instances - FIXED ✅
**Problem**: Warning "Multiple GoTrueClient instances detected in the same browser context" causing potential auth state conflicts.

**Root Cause**: Two separate Supabase client instances were being created:
1. `/src/lib/supabase.ts` - Legacy client with `persistSession: false`
2. `/src/integrations/supabase/client.ts` - Main client with `persistSession: true`

**Files Fixed**:
- `src/services/unifiedElizaService.ts` - Changed import from `../lib/supabase` to `@/integrations/supabase/client`
- `src/lib/supabase.ts` - Added deprecation warning to prevent future usage

**Solution**: Consolidated all imports to use the single client from `@/integrations/supabase/client`.

**Verification**: Check browser console - "Multiple GoTrueClient instances" warning should no longer appear.

---

### 3. 🚨 Founder IP Recognition - FIXED ✅
**Problem**: System not recognizing founder IP (showing "NOT FOUNDER (confidence: 0, signals: )")

**Root Cause**: Hardcoded founder IP `190.211.120.214` was outdated. Current IP from console logs: `190.211.121.35`

**File Fixed**: `src/services/unifiedDataService.ts`

**Solution**: Updated `FOUNDER_IP` constant from `190.211.120.214` to `190.211.121.35`

**Verification**: After deployment, check console log for "🎖️ Founder validation complete: CONFIRMED" message.

---

### 4. ✅ OAuth Redirect URL - ALREADY CORRECT
**Status**: No fix needed - already using dynamic detection.

**Current Implementation** (`src/contexts/AuthContext.tsx` line 156-163):
```typescript
const getRedirectUrl = () => {
  // Always redirect to dashboard after auth
  if (window.location.hostname.includes('lovable') || 
      window.location.hostname.includes('lovableproject')) {
    return 'https://suite-beta.vercel.app/dashboard';
  }
  return `${window.location.origin}/dashboard`;
};
```

**Note**: This correctly redirects to `suite-beta.vercel.app/dashboard`. If you're still seeing redirects to `xmrt-ecosystem.vercel.app`, check your Supabase Dashboard Auth settings:
- Go to: Supabase Dashboard → Authentication → URL Configuration
- Verify "Site URL" is set to: `https://suite-beta.vercel.app`
- Verify "Redirect URLs" includes: `https://suite-beta.vercel.app/dashboard`

---

## ⚠️ Issues Requiring SERVER-SIDE Investigation

### 5. 🚨 `ai-chat` Latency Regression (9-32 seconds) - NEEDS INVESTIGATION ⚠️
**Observed Behavior**: 
- Console logs show: `[HTTP/2 200  9139ms]` to `[HTTP/2 200  32697ms]`
- Expected: <5 seconds for simple text responses

**Suspected Causes**:
1. **Database Query Performance**:
   - Heavy joins on conversation tables
   - Missing indexes on frequently queried columns
   - N+1 query problems

2. **External API Latency**:
   - Slow AI provider responses (OpenAI, Gemini, DeepSeek)
   - Network timeout issues
   - Rate limiting delays

3. **Memory/Context Loading**:
   - Loading too much conversation history
   - Inefficient memory context retrieval
   - Unnecessary vector similarity searches

4. **Tool Execution Overhead**:
   - Long-running tool executions
   - Synchronous execution of parallel-capable operations
   - Excessive tool iterations

**Investigation Steps**:
```sql
-- Check for slow queries in edge function
SELECT 
  function_name,
  AVG(execution_time_ms) as avg_time,
  MAX(execution_time_ms) as max_time,
  COUNT(*) as call_count
FROM edge_function_logs
WHERE function_name = 'ai-chat'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY function_name;

-- Check for missing indexes
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE tablename IN (
  'conversation_messages', 
  'conversation_summaries',
  'memory_contexts',
  'conversation_memory'
);
```

**Recommended Fixes**:
1. Add performance logging to identify bottleneck
2. Add database query caching
3. Implement request timeout handling
4. Consider using streaming responses for better UX

**File to Review**: `supabase/functions/ai-chat/index.ts`

---

### 6. 🚨 `eliza_activity_log` PostgREST Exposure - NEEDS VERIFICATION ⚠️
**Problem**: Previous error showed `error=42883` (function does not exist) when accessing via PostgREST.

**Current Status**: Unknown - needs manual verification.

**Verification Command**:
```bash
# Run this with your actual Supabase URL and keys
curl -X GET \
  "https://vawouugtzwmejxqkeqqj.supabase.co/rest/v1/eliza_activity_log?select=id&limit=1" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

**Expected Response**: 
- ✅ HTTP 200 with data array (even if empty) = Fixed
- ❌ HTTP 400/500 with error = Still broken

**Suspected Cause**: Missing RLS policies or incorrect permissions on the table.

**Recommended Fix**:
```sql
-- Check if table exists and has correct permissions
SELECT * FROM information_schema.tables 
WHERE table_name = 'eliza_activity_log';

-- Check RLS policies
SELECT * FROM pg_policies 
WHERE tablename = 'eliza_activity_log';

-- If missing, create basic RLS policy
ALTER TABLE eliza_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to eliza_activity_log"
  ON eliza_activity_log FOR SELECT
  USING (true);
```

---

### 7. 🚨 PostgreSQL `realtime.broadcast_changes` Error - NEEDS INVESTIGATION ⚠️
**Problem**: Server-side error causing Realtime connection issues.

**Error**: The exact error message is not in the provided logs, but the issue is mentioned as causing client-side Realtime subscription problems.

**Suspected Causes**:
1. **Database Trigger Issues**:
   - Custom triggers on realtime-subscribed tables throwing errors
   - Triggers trying to call non-existent functions
   
2. **Realtime Configuration**:
   - Tables not properly configured for Realtime
   - Missing publication setup
   - Replication issues

3. **Permission Problems**:
   - Realtime role lacking necessary permissions
   - RLS policies blocking Realtime system operations

**Investigation Steps**:
```sql
-- Check Realtime publication
SELECT * FROM pg_publication WHERE pubname = 'supabase_realtime';

-- Check which tables are in the publication
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';

-- Check for triggers on subscribed tables
SELECT 
  event_object_schema,
  event_object_table,
  trigger_name,
  action_statement
FROM information_schema.triggers
WHERE event_object_table IN (
  'eliza_activity_log',
  'conversation_messages', 
  'workflow_executions'
);

-- Check Realtime error logs
SELECT * FROM realtime.messages 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

**Recommended Fixes**:
1. Review and fix any custom triggers on Realtime-enabled tables
2. Ensure all referenced functions exist
3. Verify Realtime role has necessary permissions

---

### 8. 🚨 Invalid PATCH Query Filter - NEEDS CODE REVIEW ⚠️
**Problem**: Edge function making invalid query: `PATCH | 400 | updated_at=eq.undefined`

**Impact**: Some conversation memory updates are failing silently.

**Root Cause**: JavaScript `undefined` value being used in filter instead of proper timestamp.

**Investigation Steps**:
```bash
# Search for the problematic code
cd /tmp/suite
grep -r "updated_at=eq" supabase/functions/ | grep -i patch
grep -r "conversation_memory" supabase/functions/ | grep -i patch
grep -r "eq.undefined" supabase/functions/
```

**Suspected Pattern**:
```typescript
// WRONG - causes "updated_at=eq.undefined" error
const { data, error } = await supabase
  .from('conversation_memory')
  .update({ content: 'new content' })
  .eq('updated_at', someVariable); // someVariable is undefined

// RIGHT - proper filter
const { data, error } = await supabase
  .from('conversation_memory')
  .update({ content: 'new content', updated_at: new Date().toISOString() })
  .eq('id', recordId);
```

**Recommended Fix**: Review all PATCH operations on `conversation_memory` table and ensure:
1. Filters use proper column values (id, user_id, etc.) not timestamps
2. `updated_at` is set in the UPDATE payload, not used in filter
3. Add validation to prevent undefined values in queries

---

### 9. 📚 Zero Conversation Summaries - NEEDS INVESTIGATION ⚠️
**Problem**: "Found 0 summaries for 2995 total messages" despite having nearly 3000 messages.

**Impact**: Eliza cannot recall past conversation contexts, limiting its ability to provide contextual responses.

**Root Cause**: Conversation summarization system not running or failing silently.

**Investigation Steps**:
```sql
-- Check if conversation_summaries table exists and has data
SELECT COUNT(*) FROM conversation_summaries;

-- Check recent summarization attempts
SELECT * FROM webhook_logs 
WHERE webhook_name = 'create_conversation_summary'
ORDER BY created_at DESC 
LIMIT 10;

-- Check message distribution
SELECT 
  session_id,
  COUNT(*) as message_count,
  MAX(created_at) as last_message
FROM conversation_messages
GROUP BY session_id
ORDER BY message_count DESC;
```

**Recommended Fixes**:
1. Check if summarization edge function exists and is working
2. Verify automatic triggers for creating summaries
3. Manually trigger summarization for existing conversations
4. Add monitoring/alerting for summarization failures

**Related Files**:
- `supabase/functions/create-conversation-summary/` (if exists)
- Check for scheduled jobs or triggers related to summarization

---

## 🔧 Server-Side Configuration Checklist

### Supabase Dashboard Settings to Verify:

1. **Authentication → URL Configuration**:
   - Site URL: `https://suite-beta.vercel.app`
   - Redirect URLs: Add `https://suite-beta.vercel.app/dashboard`
   - Remove old `xmrt-ecosystem.vercel.app` URLs if present

2. **Database → Replication**:
   - Verify `supabase_realtime` publication includes:
     - `eliza_activity_log`
     - `conversation_messages`
     - `workflow_executions`

3. **Edge Functions → Environment Variables**:
   - Verify all API keys are set and valid
   - Check for proper timeout configurations
   - Ensure function URLs are correct

4. **Database → Indexes**:
   - Check for missing indexes on frequently queried columns
   - Add indexes for:
     ```sql
     CREATE INDEX IF NOT EXISTS idx_conversation_messages_session_id 
       ON conversation_messages(session_id);
     
     CREATE INDEX IF NOT EXISTS idx_memory_contexts_user_id 
       ON memory_contexts(user_id);
     
     CREATE INDEX IF NOT EXISTS idx_eliza_activity_log_created_at 
       ON eliza_activity_log(created_at DESC);
     ```

---

## 📋 Post-Deployment Verification

After deploying the client-side fixes, verify:

1. ✅ **Gemini Image Generation**: 
   - Check browser console for "Gemini image generation error" - should be gone
   - Test image generation functionality

2. ✅ **Multiple GoTrueClient**: 
   - Check browser console - warning should not appear
   - Test login/logout flow

3. ✅ **Founder Recognition**:
   - Check console log for "🎖️ Founder validation complete: CONFIRMED"
   - Current IP: `190.211.121.35`

4. ⚠️ **ai-chat Latency**:
   - Monitor response times (should be <5s for simple queries)
   - Check edge function logs for bottlenecks

5. ⚠️ **Realtime Subscriptions**:
   - Verify WebSocket connection stays active
   - Test that new messages appear in real-time

6. ⚠️ **Conversation Summaries**:
   - Check if summaries are being created
   - Verify Eliza can recall conversation context

---

## 🚀 Next Steps

1. **Deploy Current Fixes**:
   ```bash
   git push origin fix/critical-issues-jan-2026
   # Create PR and merge to main
   ```

2. **Server-Side Investigations** (Priority Order):
   - [ ] Profile `ai-chat` function performance
   - [ ] Verify `eliza_activity_log` PostgREST access
   - [ ] Fix `realtime.broadcast_changes` error
   - [ ] Find and fix invalid PATCH query
   - [ ] Investigate conversation summarization failure

3. **Monitoring Setup**:
   - Add performance metrics logging
   - Set up alerts for slow responses (>10s)
   - Monitor Realtime connection health
   - Track conversation summary creation rate

---

## 📞 Support Information

If server-side issues persist after investigation:
- Check Supabase project logs: Dashboard → Logs → All logs
- Review Edge Function logs: Dashboard → Edge Functions → [function-name] → Logs
- Check database slow query log: Dashboard → Database → Query Performance

**GitHub Repository**: DevGruGold/suite  
**Branch**: fix/critical-issues-jan-2026
