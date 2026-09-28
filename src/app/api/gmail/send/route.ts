import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/googleAuth';
import { Client } from 'pg';
import { google } from 'googleapis';

function createMimeMessage(to: string, cc: string | undefined, subject: string, body: string, inReplyTo?: string, references?: string): string {
  const lines = [
    `To: ${to}`,
  ];

  if (cc) {
    lines.push(`Cc: ${cc}`);
  }

  lines.push(
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8'
  );

  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`);
  }
  if (references) {
    lines.push(`References: ${references}`);
  }

  lines.push('', body);

  // Base64url encode
  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function POST(request: Request) {
  try {
    const { leadId, to, cc, subject, body, threadId, inReplyTo } = await request.json();

    if (!to || !subject || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    await client.connect();
    const result = await client.query("SELECT value FROM settings WHERE key = 'google_auth'");
    
    if (result.rows.length === 0 || !result.rows[0].value) {
      await client.end();
      return NextResponse.json({ error: 'Not connected to Gmail' }, { status: 401 });
    }

    const authData = typeof result.rows[0].value === 'string' 
      ? JSON.parse(result.rows[0].value) 
      : result.rows[0].value;

    const sigResult = await client.query("SELECT value FROM settings WHERE key = 'email_signature'");
    let signature = '';
    if (sigResult.rows.length > 0 && sigResult.rows[0].value) {
      signature = sigResult.rows[0].value;
      if (typeof signature === 'string') {
        try { signature = JSON.parse(signature); } catch(e) {}
      }
    }
    if (signature) {
      // Apply zero margin to paragraphs in the signature to reduce line spacing
      signature = signature.replace(/<p>/gi, '<p style="margin: 0; padding: 0; line-height: 1.2;">');
      signature = `<div style="margin-top: 12px;">${signature}</div>`;
    }
    
    const finalBody = signature ? `${body}${signature}` : body;

    const oauth2Client = getGoogleAuth();
    oauth2Client.setCredentials(authData.tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    const raw = createMimeMessage(to, cc, subject, finalBody, inReplyTo, inReplyTo);
    
    const requestBody: any = { raw };
    if (threadId) {
      requestBody.threadId = threadId;
    }

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody
    });

    if (res.data.id && leadId) {
      // If pending, mark as outreached in DB
      await client.query("UPDATE leads SET status = CASE WHEN status = 'pending' THEN 'outreached' ELSE status END WHERE id = $1", [leadId]);
    }
    
    await client.end();
    return NextResponse.json({ success: true, messageId: res.data.id });
  } catch (err) {
    console.error('Send email error', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
