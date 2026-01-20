import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getMongoClient } from '@/lib/mongodb';
import { writeAuditLog } from '@/lib/auditLog';

const getRequesterEmail = (req: Request) => {
  const headerEmail = req.headers.get('x-user-email');
  if (!headerEmail) return undefined;
  return headerEmail.trim().toLowerCase();
};

export async function GET(req: Request) {
  try {
    const client = await getMongoClient();
    const db = client.db();
    const facesCollection = db.collection('faces');

    const url = new URL(req.url);
    const pageParam = url.searchParams.get('page');
    const limitParam = url.searchParams.get('limit');
    const page = pageParam ? Math.max(parseInt(pageParam, 10), 1) : null;
    const limit = limitParam ? Math.max(parseInt(limitParam, 10), 1) : null;

    if (page && limit) {
      const skip = (page - 1) * limit;
      const total = await facesCollection.countDocuments({});
      const users = await facesCollection
        .find({}, { projection: { password: 0 } })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      const normalized = users.map((user: Record<string, unknown>) => ({
        ...user,
        _id: user._id?.toString?.() || user._id
      }));

      return NextResponse.json({
        data: normalized,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    }

    const users = await facesCollection.find({}, { projection: { password: 0 } }).toArray();
    const normalized = users.map((user: Record<string, unknown>) => ({
      ...user,
      _id: user._id?.toString?.() || user._id
    }));

    return NextResponse.json(normalized);
  } catch (error) {
    console.error('Error loading users:', error);
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const text = await req.text();
    if (!text) {
      await writeAuditLog(req, {
        event: 'admin-action',
        status: 'fail',
        errorCode: 'EMPTY_BODY',
        message: 'Request body is empty',
        email: getRequesterEmail(req)
      });
      return NextResponse.json({ success: false, message: 'Request body is empty' }, { status: 400 });
    }

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      await writeAuditLog(req, {
        event: 'admin-action',
        status: 'fail',
        errorCode: 'INVALID_JSON',
        message: 'Invalid JSON',
        email: getRequesterEmail(req)
      });
      return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
    }

    const { id, type } = body;
    if (!id || !type || !['admin', 'user'].includes(type)) {
      await writeAuditLog(req, {
        event: 'admin-action',
        status: 'fail',
        errorCode: 'INVALID_PAYLOAD',
        message: 'Invalid payload',
        email: getRequesterEmail(req)
      });
      return NextResponse.json({ success: false, message: 'Invalid payload' }, { status: 400 });
    }

    const client = await getMongoClient();
    const db = client.db();
    const facesCollection = db.collection('faces');

    await facesCollection.updateOne({ _id: new ObjectId(id) }, { $set: { type } });

    await writeAuditLog(req, {
      event: 'admin-action',
      status: 'success',
      email: getRequesterEmail(req),
      result: {
        changedFields: { type }
      },
      meta: {
        userId: id
      }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating user:', error);
    await writeAuditLog(req, {
      event: 'admin-action',
      status: 'fail',
      errorCode: 'SERVER_ERROR',
      message: 'Failed to update user',
      email: getRequesterEmail(req)
    });
    return NextResponse.json({ success: false, message: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const text = await req.text();
    if (!text) {
      await writeAuditLog(req, {
        event: 'admin-action',
        status: 'fail',
        errorCode: 'EMPTY_BODY',
        message: 'Request body is empty',
        email: getRequesterEmail(req)
      });
      return NextResponse.json({ success: false, message: 'Request body is empty' }, { status: 400 });
    }

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      await writeAuditLog(req, {
        event: 'admin-action',
        status: 'fail',
        errorCode: 'INVALID_JSON',
        message: 'Invalid JSON',
        email: getRequesterEmail(req)
      });
      return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
    }

    const { id } = body;
    if (!id) {
      await writeAuditLog(req, {
        event: 'admin-action',
        status: 'fail',
        errorCode: 'MISSING_ID',
        message: 'Missing id',
        email: getRequesterEmail(req)
      });
      return NextResponse.json({ success: false, message: 'Missing id' }, { status: 400 });
    }

    const client = await getMongoClient();
    const db = client.db();
    const facesCollection = db.collection('faces');

    await facesCollection.deleteOne({ _id: new ObjectId(id) });

    await writeAuditLog(req, {
      event: 'admin-action',
      status: 'success',
      email: getRequesterEmail(req),
      result: {
        changedFields: { deleted: true }
      },
      meta: {
        userId: id
      }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    await writeAuditLog(req, {
      event: 'admin-action',
      status: 'fail',
      errorCode: 'SERVER_ERROR',
      message: 'Failed to delete user',
      email: getRequesterEmail(req)
    });
    return NextResponse.json({ success: false, message: 'Failed to delete user' }, { status: 500 });
  }
}
