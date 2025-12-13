import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'process-license-application';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LicenseApplicationData {
  company_name: string;
  company_size: number;
  industry?: string;
  current_ceo_salary?: number;
  current_cto_salary?: number;
  current_cfo_salary?: number;
  current_coo_salary?: number;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  contact_title?: string;
  tier_requested: string;
  compliance_commitment: boolean;
  notes?: string;
  session_key?: string;
  filled_by?: string;
}

Deno.serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { action, data } = await req.json();
    console.log(`📋 License Application Action: ${action}`, data);

    switch (action) {
      case 'submit_application': {
        const appData = data as LicenseApplicationData;
        
        // Calculate savings
        const totalExecComp = 
          (appData.current_ceo_salary || 0) +
          (appData.current_cto_salary || 0) +
          (appData.current_cfo_salary || 0) +
          (appData.current_coo_salary || 0);
        
        const aiCost = 100000;
        const estimatedSavings = Math.max(0, totalExecComp - aiCost);
        const perEmployeeRedistribution = appData.company_size > 0 
          ? estimatedSavings / appData.company_size 
          : 0;

        const { data: result, error } = await supabase
          .from('corporate_license_applications')
          .insert({
            ...appData,
            estimated_savings: estimatedSavings,
            per_employee_redistribution: perEmployeeRedistribution,
            application_status: 'submitted',
            filled_by: appData.filled_by || 'eliza_conversation',
          })
          .select()
          .single();

        if (error) throw error;

        // Log activity for visibility in ticker
        await supabase.from('activity_feed').insert({
          type: 'license_application',
          title: `License Application: ${appData.company_name}`,
          description: `New ${appData.tier_requested} license application from ${appData.company_name} (${appData.company_size} employees)`,
          data: { application_id: result.id, tier: appData.tier_requested, savings: estimatedSavings }
        });

        // Also log to eliza_activity_log for Eliza awareness
        await supabase.from('eliza_activity_log').insert({
          activity_type: 'license_application_received',
          description: `New license application from ${appData.company_name} for ${appData.tier_requested} tier. Estimated savings: $${estimatedSavings.toLocaleString()}`,
          metadata: { 
            application_id: result.id, 
            company: appData.company_name,
            tier: appData.tier_requested, 
            savings: estimatedSavings,
            employees: appData.company_size,
            contact_email: appData.contact_email
          }
        });

        // Trigger monetization engine for free trial applications
        if (appData.tier_requested === 'free_trial') {
          try {
            const monetizationResult = await supabase.functions.invoke('service-monetization-engine', {
              body: {
                action: 'generate_api_key',
                data: {
                  company_name: appData.company_name,
                  contact_email: appData.contact_email,
                  tier: 'trial',
                  monthly_quota: 1000,
                  metadata: { application_id: result.id }
                }
              }
            });
            console.log('✅ Monetization engine triggered:', monetizationResult);
          } catch (monError) {
            console.error('⚠️ Monetization engine call failed (non-blocking):', monError);
          }
        }

        return new Response(JSON.stringify({
          success: true,
          application_id: result.id,
          estimated_savings: estimatedSavings,
          per_employee_redistribution: perEmployeeRedistribution,
          message: `Application submitted successfully. Estimated annual savings: $${estimatedSavings.toLocaleString()}, Per employee raise: $${perEmployeeRedistribution.toLocaleString()}`
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get_application_status': {
        const { application_id, email } = data;
        
        let query = supabase.from('corporate_license_applications').select('*');
        
        if (application_id) {
          query = query.eq('id', application_id);
        } else if (email) {
          query = query.eq('contact_email', email).order('created_at', { ascending: false });
        }

        const { data: applications, error } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({
          success: true,
          applications: applications || []
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'update_application': {
        const { application_id, updates } = data;
        
        const { data: result, error } = await supabase
          .from('corporate_license_applications')
          .update(updates)
          .eq('id', application_id)
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify({
          success: true,
          application: result
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'calculate_savings': {
        const { ceo_salary, cto_salary, cfo_salary, coo_salary, employee_count } = data;
        
        const totalExecComp = (ceo_salary || 0) + (cto_salary || 0) + (cfo_salary || 0) + (coo_salary || 0);
        const aiCost = 100000;
        const annualSavings = Math.max(0, totalExecComp - aiCost);
        const perEmployeeRaise = employee_count > 0 ? annualSavings / employee_count : 0;
        const percentageIncrease = (perEmployeeRaise / 60000) * 100; // Based on $60k avg salary

        return new Response(JSON.stringify({
          success: true,
          total_executive_compensation: totalExecComp,
          ai_executive_cost: aiCost,
          annual_savings: annualSavings,
          per_employee_raise: perEmployeeRaise,
          percentage_increase: percentageIncrease,
          summary: `With ${employee_count} employees and $${totalExecComp.toLocaleString()} in executive compensation, you could save $${annualSavings.toLocaleString()}/year. This means $${perEmployeeRaise.toLocaleString()} extra per employee annually (${percentageIncrease.toFixed(0)}% raise on average salary).`
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'create_draft': {
        // Create a draft application from conversation
        const { session_key, partial_data } = data;
        
        const { data: draft, error } = await supabase
          .from('corporate_license_applications')
          .insert({
            ...partial_data,
            application_status: 'draft',
            filled_by: 'eliza_conversation',
            session_key: session_key,
          })
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify({
          success: true,
          draft_id: draft.id,
          message: 'Draft application created. Continue providing information to complete it.'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get_draft_by_session': {
        const { session_key } = data;
        
        const { data: draft, error } = await supabase
          .from('corporate_license_applications')
          .select('*')
          .eq('session_key', session_key)
          .eq('application_status', 'draft')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        return new Response(JSON.stringify({
          success: true,
          draft: draft
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        await usageTracker.failure(`Unknown action: ${action}`, 400);
        return new Response(JSON.stringify({
          success: false,
          error: `Unknown action: ${action}`
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (error: any) {
    console.error('❌ License Application Error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});