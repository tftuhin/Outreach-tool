const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local or .env if present
function loadEnvFile(filename) {
  try {
    const fullPath = path.resolve(process.cwd(), filename);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.substring(0, idx).trim();
            let val = trimmed.substring(idx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.substring(1, val.length - 1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      });
    }
  } catch (e) {}
}

loadEnvFile('.env.local');
loadEnvFile('.env');

function cleanDraftBody(body) {
  if (!body || typeof body !== 'string') return '';

  let cleaned = body;

  // 1. Separate opt-out / PS note if present at the end
  const psRegex = /(?:<p[^>]*>)?\s*(<i[^>]*>\s*PS:[\s\S]*?<\/i>)\s*(?:<\/p>)?|(?:\r?\n)+\s*(PS:\s*If you aren't interested[\s\S]*?)$/i;
  let psNote = '';
  const psMatch = cleaned.match(psRegex);
  if (psMatch) {
    psNote = psMatch[1] || psMatch[2] || psMatch[0];
    cleaned = cleaned.replace(psRegex, '');
  }

  // 2. Remove previously appended HTML signature blocks if any
  cleaned = cleaned.replace(/<div[^>]*>\s*(?:Best regards|Kind regards|Regards),?\s*<\/div>[\s\S]*$/i, '');

  // 3. Remove sign-offs and typed signatures
  const signoffRegex = /(?:<p[^>]*>|<div[^>]*>|<br\s*\/?>|\r?\n|^)\s*(?:<\/?(?:strong|b|em|i)>)*\s*(?:Best regards|Kind regards|Warm regards|With regards|Regards|Sincerely|Best|Thanks & regards|Thanks and regards|Thanks,\s*\n|Thank you,\s*\n)[,\.]?\s*(?:<\/?(?:strong|b|em|i)>)*\s*(?:<\/(?:p|div)>)?[\s\S]*$/i;
  cleaned = cleaned.replace(signoffRegex, '');

  // 4. Clean trailing breaks, newlines, empty paragraphs
  cleaned = cleaned.replace(/(?:<p>\s*(?:<br\s*\/?>)*\s*<\/p>|<br\s*\/?>|\r?\n|\s)+$/gi, '');

  // 5. Re-append PS note if it was extracted and not already present
  if (psNote && !cleaned.includes(psNote)) {
    cleaned = cleaned + '\n\n' + psNote.trim();
  }

  return cleaned.trim();
}

async function run() {
  const dbUrl = process.argv[2] || process.env.DATABASE_URL;

  if (!dbUrl) {
    console.log("No DATABASE_URL found.");
    console.log("To run this script directly on your database, run:");
    console.log('  node clean_signatures.js "<YOUR_NEON_DATABASE_URL>"');
    console.log("Or add DATABASE_URL=\"...\" to a .env.local file.");
    return;
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to database...");

    const res = await client.query("SELECT id, email_body FROM leads WHERE email_body IS NOT NULL");
    let updatedCount = 0;

    for (const row of res.rows) {
      const original = (row.email_body || '').replace(/—/g, '-');
      const cleaned = cleanDraftBody(original);

      if (cleaned !== original) {
        await client.query("UPDATE leads SET email_body = $1 WHERE id = $2", [cleaned, row.id]);
        updatedCount++;
      }
    }

    console.log(`Scan complete: ${res.rows.length} leads checked, ${updatedCount} leads updated with typed signatures removed.`);
  } catch (err) {
    console.error("Database clean error:", err);
  } finally {
    await client.end();
  }
}

run();
