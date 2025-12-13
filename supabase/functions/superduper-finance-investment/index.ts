import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { startUsageTracking } from "../_shared/edgeFunctionUsageLogger.ts";

const FUNCTION_NAME = 'superduper-finance-investment';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-eliza-key',
};

/**
 * SuperDuper Agent: Financial Intelligence & Investment Advisor
 * 
 * Combined capabilities from:
 * - Compound Interest Investment Agent
 * - Corporate Finance & DCM Expert
 * - LatAm Fintech Credit Analyst
 * - Structured Credit Counsel
 * - ABL Borrowing Base Analyst
 * - IC Chief-of-Staff
 * - Super Finance Ops Agent
 * 
 * Core Functions:
 * - analyzeTreasuryPerformance
 * - calculateCompoundReturns
 * - generateInvestmentMemo
 * - performCreditAnalysis
 * - createBorrowingBaseReport
 * - optimizeTokenomics
 * - generateICPack
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body for cron triggers
    }

    const { action, params, context } = body;

    // Early return for cron triggers
    if (!action) {
      console.log('💰 Financial Intelligence Agent: Cron health check - OK');
      await usageTracker.success({ result_summary: 'cron_health_check' });
      return new Response(
        JSON.stringify({ 
          success: true, 
          cron: true,
          agent: "Financial Intelligence & Investment Advisor",
          status: "healthy",
          message: "Ready for financial tasks",
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`💰 Financial Intelligence Agent: ${action}`);

    // Route to appropriate function
    let result;
    
    switch (action) {
      case 'analyzeTreasuryPerformance':
        result = await analyzeTreasuryPerformance(params);
        break;
        
      case 'calculateCompoundReturns':
        result = await calculateCompoundReturns(params);
        break;
        
      case 'generateInvestmentMemo':
        result = await generateInvestmentMemo(params);
        break;
        
      case 'performCreditAnalysis':
        result = await performCreditAnalysis(params);
        break;
        
      case 'createBorrowingBaseReport':
        result = await createBorrowingBaseReport(params);
        break;
        
      case 'optimizeTokenomics':
        result = await optimizeTokenomics(params);
        break;
        
      case 'generateICPack':
        result = await generateICPack(params);
        break;
        
      default:
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Unknown action: ${action}`,
            available_actions: [
              'analyzeTreasuryPerformance',
              'calculateCompoundReturns',
              'generateInvestmentMemo',
              'performCreditAnalysis',
              'createBorrowingBaseReport',
              'optimizeTokenomics',
              'generateICPack'
            ]
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    await usageTracker.success({ result_summary: `${action}_completed` });
    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Financial Intelligence Agent error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================
// FUNCTION IMPLEMENTATIONS
// ============================================

async function analyzeTreasuryPerformance(params: any) {
  const { wallet_data, period = '30d', benchmarks = [] } = params;

  console.log('📊 Analyzing treasury performance...');

  // Calculate key metrics
  const totalValue = wallet_data?.total_value || 0;
  const startValue = wallet_data?.start_value || totalValue;
  const returnPercent = startValue > 0 ? ((totalValue - startValue) / startValue) * 100 : 0;

  // Asset allocation analysis
  const assets = wallet_data?.assets || [];
  const allocation = assets.map((asset: any) => ({
    asset: asset.symbol,
    value: asset.value,
    percent: (asset.value / totalValue) * 100,
    change_24h: asset.change_24h || 0
  }));

  // Risk metrics
  const volatility = calculateVolatility(assets);
  const sharpeRatio = calculateSharpeRatio(returnPercent, volatility);

  // Recommendations
  const recommendations = generateTreasuryRecommendations(allocation, volatility, returnPercent);

  return {
    summary: {
      total_value: totalValue,
      period_return_percent: returnPercent.toFixed(2),
      volatility: volatility.toFixed(2),
      sharpe_ratio: sharpeRatio.toFixed(2),
      risk_level: getRiskLevel(volatility)
    },
    allocation,
    performance: {
      vs_hold_monero: returnPercent - (benchmarks.find((b: any) => b.name === 'XMR')?.return || 0),
      vs_hold_btc: returnPercent - (benchmarks.find((b: any) => b.name === 'BTC')?.return || 0)
    },
    recommendations,
    analysis_timestamp: new Date().toISOString()
  };
}

async function calculateCompoundReturns(params: any) {
  const { 
    principal, 
    rate_percent, 
    period_years, 
    compound_frequency = 'daily',
    additional_contributions = 0,
    contribution_frequency = 'monthly'
  } = params;

  console.log('💵 Calculating compound returns...');

  const rate = rate_percent / 100;
  const frequencies: Record<string, number> = {
    'daily': 365,
    'weekly': 52,
    'monthly': 12,
    'quarterly': 4,
    'annually': 1
  };

  const n = frequencies[compound_frequency] || 365;
  const contribution_n = frequencies[contribution_frequency] || 12;

  // Calculate compound interest with regular contributions
  let finalValue = principal;
  const yearlyBreakdown = [];

  for (let year = 1; year <= period_years; year++) {
    // Compound existing balance
    finalValue = finalValue * Math.pow(1 + rate / n, n);
    
    // Add contributions
    const yearlyContributions = additional_contributions * contribution_n;
    for (let i = 0; i < contribution_n; i++) {
      const remaining_periods = contribution_n - i;
      finalValue += additional_contributions * Math.pow(1 + rate / n, (n / contribution_n) * remaining_periods);
    }

    yearlyBreakdown.push({
      year,
      value: finalValue,
      contributed_to_date: principal + (yearlyContributions * year),
      gains: finalValue - (principal + yearlyContributions * year)
    });
  }

  const totalContributed = principal + (additional_contributions * contribution_n * period_years);
  const totalGains = finalValue - totalContributed;
  const effectiveAPY = (Math.pow(finalValue / totalContributed, 1 / period_years) - 1) * 100;

  return {
    principal,
    final_value: finalValue,
    total_contributed: totalContributed,
    total_gains: totalGains,
    effective_apy: effectiveAPY.toFixed(2),
    roi_percent: ((totalGains / totalContributed) * 100).toFixed(2),
    yearly_breakdown: yearlyBreakdown,
    strategy: {
      compound_frequency,
      contribution_frequency,
      annual_rate: rate_percent
    }
  };
}

async function generateInvestmentMemo(params: any) {
  const { opportunity, analysis_depth = 'comprehensive' } = params;

  console.log('📄 Generating investment memo...');

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Get AI analysis
  const memoPrompt = `Generate a professional investment memo for the following opportunity:

**Investment Opportunity:**
${JSON.stringify(opportunity, null, 2)}

**Analysis Depth:** ${analysis_depth}

Please provide:
1. Executive Summary
2. Investment Thesis
3. Market Analysis
4. Financial Projections
5. Risk Assessment
6. Recommendation (Invest/Pass/More Diligence)
7. Key Terms & Conditions

Format the output as a professional investment committee memo.`;

  const { data: aiResponse, error } = await supabase.functions.invoke('lovable-chat', {
    body: {
      messages: [{ role: 'user', content: memoPrompt }]
    }
  });

  if (error) {
    throw new Error(`Failed to generate memo: ${error.message}`);
  }

  const memoContent = aiResponse?.response?.choices?.[0]?.message?.content || 'Memo generation failed';

  return {
    memo_content: memoContent,
    opportunity_name: opportunity.name || 'Unnamed Opportunity',
    generated_at: new Date().toISOString(),
    analysis_depth,
    metadata: {
      sector: opportunity.sector,
      stage: opportunity.stage,
      deal_size: opportunity.deal_size
    }
  };
}

async function performCreditAnalysis(params: any) {
  const { entity, financials } = params;

  console.log('🔍 Performing credit analysis...');

  // Calculate key financial ratios
  const currentRatio = financials.current_assets / financials.current_liabilities;
  const debtToEquity = financials.total_debt / financials.total_equity;
  const interestCoverage = financials.ebit / financials.interest_expense;
  const dscr = financials.net_operating_income / financials.total_debt_service;

  // Credit scoring
  let creditScore = 100;
  
  // Liquidity (0-25 points)
  if (currentRatio < 1) creditScore -= 25;
  else if (currentRatio < 1.5) creditScore -= 15;
  else if (currentRatio < 2) creditScore -= 5;

  // Leverage (0-25 points)
  if (debtToEquity > 2) creditScore -= 25;
  else if (debtToEquity > 1.5) creditScore -= 15;
  else if (debtToEquity > 1) creditScore -= 5;

  // Coverage (0-25 points)
  if (interestCoverage < 1.5) creditScore -= 25;
  else if (interestCoverage < 2.5) creditScore -= 15;
  else if (interestCoverage < 3.5) creditScore -= 5;

  // DSCR (0-25 points)
  if (dscr < 1) creditScore -= 25;
  else if (dscr < 1.25) creditScore -= 15;
  else if (dscr < 1.5) creditScore -= 5;

  const rating = getCreditRating(creditScore);
  const risk_level = getRiskFromRating(rating);

  return {
    entity: entity.name,
    credit_score: creditScore,
    credit_rating: rating,
    risk_level,
    key_ratios: {
      current_ratio: currentRatio.toFixed(2),
      debt_to_equity: debtToEquity.toFixed(2),
      interest_coverage: interestCoverage.toFixed(2),
      dscr: dscr.toFixed(2)
    },
    recommendation: creditScore >= 70 ? 'APPROVE' : creditScore >= 50 ? 'REVIEW' : 'DECLINE',
    analysis_date: new Date().toISOString()
  };
}

async function createBorrowingBaseReport(params: any) {
  const { assets, advance_rates } = params;

  console.log('📋 Creating borrowing base report...');

  const assetCategories = {
    accounts_receivable: { rate: advance_rates?.ar || 0.80 },
    inventory: { rate: advance_rates?.inventory || 0.50 },
    equipment: { rate: advance_rates?.equipment || 0.70 },
    real_estate: { rate: advance_rates?.real_estate || 0.75 }
  };

  const borrowingBase = Object.entries(assets).map(([category, value]: [string, any]) => {
    const rate = assetCategories[category as keyof typeof assetCategories]?.rate || 0;
    const eligible = value * rate;
    
    return {
      category,
      gross_value: value,
      advance_rate: rate * 100,
      eligible_amount: eligible
    };
  });

  const totalGrossValue = borrowingBase.reduce((sum, item) => sum + item.gross_value, 0);
  const totalEligible = borrowingBase.reduce((sum, item) => sum + item.eligible_amount, 0);
  const blendedAdvanceRate = (totalEligible / totalGrossValue) * 100;

  return {
    borrowing_base: borrowingBase,
    summary: {
      total_gross_value: totalGrossValue,
      total_eligible_borrowing: totalEligible,
      blended_advance_rate: blendedAdvanceRate.toFixed(2) + '%',
      availability: totalEligible
    },
    report_date: new Date().toISOString()
  };
}

async function optimizeTokenomics(params: any) {
  const { model_params } = params;

  console.log('🪙 Optimizing tokenomics...');

  const {
    total_supply,
    initial_price,
    mining_rewards,
    staking_apr,
    burn_rate,
    vesting_schedule
  } = model_params;

  // Simulate token economics over time
  const years = 5;
  const projections = [];
  
  let circulatingSupply = model_params.initial_circulation || total_supply * 0.1;
  let price = initial_price;

  for (let year = 0; year < years; year++) {
    // Add mining rewards
    const yearlyMining = mining_rewards * 365;
    circulatingSupply += yearlyMining;

    // Apply burn
    const burned = circulatingSupply * burn_rate;
    circulatingSupply -= burned;

    // Apply vesting releases
    const vested = (total_supply - circulatingSupply) * (vesting_schedule[year] || 0);
    circulatingSupply += vested;

    // Simple price model based on supply/demand
    const supplyInflation = yearlyMining / circulatingSupply;
    const demandGrowth = 0.5; // Assume 50% YoY demand growth
    price = price * (1 + demandGrowth - supplyInflation);

    projections.push({
      year: year + 1,
      circulating_supply: Math.round(circulatingSupply),
      price: price.toFixed(6),
      market_cap: (circulatingSupply * price).toFixed(0),
      inflation_rate: (supplyInflation * 100).toFixed(2) + '%'
    });
  }

  // Recommendations
  const recommendations = [];
  
  const finalInflation = (mining_rewards * 365) / circulatingSupply;
  if (finalInflation > 0.05) {
    recommendations.push('Consider reducing mining rewards to achieve <5% inflation');
  }
  
  if (burn_rate < 0.01) {
    recommendations.push('Implement token burn mechanism to offset inflation');
  }

  return {
    projections,
    recommendations,
    optimal_staking_apr: calculateOptimalStakingAPR(staking_apr, finalInflation),
    analysis_timestamp: new Date().toISOString()
  };
}

async function generateICPack(params: any) {
  const { deal_data } = params;

  console.log('📊 Generating Investment Committee pack...');

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const icPrompt = `Create a comprehensive Investment Committee decision pack for:

**Deal Information:**
${JSON.stringify(deal_data, null, 2)}

Please provide:
1. Executive Summary (1-page overview)
2. Deal Snapshot (key terms, parties, structure)
3. Investment Rationale (why this deal)
4. Financial Analysis (projections, returns, sensitivities)
5. Risk Assessment (key risks and mitigations)
6. Due Diligence Summary
7. Recommendation & Vote Request

Format as a professional IC memo with clear action items.`;

  const { data: aiResponse, error } = await supabase.functions.invoke('lovable-chat', {
    body: {
      messages: [{ role: 'user', content: icPrompt }]
    }
  });

  if (error) {
    throw new Error(`Failed to generate IC pack: ${error.message}`);
  }

  const icContent = aiResponse?.response?.choices?.[0]?.message?.content || 'IC pack generation failed';

  return {
    ic_pack: icContent,
    deal_name: deal_data.name || 'Unnamed Deal',
    generated_at: new Date().toISOString(),
    required_approvals: deal_data.required_approvals || ['CFO', 'CEO', 'Board'],
    deal_size: deal_data.size,
    recommendation: deal_data.recommendation || 'PENDING REVIEW'
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function calculateVolatility(assets: any[]): number {
  if (!assets || assets.length === 0) return 0;
  
  const returns = assets.map(a => a.change_24h || 0);
  const avg = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / returns.length;
  
  return Math.sqrt(variance);
}

function calculateSharpeRatio(returnPercent: number, volatility: number): number {
  const riskFreeRate = 4; // Assume 4% risk-free rate
  return volatility > 0 ? (returnPercent - riskFreeRate) / volatility : 0;
}

function getRiskLevel(volatility: number): string {
  if (volatility < 5) return 'LOW';
  if (volatility < 15) return 'MODERATE';
  if (volatility < 30) return 'HIGH';
  return 'VERY HIGH';
}

function generateTreasuryRecommendations(allocation: any[], volatility: number, returnPercent: number): string[] {
  const recommendations = [];
  
  // Concentration risk
  const maxAllocation = Math.max(...allocation.map(a => a.percent));
  if (maxAllocation > 50) {
    recommendations.push(`Reduce concentration in ${allocation.find(a => a.percent === maxAllocation)?.asset} (currently ${maxAllocation.toFixed(1)}%)`);
  }
  
  // Volatility management
  if (volatility > 20) {
    recommendations.push('Consider adding stable assets to reduce volatility');
  }
  
  // Performance
  if (returnPercent < 0) {
    recommendations.push('Review underperforming assets and consider rebalancing');
  }
  
  return recommendations.length > 0 ? recommendations : ['Portfolio allocation appears healthy'];
}

function getCreditRating(score: number): string {
  if (score >= 90) return 'AAA';
  if (score >= 80) return 'AA';
  if (score >= 70) return 'A';
  if (score >= 60) return 'BBB';
  if (score >= 50) return 'BB';
  if (score >= 40) return 'B';
  return 'CCC';
}

function getRiskFromRating(rating: string): string {
  const investmentGrade = ['AAA', 'AA', 'A', 'BBB'];
  return investmentGrade.includes(rating) ? 'INVESTMENT GRADE' : 'HIGH YIELD';
}

function calculateOptimalStakingAPR(currentAPR: number, inflation: number): number {
  // Optimal staking APR should be inflation + 2-5% premium
  return inflation * 100 + 3.5;
}
