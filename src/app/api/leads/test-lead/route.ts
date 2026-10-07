import { NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET(request: Request) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    const testLead = {
      id: 'lead_000', // Puts it at the very top of the list (#1)
      module: 'Dentist',
      tier: 'Tier 1',
      business_name: 'Zeon Dental Studio (Test Lead)',
      area: 'Gulshan 2, Dhaka',
      owner_name: 'S. M. Tariquzzaman (Tuhin)',
      license_credentials: 'BM&DC 99999 (Test)',
      graduation_experience: 'BDS, PGT — Lead Consultant',
      phone_whatsapp: '+880 1700-000000',
      email: 'tuhin59083@gmail.com',
      alt_email: 'tuhin.themefisher@gmail.com',
      website: 'https://zeon.studio',
      facebook: 'https://facebook.com/zeonstudio',
      linkedin: 'https://linkedin.com/in/tftuhin',
      google_maps: 'https://maps.google.com/?q=Gulshan+2+Dhaka',
      address: 'House 12, Road 11, Block D, Gulshan 2, Dhaka 1212',
      location_note: 'Opposite to Gulshan Club, high-footfall commercial area',
      business_size: '4 dentists, 8 staff',
      hours: 'Sat–Thu 10am–9pm · Fri closed',
      founder_age_est: '~32',
      age_flag: 'VERIFIED — Test Profile',
      opened_since: '2023',
      other_channels_notes: 'Test lead profile configured for testing Gmail outreach, delivery verification, and reply polling.',
      sources: 'Zeon Studio Internal Testing',
      local_competitors: 'Test Competitor A | Test Competitor B',
      snapshot: 'High-intent test lead setup to verify Gmail send delivery and automated inbound reply tracking.',
      growth_signals: 'Active inbox (tuhin59083@gmail.com) ready for testing outbound email and replies.',
      automation_angle: 'Instant Gmail outreach delivery test + follow-up workflow.',
      whatsapp_message: 'Assalamu Alaikum Tuhin - this is a test message from your Zeon Outreach Hub application.',
      email_subject: 'Zeon Outreach Tool - Test Outreach Email for Tuhin',
      email_body: 'Hello Tuhin,\n\nThis is a live test outreach email sent directly through your connected Gmail account using the Zeon Outreach Tool.\n\nEverything is working as expected:\n- Direct Gmail API dispatch\n- Custom modal confirmation\n- Automatic status tracking',
      status: 'pending'
    };

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
        alt_email = EXCLUDED.alt_email,
        business_name = EXCLUDED.business_name,
        whatsapp_message = EXCLUDED.whatsapp_message,
        email_subject = EXCLUDED.email_subject,
        email_body = EXCLUDED.email_body,
        status = EXCLUDED.status;
    `, [
      testLead.id, testLead.module, testLead.tier, testLead.business_name, testLead.area,
      testLead.owner_name, testLead.license_credentials, testLead.graduation_experience,
      testLead.phone_whatsapp, testLead.email, testLead.alt_email, testLead.website,
      testLead.facebook, testLead.linkedin, testLead.google_maps, testLead.address,
      testLead.location_note, testLead.business_size, testLead.hours, testLead.founder_age_est,
      testLead.age_flag, testLead.opened_since, testLead.other_channels_notes, testLead.sources,
      testLead.local_competitors, testLead.snapshot, testLead.growth_signals, testLead.automation_angle,
      testLead.whatsapp_message, testLead.email_subject, testLead.email_body, testLead.status
    ]);

    await client.end();

    const { searchParams } = new URL(request.url);
    if (searchParams.get('redirect') === '1') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.json({ success: true, message: 'Test lead created/updated successfully!', lead: testLead });
  } catch (err: any) {
    console.error('Test lead creation error', err);
    if (client) await client.end();
    return NextResponse.json({ error: err.message || 'Failed to create test lead' }, { status: 500 });
  }
}
