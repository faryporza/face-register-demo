import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

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

    const filePath = path.join(process.cwd(), 'data', 'faces.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const fileData = fs.readFileSync(filePath, 'utf8');
    const faces = fileData ? JSON.parse(fileData) : [];

    const userIndex = faces.findIndex((u: any) => u.email === email);
    if (userIndex === -1) {
      return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    }

    const user = faces[userIndex];
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
      faces[userIndex].password = newHash;
      fs.writeFileSync(filePath, JSON.stringify(faces, null, 2));
    }

    const { password: _password, ...safeUser } = faces[userIndex];
    return NextResponse.json({ success: true, user: safeUser });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: 'Login error' }, { status: 500 });
  }
}
