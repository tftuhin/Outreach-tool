import { NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    const result = await client.query("SELECT * FROM leads ORDER BY CAST(REPLACE(id, 'lead_', '') AS INTEGER) ASC");
    
    // Map db columns to frontend nested structure
    const mappedLeads = result.rows.map((row: any) => ({
      lead_id: row.id,
      module: row.module || 'Dentist',
      tier: row.tier,
      business_name: row.business_name,
      area: row.area,
      owner_details: {
        name: row.owner_name,
        license_credentials: row.license_credentials,
        graduation_experience: row.graduation_experience,
      },
      contact_info: {
        phone_whatsapp: row.phone_whatsapp,
        email: row.email,
        alt_email: row.alt_email,
        website: row.website,
        facebook: row.facebook,
        linkedin: row.linkedin,
        google_maps: row.google_maps,
        address: row.address,
        location_note: row.location_note,
      },
      business_context: {
        business_size: row.business_size,
        hours: row.hours,
        founder_age_est: row.founder_age_est,
        age_flag: row.age_flag,
        opened_since: row.opened_since,
        other_channels_notes: row.other_channels_notes,
        sources: row.sources,
        local_competitors: row.local_competitors,
      },
      marketing_angles: {
        snapshot: row.snapshot,
        growth_signals: row.growth_signals,
        automation_angle: row.automation_angle,
      },
      draft_message: {
        whatsapp: row.whatsapp_message,
        subject: row.email_subject,
        body: row.email_body,
      },
      status: row.status,
    }));
    
    await client.end();
    return NextResponse.json(mappedLeads);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}
