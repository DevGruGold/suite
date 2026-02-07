
const fs = require('fs');
const path = require('path');

const FUNCTIONS_DIR = "supabase/functions";
const REGISTRY_PATH = "supabase/functions/_shared/edgeFunctionRegistry.ts";

// Simple regexes
const REGEX_LIST_ACTIONS = /case\s+['"]list_actions['"]\s*:\s*result\s*=\s*({[\s\S]*?});/m;
const REGEX_REQ_JSON_DESTRUCT = /const\s+\{([^}]+)\}\s*=\s*(?:await\s+)?(?:req\.json\(\)|body)/;
const REGEX_BODY_DOT = /body\.([a-zA-Z0-9_]+)/g;
const REGEX_SWITCH_ACTION = /case\s+['"]([^'"]+)['"]:/g;

async function main() {
    console.log("🚀 Starting Edge Function Analysis (Node.js version)...");

    if (!fs.existsSync(REGISTRY_PATH)) {
        console.error(`❌ Registry not found at ${REGISTRY_PATH}`);
        return;
    }

    // 1. Parse Registry (Robust Text Extraction)
    const registryContent = fs.readFileSync(REGISTRY_PATH, 'utf-8');

    // Extract the array body
    const arrayStart = registryContent.indexOf('export const EDGE_FUNCTIONS_REGISTRY: EdgeFunctionCapability[] = [');
    const arrayEnd = registryContent.lastIndexOf('];');

    if (arrayStart === -1 || arrayEnd === -1) {
        console.error("❌ Could not find EDGE_FUNCTIONS_REGISTRY array block");
        return;
    }

    // Get the content inside the []
    const arrayBody = registryContent.substring(arrayStart + 64, arrayEnd); // 64 is approx length of export...line

    // Split into objects (heuristic: look for name property as start of new obj)
    const objectChunks = arrayBody.split(/},\s*{\s*name/);

    const registryMap = new Map();

    objectChunks.forEach((chunk, index) => {
        // Re-add "name" if it was consumed by split (except first one)
        let fullChunk = index > 0 ? "name" + chunk : chunk;

        const nameMatch = /name:\s*['"]([^'"]+)['"]/.exec(fullChunk);
        const descMatch = /description:\s*['"]([\s\S]*?)['"],/.exec(fullChunk);
        const catMatch = /category:\s*['"]([^'"]+)['"]/.exec(fullChunk);
        const exMatch = /example_use:\s*['"]([\s\S]*?)['"]/.exec(fullChunk);

        if (nameMatch) {
            registryMap.set(nameMatch[1], {
                description: descMatch ? descMatch[1] : "No description",
                example: exMatch ? exMatch[1] : "No example",
                category: catMatch ? catMatch[1] : "general"
            });
        }
    });
    console.log(`📋 Found ${registryMap.size} functions in registry.`);

    const knowledgeEntities = [];

    for (const [name, meta] of registryMap.entries()) {
        const indexPath = path.join(FUNCTIONS_DIR, name, "index.ts");

        if (!fs.existsSync(indexPath)) {
            console.warn(`⚠️ skipping ${name} (no index.ts found)`);
            continue;
        }

        try {
            const code = fs.readFileSync(indexPath, 'utf-8');

            let extraction = "**Usage Analysis:**\n";
            let params = new Set();
            let actions = new Set();

            // Check for list_actions
            const listActionsMatch = REGEX_LIST_ACTIONS.exec(code);
            if (listActionsMatch) {
                extraction += "\n**Formal Actions Definition:**\n```json\n" + listActionsMatch[1] + "\n```\n";
            }

            // Check for destructured params
            const destructMatch = REGEX_REQ_JSON_DESTRUCT.exec(code);
            if (destructMatch) {
                destructMatch[1].split(',').map(s => s.trim().split(':')[0].trim()).forEach(p => params.add(p));
            }

            // Check for body.param usage
            let bodyMatch;
            while ((bodyMatch = REGEX_BODY_DOT.exec(code)) !== null) {
                if (bodyMatch[1] !== 'action') params.add(bodyMatch[1]);
            }

            // Check for actions (switch cases)
            let actionMatch;
            while ((actionMatch = REGEX_SWITCH_ACTION.exec(code)) !== null) {
                actions.add(actionMatch[1]);
            }

            if (actions.size > 0) {
                extraction += `\n**Available Actions:**\n${Array.from(actions).map(a => `- \`${a}\``).join('\n')}\n`;
            }

            if (params.size > 0) {
                extraction += `\n**Detected Parameters:**\n${Array.from(params).map(p => `- \`${p}\``).join('\n')}\n`;
            }

            const content = `
# ${name}

**Description:** ${meta.description}
**Category:** ${meta.category}

**Example Use:**
\`\`\`json
${meta.example}
\`\`\`

${extraction}

**Source Code Analysis:**
Scanned ${code.length} bytes of code to extract usage patterns.
      `.trim();

            knowledgeEntities.push({
                name: name,
                type: "tool",
                description: `${meta.description} (Detailed Reference)`,
                content: content,
                confidence_score: 0.95,
                metadata: {
                    source: "auto_generated",
                    registry_example: meta.example,
                    detected_actions: Array.from(actions),
                    detected_params: Array.from(params)
                }
            });

        } catch (err) {
            console.warn(`⚠️ Could not read ${name}: ${err.message}`);
        }
    }

    console.log(`✅ Generated ${knowledgeEntities.length} knowledge entities.`);

    // Generate SQL Migration
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const migrationFile = path.join('supabase', 'migrations', `${timestamp}_seed_knowledge_entities.sql`);

    let sqlContent = `-- Auto-generated migration to seed knowledge entities for edge functions\n\n`;
    sqlContent += `BEGIN;\n\n`;
    sqlContent += `TRUNCATE TABLE knowledge_entities CASCADE;\n\n`; // Optional: clear old entries or use UPSERT

    // Using UPSERT approach for safety
    sqlContent += `INSERT INTO knowledge_entities (entity_name, entity_type, description, metadata, confidence_score)\nVALUES\n`;

    const values = knowledgeEntities.map(entity => {
        const name = entity.name.replace(/'/g, "''");
        const type = entity.type.replace(/'/g, "''");
        const desc = entity.description.replace(/'/g, "''");

        // Merge content into metadata
        const fullMetadata = {
            ...entity.metadata,
            content: entity.content // Store the detailed analysis here
        };

        const meta = JSON.stringify(fullMetadata).replace(/'/g, "''");

        return `('${name}', '${type}', '${desc}', '${meta}'::jsonb, ${entity.confidence_score})`;
    });

    sqlContent += values.join(',\n');
    sqlContent += `\nON CONFLICT (entity_name, entity_type) DO UPDATE SET\n`; // updated conflict target
    sqlContent += `description = EXCLUDED.description,\n`;
    sqlContent += `metadata = EXCLUDED.metadata,\n`; // this now updates content too
    sqlContent += `confidence_score = EXCLUDED.confidence_score;\n\n`; // optional update

    sqlContent += `COMMIT;\n`;

    fs.writeFileSync(migrationFile, sqlContent);
    console.log(`💾 SQL Migration written to ${migrationFile}`);

    // Deploy directly via Management API
    const PROJECT_REF = "vawouugtzwmejxqkeqqj";
    const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "sbp_02e7562153a72212965749d42b82419b91558022";

    if (!ACCESS_TOKEN) {
        console.warn("⚠️ No SUPABASE_ACCESS_TOKEN found. Skipping direct deployment.");
        return;
    }

    console.log("🚀 Deploying to Supabase via Management API...");

    try {
        const fetch = (await import('node-fetch')).default;

        const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: sqlContent })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error: ${response.status} ${errText}`);
        }

        console.log("✅ Successfully executed SQL on remote database!");

    } catch (err) {
        console.error(`❌ Deployment failed: ${err.message}`);
    }
}

main();
