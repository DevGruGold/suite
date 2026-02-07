import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  deviceId: string | null;
  ipAddress: string;
  walletAddress: string;
  walletType?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { deviceId, ipAddress, walletAddress, walletType = 'ethereum' }: RequestBody = await req.json();

    console.log('Updating payout wallet:', { deviceId, ipAddress, walletAddress, walletType });

    // Validate inputs
    if (!ipAddress || !walletAddress) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: ipAddress, walletAddress' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate wallet address format
    if (walletType === 'ethereum' && !walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return new Response(
        JSON.stringify({ error: 'Invalid Ethereum wallet address format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find or create user profile by IP address
    const { data: existingProfile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('ip_address', ipAddress)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching user profile:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let profileId: string;

    if (existingProfile) {
      // Update existing profile
      profileId = existingProfile.id;
      
      // Build wallet history
      const walletHistory = existingProfile.metadata?.wallet_history || [];
      walletHistory.push({
        address: walletAddress,
        type: walletType,
        connected_at: new Date().toISOString()
      });

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          payout_wallet_address: walletAddress,
          payout_wallet_type: walletType,
          wallet_connected_at: existingProfile.wallet_connected_at || new Date().toISOString(),
          wallet_last_verified: new Date().toISOString(),
          metadata: {
            ...existingProfile.metadata,
            wallet_history: walletHistory.slice(-10) // Keep last 10 wallet changes
          }
        })
        .eq('id', profileId);

      if (updateError) {
        console.error('Error updating profile:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update payout wallet' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Updated payout wallet for existing profile:', profileId);
    } else {
      // Create new profile
      const { data: newProfile, error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          ip_address: ipAddress,
          payout_wallet_address: walletAddress,
          payout_wallet_type: walletType,
          wallet_connected_at: new Date().toISOString(),
          wallet_last_verified: new Date().toISOString(),
          metadata: {
            wallet_history: [{
              address: walletAddress,
              type: walletType,
              connected_at: new Date().toISOString()
            }]
          }
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating profile:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to create user profile' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      profileId = newProfile.id;
      console.log('Created new profile with payout wallet:', profileId);
    }

    // Log the wallet connection activity
    if (deviceId) {
      await supabase.from('device_activity_log').insert({
        device_id: deviceId,
        event: 'wallet_connected',
        event_at: new Date().toISOString(),
        data: {
          wallet_address: walletAddress,
          wallet_type: walletType,
          profile_id: profileId
        }
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        profileId,
        walletAddress,
        walletType,
        message: 'Payout wallet saved successfully'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in update-payout-wallet:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
