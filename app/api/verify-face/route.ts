import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMongoClient } from '@/lib/mongodb';

// Euclidean distance between two face descriptors
function euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error('Descriptor lengths do not match');
    }
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
}

export async function POST(req: Request) {
    try {
        // Get current session
        const sessionUser = await getSession();
        if (!sessionUser) {
            return NextResponse.json(
                { success: false, message: 'Not authenticated' },
                { status: 401 }
            );
        }

        // Parse request body
        const text = await req.text();
        if (!text) {
            return NextResponse.json(
                { success: false, message: 'Request body is empty' },
                { status: 400 }
            );
        }

        let body: { descriptor?: number[] };
        try {
            body = JSON.parse(text);
        } catch {
            return NextResponse.json(
                { success: false, message: 'Invalid JSON' },
                { status: 400 }
            );
        }

        const { descriptor: capturedDescriptor } = body;
        if (!capturedDescriptor || !Array.isArray(capturedDescriptor)) {
            return NextResponse.json(
                { success: false, message: 'Missing or invalid descriptor' },
                { status: 400 }
            );
        }

        // Get user's stored descriptor from database
        const client = await getMongoClient();
        const db = client.db();
        const user = await db.collection('faces').findOne({ email: sessionUser.email });

        if (!user) {
            return NextResponse.json(
                { success: false, message: 'User not found' },
                { status: 404 }
            );
        }

        if (!user.descriptor || !Array.isArray(user.descriptor) || user.descriptor.length === 0) {
            return NextResponse.json(
                { success: false, message: 'No face registered for this user', needsFaceSetup: true },
                { status: 400 }
            );
        }

        // Compare descriptors on server
        const storedDescriptor = user.descriptor as number[];
        const distance = euclideanDistance(capturedDescriptor, storedDescriptor);

        // Thresholds matching the client-side values
        const THRESHOLD_STRICT = 0.42;
        const THRESHOLD_NORMAL = 0.48;

        let confidence: 'high' | 'medium' | 'low';
        let matched: boolean;

        if (distance < THRESHOLD_STRICT) {
            confidence = 'high';
            matched = true;
        } else if (distance < THRESHOLD_NORMAL) {
            confidence = 'medium';
            matched = true;
        } else {
            confidence = 'low';
            matched = false;
        }

        return NextResponse.json({
            success: matched,
            distance: parseFloat(distance.toFixed(4)),
            confidence,
            message: matched ? 'Face verified successfully' : 'Face does not match'
        });

    } catch (error) {
        console.error('Error verifying face:', error);
        return NextResponse.json(
            { success: false, message: 'Face verification error' },
            { status: 500 }
        );
    }
}
