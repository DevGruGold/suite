// supabase/functions/universal-file-processor/index.ts
// Assumptions:
// - Uses built-in Web APIs and Deno runtime only.
// - Persists embeddings to a Postgres table via supabase-js using service role for server-side inserts.
// - Requires a table `vector_knowledge` with columns: id uuid default gen_random_uuid(),
//   source_name text, file_type text, chunk_index int, content text, embedding vector(1536),
//   meta jsonb, created_at timestamptz default now(). You can adjust dimensions per your model.
// - Uses Supabase AI embeddings via built-in @Supabase.ai Session (no external deps).
// - This function handles multipart/form-data uploads at POST /universal-file-processor/process.

// Imports
import { createClient } from "npm:@supabase/supabase-js@2.45.1";

// Simple type aliases to satisfy the requested interface shape
// (These can be expanded based on your application needs.)
type FileType = 'json' | 'html' | 'python' | 'solidity' | 'markdown' | 'text' | 'unknown';
interface KnowledgeEntity { id?: string; title?: string; text: string; meta?: Record<string, unknown>; }
interface CodeKnowledge { language: 'python'; symbols: string[]; docstrings: KnowledgeEntity[]; raw: string; }
interface ContractKnowledge { language: 'solidity'; contracts: string[]; comments: KnowledgeEntity[]; raw: string; }
interface DocumentKnowledge { title?: string; sections: KnowledgeEntity[]; raw: string; }
interface VectorEmbedding { content: string; vector: number[]; meta?: Record<string, unknown>; file_type: FileType; source_name?: string; chunk_index?: number; }

// Utility: chunking text into roughly N tokens (approx by characters)
const chunkText = (text: string, chunkSize = 1200, overlap = 150): string[] => {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const slice = text.slice(start, end);
    chunks.push(slice);
    if (end === text.length) break;
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
};

// Lightweight HTML to text extractor
const htmlToText = (html: string): string => {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc?.body?.textContent?.replace(/\s+/g, ' ').trim() ?? html;
  } catch {
    // Fallback strip tags
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
};

// Naive Markdown to text (strip code fences, headings markup)
const markdownToText = (md: string): string => {
  return md
    .replace(/```[\s\S]*?```/g, (m) => `\n${m}\n`) // keep code but separated
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
};

// Symbol extraction for Python/Solidity (very naive, regex-based)
const parsePythonSymbols = (code: string): string[] => {
  const symbols = new Set<string>();
  for (const m of code.matchAll(/^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gm)) symbols.add(m[1]);
  for (const m of code.matchAll(/^\s*class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[:\(]/gm)) symbols.add(m[1]);
  return [...symbols];
};
const parseSolidityContracts = (code: string): string[] => {
  const names = new Set<string>();
  for (const m of code.matchAll(/\bcontract\s+([A-Za-z_][A-Za-z0-9_]*)/g)) names.add(m[1]);
  return [...names];
};

// Embedding session using Supabase AI
// Adjust model as needed (gte-small is generally available)
// @ts-ignore: Supabase.ai exists in the Edge runtime
const embedModel = new (globalThis as any).Supabase.ai.Session('gte-small');

// Vector dimension should match your chosen model
const VECTOR_DIM = 384; // gte-small default; change to 1536 for text-embedding-3-large style models

const getEnv = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return { supabaseUrl, serviceKey };
};

const getClient = () => {
  const { supabaseUrl, serviceKey } = getEnv();
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
};

const fileNameFromHeaders = (part: File | null, fallback = 'file'): string => {
  if (!part) return fallback;
  return (part as any).name || fallback;
};

