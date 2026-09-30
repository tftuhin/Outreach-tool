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
    const duplicates: string[] = [];

    for (const lead of leads) {
      // Basic validation
      const bName = lead.business_name || lead.clinic_name;
      if (!bName) continue;

      const emailAddress = lead.email || lead.contact_info?.email;

      // Check for duplicates
      const checkDupeQuery = `
        SELECT business_name FROM leads 
        WHERE (email = $1 AND email IS NOT NULL AND email != '') 
           OR (business_name = $2 AND module = $3)
        LIMIT 1
      `;
      const checkDupeValues = [emailAddress || null, bName, module || 'Dentist'];
      const dupeRes = await client.query(checkDupeQuery, checkDupeValues);
      
      if (dupeRes.rows.length > 0) {
        duplicates.push(bName);
        continue; // Skip duplicate
      }

      // Auto-generate ID or use provided
      let newId = lead.lead_id || lead.id;
      if (!newId) {
        const maxRes = await client.query("SELECT id FROM leads WHERE id LIKE 'lead_%'");
        const maxNum = maxRes.rows.reduce((max: number, r: any) => {
          const num = parseInt(r.id.replace('lead_', ''), 10);
          return isNaN(num) ? max : Math.max(max, num);
        }, 0);
        newId = `lead_${String(maxNum + 1).padStart(3, '0')}`;
      }

      const query = `
        INSERT INTO leads (
          id, module, tier, business_name, area, owner_name, license_credentials,
          graduation_experience, phone_whatsapp, email, alt_email, website,
          facebook, linkedin, google_maps, address, location_note, business_size,
          hours, founder_age_est, age_flag, opened_since, other_channels_notes,
          sources, local_competitors, snapshot, growth_signals, automation_angle,
          whatsapp_message, email_subject, email_body
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31
        )
      `;
      
      const values = [
        newId,
        module || 'Dentist',
        lead.tier || 'Tier 3',
        bName,
        lead.area || null,
        lead.owner_details?.name || lead.owner_name || null,
        lead.owner_details?.registration_proxy || lead.license_credentials || null,
        lead.owner_details?.graduation_experience || lead.graduation_experience || null,
        lead.contact_info?.phone_whatsapp || lead.phone_whatsapp || null,
        emailAddress || null,
        lead.contact_info?.alt_email || lead.alt_email || null,
        lead.contact_info?.website || lead.website || null,
        lead.contact_info?.facebook || lead.facebook || null,
        lead.contact_info?.linkedin || lead.linkedin || null,
        lead.contact_info?.google_maps || lead.google_maps || null,
        lead.contact_info?.address || lead.address || null,
        lead.contact_info?.location_note || lead.location_note || null,
        lead.business_context?.business_size || lead.business_size || null,
        lead.business_context?.hours || lead.hours || null,
        lead.business_context?.founder_age_est || lead.founder_age_est || null,
        lead.business_context?.age_flag || lead.age_flag || null,
        lead.business_context?.opened_since || lead.opened_since || null,
        lead.business_context?.other_channels_notes || lead.other_channels_notes || null,
        lead.business_context?.sources || lead.sources || null,
        lead.business_context?.local_competitors || lead.local_competitors || null,
        lead.marketing_angles?.snapshot || lead.snapshot || null,
        lead.marketing_angles?.growth_signals || lead.growth_signals || null,
        lead.marketing_angles?.automation_angle || lead.automation_angle || null,
        lead.draft_message?.whatsapp ? lead.draft_message.whatsapp.replace(/—/g, '-') : lead.whatsapp_message || null,
        lead.draft_message?.subject ? lead.draft_message.subject.replace(/—/g, '-') : lead.email_subject || null,
        lead.draft_message?.body ? lead.draft_message.body.replace(/—/g, '-') : lead.email_body || null
      ];

      await client.query(query, values);
      importedCount++;
    }

    await client.end();
    return NextResponse.json({ success: true, imported: importedCount, duplicates });
  } catch (err) {
    console.error('Import failed', err);
    if (client) await client.end();
    return NextResponse.json({ error: 'Failed to import leads' }, { status: 500 });
  }
}
