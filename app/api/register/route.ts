import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
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

    const { prefix, name, surname, phone, email, password, descriptor } = body;

    const client = await getMongoClient();
    const db = client.db();
    const facesCollection = db.collection('faces');

    // ป้องกันผู้ใช้ซ้ำ (อีเมลซ้ำ)
    const existing = await facesCollection.findOne({ email });
    if (existing) {
      return NextResponse.json({ success: false, message: 'อีเมลนี้ถูกใช้งานแล้ว' }, { status: 409 });
    }

    // เพิ่มข้อมูลใหม่
    const passwordHash = password ? await bcrypt.hash(password, 10) : '';

    const newRecord = {
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

    await facesCollection.insertOne(newRecord);

    return NextResponse.json({ message: 'บันทึกข้อมูลเรียบร้อย', success: true });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: 'เกิดข้อผิดพลาดในการบันทึก', success: false }, { status: 500 });
  }
}
