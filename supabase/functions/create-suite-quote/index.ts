import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QuoteRequest {
  company_name: string;
  contact_email: string;
  contact_name?: string;
  tier?: 'basic' | 'pro' | 'enterprise';
  employee_count?: number;
  notes?: string;
  executive_salaries?: {
    ceo?: number;
    cto?: number;
    cfo?: number;
    coo?: number;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body: QuoteRequest = await req.json();
    const { 
      company_name, 
      contact_email, 
      contact_name, 
      tier = 'enterprise',
      employee_count,
      notes,
      executive_salaries
    } = body;

    // Validate required fields
    if (!company_name || !contact_email) {
      return new Response(JSON.stringify({
        success: false,
        error: "company_name and contact_email are required"
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`📧 Creating Suite Quote for ${company_name} (${contact_email})`);

    // Parse contact name into first/last
    let firstName = '';
    let lastName = '';
    if (contact_name) {
      const nameParts = contact_name.trim().split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }

    // Step 1: Create contact in VSCO
    console.log(`1️⃣ Creating contact in VSCO...`);
    const contactResult = await supabase.functions.invoke('vsco-workspace', {
      body: {
        action: 'create_contact',
        data: {
          first_name: firstName || company_name,
          last_name: lastName || 'Contact',
          email: contact_email,
          company: company_name,
          kind: 'company',
          source: 'Eliza Chat',
          notes: `Suite ${tier} license inquiry`
        }
      }
    });

    if (contactResult.error) {
      console.error('Contact creation failed:', contactResult.error);
      return new Response(JSON.stringify({
        success: false,
        error: `Failed to create contact: ${contactResult.error.message}`,
        step: 'create_contact'
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const contactId = contactResult.data?.result?.id || contactResult.data?.id;
    console.log(`✅ Contact created: ${contactId}`);

    // Step 2: Create job/lead in VSCO (this triggers the automation!)
    console.log(`2️⃣ Creating SuiteEnterprise job in VSCO...`);
    const jobResult = await supabase.functions.invoke('vsco-workspace', {
      body: {
        action: 'create_job',
        data: {
          name: `Suite ${tier.charAt(0).toUpperCase() + tier.slice(1)} - ${company_name}`,
          job_type: 'SuiteEnterprise', // This triggers the Táve automation!
          stage: 'lead',
          lead_source: 'Eliza Chat',
          lead_rating: 'hot',
          notes: `Auto-generated Suite quote request.\nTier: ${tier}\nCompany: ${company_name}\nContact: ${contact_email}`
        }
      }
    });

    if (jobResult.error) {
      console.error('Job creation failed:', jobResult.error);
      return new Response(JSON.stringify({
        success: false,
        error: `Failed to create job: ${jobResult.error.message}`,
        step: 'create_job',
        contact_id: contactId
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const jobId = jobResult.data?.result?.id || jobResult.data?.id;
    console.log(`✅ Job created: ${jobId}`);

    // Step 3: Link contact to job
    console.log(`3️⃣ Linking contact to job...`);
    const linkResult = await supabase.functions.invoke('vsco-workspace', {
      body: {
        action: 'create_job_contact',
        data: {
          job_id: jobId,
          contact_id: contactId,
          is_primary: true,
          role: 'Decision Maker'
        }
      }
    });

    if (linkResult.error) {
      console.warn('Job-contact link warning:', linkResult.error);
      // Continue even if linking fails
    } else {
      console.log(`✅ Contact linked to job`);
    }

    // Step 4: Create order/quote (triggers quote email automation)
    console.log(`4️⃣ Creating order/quote...`);
    const orderResult = await supabase.functions.invoke('vsco-workspace', {
      body: {
        action: 'create_order',
        data: {
          job_id: jobId,
          notes: `Suite ${tier} License Quote`
        }
      }
    });

    const orderId = orderResult.data?.result?.id || orderResult.data?.id;
    if (orderId) {
      console.log(`✅ Order created: ${orderId}`);
    } else {
      console.warn('Order creation returned no ID:', orderResult);
    }

    // Step 5: Add detailed context note
    console.log(`5️⃣ Adding context note...`);
    
    // Calculate savings if we have the data
    let savingsInfo = '';
    if (employee_count || executive_salaries) {
      const ceoSalary = executive_salaries?.ceo || 500000;
      const ctoSalary = executive_salaries?.cto || 350000;
      const cfoSalary = executive_salaries?.cfo || 300000;
      const cooSalary = executive_salaries?.coo || 280000;
      const totalExecComp = ceoSalary + ctoSalary + cfoSalary + cooSalary;
      const suiteCost = tier === 'enterprise' ? 50000 : tier === 'pro' ? 5000 : 500;
      const savings = totalExecComp - suiteCost;
      const perEmployee = employee_count ? Math.round(savings / employee_count) : 0;
      
      savingsInfo = `\n\n💰 SAVINGS ESTIMATE:\n- Current Executive Compensation: $${totalExecComp.toLocaleString()}\n- Suite ${tier} Annual Cost: $${suiteCost.toLocaleString()}\n- Estimated Savings: $${savings.toLocaleString()}/year\n${employee_count ? `- Per Employee Redistribution: $${perEmployee.toLocaleString()}/year` : ''}`;
    }

    const noteContent = `🤖 SUITE AI EXECUTIVE QUOTE REQUEST

📋 DETAILS:
- Company: ${company_name}
- Contact: ${contact_name || 'N/A'} (${contact_email})
- Tier Requested: ${tier.toUpperCase()}
${employee_count ? `- Company Size: ${employee_count} employees` : ''}
${notes ? `\n📝 NOTES:\n${notes}` : ''}
${savingsInfo}

🕐 Created: ${new Date().toISOString()}
🔗 Source: Eliza Chat Conversational Acquisition`;

    await supabase.functions.invoke('vsco-workspace', {
      body: {
        action: 'create_note',
        data: {
          job_id: jobId,
          content: noteContent
        }
      }
    });
    console.log(`✅ Context note added`);

    // Step 6: Log activity
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'quote_created',
      description: `Suite ${tier} quote created for ${company_name}`,
      metadata: {
        company_name,
        contact_email,
        tier,
        vsco_job_id: jobId,
        vsco_contact_id: contactId,
        vsco_order_id: orderId,
        employee_count,
        source: 'create-suite-quote'
      }
    });

    console.log(`🎉 Quote workflow complete! Táve automation will send email.`);

    return new Response(JSON.stringify({
      success: true,
      message: `Quote created for ${company_name}! The quote email will be sent automatically to ${contact_email} from pfpattendants@gmail.com.`,
      data: {
        contact_id: contactId,
        job_id: jobId,
        order_id: orderId,
        tier,
        company_name,
        contact_email,
        automation_triggered: true,
        email_from: 'pfpattendants@gmail.com'
      }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Create suite quote error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error creating quote"
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
