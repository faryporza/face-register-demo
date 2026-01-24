import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET() {
    try {
        const user = await getSession();

        if (!user) {
            return NextResponse.json(
                { success: false, user: null },
                { status: 401 }
            );
        }

        // Return user info without sensitive data
        return NextResponse.json({
            success: true,
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                surname: user.surname,
                prefix: user.prefix,
                phone: user.phone,
                type: user.type,
                hasFace: user.hasFace
            }
        });
    } catch (error) {
        console.error('Error getting current user:', error);
        return NextResponse.json(
            { success: false, message: 'Error getting user info' },
            { status: 500 }
        );
    }
}
