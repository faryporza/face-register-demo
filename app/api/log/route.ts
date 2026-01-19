import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

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

    const dataDir = path.join(process.cwd(), 'data');
    const filePath = path.join(dataDir, 'logs.json');

    // ตรวจสอบว่ามีโฟลเดอร์ data ไหม
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }

    let logs = [];
    if (fs.existsSync(filePath)) {
      const fileData = fs.readFileSync(filePath, 'utf8');
      if (fileData) {
        try {
          logs = JSON.parse(fileData);
        } catch (e) {
          console.error("Error parsing logs.json:", e);
          logs = [];
        }
      }
    }

    const now = new Date();
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;

    // ตรวจสอบการบันทึกซ้ำ (30 นาที)
    const lastEntry = [...logs].reverse().find(log => log.name === name && log.surname === surname);
    
    if (lastEntry) {
      const lastTime = new Date(lastEntry.timestamp);
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

    logs.push(newLog);
    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2));

    return NextResponse.json({ success: true, message: 'Log saved' });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: 'Error saving log' }, { status: 500 });
  }
}
