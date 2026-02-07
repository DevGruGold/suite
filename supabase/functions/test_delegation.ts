
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { executeToolCall } from "./_shared/toolExecutor.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const toolCall = {
    name: 'delegate_to_specialist',
    args: {
        specialist_role: 'social-viral',
        task_description: 'Test delegation from test script',
        context_data: { source: 'test_delegation.ts' }
    }
};

console.log("🚀 Testing Delegation Logic...");

try {
    const result = await executeToolCall(
        supabase,
        toolCall,
        'Michael', // Simulating "Michael" the active agent
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
    );

    console.log("✅ Delegation Result:", result);
} catch (error) {
    console.error("❌ Delegation Failed:", error);
}
