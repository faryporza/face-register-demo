import { NextResponse } from 'next/server';
import { getMongoClient } from '@/lib/mongodb';

export async function GET() {
  try {
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
