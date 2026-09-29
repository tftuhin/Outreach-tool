import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/googleAuth';
import { Client } from 'pg';
import { google } from 'googleapis';

export async function POST(request: Request) {
  try {
    const { messageId } = await request.json();

    if (!messageId) {
      return NextResponse.json({ error: 'Message ID is required' }, { status: 400 });
    }

    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    await client.connect();
    const result = await client.query("SELECT value FROM settings WHERE key = 'google_auth'");
    await client.end();
    
    if (result.rows.length === 0 || !result.rows[0].value) {
      return NextResponse.json({ error: 'Not connected to Gmail' }, { status: 401 });
    }

    const authData = typeof result.rows[0].value === 'string' 
      ? JSON.parse(result.rows[0].value) 
      : result.rows[0].value;

    const oauth2Client = getGoogleAuth();
    oauth2Client.setCredentials(authData.tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    await gmail.users.messages.trash({
      userId: 'me',
      id: messageId
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Delete error', err);
    return NextResponse.json({ error: err.message || 'Failed to delete message' }, { status: 500 });
  }
}
