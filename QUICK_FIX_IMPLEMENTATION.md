# 🚀 Quick Fix Implementation Guide
**Objective:** Connect Vertex AI Chat to the main ai-chat flow

---

## 📝 **File to Modify**

**Location:** `supabase/functions/ai-chat/index.ts`

---

## 🔧 **CODE CHANGES**

### **Step 1: Add Vertex AI Import**

**Add at the top of the file (around line 20):**
```typescript
// Add this import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
```

### **Step 2: Replace the AI Processing Section**

**Find this section (around line 144-220):**
```typescript
// ========== PHASE: AI PROCESSING WITH FALLBACKS ==========
// Generate executive system prompt
const executivePrompt = generateExecutiveSystemPrompt('AI');
const contextualPrompt = await buildContextualPrompt(executivePrompt, {
  conversationHistory: enrichedConversationHistory,
  userContext,
  miningStats,
  systemVersion
});

if (councilMode) {
  contextualPrompt += '\n\n=== COUNCIL MODE ACTIVATED ===\nYou are participating in an executive council deliberation. Provide strategic, analytical input from a general AI perspective. Focus on comprehensive analysis and balanced recommendations.';
}

const aiMessages = [{ role: 'system', content: contextualPrompt }, ...messages];

console.log('🚀 Trying AI providers in sequence...');

// Try Gemini first (most reliable for general AI)
const geminiResult = await callGeminiFallback(aiMessages, ELIZA_TOOLS);
if (geminiResult) {
  // ... existing gemini handling code
}

// Try DeepSeek fallback
console.log('🔄 Trying DeepSeek fallback...');
const deepseekResult = await callDeepSeekFallback(aiMessages, ELIZA_TOOLS);
if (deepseekResult) {
  // ... existing deepseek handling code
}
```

**Replace with:**
```typescript
// ========== PHASE: AI PROCESSING WITH FALLBACKS ==========
// Generate executive system prompt
const executivePrompt = generateExecutiveSystemPrompt('AI');
const contextualPrompt = await buildContextualPrompt(executivePrompt, {
  conversationHistory: enrichedConversationHistory,
  userContext,
  miningStats,
  systemVersion
});

if (councilMode) {
  contextualPrompt += '\n\n=== COUNCIL MODE ACTIVATED ===\nYou are participating in an executive council deliberation. Provide strategic, analytical input from a general AI perspective. Focus on comprehensive analysis and balanced recommendations.';
}

const aiMessages = [{ role: 'system', content: contextualPrompt }, ...messages];

console.log('🚀 Trying AI providers in sequence...');

// ========== NEW: TRY VERTEX AI FIRST (Google Cloud OAuth) ==========
try {
  console.log('🔵 Attempting Vertex AI (Google Cloud OAuth)...');
  const { data: vertexData, error: vertexError } = await supabase.functions.invoke('vertex-ai-chat', {
    body: { 
      messages: aiMessages,
      options: { temperature: 0.7, max_tokens: 1000 }
    }
  });

  if (!vertexError && vertexData?.success) {
    console.log('✅ Vertex AI succeeded');
    const vertexContent = vertexData.data?.choices?.[0]?.message?.content || vertexData.data?.content;
    
    if (vertexContent) {
      return new Response(
        JSON.stringify({
          success: true,
          response: vertexContent,
          executive: 'ai-chat',
          executiveTitle: 'AI Assistant [Vertex AI]',
          provider: 'vertex-ai',
          model: 'gemini-1.5-pro',
          oauth_authenticated: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }
  
  console.log('⚠️ Vertex AI unavailable or failed, falling back to Gemini API', vertexError?.message || 'No error');
} catch (vertexException) {
  console.log('⚠️ Vertex AI exception, falling back:', vertexException.message);
}

// ========== FALLBACK: TRY GEMINI API DIRECTLY ==========
console.log('🟢 Attempting Gemini API (direct)...');
const geminiResult = await callGeminiFallback(aiMessages, ELIZA_TOOLS);
if (geminiResult) {
  // Execute any tool calls from Gemini
  if (geminiResult.tool_calls && geminiResult.tool_calls.length > 0) {
    console.log(`🔧 Executing ${geminiResult.tool_calls.length} tool(s) from Gemini`);
    const toolResults = [];
    for (const toolCall of geminiResult.tool_calls) {
      const result = await executeToolCall(supabase, toolCall, 'AI', SUPABASE_URL, SERVICE_ROLE_KEY);
      toolResults.push({ tool: toolCall.function.name, result });
    }
    
    const userQuery = messages[messages.length - 1]?.content || '';
    const synthesized = await synthesizeToolResults(toolResults, userQuery, 'AI General Assistant');
    
    return new Response(
      JSON.stringify({
        success: true,
        response: synthesized || geminiResult.content,
        hasToolCalls: true,
        toolCallsExecuted: geminiResult.tool_calls.length,
        executive: 'ai-chat',
        executiveTitle: 'AI Assistant [Gemini API]',
        provider: 'gemini-api',
        model: 'gemini-2.0-flash-exp'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  return new Response(
    JSON.stringify({
      success: true,
      response: geminiResult.content,
      executive: 'ai-chat',
      executiveTitle: 'AI Assistant [Gemini API]',
      provider: 'gemini-api',
      model: 'gemini-2.0-flash-exp'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// ========== FALLBACK: TRY DEEPSEEK ==========
console.log('🔄 Trying DeepSeek fallback...');
const deepseekResult = await callDeepSeekFallback(aiMessages, ELIZA_TOOLS);
if (deepseekResult) {
  return new Response(
    JSON.stringify({
      success: true,
      response: deepseekResult.content,
      executive: 'ai-chat',
      executiveTitle: 'AI Assistant [DeepSeek]',
      provider: 'deepseek-fallback',
      model: 'deepseek-chat'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Emergency static fallback (rest of code remains same)
```

