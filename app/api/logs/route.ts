import { NextResponse } from 'next/server';
import { getMongoClient } from '@/lib/mongodb';

export async function GET(req: Request) {
  try {
    const client = await getMongoClient();
    const db = client.db();
    const logsCollection = db.collection('logs');

    const url = new URL(req.url);

    const pageParam = url.searchParams.get('page');
    const limitParam = url.searchParams.get('limit');
    const page = pageParam ? Math.max(parseInt(pageParam, 10), 1) : null;
    const limit = limitParam ? Math.max(parseInt(limitParam, 10), 1) : null;

    if (page && limit) {
      const skip = (page - 1) * limit;
      const total = await logsCollection.countDocuments({});
      const logs = await logsCollection.find({}).sort({ timestamp: -1 }).skip(skip).limit(limit).toArray();
      const normalizedLogs = logs.map((log: any) => ({
        ...log,
        _id: log._id?.toString?.() || log._id
      }));

      return NextResponse.json({
        data: normalizedLogs,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    }

    const logs = await logsCollection.find({}).sort({ timestamp: 1 }).toArray();
    const normalizedLogs = logs.map((log: any) => ({
      ...log,
      _id: log._id?.toString?.() || log._id
    }));

    return NextResponse.json(normalizedLogs);
  } catch (error) {
    console.error('Error loading logs:', error);
    return NextResponse.json({ error: 'Failed to load logs' }, { status: 500 });
  }
}
