import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const SESSION_COOKIE_NAME = 'session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionUser {
    _id: string;
    email: string;
    name: string;
    surname: string;
    prefix?: string;
    phone?: string;
    type?: string;
    hasFace?: boolean;
}

export interface SessionPayload {
    user: SessionUser;
    iat: number;
    exp: number;
}

/**
 * Create a JWT token for the user
 */
export function createSessionToken(user: SessionUser): string {
    return jwt.sign({ user }, JWT_SECRET, { expiresIn: SESSION_MAX_AGE });
}

/**
 * Verify and decode a JWT token
 */
export function verifySessionToken(token: string): SessionPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as SessionPayload;
    } catch {
        return null;
    }
}

/**
 * Get current session from cookies (for Server Components and API routes)
 */
export async function getSession(): Promise<SessionUser | null> {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (!sessionCookie?.value) {
        return null;
    }

    const payload = verifySessionToken(sessionCookie.value);
    return payload?.user || null;
}

/**
 * Set session cookie in a NextResponse
 */
export function setSessionCookie(response: NextResponse, user: SessionUser): NextResponse {
    const token = createSessionToken(user);

    response.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE,
        path: '/',
    });

    return response;
}

/**
 * Clear session cookie in a NextResponse
 */
export function clearSessionCookie(response: NextResponse): NextResponse {
    response.cookies.set(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
    });

    return response;
}

/**
 * Create a response with session cookie set
 */
export function createSessionResponse(user: SessionUser, body: object = { success: true }): NextResponse {
    const response = NextResponse.json(body);
    return setSessionCookie(response, user);
}

/**
 * Create a response that clears the session
 */
export function createLogoutResponse(): NextResponse {
    const response = NextResponse.json({ success: true });
    return clearSessionCookie(response);
}
