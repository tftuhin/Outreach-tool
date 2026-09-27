import { NextResponse } from 'next/server';
import { Client } from 'pg';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const resolvedParams = await params;
  const { id } = resolvedParams;
  
  try {
    const body = await request.json();
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    await client.connect();

    if (body.status && Object.keys(body).length === 1) {
      // Just status update
      await client.query("UPDATE leads SET status = $1 WHERE id = $2", [body.status, id]);
    } else {
      // Full update
      await client.query(`
        UPDATE leads SET 
          business_name = $1, area = $2, owner_name = $3,
          email = $4, phone_whatsapp = $5, website = $6, address = $7,
          whatsapp_message = $8, email_subject = $9, email_body = $10
        WHERE id = $11
      `, [
        body.business_name, body.area, body.owner_details?.name,
        body.contact_info?.email, body.contact_info?.phone_whatsapp, 
        body.contact_info?.website, body.contact_info?.address, 
        (body.draft_message?.whatsapp || body.whatsapp_message || '').replace(/—/g, '-'),
        (body.draft_message?.subject || body.email_subject || '').replace(/—/g, '-'),
        (body.draft_message?.body || body.email_body || '').replace(/—/g, '-'),
        id
      ]);
    }

    await client.end();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
  }
}
