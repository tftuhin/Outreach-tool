import { NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET() {
  try {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT
      );
    `);
    const result = await client.query("SELECT value FROM settings WHERE key = 'google_auth'");
    await client.end();

    if (result.rows.length > 0 && result.rows[0].value) {
      const authData = typeof result.rows[0].value === 'string' 
        ? JSON.parse(result.rows[0].value) 
        : result.rows[0].value;
      
      return NextResponse.json({ connected: true, email: authData.email });
    }
    
    return NextResponse.json({ connected: false });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}