---

## 🧪 **TESTING PROCEDURE**

### **1. Verify OAuth Status**
```bash
# Replace YOUR_PROJECT and YOUR_ANON_KEY
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

**If `ready: false`:**
See "OAuth Setup Guide" section below.

---

### **2. Deploy Updated Function**
```bash
cd /path/to/suite

# Deploy the modified ai-chat function
supabase functions deploy ai-chat

# Check deployment logs
supabase functions logs ai-chat
```

---

### **3. Test Vertex AI Connection**
```bash
# Test vertex-ai-chat directly
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/vertex-ai-chat \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, this is a test message"}
    ]
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "choices": [
      {
        "message": {
          "role": "assistant",
          "content": "Hello! This is the Vertex AI ML Operations Specialist..."
        }
      }
    ],
    "provider": "vertex"
  },
  "executive": {
    "name": "ML Operations Specialist",
    "aiService": "vertex",
    "specializations": ["ml_ops", "ai_training", "model_deployment"]
  }
}
```

---

### **4. Test ai-chat with Vertex AI Integration**
```bash
# Test ai-chat (should now use Vertex AI as first option)
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/ai-chat \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What can you help me with?"}
    ]
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "response": "I can help you with...",
  "executive": "ai-chat",
  "executiveTitle": "AI Assistant [Vertex AI]",
  "provider": "vertex-ai",
  "model": "gemini-1.5-pro",
  "oauth_authenticated": true
}
```

**Key Field to Check:** `"provider": "vertex-ai"` confirms Vertex AI is being used!

---

### **5. Test Frontend Integration**
1. Open your app in browser
2. Open Developer Console (F12)
3. Type a message in chat
4. Check Network tab for request to `/functions/v1/ai-chat`
5. Look for response with `"provider": "vertex-ai"`

**Console should show:**
```
🔵 Attempting Vertex AI (Google Cloud OAuth)...
✅ Vertex AI succeeded
```

---

## 🔐 **OAUTH SETUP GUIDE** (if needed)

### **If OAuth Status Shows `ready: false`**

#### **Step 1: Get Authorization URL**
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/google-cloud-auth \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"get_authorization_url"}'
```

**Response:**
```json
{
  "success": true,
  "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...",
  "instructions": "Open this URL, sign in as xmrtsolutions@gmail.com..."
}
```

#### **Step 2: Complete OAuth in Browser**
1. Copy the `authorization_url` from response
2. Open in browser
3. **Sign in with:** `xmrtsolutions@gmail.com`
4. **Authorize all scopes** (Gmail, Drive, Sheets, Calendar, Vertex AI)
5. You'll be redirected to callback URL with success response

