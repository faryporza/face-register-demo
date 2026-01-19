import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'logs.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json([]);
    }

    const fileData = fs.readFileSync(filePath, 'utf8');
    const logs = fileData ? JSON.parse(fileData) : [];

    return NextResponse.json(logs);
  } catch (error) {
    console.error('Error loading logs:', error);
    return NextResponse.json({ error: 'Failed to load logs' }, { status: 500 });
  }
}
