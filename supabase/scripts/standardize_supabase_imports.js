
import fs from 'fs';
import path from 'path';

const TARGET_VERSION = '2.58.0';
const TARGET_IMPORT = `https://esm.sh/@supabase/supabase-js@${TARGET_VERSION}`;
const ROOT_DIR = 'c:/Users/PureTrek/Desktop/DevGruGold/suite/supabase/functions';

// Regex to match various import patterns
// Matches:
// from "https://esm.sh/@supabase/supabase-js@..."
// from 'https://esm.sh/@supabase/supabase-js@...'
// from "jsr:@supabase/supabase-js@..."
// from 'npm:@supabase/supabase-js@...'
const IMPORT_REGEX = /(from\s+['"])(https:\/\/esm\.sh\/|jsr:|npm:)@supabase\/supabase-js(@[^\s'"]+)?(['"])/g;

function walkDir(dir, callback) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            walkDir(filePath, callback);
        } else {
            callback(filePath);
        }
    });
}

let modifiedCount = 0;

console.log(`Scanning ${ROOT_DIR} for supabase-js imports...`);

walkDir(ROOT_DIR, (filePath) => {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.js')) return;

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        let hasMatch = false;

        // Check if file contains a relevant import before doing expensive replace
        if (!content.match(IMPORT_REGEX)) return;

        const newContent = content.replace(IMPORT_REGEX, (match, prefix, source, version, suffix) => {
            // Construct the new import string
            // prefix is usually 'from "' or "from '"
            // suffix is contents of closing quote
            return `${prefix}${TARGET_IMPORT}${suffix}`;
        });

        if (newContent !== content) {
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`✅ Updated: ${filePath}`);
            modifiedCount++;
        }
    } catch (err) {
        console.error(`❌ Error processing ${filePath}:`, err.message);
    }
});

console.log(`\n🎉 Process complete. Modified ${modifiedCount} files.`);
