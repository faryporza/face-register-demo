import { getSession, type SessionUser } from './session';
import { getMongoClient } from './mongodb';

const KIOSK_API_KEY = process.env.KIOSK_API_KEY;

/**
 * Require authenticated user - returns user or null
 */
export async function requireAuth(): Promise<SessionUser | null> {
    return await getSession();
}

/**
 * Require admin user - returns user or null
 */
export async function requireAdmin(): Promise<SessionUser | null> {
    const user = await getSession();
    if (!user) return null;

    // Check if user has admin type
    if (user.type === 'admin') {
        return user;
    }

    // Double-check from database (in case session is stale)
    try {
        const client = await getMongoClient();
        const db = client.db();
        const dbUser = await db.collection('faces').findOne({ email: user.email });

        if (dbUser?.type === 'admin') {
            return user;
        }
    } catch (error) {
        console.error('Error checking admin status:', error);
    }

    return null;
}

/**
 * Verify Kiosk API Key from request headers
 */
export function verifyKioskApiKey(req: Request): boolean {
    if (!KIOSK_API_KEY) {
        console.warn('KIOSK_API_KEY not configured - kiosk access disabled');
        return false;
    }

    const apiKey = req.headers.get('x-api-key');
    return apiKey === KIOSK_API_KEY;
}

/**
 * Check if request is from an authorized source (admin or kiosk)
 */
export async function isAuthorizedForFaces(req: Request): Promise<boolean> {
    // Check Kiosk API Key first
    if (verifyKioskApiKey(req)) {
        return true;
    }

    // Check if user is admin
    const admin = await requireAdmin();
    return admin !== null;
}
