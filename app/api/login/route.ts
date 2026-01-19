import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getMongoClient } from '@/lib/mongodb';

const isBcryptHash = (value: string) => value.startsWith('$2a$') || value.startsWith('$2b$') || value.startsWith('$2y$');

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

    const { email, password } = body;
    if (!email || !password) {
      return NextResponse.json({ success: false, message: 'Missing email or password' }, { status: 400 });
    }

    const client = await getMongoClient();
    const db = client.db();
    const facesCollection = db.collection('faces');

    const user = await facesCollection.findOne({ email });
    if (!user) {
      return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    }

    const storedPassword = user.password || '';

    let isValid = false;
    if (storedPassword) {
      if (isBcryptHash(storedPassword)) {
        isValid = await bcrypt.compare(password, storedPassword);
      } else {
        isValid = password === storedPassword;
      }
    }

    if (!isValid) {
      return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    }

    // Upgrade legacy plaintext password to bcrypt
    if (storedPassword && !isBcryptHash(storedPassword)) {
      const newHash = await bcrypt.hash(password, 10);
      await facesCollection.updateOne({ email }, { $set: { password: newHash } });
      user.password = newHash;
    }

    const { password: _password, ...safeUser } = user;
    const normalizedUser = { ...safeUser, _id: user._id?.toString?.() || user._id };
    return NextResponse.json({ success: true, user: normalizedUser });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: 'Login error' }, { status: 500 });
  }
}
