
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'src/services/edgeFunctionRegistry.ts');
const sharedPath = path.join(__dirname, 'supabase/functions/_shared/edgeFunctionRegistry.ts');

function parseRegistry(content) {
    // Extract the array content
    const match = content.match(/export const EDGE_FUNCTIONS_REGISTRY: EdgeFunctionCapability\[\] = \[(.*?)\];/s);
    if (!match) return [];

    // Quick and dirty manual parsing because eval is risky and JSON.parse won't work on TS object literals
    // We'll use regex to find objects
    const objects = [];
    const objectRegex = /{\s*name:\s*'([^']+)',\s*url:\s*'([^']+)',\s*description:\s*'([^']*)',\s*capabilities:\s*\[(.*?)\]\s*,\s*category:\s*'([^']+)',\s*example_use:\s*'([^']*)'\s*}/gs;

    let m;
    while ((m = objectRegex.exec(match[1])) !== null) {
        objects.push({
            name: m[1],
            url: m[2],
            description: m[3],
            capabilities: m[4].split(',').map(s => s.trim().replace(/^'|'$/g, '')),
            category: m[5],
            example_use: m[6]
        });
    }
    return objects;
}

// Better parser that evaluates the code safely-ish
function betterParse(content) {
    const start = content.indexOf('export const EDGE_FUNCTIONS_REGISTRY: EdgeFunctionCapability[] = [');
    if (start === -1) return [];

    let arrayContent = content.substring(start);
    // Find the end of the array
    // This is tricky without a true parser, but let's assume it ends with ]; at start of line or similar
    // Actually, let's just use the file content and replace export ... with module.exports = ... and eval it
    // But we need to mock types and imports.

    // Simplest approach: formatting is consistent.
    // Let's use regex to capture each object block
    const items = [];
    const lines = content.split('\n');
    let inArray = false;
    let currentItem = '';

    for (const line of lines) {
        if (line.includes('export const EDGE_FUNCTIONS_REGISTRY')) {
            inArray = true;
            continue;
        }
        if (!inArray) continue;
        if (line.trim().startsWith('];')) break;

        currentItem += line + '\n';
        if (line.trim() === '},') {
            // End of an item
            // Parse currentItem
            try {
                // remove trailing comma if present
                const cleanItem = currentItem.trim().replace(/,\s*$/, '');
                // Replace single quotes with double quotes for keys and values, carefully
                // This is hard.
                // Let's rely on the regex approach but be more robust
            } catch (e) { }
            currentItem = '';
        }
    }
    return [];
}

// Regex approach again, but cleaner
function extractItems(content) {
    const list = [];
    // Match { ... } blocks
    // Assumption: keys are unquoted, values are single-quoted strings.
    const regex = /{\s*name:\s*'([^']+)',\s*url:\s*'([^']+)',\s*description:\s*'(.*?)',\s*capabilities:\s*\[(.*?)\],\s*category:\s*'([^']+)',\s*example_use:\s*'(.*?)'\s*}/gs;
    // Note: description and example_use might contain escaped single quotes. valid JS string handling is needed.
    // The previous regex failed on newlines or complex strings.

    // Let's effectively "eval" by transforming to valid JS
    let arrayStr = content.match(/export const EDGE_FUNCTIONS_REGISTRY: EdgeFunctionCapability\[\] = (\[[\s\S]*?\]);/)[1];

    // Remove type annotations if any (none in array)
    // Replace single quotes with double quotes? No, string content might have double quotes.
    // Just run it.
    // But we need to define 'EdgeFunctionCapability' if it was used? No.
    try {
        const func = new Function('return ' + arrayStr);
        return func();
    } catch (e) {
        // Function constructor might fail if headers not present, but arrayStr is just an array literal
        // It should work if syntax is standard JS.
        // The file uses 'name': 'value' or name: 'value'.
        // TS object literals are valid JS.
        return new Function('return ' + arrayStr)();
    }
}

const srcContent = fs.readFileSync(srcPath, 'utf8');
const sharedContent = fs.readFileSync(sharedPath, 'utf8');

const srcItems = extractItems(srcContent);
const sharedItems = extractItems(sharedContent);

console.log(`Source items: ${srcItems.length}`);
console.log(`Shared items: ${sharedItems.length}`);

// Merge: Use Map by name
const merged = new Map();

sharedItems.forEach(item => merged.set(item.name, item));
srcItems.forEach(item => {
    if (!merged.has(item.name)) {
        merged.set(item.name, item);
    } else {
        // Optional: Update if src is "newer"? 
        // Let's assume shared is master, but add missing from src.
    }
});

const mergedList = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));

console.log(`Merged count: ${mergedList.length}`);

// Generate output content
// We need to preserve the header comments and interface definition from sharedPath
const header = sharedContent.split('export const EDGE_FUNCTIONS_REGISTRY')[0];

const newArrayStr = JSON.stringify(mergedList, null, 2);
// Convert JSON field names "name" to name (unquoted) to match style? 
// Or just leave as JSON, TS accepts it.
// But single quotes are preferred in this codebase.
// Let's stick to JSON for safety, or try to format it.

let formattedArray = '[\n';
mergedList.forEach(item => {
    formattedArray += '  {\n';
    formattedArray += `    name: '${item.name}',\n`;
    formattedArray += `    url: '${item.url}',\n`;
    formattedArray += `    description: '${item.description.replace(/'/g, "\\'")}',\n`; // Escape single quotes
    formattedArray += `    capabilities: [${item.capabilities.map(c => `'${c.replace(/'/g, "\\'")}'`).join(', ')}],\n`;
    formattedArray += `    category: '${item.category}',\n`;
    formattedArray += `    example_use: '${item.example_use.replace(/'/g, "\\'")}'\n`;
    formattedArray += '  },\n';
});
formattedArray += '];';

const newContent = `${header}export const EDGE_FUNCTIONS_REGISTRY: EdgeFunctionCapability[] = ${formattedArray}\n`;

fs.writeFileSync(sharedPath, newContent);
console.log('Successfully updated shared registry.');
