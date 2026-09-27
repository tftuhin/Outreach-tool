import { NextResponse } from 'next/server';
import { Client } from 'pg';

export async function POST(request: Request) {
  const { module, leads } = await request.json();
  
  if (!leads || !Array.isArray(leads)) {
    return NextResponse.json({ error: 'Invalid leads array' }, { status: 400 });
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    let importedCount = 0;

    for (const lead of leads) {
      // Basic validation
      if (!lead.business_name) continue;

      const query = `
        INSERT INTO leads (
          module, tier, business_name, area, owner_name, license_credentials,
          graduation_experience, phone_whatsapp, email, alt_email, website,
          facebook, linkedin, google_maps, address, location_note, business_size,
          hours, founder_age_est, age_flag, opened_since, other_channels_notes,
          sources, local_competitors, whatsapp_message, email_subject, email_body
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
        )
      `;
      
      const values = [
        module || 'Dentist',
        lead.tier || 'Tier 3',
        lead.business_name,
        lead.area || null,
        lead.owner_name || null,
        lead.license_credentials || null,
        lead.graduation_experience || null,
        lead.phone_whatsapp || null,
        lead.email || null,
        lead.alt_email || null,
        lead.website || null,
        lead.facebook || null,
        lead.linkedin || null,
        lead.google_maps || null,
        lead.address || null,
        lead.location_note || null,
        lead.business_size || null,
        lead.hours || null,
        lead.founder_age_est || null,
        lead.age_flag || null,
        lead.opened_since || null,
        lead.other_channels_notes || null,
        lead.sources || null,
        lead.local_competitors || null,
        lead.whatsapp_message || null,
        lead.email_subject || null,
        lead.email_body || null
      ];

      await client.query(query, values);
      importedCount++;
    }

    await client.end();
    return NextResponse.json({ success: true, imported: importedCount });
  } catch (err) {
    console.error('Import failed', err);
    if (client) await client.end();
    return NextResponse.json({ error: 'Failed to import leads' }, { status: 500 });
  }
}
