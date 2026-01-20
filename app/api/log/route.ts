import { NextResponse } from 'next/server';
import { getMongoClient } from '@/lib/mongodb';
import { writeAuditLog } from '@/lib/auditLog';

export async function POST(req: Request) {
  try {
    const text = await req.text();
    if (!text) {
      await writeAuditLog(req, {
        event: 'checkin',
        status: 'fail',
        errorCode: 'EMPTY_BODY',
        message: 'Request body is empty'
      });
      return NextResponse.json({ success: false, message: 'Request body is empty' }, { status: 400 });
    }
    
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      await writeAuditLog(req, {
        event: 'checkin',
        status: 'fail',
        errorCode: 'INVALID_JSON',
        message: 'Invalid JSON'
      });
      return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
    }

    const { name, surname, status, eventType, reason, distanceStatus, bestMatch, source, email } = body;

    const client = await getMongoClient();
    const db = client.db();
    const logsCollection = db.collection('logs');

    if (eventType === 'SCAN_FAIL' || eventType === 'LOGIN_SCAN_FAIL') {
      const auditCollection = db.collection('audit_logs');
      const resolvedSource = typeof source === 'string' ? source : 'checkin';
      const resolvedReason = typeof reason === 'string' ? reason : 'UNKNOWN';
      const cutoff = new Date(Date.now() - 10_000).toISOString();
      const recent = await auditCollection.findOne({
        event: eventType === 'LOGIN_SCAN_FAIL' ? 'login-scan-fail' : 'checkin-scan-fail',
        errorCode: resolvedReason,
        'meta.source': resolvedSource,
        timestamp: { $gte: cutoff }
      });

      if (!recent) {
        await writeAuditLog(req, {
          event: eventType === 'LOGIN_SCAN_FAIL' ? 'login-scan-fail' : 'checkin-scan-fail',
          status: 'fail',
          errorCode: resolvedReason,
          message: typeof distanceStatus === 'string' ? distanceStatus : 'Face scan failed',
          email: typeof email === 'string' ? email : undefined,
          meta: {
            source: resolvedSource,
            bestMatch: typeof bestMatch === 'string' ? bestMatch : undefined
          }
        });
      }

      return NextResponse.json({ success: true, message: 'Scan fail logged' });
    }

    if (eventType === 'LOGIN_SCAN_SUCCESS') {
      await writeAuditLog(req, {
        event: 'login-face-verified',
        status: 'success',
        email: typeof email === 'string' ? email : undefined,
        meta: {
          source: typeof source === 'string' ? source : 'login'
        }
      });
      return NextResponse.json({ success: true, message: 'Login face verified logged' });
    }

    if (typeof name !== 'string' || typeof surname !== 'string') {
      await writeAuditLog(req, {
        event: 'checkin',
        status: 'fail',
        errorCode: 'INVALID_PAYLOAD',
        message: 'Missing name or surname'
      });
      return NextResponse.json({ success: false, message: 'Missing name or surname' }, { status: 400 });
    }

    const now = new Date();
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;

    // ตรวจสอบการบันทึกซ้ำ (30 นาที)
    const lastEntry = await logsCollection
      .find({ name, surname })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();

    if (lastEntry.length > 0) {
      const lastTime = new Date(lastEntry[0].timestamp);
      if (now.getTime() - lastTime.getTime() < THIRTY_MINUTES_MS) {
        await writeAuditLog(req, {
          event: status === 'CHECK_OUT' ? 'checkout' : 'checkin',
          status: 'fail',
          errorCode: 'COOLDOWN',
          message: 'เพิ่งบันทึกไปเมื่อไม่นานมานี้ (Cooldown 30 นาที)',
          meta: {
            name,
            surname,
            status,
            cooldownMs: THIRTY_MINUTES_MS
          }
        });
        return NextResponse.json({ 
          success: true, 
          message: 'เพิ่งบันทึกไปเมื่อไม่นานมานี้ (Cooldown 30 นาที)',
          alreadyLogged: true 
        });
      }
    }

    // เพิ่ม Log ใหม่
    const newLog = {
      timestamp: now.toISOString(),
      name,
      surname,
      status: typeof status === 'string' ? status : 'CHECK_IN'
    };

    const insertResult = await logsCollection.insertOne(newLog);

    await writeAuditLog(req, {
      event: status === 'CHECK_OUT' ? 'checkout' : 'checkin',
      status: 'success',
      meta: {
        name,
        surname,
        status
      },
      result: {
        createdId: insertResult.insertedId?.toString?.() || String(insertResult.insertedId)
      }
    });

    return NextResponse.json({ success: true, message: 'Log saved' });

  } catch (error) {
    console.error(error);
    await writeAuditLog(req, {
      event: 'checkin',
      status: 'fail',
      errorCode: 'SERVER_ERROR',
      message: 'Error saving log'
    });
    return NextResponse.json({ success: false, message: 'Error saving log' }, { status: 500 });
  }
}
