import { NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET() {
  try {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    await client.connect();
    // Use upsert or simply SELECT to get the setting
    const result = await client.query("SELECT value FROM settings WHERE key = 'email_signature'");
    await client.end();
    
    let signature = '';
    if (result.rows.length > 0) {
      signature = result.rows[0].value;
      if (typeof signature !== 'string') {
        // Just in case it's stored as JSON
        signature = JSON.stringify(signature);
      }
    }
    
    return NextResponse.json({ signature });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { signature } = await request.json();
    
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    await client.connect();
    
    // Upsert into settings table
    const query = `
      INSERT INTO settings (key, value) 
      VALUES ('email_signature', $1) 
      ON CONFLICT (key) 
      DO UPDATE SET value = EXCLUDED.value
    `;
    
    // We store the raw HTML string as the value. Since the settings table column is JSONB, 
    // we need to wrap the string in JSON format, or just insert it as a JSON string.
    const jsonValue = JSON.stringify(signature);
    
    await client.query(query, [jsonValue]);
    await client.end();
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
