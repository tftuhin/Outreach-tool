import { NextResponse } from 'next/server';
import { Client } from 'pg';
import { cleanDraftBody } from '@/lib/cleanDraft';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  try {
    const body = await request.json();
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    await client.connect();

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (body.is_reviewed !== undefined) {
      updates.push(`is_reviewed = $${paramIndex++}`);
      values.push(Boolean(body.is_reviewed));
    }

    if (body.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(body.status);
    }

    if (body.email_subject !== undefined || body.draft_message?.subject !== undefined) {
      const subj = (body.draft_message?.subject ?? body.email_subject ?? '').replace(/—/g, '-');
      updates.push(`email_subject = $${paramIndex++}`);
      values.push(subj);
    }

    if (body.email_body !== undefined || body.draft_message?.body !== undefined) {
      const rawBody = (body.draft_message?.body ?? body.email_body ?? '').replace(/—/g, '-');
      const cleaned = cleanDraftBody(rawBody);
      updates.push(`email_body = $${paramIndex++}`);
      values.push(cleaned);
    }

    if (body.whatsapp_message !== undefined || body.draft_message?.whatsapp !== undefined) {
      const wa = (body.draft_message?.whatsapp ?? body.whatsapp_message ?? '').replace(/—/g, '-');
      updates.push(`whatsapp_message = $${paramIndex++}`);
      values.push(wa);
    }

    if (body.business_name !== undefined) {
      updates.push(`business_name = $${paramIndex++}`);
      values.push(body.business_name);
    }

    if (body.area !== undefined) {
      updates.push(`area = $${paramIndex++}`);
      values.push(body.area);
    }

    if (body.owner_details?.name !== undefined || body.owner_name !== undefined) {
      updates.push(`owner_name = $${paramIndex++}`);
      values.push(body.owner_details?.name ?? body.owner_name ?? '');
    }

    if (body.contact_info?.email !== undefined || body.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(body.contact_info?.email ?? body.email ?? '');
    }

    if (body.contact_info?.alt_email !== undefined || body.alt_email !== undefined) {
      updates.push(`alt_email = $${paramIndex++}`);
      values.push(body.contact_info?.alt_email ?? body.alt_email ?? '');
    }

    if (body.contact_info?.phone_whatsapp !== undefined || body.phone_whatsapp !== undefined) {
      updates.push(`phone_whatsapp = $${paramIndex++}`);
      values.push(body.contact_info?.phone_whatsapp ?? body.phone_whatsapp ?? '');
    }

    if (body.contact_info?.website !== undefined || body.website !== undefined) {
      updates.push(`website = $${paramIndex++}`);
      values.push(body.contact_info?.website ?? body.website ?? '');
    }

    if (body.contact_info?.address !== undefined || body.address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      values.push(body.contact_info?.address ?? body.address ?? '');
    }

    if (body.contact_info?.location_note !== undefined || body.location_note !== undefined) {
      updates.push(`location_note = $${paramIndex++}`);
      values.push(body.contact_info?.location_note ?? body.location_note ?? '');
    }

    if (body.contact_info?.google_maps !== undefined || body.google_maps !== undefined) {
      updates.push(`google_maps = $${paramIndex++}`);
      values.push(body.contact_info?.google_maps ?? body.google_maps ?? '');
    }

    if (body.contact_info?.facebook !== undefined || body.facebook !== undefined) {
      updates.push(`facebook = $${paramIndex++}`);
      values.push(body.contact_info?.facebook ?? body.facebook ?? '');
    }

    if (body.contact_info?.linkedin !== undefined || body.linkedin !== undefined) {
      updates.push(`linkedin = $${paramIndex++}`);
      values.push(body.contact_info?.linkedin ?? body.linkedin ?? '');
    }

    if (updates.length > 0) {
      values.push(id);
      await client.query(
        `UPDATE leads SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    }

    await client.end();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Update lead error:', err);
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
  }
}
