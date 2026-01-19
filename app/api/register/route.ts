import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

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

    const { prefix, name, surname, phone, email, password, descriptor } = body;

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

    // ป้องกันผู้ใช้ซ้ำ (อีเมลซ้ำ)
    const hasDuplicateEmail = faces.some((face: any) => face.email === email);
    if (hasDuplicateEmail) {
      return NextResponse.json({ success: false, message: 'อีเมลนี้ถูกใช้งานแล้ว' }, { status: 409 });
    }

    // เพิ่มข้อมูลใหม่
    const passwordHash = password ? await bcrypt.hash(password, 10) : '';

    const newRecord = {
      id: Date.now(),
      prefix,
      name,
      surname,
      phone,
      email,
      type: 'user', // Default type is user
      password: passwordHash,
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
