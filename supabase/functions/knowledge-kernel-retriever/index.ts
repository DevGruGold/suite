import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY'); // Or SERVICE_ROLE_KEY if needed for RLS bypass

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Supabase URL or Key not set' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { query } = await req.json();

    if (!query) {
      return new Response(JSON.stringify({ error: 'Missing query in request body' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Example: Simple search based on description or name
    // In a real scenario, this would involve vector search if enabled
    const { data, error } = await supabase
      .from('knowledge_entities')
      .select('*')
      .ilike('description', `%${query}%`) // Case-insensitive search
      .limit(10); // Limit to top 10 relevant results

    if (error) {
      console.error('Error retrieving knowledge:', error);
      return new Response(JSON.stringify({ error: 'Failed to retrieve knowledge', details: error.message }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    return new Response(JSON.stringify({ success: true, results: data }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (e) {
    console.error('Request processing error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});