
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'supabase/functions/_shared/edgeFunctionRegistry.ts');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('example_use:')) {
        // Check if line ends with unescaped quote and comma?
        // A valid line should end with just ' (quote) or ', (quote comma)
        // Or be a valid JSON string.

        const trimmed = line.trim();
        // Check for unterminated string
        // Count number of single quotes not preceded by backslash
        // Simple heuristic: If it ends with \, it's suspicious if it's supposed to be a one-liner.

        if (trimmed.endsWith("\\'")) {
            console.log(`Line ${index + 1}: Ends with escaped quote (suspicious): ${line}`);
        } else if (!trimmed.endsWith("',") && !trimmed.endsWith("'") && !trimmed.endsWith("},")) {
            // Maybe it's multi-line? But current file format seems single-line.
            console.log(`Line ${index + 1}: Doesn't end with quote or comma: ${line}`);
        }

        // Also check if the string inside is valid
        // Extract content between first and last quote
        const match = trimmed.match(/example_use:\s*'(.*)'/);
        if (match) {
            const val = match[1];
            // Check if it ends with backslash
            if (val.endsWith('\\')) {
                console.log(`Line ${index + 1}: Value ends with backslash: ${line}`);
            }
        } else {
            // Maybe the regex didn't match because end quote is missing
            console.log(`Line ${index + 1}: proper string pattern not found: ${line}`);
        }
    }
});
