# Google Gmail OAuth Setup Guide

## Problem Identified

The `google-gmail` edge function is returning 200 OK but not executing Gmail API operations because:

1. OAuth authentication is not properly configured
2. Missing refresh token in the `oauth_connections` database table
3. Environment variables for Google OAuth are not set

## Solution Steps

### User Authorization Flow (Two-Step Process)

**Important:** Authentication in the Suite ecosystem is a **two-step process**.

1. **App Authentication:** You sign in to the application using Supabase Auth (Google Sign-In). This verifies your identity.
2. **Service Authorization:** You must explicitly authorize Google Cloud Services (Gmail, Drive, Sheets, Calendar) to allow the AI agents to act on your behalf.

Users must complete **both** steps. After signing in, navigate to the **Credentials** page or your **Profile** to connect your Google Cloud account.

### Step 1: Create Google Cloud Project & Enable Gmail API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API:
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API"
   - Click "Enable"

### Step 2: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Configure OAuth consent screen if prompted:
   - User Type: External (for testing) or Internal (for organization)
   - App name: "Suite Gmail Integration"
   - User support email: Your email
   - Scopes: Add `https://mail.google.com/` or `https://www.googleapis.com/auth/gmail.send`
4. Create OAuth Client ID:
   - Application type: Web application
   - Name: "Suite Gmail OAuth"
   - Authorized redirect URIs: `https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/google-oauth-handler/callback`
5. Save the **Client ID** and **Client Secret**

### Step 3: Set Supabase Environment Variables

1. Go to your Supabase project: <https://supabase.com/dashboard/project/vawouugtzwmejxqkeqqj>
2. Navigate to "Settings" > "Edge Functions" > "Environment Variables"
3. Add these variables:

   ```
   GOOGLE_CLIENT_ID=<your-client-id>
   GOOGLE_CLIENT_SECRET=<your-client-secret>
   ```

### Step 4: Create OAuth Handler Edge Function

You need to create a new edge function to handle OAuth flow. This function will:

1. Generate the authorization URL
2. Handle the OAuth callback
3. Store the refresh token in the database

**File: `supabase/functions/google-oauth-handler/index.ts`**

See the implementation in this repository.

### Step 5: Complete OAuth Flow

1. Open this URL in your browser:

   ```
   https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/google-oauth-handler/start
   ```

2. You'll be redirected to Google's consent screen
3. Grant the requested permissions
4. You'll be redirected back and the refresh token will be saved to the database

### Step 6: Verify Setup

1. Check the `oauth_connections` table in your Supabase database:

   ```sql
   SELECT provider, provider_email, is_active, connected_at, scopes
   FROM oauth_connections
   WHERE provider = 'google_cloud'
   ORDER BY connected_at DESC;
   ```

2. Test the Gmail function:

   ```bash
   curl -X POST 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/google-gmail' \
     -H "Authorization: Bearer <your-anon-key>" \
     -H "Content-Type: application/json" \
     -d '{
       "action": "send_email",
       "to": "test@example.com",
       "subject": "Test Email",
       "body": "This is a test email from Suite"
     }'
   ```

## Troubleshooting

### Error: "Google Cloud not configured"

- Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in Supabase Edge Functions environment variables
- Redeploy the edge functions after setting variables

### Error: "Failed to get access token"

- Complete the OAuth flow by visiting `/google-oauth-handler/start`
- Check if refresh token exists in `oauth_connections` table
- Verify the refresh token hasn't expired

### Error: "Invalid grant" when refreshing token

- The refresh token may have expired or been revoked
- Complete the OAuth flow again to get a new refresh token

## Security Notes

⚠️ **IMPORTANT**:

- Never commit `GOOGLE_CLIENT_SECRET` to version control
- Store refresh tokens securely (consider encrypting in production)
- Use Supabase Vault for sensitive credentials in production
- Regularly rotate OAuth credentials
- Monitor the `oauth_connections` table for suspicious activity

## Testing

After setup, you can test with:

```bash
# List available actions
curl -X POST 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/google-gmail' \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "list_actions"}'

# Send test email
curl -X POST 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/google-gmail' \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "send_email",
    "to": "xmrtnet@gmail.com",
    "subject": "Test from Suite",
    "body": "Hello from Suite!",
    "is_html": false
  }'
```
