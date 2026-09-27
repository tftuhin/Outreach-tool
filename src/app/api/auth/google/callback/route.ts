import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/googleAuth';
import { Client } from 'pg';
import { google } from 'googleapis';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  try {
    const oauth2Client = getGoogleAuth();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    // Save to DB
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    await client.connect();
    await client.query(`
      INSERT INTO settings (key, value) 
      VALUES ('google_auth', $1)
      ON CONFLICT (key) DO UPDATE SET value = $1
    `, [JSON.stringify({ tokens, email: userInfo.data.email })]);
    await client.end();

    // Redirect back to home
    return NextResponse.redirect(new URL('/', request.url));
  } catch (err) {
    console.error('OAuth error', err);
    return NextResponse.json({ error: 'OAuth failed' }, { status: 500 });
  }
}
