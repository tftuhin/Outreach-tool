import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, AUTH_CREDENTIALS, validateCredentials, createSessionToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, username, password } = body;
    const userInput = (userId || username || '').trim();
    const passwordInput = password || '';

    if (!userInput || !passwordInput) {
      return NextResponse.json(
        { error: 'Please enter both User ID and Password' },
        { status: 400 }
      );
    }

    const isValid = await validateCredentials(userInput, passwordInput);
    if (!isValid) {
      // Artificial delay to prevent brute-force attacks
      await new Promise(resolve => setTimeout(resolve, 400));
      return NextResponse.json(
        { error: 'Invalid User ID or Password' },
        { status: 401 }
      );
    }

    const token = await createSessionToken(AUTH_CREDENTIALS.userId);
    const response = NextResponse.json({
      success: true,
      user: {
        userId: AUTH_CREDENTIALS.userId
      }
    });

    const isProduction = process.env.NODE_ENV === 'production';

    // Set secure auth cookie
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });

    return response;
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred during login' },
      { status: 500 }
    );
  }
}
