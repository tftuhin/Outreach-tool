import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/googleAuth';
import { Client } from 'pg';
import { google } from 'googleapis';

export async function POST() {
  try {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    await client.connect();
    
    // Check if connected
    const settingsRes = await client.query("SELECT value FROM settings WHERE key = 'google_auth'");
    if (settingsRes.rows.length === 0 || !settingsRes.rows[0].value) {
      await client.end();
      return NextResponse.json({ error: 'Not connected to Gmail' }, { status: 401 });
    }

    const authData = typeof settingsRes.rows[0].value === 'string' 
      ? JSON.parse(settingsRes.rows[0].value) 
      : settingsRes.rows[0].value;

    const oauth2Client = getGoogleAuth();
    oauth2Client.setCredentials(authData.tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Fetch all outreached leads
    const leadsRes = await client.query("SELECT id, email, alt_email FROM leads WHERE status = 'outreached'");
    const outreachedLeads = leadsRes.rows;
    
    let updatedCount = 0;
    const updatedLeadIds: string[] = [];

    // Check inbox for replies from any of these emails
    for (const lead of outreachedLeads) {
      const emailsToCheck = [lead.email, lead.alt_email].filter(Boolean);
      let hasReply = false;
      
      for (const email of emailsToCheck) {
        // Query Gmail for messages from this email
        const res = await gmail.users.messages.list({
          userId: 'me',
          q: `from:${email}`,
          maxResults: 1
        });
        
        if (res.data.messages && res.data.messages.length > 0) {
          hasReply = true;
          break;
        }
      }
      
      if (hasReply) {
        await client.query("UPDATE leads SET status = 'responded', last_response_received = NOW() WHERE id = $1", [lead.id]);
        updatedCount++;
        updatedLeadIds.push(lead.id);
      }
    }
    
    await client.end();
    return NextResponse.json({ success: true, updatedCount, updatedLeadIds });
  } catch (err) {
    console.error('Receive check error', err);
    return NextResponse.json({ error: 'Failed to check inbox' }, { status: 500 });
  }
}
