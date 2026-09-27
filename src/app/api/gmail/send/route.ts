import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/googleAuth';
import { Client } from 'pg';
import { google } from 'googleapis';

function createMimeMessage(to: string, subject: string, body: string): string {
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body
  ].join('\r\n');

  // Base64url encode
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function POST(request: Request) {
  try {
    const { leadId, to, subject, body } = await request.json();

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

    const oauth2Client = getGoogleAuth();
    oauth2Client.setCredentials(authData.tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    const raw = createMimeMessage(to, subject, body);
    
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    });

    if (res.data.id && leadId) {
      // Mark as outreached in DB
      await client.query("UPDATE leads SET status = 'outreached' WHERE id = $1", [leadId]);
    }
    
    await client.end();
    return NextResponse.json({ success: true, messageId: res.data.id });
  } catch (err) {
    console.error('Send email error', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
