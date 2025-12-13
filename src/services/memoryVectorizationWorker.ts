import { supabase } from '@/integrations/supabase/client';

/**
 * Background worker to process pending memory vectorization tasks
 * This monitors the webhook_logs table for pending vectorization requests
 */
export class MemoryVectorizationWorker {
  private static instance: MemoryVectorizationWorker;
  private isRunning = false;
  private checkInterval = 5000; // Check every 5 seconds

  public static getInstance(): MemoryVectorizationWorker {
    if (!MemoryVectorizationWorker.instance) {
      MemoryVectorizationWorker.instance = new MemoryVectorizationWorker();
    }
    return MemoryVectorizationWorker.instance;
  }

  // Start the worker
  public start(): void {
    if (this.isRunning) {
      console.log('⚙️ Vectorization worker already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting memory vectorization worker');
    this.processLoop();
  }

  // Stop the worker
  public stop(): void {
    this.isRunning = false;
    console.log('🛑 Stopping memory vectorization worker');
  }

  // Main processing loop
  private async processLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.processPendingVectorizations();
      } catch (error) {
        console.error('Error in vectorization worker:', error);
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, this.checkInterval));
    }
  }

  // Process pending vectorization tasks
  private async processPendingVectorizations(): Promise<void> {
    try {
      // Get pending vectorization tasks
      const { data: pendingTasks, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .eq('webhook_name', 'vectorize_memory')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(10);

      if (error) {
        console.error('Error fetching pending tasks:', error);
        return;
      }

      if (!pendingTasks || pendingTasks.length === 0) {
        return; // No pending tasks
      }

      console.log(`📝 Processing ${pendingTasks.length} pending vectorization tasks`);

      // Process each task
      for (const task of pendingTasks) {
        try {
          const payload = task.payload as any;
          const { memory_id, content, context_type } = payload;

          // Skip empty content - don't even call the function
          if (!content || content.trim().length === 0) {
            console.log(`⏭️ Skipping vectorization for ${memory_id} - empty content`);
            await supabase
              .from('webhook_logs')
              .update({ 
                status: 'completed',
                response: { skipped: true, reason: 'empty_content' }
              })
              .eq('id', task.id);
            continue;
          }

          // Call vectorization function
          const { data, error: vectorizeError } = await supabase.functions.invoke('vectorize-memory', {
            body: {
              memory_id,
              content,
              context_type
            }
          });

          // Handle skipped responses (400 with skipped: true) as success
          if (data?.skipped) {
            console.log(`⏭️ Vectorization skipped for ${memory_id}: ${data.error || 'empty content'}`);
            await supabase
              .from('webhook_logs')
              .update({ 
                status: 'completed',
                response: data
              })
              .eq('id', task.id);
          } else if (vectorizeError) {
            console.error(`Failed to vectorize memory ${memory_id}:`, vectorizeError);
            
            // Mark as failed
            await supabase
              .from('webhook_logs')
              .update({ 
                status: 'failed',
                error_message: vectorizeError.message 
              })
              .eq('id', task.id);
          } else {
            console.log(`✅ Successfully vectorized memory ${memory_id}`);
            
            // Mark as completed
            await supabase
              .from('webhook_logs')
              .update({ 
                status: 'completed',
                response: data
              })
              .eq('id', task.id);
          }
        } catch (taskError) {
          console.error('Error processing task:', taskError);
          
          // Mark as failed
          await supabase
            .from('webhook_logs')
            .update({ 
              status: 'failed',
              error_message: taskError instanceof Error ? taskError.message : 'Unknown error'
            })
            .eq('id', task.id);
        }
      }
    } catch (error) {
      console.error('Error in processPendingVectorizations:', error);
    }
  }
}

export const memoryVectorizationWorker = MemoryVectorizationWorker.getInstance();
