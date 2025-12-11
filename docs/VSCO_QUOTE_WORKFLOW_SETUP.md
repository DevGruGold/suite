# VSCO Quote Workflow Setup Guide

This document describes how to configure Táve (VSCO Workspace) to automatically send Suite Enterprise quotes when Eliza creates a lead.

## Prerequisites

1. Active Táve account with Gmail integration (pfpattendants@gmail.com)
2. Stripe connected to Táve for payment processing
3. VSCO API credentials configured in Supabase secrets

## Táve Configuration Steps

### 1. Create "SuiteEnterprise" Job Type

1. Go to **Settings → Job Types**
2. Click **Add Job Type**
3. Configure:
   - Name: `SuiteEnterprise`
   - Category: Business/Corporate
   - Default Stage: Lead
   - Enable: Quote workflow

### 2. Create Suite Quote Template

1. Go to **Settings → Quote Templates**
2. Click **Add Template**
3. Configure:
   - Name: `Suite Enterprise License`
   - Description: AI Executive Replacement License
   - Products to include:
     - Suite Enterprise License - $50,000/year
     - Suite Pro License - $5,000/year (optional)
     - Suite Basic License - $500/year (optional)

### 3. Create Quote Email Template

1. Go to **Settings → Email Templates**
2. Click **Add Template**
3. Configure:
   - Name: `Suite Quote Invitation`
   - Subject: `Your AI Executive Suite Quote - {{company_name}}`
   - From: `pfpattendants@gmail.com`
   - Body: Include quote link, pricing breakdown, payment button

### 4. Create Automation Rule

1. Go to **Settings → Automations**
2. Click **Add Automation**
3. Configure:
   - Name: `Send Suite Quote on New Lead`
   - Trigger: **New Job Created**
   - Conditions:
     - Job Type = `SuiteEnterprise`
     - Stage = `Lead`
   - Action: **Send Email**
     - Template: `Suite Quote Invitation`
     - Include: Quote attachment

### 5. Configure Stripe Payment Link

1. Go to **Settings → Payments → Stripe**
2. Ensure Stripe is connected
3. Quote emails will automatically include Stripe payment buttons
4. When paid, job automatically moves to "Booked" stage

## Workflow Flow

```
User requests quote via Eliza
        ↓
Eliza calls create_suite_quote tool
        ↓
create-suite-quote edge function:
  1. Creates contact in VSCO
  2. Creates job (type: SuiteEnterprise) ← TRIGGERS AUTOMATION
  3. Links contact to job
  4. Creates order/quote
  5. Adds context note with savings estimate
        ↓
Táve Automation fires:
  - Detects new SuiteEnterprise lead
  - Sends quote email via Gmail
  - Email includes Stripe payment link
        ↓
Prospect receives email at their address
        ↓
Prospect clicks "Pay Now" button
        ↓
Stripe processes payment
        ↓
Táve updates job to "Booked"
```

## Testing the Workflow

### Via Eliza Chat
```
User: "Create a quote for Acme Corp, email ceo@acme.com, enterprise tier"
Eliza: [calls create_suite_quote] 
       "Quote sent to ceo@acme.com! They'll receive it shortly from pfpattendants@gmail.com."
```

### Via API
```bash
curl -X POST https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/create-suite-quote \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Acme Corp",
    "contact_email": "ceo@acme.com",
    "contact_name": "John Smith",
    "tier": "enterprise",
    "employee_count": 500
  }'
```

## Troubleshooting

### Quote email not sending
1. Check Táve automation is enabled
2. Verify job type is exactly `SuiteEnterprise`
3. Check Gmail integration status in Táve settings
4. Review Táve automation logs

### Payment link not working
1. Verify Stripe is connected in Táve
2. Check quote template has payment enabled
3. Ensure product pricing is configured

### Contact not linking
1. Check VSCO API permissions
2. Verify contact email format is valid
3. Review edge function logs

## Related Files

- `supabase/functions/create-suite-quote/index.ts` - Main orchestration function
- `supabase/functions/vsco-workspace/index.ts` - VSCO API wrapper
- `supabase/functions/_shared/elizaTools.ts` - Tool definition
- `supabase/functions/_shared/toolExecutor.ts` - Tool handler
