import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Service-specific validation rules
const SERVICE_VALIDATORS: Record<string, { prefix?: string; minLength: number; name: string }> = {
  openai: { prefix: 'sk-', minLength: 20, name: 'OpenAI' },
  deepseek: { prefix: 'sk-', minLength: 20, name: 'DeepSeek' },
  gemini: { prefix: 'AIza', minLength: 30, name: 'Google Gemini' },
  xai: { minLength: 10, name: 'xAI' },
  github: { prefix: 'ghp_', minLength: 36, name: 'GitHub' },
  elevenlabs: { minLength: 20, name: 'ElevenLabs' },
  vercel_ai: { prefix: 'vck_', minLength: 20, name: 'Vercel AI' },
  lovable_ai: { prefix: 'lvbl_', minLength: 20, name: 'Lovable AI' },
};

function validateAPIKey(service: string, apiKey: string): { valid: boolean; error?: string } {
  const validator = SERVICE_VALIDATORS[service.toLowerCase()];

  if (!validator) {
    // console.warn(`⚠️ No validation rules for service: ${service}`);
    return { valid: true };
  }

  if (apiKey.length < validator.minLength) {
    return {
      valid: false,
      error: `${validator.name} API key must be at least ${validator.minLength} characters`
    };
  }

  if (validator.prefix) {
    if (service === 'github') {
      if (!apiKey.startsWith('ghp_') && !apiKey.startsWith('github_pat_')) {
        return {
          valid: false,
          error: 'GitHub tokens must start with "ghp_" or "github_pat_"'
        };
      }
    } else if (!apiKey.startsWith(validator.prefix)) {
      return {
        valid: false,
        error: `${validator.name} API keys must start with "${validator.prefix}"`
      };
    }
  }

  return { valid: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { service, secret_name, api_key, organization_id } = await req.json();

    if (!service || !api_key) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: service, api_key' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get User
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid user token' }), { status: 401, headers: corsHeaders });
    }

    const validationResult = validateAPIKey(service, api_key);
    if (!validationResult.valid) {
      return new Response(
        JSON.stringify({ error: validationResult.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upsert key to user_api_connections
    // We match on (user_id, provider, organization_id) thanks to the unique constraint.
    // If organization_id is undefined/null, it treats it as NULL. 
    // IMPORTANT: unique constraints with NULLs in PG < 15 require specific handling or explicit indices (which we created).
    // However, Supabase `upsert` relies on the constraint. The constraint name `user_api_connections_user_id_provider_org_key` was created.

    // Construct the record
    const record: any = {
      user_id: user.id,
      provider: service, // Usage of 'service' as 'provider'
      api_key: api_key,
      updated_at: new Date().toISOString()
    };

    if (organization_id) {
      record.organization_id = organization_id;
    } else {
      record.organization_id = null;
    }

    // We can't specify "onConflict" easily if we have two different unique indices (one for null, one for not null).
    // But we defined `user_api_connections_org_idx` etc.
    // simpler approach: Check if exists, then update or insert. Or try upsert.
    // Actually, `organization_id` is part of the constraint I added: `UNIQUE (user_id, provider, organization_id)`.
    // Wait, did I add that constraint?
    // In `20260205_org_context_switching.sql`:
    // `ALTER TABLE public.user_api_connections ADD CONSTRAINT user_api_connections_user_id_provider_org_key UNIQUE (user_id, provider, organization_id);`
    // Standard SQL treats NULLs as distinct, so multiple NULLs allowed. 
    // BUT I also added:
    // `CREATE UNIQUE INDEX IF NOT EXISTS user_api_connections_personal_idx ... WHERE organization_id IS NULL;`
    // To handle the NULL case for personal keys.

    // To properly UPSERT with Supabase/PostgREST on the NULL case, we might need to rely on the `id` if we knew it, or do a delete-insert?
    // Or utilize the conflict on the *index*? PostgREST supports `on_conflict` param.
    // Let's try explicit logic: Delete any existing matching row, then Insert. 
    // (This avoids "duplicate key" errors if we can't target the constraint perfectly).

    let deleteQuery = supabase
      .from('user_api_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', service);

    if (organization_id) {
      deleteQuery = deleteQuery.eq('organization_id', organization_id);
    } else {
      deleteQuery = deleteQuery.is('organization_id', null);
    }

    await deleteQuery;

    const { error: insertError } = await supabase
      .from('user_api_connections')
      .insert(record);

    if (insertError) {
      throw insertError;
    }

    console.log(`✅ Persisted ${service} API key for user ${user.id} (Org: ${organization_id || 'Personal'})`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${service} API key updated successfully`,
        service
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error updating API key:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