#### **Step 3: Store Refresh Token**
```bash
# The callback response contains refresh_token
# Store it in Supabase secrets:
supabase secrets set GOOGLE_REFRESH_TOKEN=<refresh_token_from_callback>

# Verify it's set:
supabase secrets list
```

**OR** store in database:
```sql
INSERT INTO oauth_connections (
  provider,
  refresh_token,
  is_active,
  scopes
) VALUES (
  'google_cloud',
  '<refresh_token_from_callback>',
  true,
  'gmail drive sheets calendar vertex-ai'
);
```

---

## ✅ **SUCCESS CRITERIA**

After implementing changes, you should see:

### **1. Logs Show Vertex AI Activation**
```
🔵 Attempting Vertex AI (Google Cloud OAuth)...
🔑 Refreshing Google access token...
✅ Successfully obtained Google access token
✅ Vertex AI succeeded
```

### **2. API Response Indicates Vertex AI**
```json
{
  "provider": "vertex-ai",
  "model": "gemini-1.5-pro",
  "oauth_authenticated": true,
  "executiveTitle": "AI Assistant [Vertex AI]"
}
```

### **3. Fallback Works if Vertex AI Fails**
```
⚠️ Vertex AI unavailable or failed, falling back to Gemini API
🟢 Attempting Gemini API (direct)...
✅ Gemini API succeeded
```

---

## 🆘 **COMMON ISSUES**

### **Issue: "Failed to get Google OAuth token"**
**Cause:** OAuth not configured or refresh token expired

**Solution:**
1. Run OAuth setup (see OAuth Setup Guide above)
2. Verify secrets with `supabase secrets list`
3. Check `oauth_connections` table for active connection

---

### **Issue: "Vertex AI API failed: 403 Forbidden"**
**Cause:** Vertex AI API not enabled in Google Cloud Project

**Solution:**
```bash
# 1. Go to Google Cloud Console
# 2. Navigate to: APIs & Services → Library
# 3. Search for "Vertex AI API"
# 4. Click "Enable"
# 5. Wait 2-3 minutes for propagation
```

---

### **Issue: "GOOGLE_CLOUD_PROJECT_ID not configured"**
**Cause:** Missing project ID environment variable

**Solution:**
```bash
# Find your project ID in Google Cloud Console
# Set in Supabase secrets:
supabase secrets set GOOGLE_CLOUD_PROJECT_ID=your-project-id
```

---

### **Issue: Response still shows "gemini-api" instead of "vertex-ai"**
**Possible Causes:**
1. Function not deployed: Run `supabase functions deploy ai-chat`
2. Old cache: Clear browser cache and reload
3. Vertex AI failing silently: Check logs with `supabase functions logs ai-chat`

**Debug:**
```bash
# Watch logs in real-time
supabase functions logs ai-chat --follow

# Then send a test message and watch for:
# - "Attempting Vertex AI" message
# - Any error messages from Vertex AI invocation
```

---

## 📊 **MONITORING**

### **Check Provider Distribution**
```sql
-- See which AI provider is being used
SELECT 
  provider,
  COUNT(*) as request_count,
  AVG(execution_time_ms) as avg_time_ms
FROM edge_function_usage_log
WHERE function_name = 'ai-chat'
  AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY provider
ORDER BY request_count DESC;
```

**Expected Result After Fix:**
```
provider    | request_count | avg_time_ms
------------|---------------|-------------
vertex-ai   | 95           | 850
gemini-api  | 4            | 950
deepseek    | 1            | 1200
```

---

## 🎯 **COMPLETION CHECKLIST**

- [ ] Modified `supabase/functions/ai-chat/index.ts` with Vertex AI fallback
- [ ] Verified OAuth status shows `ready: true`
- [ ] Deployed updated ai-chat function
- [ ] Tested vertex-ai-chat directly (works)
- [ ] Tested ai-chat shows `provider: "vertex-ai"`
- [ ] Tested frontend chat shows Vertex AI in logs
- [ ] Verified fallback to Gemini API works
- [ ] Monitored logs for any errors
- [ ] Updated team documentation

---

**Implementation Time:** ~15 minutes  
**Testing Time:** ~10 minutes  
**Total Time:** ~25 minutes

**Next Steps:** Once confirmed working, consider adding Vertex AI to the AI Gateway configuration for broader system integration.
