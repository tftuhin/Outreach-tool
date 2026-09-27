import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/googleAuth';

export async function GET(request: Request) {
  const oauth2Client = getGoogleAuth();
  
  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent' // force prompt to get refresh token
  });

  return NextResponse.redirect(url);
}
