import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getMongoClient } from '@/lib/mongodb';

// ---- helpers ----
const normalizeName = (s: string) => s.trim().replace(/\s+/g, ' ');
const normalizeEmail = (s: string) => s.trim().toLowerCase();
const normalizePhone = (s: string) => s.replace(/\D/g, '');

const isValidName = (s: string) => {
  const v = normalizeName(s);
  // ไทย/อังกฤษ/เว้นวรรค/ขีด, ยาว 2-60
  return /^[A-Za-zก-๙\s-]{2,60}$/.test(v);
};

const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
const isValidPhoneTH = (s: string) => /^0\d{9}$/.test(normalizePhone(s));

const isNumberArray = (x: any) =>
  Array.isArray(x) && x.every((n) => typeof n === 'number' && Number.isFinite(n));

export async function POST(req: Request) {
  try {
    const text = await req.text();
    if (!text) {
      return NextResponse.json({ success: false, message: 'Request body is empty' }, { status: 400 });
    }

    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
    }

    let { prefix, name, surname, phone, email, password, descriptor } = body;

    // ---- validate presence ----
    if (!prefix || !name || !surname || !phone || !email || !password || !descriptor) {
      return NextResponse.json({ success: false, message: 'กรอกข้อมูลให้ครบ' }, { status: 400 });
    }

    // ---- normalize ----
    name = normalizeName(String(name));
    surname = normalizeName(String(surname));
    email = normalizeEmail(String(email));
    phone = normalizePhone(String(phone));
    prefix = String(prefix).trim();

    // ---- validate fields ----
    const allowedPrefix = ['นาย', 'นางสาว', 'นาง', 'เด็กชาย', 'เด็กหญิง'];
    if (!allowedPrefix.includes(prefix)) {
      return NextResponse.json({ success: false, message: 'คำนำหน้าไม่ถูกต้อง' }, { status: 400 });
    }

    if (!isValidName(name)) {
      return NextResponse.json({ success: false, message: 'ชื่อไม่ถูกต้อง (อย่างน้อย 2 ตัวอักษร)' }, { status: 400 });
    }

    if (!isValidName(surname)) {
      return NextResponse.json({ success: false, message: 'นามสกุลไม่ถูกต้อง (อย่างน้อย 2 ตัวอักษร)' }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ success: false, message: 'อีเมลไม่ถูกต้อง' }, { status: 400 });
    }

    if (!/^0\d{9}$/.test(phone)) {
      return NextResponse.json({ success: false, message: 'เบอร์โทรไม่ถูกต้อง (ต้องเป็น 10 หลัก เริ่มด้วย 0)' }, { status: 400 });
    }

    password = String(password);
    if (password.length < 6) {
      return NextResponse.json({ success: false, message: 'รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
    }

    // descriptor ต้องเป็น array ตัวเลข และยาวพอสมควร
    // face-api.js ส่วนใหญ่ ~128 ค่า (บางรุ่นอาจต่างได้เล็กน้อย)
    if (!isNumberArray(descriptor) || descriptor.length < 64) {
      return NextResponse.json({ success: false, message: 'ข้อมูลใบหน้า (descriptor) ไม่ถูกต้อง' }, { status: 400 });
    }

    const client = await getMongoClient();
    const db = client.db();
    const facesCollection = db.collection('faces');

    // ---- prevent duplicates (email + phone) ----
    const existingEmail = await facesCollection.findOne({ email });
    if (existingEmail) {
      return NextResponse.json({ success: false, message: 'อีเมลนี้ถูกใช้งานแล้ว' }, { status: 409 });
    }

    const existingPhone = await facesCollection.findOne({ phone });
    if (existingPhone) {
      return NextResponse.json({ success: false, message: 'เบอร์โทรนี้ถูกใช้งานแล้ว' }, { status: 409 });
    }

    // ---- insert ----
    const passwordHash = await bcrypt.hash(password, 10);

    const newRecord = {
      prefix,
      name,
      surname,
      phone,
      email,
      type: 'user',
      password: passwordHash,
      descriptor,
      createdAt: new Date().toISOString(),
    };

    await facesCollection.insertOne(newRecord);

    return NextResponse.json({ message: 'บันทึกข้อมูลเรียบร้อย', success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: 'เกิดข้อผิดพลาดในการบันทึก', success: false }, { status: 500 });
  }
}
