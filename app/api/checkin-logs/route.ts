import { NextResponse } from 'next/server';
import { getMongoClient } from '@/lib/mongodb';

export async function GET(req: Request) {
  try {
    const client = await getMongoClient();
    const db = client.db();
    const logsCollection = db.collection('logs');
    const facesCollection = db.collection('faces');

    const url = new URL(req.url);

    const pageParam = url.searchParams.get('page');
    const limitParam = url.searchParams.get('limit');
    const page = pageParam ? Math.max(parseInt(pageParam, 10), 1) : null;
    const limit = limitParam ? Math.max(parseInt(limitParam, 10), 1) : null;

    const name = url.searchParams.get('name');
    const surname = url.searchParams.get('surname');
    const status = url.searchParams.get('status');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    const requesterEmail = req.headers.get('x-user-email')?.trim().toLowerCase();
    if (!requesterEmail) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const requester = await facesCollection.findOne({ email: requesterEmail });
    const isAdmin = requester?.type?.toLowerCase?.() === 'admin';
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const query: Record<string, unknown> = {};
    if (name) query.name = name;
    if (surname) query.surname = surname;
    if (status) query.status = status;

    if (from || to) {
      const range: { $gte?: string; $lte?: string } = {};
      if (from) range.$gte = new Date(from).toISOString();
      if (to) range.$lte = new Date(to).toISOString();
      query.timestamp = range;
    }

    if (page && limit) {
      const skip = (page - 1) * limit;
      const total = await logsCollection.countDocuments(query);
      const logs = await logsCollection.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).toArray();
      const normalizedLogs = logs.map((log: Record<string, unknown>) => ({
        ...log,
        _id: (log as { _id?: { toString?: () => string } })._id?.toString?.() || (log as { _id?: unknown })._id
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

    const logs = await logsCollection.find(query).sort({ timestamp: 1 }).toArray();
    const normalizedLogs = logs.map((log: Record<string, unknown>) => ({
      ...log,
      _id: (log as { _id?: { toString?: () => string } })._id?.toString?.() || (log as { _id?: unknown })._id
    }));

    return NextResponse.json(normalizedLogs);
  } catch (error) {
    console.error('Error loading check-in logs:', error);
    return NextResponse.json({ error: 'Failed to load check-in logs' }, { status: 500 });
  }
}
