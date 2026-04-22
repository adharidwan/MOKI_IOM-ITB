import { NextResponse } from 'next/server';

import { SSO_SESSION_COOKIE } from '@/app/lib/sso-config';

export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.set({
    name: SSO_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  });

  return response;
}
