const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    const res = await client.query("SELECT id, email_body FROM leads WHERE email_body IS NOT NULL");
    
    let updatedCount = 0;
    for (const row of res.rows) {
      let body = row.email_body;

      // First, remove the hardcoded signature if it's there
      const sigIndex = body.indexOf('\n\nBest regards,');
      if (sigIndex !== -1) {
        body = body.substring(0, sigIndex);
      }

      // If the opt-out isn't already there, add it
      if (!body.includes('not interested')) {
        body += '\n\n<i style="color: #64748b;">PS: If you aren\'t interested or don\'t want to hear from me again, just reply "not interested" and I won\'t follow up.</i>';
      }

      await client.query("UPDATE leads SET email_body = $1 WHERE id = $2", [body, row.id]);
      updatedCount++;
    }
    
    console.log(`Successfully updated ${updatedCount} leads in the database! Removed hardcoded signatures and added highlighted opt-out line.`);
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
