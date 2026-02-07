
import { walk } from "https://deno.land/std@0.168.0/fs/walk.ts";
import { join } from "https://deno.land/std@0.168.0/path/mod.ts";

const FUNCTIONS_DIR = "supabase/functions";
const REGISTRY_PATH = "supabase/functions/_shared/edgeFunctionRegistry.ts";

interface KnowledgeEntity {
    name: string;
    type: "tool";
    description: string;
    content: string; // Detailed markdown
    confidence_score: number;
    metadata: any;
}

// simple regexes
const REGEX_LIST_ACTIONS = /case\s+['"]list_actions['"]\s*:\s*result\s*=\s*({[\s\S]*?});/m;
const REGEX_REQ_JSON_DESTRUCT = /const\s+\{([^}]+)\}\s*=\s*(?:await\s+)?(?:req\.json\(\)|body)/;
const REGEX_BODY_DOT = /body\.([a-zA-Z0-9_]+)/g;
const REGEX_SWITCH_ACTION = /case\s+['"]([^'"]+)['"]:/g;

async function main() {
    console.log("🚀 Starting Edge Function Analysis...");

    // 1. Parse Registry (Text based to avoid import issues)
    const registryContent = await Deno.readTextFile(REGISTRY_PATH);
    // Extract objects from the array. This is hacky but sufficient.
    // We look for name: '...', description: '...'
    const registryMap = new Map<string, { description: string, example: string }>();

    const registryRegex = /{\s*name:\s*['"]([^'"]+)['"],\s*description:\s*['"]([^'"]+)['"](?:,\s*example_use:\s*['"]([^'"]+)['"])?/g;
    let match;
    while ((match = registryRegex.exec(registryContent)) !== null) {
        registryMap.set(match[1], {
            description: match[2],
            example: match[3] || "No example provided"
        });
    }

    console.log(`📋 Found ${registryMap.size} functions in registry.`);

    const knowledgeEntities: KnowledgeEntity[] = [];

    for (const [name, meta] of registryMap.entries()) {
        const indexPath = join(FUNCTIONS_DIR, name, "index.ts");

        try {
            const code = await Deno.readTextFile(indexPath);

            let extraction = "**Usage Analysis:**\n";
            let params = new Set<string>();
            let actions = new Set<string>();

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
                description: meta.description,
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

    await Deno.writeTextFile("edge_function_knowledge.json", JSON.stringify(knowledgeEntities, null, 2));
}

main();
