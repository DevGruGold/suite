# 🚀 Vertex AI Integration Setup Guide
**DevGruGold/suite - Complete Setup Instructions**

---

## 📋 **WHAT WAS CHANGED**

### **1. Code Changes**
- ✅ **Modified:** `supabase/functions/ai-chat/index.ts`
  - Added Vertex AI as primary AI provider (with OAuth)
  - Maintains fallback chain: Vertex AI → Gemini API → DeepSeek
  - Added OAuth authentication flag in responses

### **2. New Database Migration**
- ✅ **Created:** `supabase/migrations/20241228_vertex_ai_oauth_setup.sql`
  - `oauth_connections` table for storing OAuth refresh tokens
  - `ai_provider_usage_log` table for tracking AI provider usage
  - `google_cloud_service_log` table for Google Cloud API calls
  - Performance monitoring views
  - Auto-disable triggers for failing connections

---

## ⚡ **QUICK START (5 MINUTES)**

### **Step 1: Apply Database Migration**
```bash
cd /path/to/suite

# Apply the migration
supabase db push

# Verify tables were created
supabase db query "
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('oauth_connections', 'ai_provider_usage_log', 'google_cloud_service_log')
ORDER BY tablename;
"
```

**Expected output:**
```
              tablename
------------------------------------
 ai_provider_usage_log
 google_cloud_service_log
 oauth_connections
```

---

### **Step 2: Configure Google Cloud OAuth**

#### **Option A: Using Environment Variables (Fastest)**
```bash
# Set required secrets in Supabase
supabase secrets set GOOGLE_CLIENT_ID=your_client_id_here
supabase secrets set GOOGLE_CLIENT_SECRET=your_client_secret_here
supabase secrets set GOOGLE_REFRESH_TOKEN=your_refresh_token_here
supabase secrets set GOOGLE_CLOUD_PROJECT_ID=your_project_id_here

# Verify secrets are set
supabase secrets list
```

#### **Option B: Using Database (Recommended for Production)**
```sql
-- Insert OAuth connection into database
INSERT INTO public.oauth_connections (
    provider,
    provider_email,
    refresh_token,
    scopes,
    is_active,
    metadata
) VALUES (
    'google_cloud',
    'xmrtsolutions@gmail.com',
    'YOUR_REFRESH_TOKEN_HERE',
    ARRAY[
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/cloud-platform'
    ],
    true,
    '{"source": "manual_setup", "setup_date": "2024-12-28"}'::jsonb
);
```

---

### **Step 3: Get OAuth Refresh Token (if you don't have it)**

#### **3a. Test OAuth Status**
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/google-cloud-auth \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"status"}'
```

**If response shows `"ready": false`**, continue with 3b-3d:

#### **3b. Get Authorization URL**
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/google-cloud-auth \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"get_authorization_url"}'
```

**Response contains:**
```json
{
  "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...",
  "instructions": "Open this URL..."
}
```

#### **3c. Complete OAuth Flow**
1. Copy the `authorization_url` from step 3b
2. Open in browser
3. Sign in with `xmrtsolutions@gmail.com`
4. Grant all permissions
5. You'll be redirected to callback with refresh token

#### **3d. Store Refresh Token**
```bash
# Store in Supabase secrets
supabase secrets set GOOGLE_REFRESH_TOKEN=<token_from_callback>

# OR insert into database (see Option B above)
```

---

### **Step 4: Deploy Updated Edge Function**
```bash
# Deploy ai-chat function with Vertex AI integration
supabase functions deploy ai-chat

# Watch deployment logs
supabase functions logs ai-chat --follow
```

---

### **Step 5: Test the Integration**

#### **Test 1: Verify OAuth Status**
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/google-cloud-auth \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"status"}'
```

**Expected Response:**
```json
{
  "success": true,
  "configured": {
    "client_id": true,
    "client_secret": true,
    "refresh_token": true
  },
  "ready": true,
  "available_services": ["gmail", "drive", "sheets", "calendar", "gemini"]
}
```

#### **Test 2: Test Vertex AI Directly**
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/vertex-ai-chat \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, test Vertex AI"}
    ]
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "choices": [{"message": {"content": "Hello! I'm the Vertex AI..."}}],
    "provider": "vertex"
  },
  "executive": {
    "name": "ML Operations Specialist",
    "aiService": "vertex"
  }
}
```

