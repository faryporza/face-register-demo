import { NextResponse } from 'next/server';
import { getMongoClient } from '@/lib/mongodb';

export async function POST(req: Request) {
  try {
    const text = await req.text();
    if (!text) {
      return NextResponse.json({ success: false, message: 'Request body is empty' }, { status: 400 });
    }
    
    let body;
    try {
      body = JSON.parse(text);
    } catch (e) {
      return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
    }

    const { name, surname, status } = body;

    const client = await getMongoClient();
    const db = client.db();
    const logsCollection = db.collection('logs');

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
      status: status || 'CHECK_IN'
    };

    await logsCollection.insertOne(newLog);

    return NextResponse.json({ success: true, message: 'Log saved' });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: 'Error saving log' }, { status: 500 });
  }
}
