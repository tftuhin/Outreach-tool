import { NextResponse } from 'next/server';
import { Client } from 'pg';
import { cleanDraftBody } from '@/lib/cleanDraft';
import fs from 'fs';
import path from 'path';

function mapLeadRow(row: any) {
  const originalBody = (row.email_body || row.draft_message?.body || '').replace(/—/g, '-');
  const cleanedBody = cleanDraftBody(originalBody);

  return {
    lead_id: row.id || row.lead_id,
    module: row.module || 'Dentist',
    tier: row.tier || 'Tier 1',
    business_name: row.business_name || '',
    area: row.area || '',
    owner_details: {
      name: row.owner_name || row.owner_details?.name || '',
      license_credentials: row.license_credentials || row.owner_details?.license_credentials || '',
      graduation_experience: row.graduation_experience || row.owner_details?.graduation_experience || '',
    },
    contact_info: {
      phone_whatsapp: row.phone_whatsapp || row.contact_info?.phone_whatsapp || '',
      email: row.email || row.contact_info?.email || '',
      alt_email: row.alt_email || row.contact_info?.alt_email || '',
      website: row.website || row.contact_info?.website || '',
      facebook: row.facebook || row.contact_info?.facebook || '',
      linkedin: row.linkedin || row.contact_info?.linkedin || '',
      google_maps: row.google_maps || row.contact_info?.google_maps || '',
      address: row.address || row.contact_info?.address || '',
      location_note: row.location_note || row.contact_info?.location_note || '',
    },
    business_context: {
      business_size: row.business_size || row.business_context?.business_size || '',
      hours: row.hours || row.business_context?.hours || '',
      founder_age_est: row.founder_age_est || row.business_context?.founder_age_est || '',
      age_flag: row.age_flag || row.business_context?.age_flag || '',
      opened_since: row.opened_since || row.business_context?.opened_since || '',
      other_channels_notes: row.other_channels_notes || row.business_context?.other_channels_notes || '',
      sources: row.sources || row.business_context?.sources || '',
      local_competitors: row.local_competitors || row.business_context?.local_competitors || '',
    },
    marketing_angles: {
      snapshot: row.snapshot || row.marketing_angles?.snapshot || '',
      growth_signals: row.growth_signals || row.marketing_angles?.growth_signals || '',
      automation_angle: row.automation_angle || row.marketing_angles?.automation_angle || '',
    },
    draft_message: {
      whatsapp: (row.whatsapp_message || row.draft_message?.whatsapp || '').replace(/—/g, '-'),
      subject: (row.email_subject || row.draft_message?.subject || '').replace(/—/g, '-'),
      body: cleanedBody,
    },
    status: row.status || 'pending',
    is_reviewed: !!row.is_reviewed,
    last_mail_sent: row.last_mail_sent || null,
    last_response_received: row.last_response_received || null,
  };
}

function getFallbackLeads() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'test_lead.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (Array.isArray(data)) {
        return data.map(mapLeadRow);
      }
    }
  } catch (err) {
    console.error('Failed to read fallback leads:', err);
  }
  return [];
}

export async function GET() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not set in environment. Returning fallback local test leads.");
    return NextResponse.json(getFallbackLeads());
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();

    const result = await client.query("SELECT * FROM leads ORDER BY id ASC");
    
    // Map db columns to frontend nested structure and auto-clean typed signatures
    const mappedLeads = [];
    for (const row of result.rows) {
      const mapped = mapLeadRow(row);
      const originalBody = (row.email_body || '').replace(/—/g, '-');
      const cleanedBody = mapped.draft_message.body;

      // Auto-update lead in database if it has a hardcoded/typed signature
      if (cleanedBody !== originalBody && row.id) {
        try {
          await client.query("UPDATE leads SET email_body = $1 WHERE id = $2", [cleanedBody, row.id]);
        } catch (updateErr) {
          console.error(`Failed to update cleaned email_body for lead ${row.id}:`, updateErr);
        }
      }

      mappedLeads.push(mapped);
    }
    
    await client.end();
    return NextResponse.json(mappedLeads);
  } catch (err) {
    console.error('Database connection error in GET /api/leads:', err);
    if (client) {
      try { await client.end(); } catch (_) {}
    }
    return NextResponse.json(getFallbackLeads());
  }
}

export async function POST(request: Request) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const lead = await request.json();
    await client.connect();

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

    await client.query(`
      INSERT INTO leads (
        id, module, tier, business_name, area, owner_name, license_credentials,
        graduation_experience, phone_whatsapp, email, alt_email, website,
        facebook, linkedin, google_maps, address, location_note, business_size,
        hours, founder_age_est, age_flag, opened_since, other_channels_notes,
        sources, local_competitors, snapshot, growth_signals, automation_angle,
        whatsapp_message, email_subject, email_body, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
      )
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        business_name = EXCLUDED.business_name,
        whatsapp_message = EXCLUDED.whatsapp_message,
        email_subject = EXCLUDED.email_subject,
        email_body = EXCLUDED.email_body,
        status = EXCLUDED.status
    `, [
      newId,
      lead.module || 'Dentist',
      lead.tier || 'Tier 1',
      lead.business_name || 'Test Lead',
      lead.area || 'Dhaka',
      lead.owner_details?.name || lead.owner_name || 'Owner',
      lead.owner_details?.license_credentials || lead.license_credentials || '',
      lead.owner_details?.graduation_experience || lead.graduation_experience || '',
      lead.contact_info?.phone_whatsapp || lead.phone_whatsapp || '',
      lead.contact_info?.email || lead.email || '',
      lead.contact_info?.alt_email || lead.alt_email || '',
      lead.contact_info?.website || lead.website || '',
      lead.contact_info?.facebook || lead.facebook || '',
      lead.contact_info?.linkedin || lead.linkedin || '',
      lead.contact_info?.google_maps || lead.google_maps || '',
      lead.contact_info?.address || lead.address || '',
      lead.contact_info?.location_note || lead.location_note || '',
      lead.business_context?.business_size || lead.business_size || '',
      lead.business_context?.hours || lead.hours || '',
      lead.business_context?.founder_age_est || lead.founder_age_est || '',
      lead.business_context?.age_flag || lead.age_flag || '',
      lead.business_context?.opened_since || lead.opened_since || '',
      lead.business_context?.other_channels_notes || lead.other_channels_notes || '',
      lead.business_context?.sources || lead.sources || '',
      lead.business_context?.local_competitors || lead.local_competitors || '',
      lead.marketing_angles?.snapshot || lead.snapshot || '',
      lead.marketing_angles?.growth_signals || lead.growth_signals || '',
      lead.marketing_angles?.automation_angle || lead.automation_angle || '',
      (lead.draft_message?.whatsapp || lead.whatsapp_message || '').replace(/—/g, '-'),
      (lead.draft_message?.subject || lead.email_subject || '').replace(/—/g, '-'),
      cleanDraftBody((lead.draft_message?.body || lead.email_body || '').replace(/—/g, '-')),
      lead.status || 'pending'
    ]);

    await client.end();
    return NextResponse.json({ success: true, lead_id: newId });
  } catch (err: any) {
    console.error('Create lead error', err);
    return NextResponse.json({ error: err.message || 'Failed to create lead' }, { status: 500 });
  }
}
