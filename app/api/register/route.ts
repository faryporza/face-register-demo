import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prefix, name, surname, phone, email, descriptor } = body;

    // ตำแหน่งไฟล์ที่จะบันทึก (data/faces.json)
    const dataDir = path.join(process.cwd(), 'data');
    const filePath = path.join(dataDir, 'faces.json');

    // สร้างโฟลเดอร์ data ถ้ายังไม่มี
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }

    let faces = [];
    
    // อ่านไฟล์เดิมถ้ามีอยู่แล้ว
    if (fs.existsSync(filePath)) {
      const fileData = fs.readFileSync(filePath, 'utf8');
      if (fileData) {
        try {
          faces = JSON.parse(fileData);
        } catch (e) {
          console.error("Error parsing JSON:", e);
          faces = [];
        }
      }
    }

    // เพิ่มข้อมูลใหม่
    const newRecord = {
      id: Date.now(),
      prefix,
      name,
      surname,
      phone,
      email,
      descriptor, // ข้อมูลใบหน้า (Array ของตัวเลข)
      timestamp: new Date().toISOString()
    };

    faces.push(newRecord);

    // เขียนลงไฟล์
    fs.writeFileSync(filePath, JSON.stringify(faces, null, 2));

    return NextResponse.json({ message: 'บันทึกข้อมูลเรียบร้อย', success: true });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: 'เกิดข้อผิดพลาดในการบันทึก', success: false }, { status: 500 });
  }
}
