import { NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json([{ id: 1, name: 'Dentist' }]);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    const result = await client.query('SELECT * FROM modules ORDER BY id ASC');
    await client.end();
    return NextResponse.json(result.rows.length > 0 ? result.rows : [{ id: 1, name: 'Dentist' }]);
  } catch (err) {
    console.error('Database connection error in GET /api/modules:', err);
    if (client) {
      try { await client.end(); } catch (_) {}
    }
    return NextResponse.json([{ id: 1, name: 'Dentist' }]);
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
