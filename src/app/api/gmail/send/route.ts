import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/googleAuth';
import { Client } from 'pg';
import { google } from 'googleapis';

function createMimeMessage(to: string, subject: string, body: string, inReplyTo?: string, references?: string): string {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8'
  ];

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
    const { leadId, to, subject, body, threadId, inReplyTo } = await request.json();

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
    
    const raw = createMimeMessage(to, subject, body, inReplyTo, inReplyTo);
    
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
