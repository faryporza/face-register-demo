import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getMongoClient } from '@/lib/mongodb';
import { writeAuditLog } from '@/lib/auditLog';

const isBcryptHash = (value: string) => value.startsWith('$2a$') || value.startsWith('$2b$') || value.startsWith('$2y$');

export async function POST(req: Request) {
  try {
    const text = await req.text();
    if (!text) {
      await writeAuditLog(req, {
        event: 'login',
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
        event: 'login',
        status: 'fail',
        errorCode: 'INVALID_JSON',
        message: 'Invalid JSON'
      });
      return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
    }

    const { email, password } = body;
    if (!email || !password) {
      await writeAuditLog(req, {
        event: 'login',
        status: 'fail',
        errorCode: 'MISSING_CREDENTIALS',
        message: 'Missing email or password',
        email: typeof email === 'string' ? email.trim().toLowerCase() : undefined
      });
      return NextResponse.json({ success: false, message: 'Missing email or password' }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const passwordValue = String(password);

    const client = await getMongoClient();
    const db = client.db();
    const facesCollection = db.collection('faces');

    const user = await facesCollection.findOne({ email: normalizedEmail });
    if (!user) {
      await writeAuditLog(req, {
        event: 'login',
        status: 'fail',
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
        email: normalizedEmail
      });
      return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    }

    const storedPassword = user.password || '';

    let isValid = false;
    if (storedPassword) {
      if (isBcryptHash(storedPassword)) {
        isValid = await bcrypt.compare(passwordValue, storedPassword);
      } else {
        isValid = passwordValue === storedPassword;
      }
    }

    if (!isValid) {
      await writeAuditLog(req, {
        event: 'login',
        status: 'fail',
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
        email: normalizedEmail,
        userId: user._id?.toString?.() || String(user._id)
      });
      return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    }

    // Upgrade legacy plaintext password to bcrypt
    if (storedPassword && !isBcryptHash(storedPassword)) {
      const newHash = await bcrypt.hash(passwordValue, 10);
      await facesCollection.updateOne({ email: normalizedEmail }, { $set: { password: newHash } });
      user.password = newHash;
    }

    const { password: _unusedPassword, ...safeUser } = user as { password?: unknown; [key: string]: unknown };
    void _unusedPassword;
    const normalizedUser = { ...safeUser, _id: user._id?.toString?.() || user._id };
    await writeAuditLog(req, {
      event: 'login',
      status: 'success',
      email: normalizedEmail,
      userId: user._id?.toString?.() || String(user._id)
    });

    return NextResponse.json({ success: true, user: normalizedUser });
  } catch (error) {
    console.error(error);
    await writeAuditLog(req, {
      event: 'login',
      status: 'fail',
      errorCode: 'SERVER_ERROR',
      message: 'Login error'
    });
    return NextResponse.json({ success: false, message: 'Login error' }, { status: 500 });
  }
}
