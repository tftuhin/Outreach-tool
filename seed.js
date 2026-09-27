const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();
  console.log("Connected to Neon DB!");
  
  await client.query(`
    DROP TABLE IF EXISTS leads;
    CREATE TABLE IF NOT EXISTS leads (
      id VARCHAR(255) PRIMARY KEY,
      tier VARCHAR(255),
      business_name VARCHAR(255),
      area VARCHAR(255),
      owner_name VARCHAR(255),
      license_credentials TEXT,
      graduation_experience TEXT,
      phone_whatsapp VARCHAR(255),
      email VARCHAR(255),
      alt_email VARCHAR(255),
      website VARCHAR(255),
      facebook VARCHAR(255),
      linkedin VARCHAR(255),
      google_maps TEXT,
      address TEXT,
      location_note TEXT,
      business_size VARCHAR(255),
      hours VARCHAR(255),
      founder_age_est VARCHAR(255),
      age_flag VARCHAR(255),
      opened_since VARCHAR(255),
      other_channels_notes TEXT,
      sources TEXT,
      local_competitors TEXT,
      snapshot TEXT,
      growth_signals TEXT,
      automation_angle TEXT,
      whatsapp_message TEXT,
      email_subject TEXT,
      email_body TEXT,
      status VARCHAR(50) DEFAULT 'pending'
    );
  `);
  console.log("Table 'leads' verified/created.");

  const leads = JSON.parse(fs.readFileSync('./leads.json', 'utf8'));
  
  for (const lead of leads) {
    await client.query(`
      INSERT INTO leads (
        id, tier, business_name, area, owner_name, license_credentials, graduation_experience,
        phone_whatsapp, email, alt_email, website, facebook, linkedin, google_maps, address, location_note, business_size, hours,
        founder_age_est, age_flag, opened_since, other_channels_notes, sources,
        local_competitors, snapshot, growth_signals, automation_angle, whatsapp_message, email_subject, email_body
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
      ) ON CONFLICT (id) DO UPDATE SET
        whatsapp_message = EXCLUDED.whatsapp_message,
        email_subject = EXCLUDED.email_subject,
        email_body = EXCLUDED.email_body;
    `, [
      lead.leadId, lead.tier, lead.businessName, lead.area, lead.ownerName, lead.licenseCredentials,
      lead.graduationExperience, lead.phoneWhatsapp, lead.email, lead.altEmail, lead.website, lead.facebook, lead.linkedin, lead.googleMaps,
      lead.address, lead.locationNote, lead.businessSize, lead.hours, lead.founderAgeEst, lead.ageFlag, lead.openedSince, lead.otherChannelsNotes, lead.sources,
      lead.localCompetitors, lead.snapshot, lead.growthSignals, lead.automationAngle, lead.whatsappMessage, lead.emailSubject, lead.emailBody
    ]);
  }
  
  console.log(`Successfully seeded ${leads.length} leads!`);
  await client.end();
}

main().catch(console.error);
