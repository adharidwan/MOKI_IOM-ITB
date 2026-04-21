import { NextResponse } from 'next/server';

import { SSO_SESSION_COOKIE } from '@/app/lib/sso-config';
import { verifySsoAccessToken } from '@/app/lib/sso-server';

function getExpiryDate(exp: number | undefined): Date | undefined {
  if (!exp || !Number.isFinite(exp)) {
    return undefined;
  }

  return new Date(exp * 1000);
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') || '';

  if (!authorization.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Bearer token.' }, { status: 401 });
  }

  const token = authorization.slice(7);

  try {
    const payload = await verifySsoAccessToken(token);
    const response = NextResponse.json({
      authenticated: true,
      user: {
        sub: payload.sub,
        name: payload.name || null,
        email: payload.email || null,
        roles: payload.realm_access?.roles || [],
      },
    });

    response.cookies.set({
      name: SSO_SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: getExpiryDate(typeof payload.exp === 'number' ? payload.exp : undefined),
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid SSO token.' },
      { status: 401 },
    );
  }
}
