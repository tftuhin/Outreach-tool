import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/googleAuth';
import { Client } from 'pg';
import { google } from 'googleapis';

// Helper to decode Base64url encoded email body
function decodeBase64(data: string): string {
  try {
    const sanitized = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(sanitized, 'base64').toString('utf-8');
  } catch (e) {
    return '';
  }
}

// Helper to recursively extract plain text body from Gmail payload parts
function extractBody(payload: any): string {
  if (!payload) return '';

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    // Fallback: check subparts
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }

  // If HTML only, return simple stripped text if available
  if (payload.body?.data) {
    const raw = decodeBase64(payload.body.data);
    const noTags = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return noTags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
  }

  return '';
}

// Helper to isolate and hide previous message trail (quoted text, On ... wrote, etc.)
function stripMessageTrail(text: string): { cleanBody: string; trail?: string } {
  if (!text) return { cleanBody: '' };

  const normalized = text.replace(/—/g, '-');

  // Common email reply headers (On ... wrote:, Original Message, etc.)
  const headerPatterns = [
    /\r?\n\s*On\s+[\s\S]{1,300}?wrote:\s*(\r?\n|$)/i,
    /\r?\n\s*-+\s*Original Message\s*-+/i,
    /\r?\n\s*From:\s*[^\n]+\r?\n\s*(?:Sent|Date):\s*[^\n]+\r?\n\s*To:\s*[^\n]+/i,
    /\r?\n_{15,}\r?\n/,
    /\r?\n\s*-+\s*Forwarded message\s*-+/i,
    /\r?\n\s*Begin forwarded message:\s*/i
  ];

  for (const pattern of headerPatterns) {
    const match = pattern.exec(normalized);
    if (match && match.index !== undefined) {
      const before = normalized.substring(0, match.index).trim();
      const after = normalized.substring(match.index).trim();
      if (before.length > 0) {
        return { cleanBody: before, trail: after };
      }
    }
  }

  // Handle case where text has quote blocks (lines starting with '>')
  const lines = normalized.split(/\r?\n/);
  const firstQuoteIdx = lines.findIndex(l => l.trim().startsWith('>'));
  if (firstQuoteIdx > 0) {
    const before = lines.slice(0, firstQuoteIdx).join('\n').trim();
    const after = lines.slice(firstQuoteIdx).join('\n').trim();
    if (before.length > 0) {
      return { cleanBody: before, trail: after };
    }
  } else if (firstQuoteIdx === 0) {
    // Reply was placed after the quote
    const nonQuoteLines: string[] = [];
    const quoteLines: string[] = [];
    for (const line of lines) {
      if (line.trim().startsWith('>') || /^\s*On\s+[\s\S]+?wrote:\s*$/i.test(line)) {
        quoteLines.push(line);
      } else {
        nonQuoteLines.push(line);
      }
    }
    const clean = nonQuoteLines.join('\n').trim();
    if (clean.length > 0) {
      return { cleanBody: clean, trail: quoteLines.join('\n').trim() };
    }
  }

  return { cleanBody: normalized.trim() };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');

  if (!email || email === 'undefined' || email.trim() === '') {
    return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 });
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const result = await client.query("SELECT value FROM settings WHERE key = 'google_auth'");
    await client.end();

    if (result.rows.length === 0 || !result.rows[0].value) {
      return NextResponse.json({ connected: false, messages: [] });
    }

    const authData = typeof result.rows[0].value === 'string'
      ? JSON.parse(result.rows[0].value)
      : result.rows[0].value;

    const oauth2Client = getGoogleAuth();
    oauth2Client.setCredentials(authData.tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Search messages related to this email address
    const cleanEmail = email.trim();
    const q = `to:${cleanEmail} OR from:${cleanEmail}`;
    console.log(`[Gmail Sync] Searching for conversation with: ${q}`);
    
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q,
      maxResults: 20
    });

    console.log(`[Gmail Sync] Found ${listRes.data.messages?.length || 0} messages for query: ${q}`);

    if (!listRes.data.messages || listRes.data.messages.length === 0) {
      return NextResponse.json({ connected: true, messages: [] });
    }

    // Fetch full message details
    const messages = await Promise.all(
      listRes.data.messages.map(async (m) => {
        try {
          const msg = await gmail.users.messages.get({
            userId: 'me',
            id: m.id!,
            format: 'full'
          });

          const headers = msg.data.payload?.headers || [];
          const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
          const to = headers.find(h => h.name?.toLowerCase() === 'to')?.value || '';
          const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
          const date = headers.find(h => h.name?.toLowerCase() === 'date')?.value || '';
          const messageIdHeader = headers.find(h => h.name?.toLowerCase() === 'message-id')?.value || '';

          const rawBody = extractBody(msg.data.payload) || msg.data.snippet || '';
          const { cleanBody, trail } = stripMessageTrail(rawBody);
          const myEmail = (authData.email || '').toLowerCase();
          const isFromMe = from.toLowerCase().includes(myEmail);

          return {
            id: msg.data.id,
            threadId: msg.data.threadId,
            messageIdHeader,
            from,
            to,
            subject: (subject || '').replace(/—/g, '-'),
            date,
            timestamp: parseInt(msg.data.internalDate || '0', 10),
            body: cleanBody,
            trail: trail || null,
            snippet: msg.data.snippet || '',
            isFromMe
          };
        } catch (e) {
          return null;
        }
      })
    );

    // Filter valid messages and sort chronologically (oldest to newest)
    const validMessages = messages
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => a.timestamp - b.timestamp);

    const lastThreadId = validMessages.length > 0 ? validMessages[validMessages.length - 1].threadId : undefined;
    const lastMessageIdHeader = validMessages.length > 0 ? validMessages[validMessages.length - 1].messageIdHeader : undefined;
    const lastSubject = validMessages.length > 0 ? validMessages[validMessages.length - 1].subject : undefined;

    return NextResponse.json({
      connected: true,
      messages: validMessages,
      threadId: lastThreadId,
      lastMessageIdHeader,
      lastSubject
    });
  } catch (err: any) {
    console.error('Conversation fetch error', err);
    if (client) await client.end();
    return NextResponse.json({ error: 'Failed to fetch conversation', messages: [] }, { status: 500 });
  }
}
