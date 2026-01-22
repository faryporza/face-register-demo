import { NextResponse } from 'next/server';
import { getMongoClient } from '@/lib/mongodb';
import { writeAuditLog } from '@/lib/auditLog';

export async function POST(req: Request) {
    try {
        const { email, descriptor } = await req.json();

        if (!email || !descriptor || !Array.isArray(descriptor)) {
            return NextResponse.json({ success: false, message: 'Invalid data' }, { status: 400 });
        }

        const client = await getMongoClient();
        const db = client.db();
        const facesCollection = db.collection('faces');

        const result = await facesCollection.updateOne(
            { email: email.toLowerCase() },
            { $set: { descriptor } }
        );

        if (result.matchedCount === 0) {
            return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
        }

        // Return the updated user so frontend can update localStorage
        const updatedUser = await facesCollection.findOne({ email: email.toLowerCase() }, { projection: { password: 0 } });

        const userResponse = updatedUser ? { ...updatedUser, _id: updatedUser._id.toString() } : null;

        return NextResponse.json({ success: true, user: userResponse });

    } catch (error) {
        console.error('Face Setup Error:', error);
        return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
    }
}
