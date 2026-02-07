import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { corsHeaders } from "../_shared/cors.ts";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const usageTracker = startUsageTracking('cleanup-duplicate-tasks');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log('🧹 Starting duplicate task cleanup...');

    // Find all duplicate tasks grouped by title, assignee, and status
    const { data: duplicates, error: duplicatesError } = await supabase.rpc('find_duplicate_tasks');
    
    if (duplicatesError) {
      // If RPC doesn't exist, do it manually
      const { data: allTasks, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (tasksError) throw tasksError;
      
      // Group tasks by key fields
      const taskGroups = new Map<string, any[]>();
      
      for (const task of allTasks || []) {
        const key = `${task.title}|||${task.assignee_agent_id}|||${task.status}`;
        if (!taskGroups.has(key)) {
          taskGroups.set(key, []);
        }
        taskGroups.get(key)!.push(task);
      }
      
      let deletedCount = 0;
      const tasksToDelete: string[] = [];
      
      // For each group, keep the oldest, delete the rest
      for (const [key, tasks] of taskGroups) {
        if (tasks.length > 1) {
          console.log(`Found ${tasks.length} duplicates for: ${key.split('|||')[0]}`);
          
          // Sort by created_at and keep the first (oldest)
          tasks.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          const toKeep = tasks[0];
          const toDelete = tasks.slice(1);
          
          console.log(`  Keeping: ${toKeep.id} (created ${toKeep.created_at})`);
          console.log(`  Deleting: ${toDelete.map(t => t.id).join(', ')}`);
          
          tasksToDelete.push(...toDelete.map(t => t.id));
          deletedCount += toDelete.length;
        }
      }
      
      if (tasksToDelete.length > 0) {
        console.log(`🗑️ Deleting ${tasksToDelete.length} duplicate tasks...`);
        
        const { error: deleteError } = await supabase
          .from('tasks')
          .delete()
          .in('id', tasksToDelete);
        
        if (deleteError) throw deleteError;
        
        // Log the cleanup activity
        await supabase.from('eliza_activity_log').insert({
          activity_type: 'system_maintenance',
          title: '🧹 Cleaned Up Duplicate Tasks',
          description: `Removed ${deletedCount} duplicate task entries`,
          metadata: {
            deleted_count: deletedCount,
            deleted_ids: tasksToDelete
          },
          status: 'completed'
        });
        
        console.log(`✅ Successfully deleted ${deletedCount} duplicate tasks`);
      } else {
        console.log('✨ No duplicates found!');
      }
      
      await usageTracker.success({ result_summary: `deleted_${deletedCount}_duplicates` });
      return new Response(
        JSON.stringify({ 
          success: true, 
          deleted_count: deletedCount,
          message: `Cleaned up ${deletedCount} duplicate tasks`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await usageTracker.success({ result_summary: 'cleanup_completed' });
    return new Response(
      JSON.stringify({ success: true, message: 'Cleanup completed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Cleanup Error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