#### **Test 3: Test ai-chat (Should Use Vertex AI)**
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/ai-chat \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What AI provider are you using?"}
    ]
  }'
```

**Expected Response (KEY FIELD: `"provider": "vertex-ai"`):**
```json
{
  "success": true,
  "response": "I am currently using Vertex AI...",
  "executive": "ai-chat",
  "executiveTitle": "AI Assistant [Vertex AI]",
  "provider": "vertex-ai",
  "model": "gemini-1.5-pro",
  "oauth_authenticated": true
}
```

✅ **SUCCESS INDICATOR:** Response shows `"provider": "vertex-ai"`

---

## 📊 **MONITORING & VERIFICATION**

### **Query 1: Check OAuth Connection Health**
```sql
SELECT * FROM public.oauth_connection_health;
```

**Expected Result:**
```
provider      | total_connections | active_connections | most_recent_use
--------------|-------------------|--------------------|-----------------
google_cloud  | 1                 | 1                  | 2024-12-28 ...
```

---

### **Query 2: Verify Vertex AI is Being Used**
```sql
SELECT 
    provider,
    COUNT(*) as request_count,
    COUNT(*) FILTER (WHERE success = TRUE) as successful,
    AVG(execution_time_ms) as avg_time_ms,
    COUNT(*) FILTER (WHERE oauth_authenticated = TRUE) as oauth_requests
FROM public.ai_provider_usage_log
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY provider
ORDER BY request_count DESC;
```

**Expected Result:**
```
provider    | request_count | successful | avg_time_ms | oauth_requests
------------|---------------|------------|-------------|---------------
vertex-ai   | 15            | 15         | 850         | 15
gemini-api  | 2             | 2          | 920         | 0
```

✅ **Success:** `vertex-ai` should have highest request count with `oauth_requests > 0`

---

### **Query 3: Check Recent AI Requests**
```sql
SELECT 
    provider,
    model,
    oauth_authenticated,
    execution_time_ms,
    success,
    fallback_level,
    timestamp
FROM public.ai_provider_usage_log
ORDER BY timestamp DESC
LIMIT 10;
```

---

### **Query 4: Monitor Google Cloud Service Usage**
```sql
SELECT 
    service,
    operation,
    COUNT(*) as operation_count,
    AVG(execution_time_ms) as avg_time_ms,
    COUNT(*) FILTER (WHERE success = TRUE) as successful
FROM public.google_cloud_service_log
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY service, operation
ORDER BY operation_count DESC;
```

---

## 🔍 **TROUBLESHOOTING**

### **Issue 1: OAuth Status Shows `"ready": false`**

**Diagnosis:**
```bash
supabase secrets list
```

**Look for:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_CLOUD_PROJECT_ID`

**Solution:** Complete Step 3 (Get OAuth Refresh Token) above

---

### **Issue 2: Vertex AI Returns 403 Forbidden**

**Cause:** Vertex AI API not enabled in Google Cloud Project

**Solution:**
1. Go to: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com
2. Click "Enable"
3. Wait 2-3 minutes for propagation
4. Test again

---

### **Issue 3: Response Still Shows `"provider": "gemini-api"`**

**Possible Causes:**
1. Function not deployed
2. Vertex AI failing silently
3. OAuth not configured

**Debug Steps:**
```bash
# Check deployment
supabase functions list

# Watch logs in real-time
supabase functions logs ai-chat --follow

# Send test message and watch for:
# - "🔵 Attempting Vertex AI"
# - Any error messages
```

**Look for these log messages:**
- ✅ `🔵 Attempting Vertex AI (Google Cloud OAuth)...`
- ✅ `✅ Vertex AI succeeded`
- ⚠️ `⚠️ Vertex AI unavailable or failed, falling back to Gemini API` (indicates OAuth issue)

---

### **Issue 4: Database Migration Failed**