// Implementation of the FileProcessor interface
const FileProcessorImpl = {
  detectFormat(file: Blob): FileType {
    const name = (file as any).name?.toLowerCase?.() || '';
    if (name.endsWith('.json')) return 'json';
    if (name.endsWith('.html') || name.endsWith('.htm')) return 'html';
    if (name.endsWith('.py')) return 'python';
    if (name.endsWith('.sol')) return 'solidity';
    if (name.endsWith('.md') || name.endsWith('.markdown')) return 'markdown';
    return 'text';
  },
  parseJSON(content: string): KnowledgeEntity[] {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.map((it, i) => ({ id: String(i), text: typeof it === 'string' ? it : JSON.stringify(it) }));
      }
      if (typeof parsed === 'object') {
        return [{ text: JSON.stringify(parsed) }];
      }
      return [{ text: String(parsed) }];
    } catch (e) {
      return [{ text: content }];
    }
  },
  parseHTML(content: string): KnowledgeEntity[] {
    const text = htmlToText(content);
    return chunkText(text).map((t, i) => ({ id: String(i), text: t }));
  },
  parsePython(code: string): CodeKnowledge {
    const docstrings: KnowledgeEntity[] = [];
    for (const m of code.matchAll(/"""([\s\S]*?)"""|'''([\s\S]*?)'''/g)) {
      const txt = (m[1] || m[2] || '').trim();
      if (txt) docstrings.push({ text: txt });
    }
    return { language: 'python', symbols: parsePythonSymbols(code), docstrings, raw: code };
  },
  parseSolidity(contract: string): ContractKnowledge {
    const comments: KnowledgeEntity[] = [];
    for (const m of contract.matchAll(/\/\*([\s\S]*?)\*\/|\/\/([^\n]*)/g)) {
      const txt = (m[1] || m[2] || '').trim();
      if (txt) comments.push({ text: txt });
    }
    return { language: 'solidity', contracts: parseSolidityContracts(contract), comments, raw: contract };
  },
  parseMarkdown(md: string): DocumentKnowledge {
    const text = markdownToText(md);
    const sections = chunkText(text).map((t, i) => ({ id: String(i), text: t }));
    return { sections, raw: md };
  },
  async extractSemantics(parsed: any): Promise<VectorEmbedding[]> {
    // Normalize into text chunks
    let chunks: { text: string; meta?: Record<string, unknown> }[] = [];
    if (Array.isArray(parsed)) {
      chunks = parsed.map((e: any) => ({ text: e.text ?? String(e) }));
    } else if (parsed?.raw && parsed?.sections) {
      chunks = parsed.sections.map((s: any) => ({ text: s.text }));
    } else if (parsed?.raw && parsed?.docstrings) {
      chunks = [
        ...parsed.docstrings.map((d: any) => ({ text: d.text })),
        ...chunkText(parsed.raw)
      ];
    } else if (parsed?.raw && parsed?.comments) {
      chunks = [
        ...parsed.comments.map((d: any) => ({ text: d.text })),
        ...chunkText(parsed.raw)
      ];
    } else if (typeof parsed === 'string') {
      chunks = chunkText(parsed).map((t) => ({ text: t }));
    }

    if (!chunks.length) return [];

    // Generate embeddings in batches
    const outputs: VectorEmbedding[] = [];
    const BATCH = 16;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const input = batch.map((b) => b.text);
      // mean_pool + normalize produces fixed length vectors suitable for pgvector
      const result = await embedModel.run(input, { mean_pool: true, normalize: true });
      const vectors: number[][] = Array.isArray(result) ? result : (result?.output ?? []);
      for (let j = 0; j < batch.length; j++) {
        outputs.push({ content: batch[j].text, vector: vectors[j] || [], file_type: 'unknown' });
      }
    }
    return outputs;
  },
  async storeInVectorDB(embeddings: VectorEmbedding[], opts: { source_name: string; file_type: FileType }) {
    if (!embeddings.length) return { inserted: 0 };
    const supabase = getClient();
    const rows = embeddings.map((e, i) => ({
      source_name: opts.source_name,
      file_type: opts.file_type,
      chunk_index: i,
      content: e.content,
      embedding: e.vector,
      meta: e.meta ?? {},
    }));
    const { error, count } = await supabase
      .from('vector_knowledge')
      .insert(rows, { count: 'exact' });
    if (error) throw error;
    return { inserted: count ?? embeddings.length };
  },
};

// Router: /universal-file-processor/process (POST multipart)
console.info('universal-file-processor started');
Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (req.method === 'POST' && pathname.endsWith('/universal-file-processor/process')) {
      const ctype = req.headers.get('content-type') || '';
      if (!ctype.includes('multipart/form-data')) {
        return new Response(JSON.stringify({ error: 'Expected multipart/form-data' }), { status: 400 });
      }
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return new Response(JSON.stringify({ error: 'Missing file field' }), { status: 400 });
      }
      const sourceName = form.get('source_name')?.toString() || fileNameFromHeaders(file, 'upload');

      // Detect type
      const fileType = FileProcessorImpl.detectFormat(file);
      const content = await file.text();

      // Parse by type
      let parsed: any;
      switch (fileType) {
        case 'json':
          parsed = FileProcessorImpl.parseJSON(content);
          break;
        case 'html':
          parsed = FileProcessorImpl.parseHTML(content);
          break;
        case 'python':
          parsed = FileProcessorImpl.parsePython(content);
          break;
        case 'solidity':
          parsed = FileProcessorImpl.parseSolidity(content);
          break;
        case 'markdown':
          parsed = FileProcessorImpl.parseMarkdown(content);
          break;
        default:
          parsed = chunkText(content).map((t, i) => ({ id: String(i), text: t }));
      }

      // Embed
      const embeddings = await FileProcessorImpl.extractSemantics(parsed);
      // Attach file_type on outputs
      for (const e of embeddings) e.file_type = fileType;

      // Persist
      const result = await FileProcessorImpl.storeInVectorDB(embeddings, { source_name: sourceName, file_type: fileType });

      return new Response(JSON.stringify({ ok: true, file_type: fileType, source_name: sourceName, inserted: result.inserted }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (req.method === 'GET' && pathname.endsWith('/universal-file-processor/health')) {
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
    }

    return new Response('Not Found', { status: 404 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
});
