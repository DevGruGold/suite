
const fs = require('fs');
const envPath = 'c:\\Users\\PureTrek\\Desktop\\DevGruGold\\suite\\.env';
try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    console.log("Checking for LOVABLE_API_KEY in .env...");
    if (envContent.includes("LOVABLE_API_KEY")) {
        console.log("LOVABLE_API_KEY found in .env");
    } else {
        console.log("LOVABLE_API_KEY NOT found in .env");
    }
} catch (e) {
    console.log("Could not read .env");
}
