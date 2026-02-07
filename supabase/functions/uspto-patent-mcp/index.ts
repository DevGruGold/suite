import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "../_shared/cors.ts";

const MCP_SERVER_INFO = {
  name: "uspto-patent-mcp",
  version: "1.0.0",
  protocolVersion: "2025-06-18",
  capabilities: {
    tools: {},
    resources: { subscribe: false, listChanged: false },
    prompts: {},
    logging: {}
  }
};

const PPUBS_BASE_URL = "https://ppubs.uspto.gov/dirsearch-public";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { method, params } = body;

    console.log('USPTO MCP Request:', { method, params });

    let response: any;

    switch (method) {
      case 'initialize':
        response = {
          protocolVersion: MCP_SERVER_INFO.protocolVersion,
          capabilities: MCP_SERVER_INFO.capabilities,
          serverInfo: {
            name: MCP_SERVER_INFO.name,
            version: MCP_SERVER_INFO.version
          }
        };
        break;

      case 'tools/list':
        response = {
          tools: getToolRegistry()
        };
        break;

      case 'tools/call':
        response = await handleToolCall(params);
        break;

      case 'resources/list':
        response = {
          resources: getResourceRegistry()
        };
        break;

      case 'resources/read':
        response = await handleResourceRead(params);
        break;

      case 'prompts/list':
        response = {
          prompts: getPromptRegistry()
        };
        break;

      case 'prompts/get':
        response = await handlePromptGet(params);
        break;

      case 'ping':
        response = { status: 'pong' };
        break;

      default:
        throw new Error(`Unknown method: ${method}`);
    }

    // Log USPTO MCP operation
    await supabase.from('webhook_logs').insert({
      webhook_name: 'uspto_patent_mcp',
      trigger_table: 'mcp_operations',
      trigger_operation: method,
      payload: { method, params, response },
      status: 'completed'
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('USPTO MCP Server Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function getToolRegistry() {
  return [
    {
      name: "search_patents",
      description: "Search USPTO patents using CQL syntax. Supports: TTL/keyword (title), ABST/keyword (abstract), IN/name (inventor), AN/company (assignee), ISD/YYYYMMDD (issue date), CPC/code (classification)",
      inputSchema: {
        type: "object",
        properties: {
          query: { 
            type: "string", 
            description: "CQL search query (e.g., 'TTL/artificial intelligence AND ISD/20240101->20241231')" 
          },
          start: { type: "number", default: 0, description: "Result offset" },
          rows: { type: "number", default: 25, description: "Number of results (max 1000)" },
          sort: { type: "string", default: "date_publ desc", description: "Sort order" }
        },
        required: ["query"]
      }
    },
    {
      name: "get_patent_fulltext",
      description: "Get complete text of a patent including abstract, claims, and description",
      inputSchema: {
        type: "object",
        properties: {
          patent_number: { 
            type: "string", 
            description: "Patent number (e.g., '11234567' or 'US11234567')" 
          },
          sections: {
            type: "array",
            items: { type: "string", enum: ["abstract", "claims", "description", "all"] },
            default: ["all"],
            description: "Sections to retrieve"
          }
        },
        required: ["patent_number"]
      }
    },
    {
      name: "download_patent_pdf",
      description: "Download patent as PDF file (returns base64 encoded data)",
      inputSchema: {
        type: "object",
        properties: {
          patent_number: { type: "string", description: "Patent number" },
          document_type: { 
            type: "string", 
            enum: ["grant", "application"], 
            default: "grant",
            description: "Type of patent document" 
          }
        },
        required: ["patent_number"]
      }
    },
    {
      name: "search_by_inventor",
      description: "Search patents by inventor name with optional date range",
      inputSchema: {
        type: "object",
        properties: {
          inventor_name: { type: "string", description: "Inventor full or partial name" },
          date_from: { type: "string", description: "Start date (YYYYMMDD format)" },
          date_to: { type: "string", description: "End date (YYYYMMDD format)" },
          rows: { type: "number", default: 25, description: "Number of results" }
        },
        required: ["inventor_name"]
      }
    },
    {
      name: "search_by_assignee",
      description: "Search patents by assignee/company name",
      inputSchema: {
        type: "object",
        properties: {
          assignee_name: { type: "string", description: "Company or assignee name" },
          date_from: { type: "string", description: "Start date (YYYYMMDD format)" },
          date_to: { type: "string", description: "End date (YYYYMMDD format)" },
          rows: { type: "number", default: 25, description: "Number of results" }
        },
        required: ["assignee_name"]
      }
    },
    {
      name: "search_by_classification",
      description: "Search patents by CPC classification code",
      inputSchema: {
        type: "object",
        properties: {
          cpc_code: { type: "string", description: "CPC classification (e.g., 'G06N3/08' for neural networks)" },
          rows: { type: "number", default: 25, description: "Number of results" }
        },
        required: ["cpc_code"]
      }
    }
  ];
}

function getResourceRegistry() {
  return [
    {
      uri: "uspto://recent-patents",
      name: "Recent Patents",
      description: "Most recently published patents (last 30 days)",
      mimeType: "application/json"
    },
    {
      uri: "uspto://patent/{patent_number}",
      name: "Patent Details",
      description: "Complete patent information by number",
      mimeType: "application/json"
    },
    {
      uri: "uspto://inventor/{name}/patents",
      name: "Inventor Patent Portfolio",
      description: "All patents for a given inventor",
      mimeType: "application/json"
    },
    {
      uri: "uspto://assignee/{name}/patents",
      name: "Company Patent Portfolio",
      description: "All patents for a given assignee/company",
      mimeType: "application/json"
    },
    {
      uri: "uspto://classification/{cpc}/patents",
      name: "Patents by CPC Classification",
      description: "Patents in a specific CPC classification",
      mimeType: "application/json"
    }
  ];
}

function getPromptRegistry() {
  return [
    {
      name: "patent_search_assistant",
      description: "Help formulate effective patent search queries using CQL syntax",
      arguments: [
        { name: "technology", description: "Technology area to search", required: true },
        { name: "keywords", description: "Additional keywords", required: false }
      ]
    },
    {
      name: "prior_art_search",
      description: "Search for prior art for a new invention",
      arguments: [
        { name: "invention_description", description: "Brief description of invention", required: true },
        { name: "date_cutoff", description: "Search patents before this date", required: false }
      ]
    },
    {
      name: "competitive_analysis",
      description: "Analyze competitor patent portfolios",
      arguments: [
        { name: "company_name", description: "Competitor company name", required: true },
        { name: "technology_focus", description: "Technology area", required: false }
      ]
    },
    {
      name: "technology_landscape",
      description: "Map technology trends in patent filings",
      arguments: [
        { name: "technology_area", description: "Technology area to analyze", required: true },
        { name: "years_back", description: "Years to analyze (default 5)", required: false }
      ]
    }
  ];
}

async function handleToolCall(params: any): Promise<any> {
  const { name, arguments: args } = params;
  
  console.log(`Executing USPTO tool: ${name}`, args);

  switch (name) {
    case 'search_patents':
      return await searchPatents(args.query, args.start || 0, args.rows || 25, args.sort || 'date_publ desc');
    
    case 'get_patent_fulltext':
      return await getPatentFullText(args.patent_number, args.sections || ['all']);
    
    case 'download_patent_pdf':
      return await downloadPatentPDF(args.patent_number, args.document_type || 'grant');
    
    case 'search_by_inventor':
      let inventorQuery = `IN/${args.inventor_name}`;
      if (args.date_from || args.date_to) {
        const from = args.date_from || '17900101';
        const to = args.date_to || '99999999';
        inventorQuery += ` AND ISD/${from}->${to}`;
      }
      return await searchPatents(inventorQuery, 0, args.rows || 25);
    
    case 'search_by_assignee':
      let assigneeQuery = `AN/${args.assignee_name}`;
      if (args.date_from || args.date_to) {
        const from = args.date_from || '17900101';
        const to = args.date_to || '99999999';
        assigneeQuery += ` AND ISD/${from}->${to}`;
      }
      return await searchPatents(assigneeQuery, 0, args.rows || 25);
    
    case 'search_by_classification':
      return await searchPatents(`CPC/${args.cpc_code}`, 0, args.rows || 25);
    
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function searchPatents(query: string, start = 0, rows = 25, sort = "date_publ desc") {
  try {
    // Step 1: Initialize search session
    const sessionRes = await fetch(`${PPUBS_BASE_URL}/searches`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ 
        searchText: query,
        fq: [],
        facets: []
      })
    });
    
    if (!sessionRes.ok) {
      throw new Error(`Search initialization failed: ${sessionRes.status} ${sessionRes.statusText}`);
    }
    
    const session = await sessionRes.json();
    console.log('Search session created:', session.qid);
    
    // Step 2: Execute search
    const resultsRes = await fetch(
      `${PPUBS_BASE_URL}/searches/${session.qid}/query?start=${start}&rows=${rows}&sort=${encodeURIComponent(sort)}`
    );
    
    if (!resultsRes.ok) {
      throw new Error(`Search execution failed: ${resultsRes.status} ${resultsRes.statusText}`);
    }
    
    const results = await resultsRes.json();
    
    // Step 3: Parse and return
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total: results.response?.numFound || 0,
          start,
          rows,
          query,
          patents: (results.response?.docs || []).map((doc: any) => ({
            patent_number: doc.patentNumber || doc.publicationNumber,
            title: doc.inventionTitle,
            inventor: doc.inventor,
            assignee: doc.assignee,
            publication_date: doc.publicationDate || doc.patentIssueDate,
            abstract: doc.patentAbstract,
            application_number: doc.applicationNumber,
            cpc_classes: doc.cpcInventive
          }))
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('Patent search error:', error);
    throw error;
  }
}

async function getPatentFullText(patentNumber: string, sections = ["all"]) {
  try {
    const cleanNumber = patentNumber.replace(/[^0-9]/g, '');
    
    const response = await fetch(
      `${PPUBS_BASE_URL}/documents/${cleanNumber}/fulltext`,
      {
        headers: { 'Accept': 'application/json' }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Full text retrieval failed: ${response.status} ${response.statusText}`);
    }
    
    const fulltext = await response.json();
    
    const result: any = {
      patent_number: patentNumber,
      title: fulltext.inventionTitle
    };
    
    if (sections.includes("all") || sections.includes("abstract")) {
      result.abstract = fulltext.abstract;
    }
    if (sections.includes("all") || sections.includes("claims")) {
      result.claims = fulltext.claims;
    }
    if (sections.includes("all") || sections.includes("description")) {
      result.description = fulltext.description;
    }
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  } catch (error) {
    console.error('Full text retrieval error:', error);
    throw error;
  }
}

async function downloadPatentPDF(patentNumber: string, documentType = "grant") {
  try {
    const cleanNumber = patentNumber.replace(/[^0-9]/g, '');
    const pdfUrl = documentType === "grant"
      ? `${PPUBS_BASE_URL}/documents/${cleanNumber}/download`
      : `${PPUBS_BASE_URL}/applications/${cleanNumber}/download`;
    
    const response = await fetch(pdfUrl);
    
    if (!response.ok) {
      throw new Error(`PDF download failed: ${response.status} ${response.statusText}`);
    }
    
    const pdfBuffer = await response.arrayBuffer();
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          patent_number: patentNumber,
          filename: `${patentNumber}.pdf`,
          content_type: "application/pdf",
          data: base64Data,
          size_bytes: pdfBuffer.byteLength
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('PDF download error:', error);
    throw error;
  }
}

async function handleResourceRead(params: any): Promise<any> {
  const { uri } = params;
  
  console.log(`Reading USPTO resource: ${uri}`);
  
  const match = uri.match(/^uspto:\/\/(.+)$/);
  if (!match) throw new Error("Invalid USPTO URI");
  
  const path = match[1];
  
  if (path === "recent-patents") {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split('T')[0].replace(/-/g, '');
    
    return await searchPatents(`ISD/${dateStr}->99999999`, 0, 100);
  }
  
  if (path.startsWith("patent/")) {
    const patentNumber = path.split("/")[1];
    return await getPatentFullText(patentNumber);
  }
  
  if (path.startsWith("inventor/")) {
    const match = path.match(/inventor\/(.+)\/patents/);
    if (match) {
      const name = decodeURIComponent(match[1]);
      return await searchPatents(`IN/${name}`, 0, 100);
    }
  }
  
  if (path.startsWith("assignee/")) {
    const match = path.match(/assignee\/(.+)\/patents/);
    if (match) {
      const name = decodeURIComponent(match[1]);
      return await searchPatents(`AN/${name}`, 0, 100);
    }
  }
  
  if (path.startsWith("classification/")) {
    const match = path.match(/classification\/(.+)\/patents/);
    if (match) {
      const cpc = decodeURIComponent(match[1]);
      return await searchPatents(`CPC/${cpc}`, 0, 100);
    }
  }
  
  throw new Error(`Unknown resource path: ${path}`);
}

async function handlePromptGet(params: any): Promise<any> {
  const { name, arguments: args } = params;
  
  let promptText = "";
  
  switch (name) {
    case "patent_search_assistant":
      promptText = `I need to search USPTO patents for technology: ${args.technology}.
${args.keywords ? `Additional keywords: ${args.keywords}` : ''}

Generate an effective CQL search query using USPTO Patent Public Search syntax:
- TTL/keyword - Title search
- ABST/keyword - Abstract search
- ACLM/keyword - Claims search
- IN/inventor - Inventor name
- AN/assignee - Assignee/company
- ISD/YYYYMMDD - Issue date
- CPC/classification - CPC class

Example: TTL/artificial intelligence AND ISD/20240101->20241231

Provide 3 different search strategies with different specificity levels.`;
      break;
    
    case "prior_art_search":
      promptText = `Search for prior art for the following invention:
${args.invention_description}

${args.date_cutoff ? `Only patents before: ${args.date_cutoff}` : ''}

Generate comprehensive CQL queries to find:
1. Direct matches in title and abstract
2. Similar concepts in claims
3. Related CPC classifications
4. Key inventors in this field

Provide at least 5 different search queries to maximize prior art discovery.`;
      break;
    
    case "competitive_analysis":
      promptText = `Analyze patent portfolio for: ${args.company_name}
${args.technology_focus ? `Focus area: ${args.technology_focus}` : ''}

Generate CQL queries to analyze:
1. Total patent count by year
2. Key technology areas (CPC classifications)
3. Top inventors
4. Recent innovation trends (last 2 years)
5. Collaboration patterns (co-assignees)

Provide queries and analysis framework.`;
      break;
    
    case "technology_landscape":
      promptText = `Map technology landscape for: ${args.technology_area}
Time period: ${args.years_back || 5} years

Generate analysis framework:
1. Patent filing trends over time
2. Top companies/assignees
3. Leading inventors
4. Emerging sub-technologies
5. Geographic distribution

Provide CQL queries for each analysis dimension.`;
      break;
    
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
  
  return {
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: promptText
        }
      }
    ]
  };
}