**Check Error:**
```bash
supabase db query "SELECT * FROM _supabase_migrations ORDER BY inserted_at DESC LIMIT 5;"
```

**Common Errors:**
- **"already exists"** - Tables created, migration safe to skip
- **"permission denied"** - Run as database owner/service role

**Force Reapply (if needed):**
```bash
# Drop and recreate (CAUTION: loses data in these tables)
supabase db query "
DROP TABLE IF EXISTS public.google_cloud_service_log CASCADE;
DROP TABLE IF EXISTS public.ai_provider_usage_log CASCADE;
DROP TABLE IF EXISTS public.oauth_connections CASCADE;
"

# Reapply migration
supabase db push
```

---

## 📈 **EXPECTED BEHAVIOR AFTER SETUP**

### **Before Fix:**
```
User → ai-chat → Gemini API → Response
```
- No OAuth
- No Google Cloud integration
- Direct API calls only

### **After Fix:**
```
User → ai-chat → Vertex AI (OAuth) → Response
                    ↓ (if fails)
                Gemini API → Response
                    ↓ (if fails)
                DeepSeek → Response
```
- ✅ OAuth authenticated
- ✅ Google Cloud integration (Gmail, Drive, Sheets, Calendar)
- ✅ Enterprise-grade Vertex AI
- ✅ Maintained fallback chain

---

## 🎯 **SUCCESS CHECKLIST**

- [ ] Database migration applied successfully
- [ ] Tables created: `oauth_connections`, `ai_provider_usage_log`, `google_cloud_service_log`
- [ ] Google OAuth secrets configured (either env or database)
- [ ] OAuth status shows `"ready": true`
- [ ] `vertex-ai-chat` test returns success
- [ ] `ai-chat` test returns `"provider": "vertex-ai"`
- [ ] Frontend chat uses Vertex AI (check browser console)
- [ ] Monitoring queries return data
- [ ] Logs show "Vertex AI succeeded" messages

---

## 📚 **ADDITIONAL RESOURCES**

### **Database Schema Documentation**
- [oauth_connections Table Schema](supabase/migrations/20241228_vertex_ai_oauth_setup.sql#L12-L46)
- [ai_provider_usage_log Schema](supabase/migrations/20241228_vertex_ai_oauth_setup.sql#L72-L118)
- [google_cloud_service_log Schema](supabase/migrations/20241228_vertex_ai_oauth_setup.sql#L160-L190)

### **Monitoring Views**
- `oauth_connection_health` - OAuth connection status
- `ai_provider_performance` - 24-hour AI provider metrics
- `google_cloud_service_summary` - 7-day Google Cloud usage

### **Edge Functions**
- `google-cloud-auth` - OAuth flow and token management
- `vertex-ai-chat` - Vertex AI API integration
- `ai-chat` - Main chat router (now includes Vertex AI)

---

## 🔐 **SECURITY NOTES**

1. **Refresh Token Security**
   - Stored in `oauth_connections.refresh_token` (plaintext)
   - **PRODUCTION RECOMMENDATION:** Encrypt with Supabase Vault or similar
   - Auto-disabled after 5 consecutive failures

2. **Row Level Security (RLS)**
   - Enabled on all new tables
   - Service role has full access
   - Adjust policies based on your auth model

3. **Token Rotation**
   - Access tokens automatically refreshed
   - Last refresh tracked in `last_refreshed_at`
   - Error tracking in `error_count` column

---

## 📞 **SUPPORT**

If you encounter issues:

1. **Check logs:**
   ```bash
   supabase functions logs ai-chat --follow
   supabase functions logs google-cloud-auth --follow
   ```

2. **Verify database:**
   ```sql
   SELECT * FROM public.oauth_connection_health;
   SELECT * FROM public.ai_provider_performance;
   ```

3. **Test OAuth directly:**
   ```bash
   curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/google-cloud-auth \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     -d '{"action":"get_access_token"}'
   ```

---

**Setup Time:** ~15-20 minutes  
**Testing Time:** ~10 minutes  
**Total Time:** ~30 minutes for complete integration

---

**🎉 Congratulations!** Your Vertex AI integration with Google Cloud OAuth is now live!
