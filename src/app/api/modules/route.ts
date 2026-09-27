import { NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    const result = await client.query('SELECT * FROM modules ORDER BY id ASC');
    await client.end();
    return NextResponse.json(result.rows);
  } catch (err) {
    console.error(err);
    if (client) await client.end();
    return NextResponse.json({ error: 'Failed to fetch modules' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    const { name } = await request.json();
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    
    await client.connect();
    const result = await client.query('INSERT INTO modules (name) VALUES ($1) RETURNING *', [name]);
    await client.end();
    return NextResponse.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (client) await client.end();
    return NextResponse.json({ error: 'Failed to create module' }, { status: 500 });
  }
}
