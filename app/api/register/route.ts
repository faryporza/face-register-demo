import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getMongoClient } from '@/lib/mongodb';
import { writeAuditLog } from '@/lib/auditLog';

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
const isNumberArray = (x: unknown): x is number[] =>
  Array.isArray(x) && x.every((n) => typeof n === 'number' && Number.isFinite(n));

export async function POST(req: Request) {
  try {
    const text = await req.text();
    if (!text) {
      await writeAuditLog(req, {
        event: 'register',
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
        event: 'register',
        status: 'fail',
        errorCode: 'INVALID_JSON',
        message: 'Invalid JSON'
      });
      return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
    }

    const { descriptor } = body;
    const { prefix, name, surname, phone, email, password } = body;

    // ---- validate presence ----
    if (!prefix || !name || !surname || !phone || !email || !password || !descriptor) {
      await writeAuditLog(req, {
        event: 'register',
        status: 'fail',
        errorCode: 'MISSING_FIELDS',
        message: 'กรอกข้อมูลให้ครบ',
        email: typeof email === 'string' ? normalizeEmail(email) : undefined
      });
      return NextResponse.json({ success: false, message: 'กรอกข้อมูลให้ครบ' }, { status: 400 });
    }

    // ---- normalize ----
    const normalizedName = normalizeName(String(name));
    const normalizedSurname = normalizeName(String(surname));
    const normalizedEmail = normalizeEmail(String(email));
    const normalizedPhone = normalizePhone(String(phone));
    const normalizedPrefix = String(prefix).trim();
    const normalizedPassword = String(password);

    // ---- validate fields ----
    const allowedPrefix = ['นาย', 'นางสาว', 'นาง', 'เด็กชาย', 'เด็กหญิง'];
    if (!allowedPrefix.includes(normalizedPrefix)) {
      await writeAuditLog(req, {
        event: 'register',
        status: 'fail',
        errorCode: 'INVALID_PREFIX',
        message: 'คำนำหน้าไม่ถูกต้อง',
        email: normalizedEmail
      });
      return NextResponse.json({ success: false, message: 'คำนำหน้าไม่ถูกต้อง' }, { status: 400 });
    }

    if (!isValidName(normalizedName)) {
      await writeAuditLog(req, {
        event: 'register',
        status: 'fail',
        errorCode: 'INVALID_NAME',
        message: 'ชื่อไม่ถูกต้อง (อย่างน้อย 2 ตัวอักษร)',
        email: normalizedEmail
      });
      return NextResponse.json({ success: false, message: 'ชื่อไม่ถูกต้อง (อย่างน้อย 2 ตัวอักษร)' }, { status: 400 });
    }

    if (!isValidName(normalizedSurname)) {
      await writeAuditLog(req, {
        event: 'register',
        status: 'fail',
        errorCode: 'INVALID_SURNAME',
        message: 'นามสกุลไม่ถูกต้อง (อย่างน้อย 2 ตัวอักษร)',
        email: normalizedEmail
      });
      return NextResponse.json({ success: false, message: 'นามสกุลไม่ถูกต้อง (อย่างน้อย 2 ตัวอักษร)' }, { status: 400 });
    }

    if (!isValidEmail(normalizedEmail)) {
      await writeAuditLog(req, {
        event: 'register',
        status: 'fail',
        errorCode: 'INVALID_EMAIL',
        message: 'อีเมลไม่ถูกต้อง',
        email: normalizedEmail
      });
      return NextResponse.json({ success: false, message: 'อีเมลไม่ถูกต้อง' }, { status: 400 });
    }

    if (!/^0\d{9}$/.test(normalizedPhone)) {
      await writeAuditLog(req, {
        event: 'register',
        status: 'fail',
        errorCode: 'INVALID_PHONE',
        message: 'เบอร์โทรไม่ถูกต้อง (ต้องเป็น 10 หลัก เริ่มด้วย 0)',
        email: normalizedEmail
      });
      return NextResponse.json({ success: false, message: 'เบอร์โทรไม่ถูกต้อง (ต้องเป็น 10 หลัก เริ่มด้วย 0)' }, { status: 400 });
    }

    if (normalizedPassword.length < 6) {
      await writeAuditLog(req, {
        event: 'register',
        status: 'fail',
        errorCode: 'WEAK_PASSWORD',
        message: 'รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร',
        email: normalizedEmail
      });
      return NextResponse.json({ success: false, message: 'รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
    }

    // descriptor ต้องเป็น array ตัวเลข และยาวพอสมควร
    // face-api.js ส่วนใหญ่ ~128 ค่า (บางรุ่นอาจต่างได้เล็กน้อย)
    if (!isNumberArray(descriptor) || descriptor.length < 64) {
      await writeAuditLog(req, {
        event: 'register',
        status: 'fail',
        errorCode: 'INVALID_DESCRIPTOR',
        message: 'ข้อมูลใบหน้า (descriptor) ไม่ถูกต้อง',
        email: normalizedEmail
      });
      return NextResponse.json({ success: false, message: 'ข้อมูลใบหน้า (descriptor) ไม่ถูกต้อง' }, { status: 400 });
    }

    const client = await getMongoClient();
    const db = client.db();
    const facesCollection = db.collection('faces');

    // ---- prevent duplicates (email + phone) ----
    const existingEmail = await facesCollection.findOne({ email: normalizedEmail });
    if (existingEmail) {
      await writeAuditLog(req, {
        event: 'register',
        status: 'fail',
        errorCode: 'DUPLICATE_EMAIL',
        message: 'อีเมลนี้ถูกใช้งานแล้ว',
        email: normalizedEmail
      });
      return NextResponse.json({ success: false, message: 'อีเมลนี้ถูกใช้งานแล้ว' }, { status: 409 });
    }

    const existingPhone = await facesCollection.findOne({ phone: normalizedPhone });
    if (existingPhone) {
      await writeAuditLog(req, {
        event: 'register',
        status: 'fail',
        errorCode: 'DUPLICATE_PHONE',
        message: 'เบอร์โทรนี้ถูกใช้งานแล้ว',
        email: normalizedEmail
      });
      return NextResponse.json({ success: false, message: 'เบอร์โทรนี้ถูกใช้งานแล้ว' }, { status: 409 });
    }

    // ---- insert ----
    const passwordHash = await bcrypt.hash(normalizedPassword, 10);

    const newRecord = {
      prefix: normalizedPrefix,
      name: normalizedName,
      surname: normalizedSurname,
      phone: normalizedPhone,
      email: normalizedEmail,
      type: 'user',
      password: passwordHash,
      descriptor,
      createdAt: new Date().toISOString(),
    };

    const insertResult = await facesCollection.insertOne(newRecord);

    await writeAuditLog(req, {
      event: 'register',
      status: 'success',
      userId: insertResult.insertedId?.toString?.() || String(insertResult.insertedId),
      email: normalizedEmail,
      result: {
        createdId: insertResult.insertedId?.toString?.() || String(insertResult.insertedId)
      }
    });

    return NextResponse.json({ message: 'บันทึกข้อมูลเรียบร้อย', success: true });
  } catch (error) {
    console.error(error);
    await writeAuditLog(req, {
      event: 'register',
      status: 'fail',
      errorCode: 'SERVER_ERROR',
      message: 'เกิดข้อผิดพลาดในการบันทึก'
    });
    return NextResponse.json({ message: 'เกิดข้อผิดพลาดในการบันทึก', success: false }, { status: 500 });
  }
}
