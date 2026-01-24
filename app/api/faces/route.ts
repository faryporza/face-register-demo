import { NextResponse } from 'next/server';
import { getMongoClient } from '@/lib/mongodb';
import { isAuthorizedForFaces } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    // Check authorization - only admin or kiosk can access
    const authorized = await isAuthorizedForFaces(req);
    if (!authorized) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin or Kiosk API Key required' },
        { status: 401 }
      );
    }

    const client = await getMongoClient();
    const db = client.db();
    const facesCollection = db.collection('faces');

    const faces = await facesCollection
      .find({}, { projection: { password: 0 } })
      .toArray();

    const sanitizedFaces = faces.map((face: any) => ({
      ...face,
      _id: face._id?.toString?.() || face._id
    }));

    return NextResponse.json(sanitizedFaces);
  } catch (error) {
    console.error('Error loading faces:', error);
    return NextResponse.json({ error: 'Failed to load faces' }, { status: 500 });
  }
}
