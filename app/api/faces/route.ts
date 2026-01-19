import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // อ่านไฟล์ faces.json
    const filePath = path.join(process.cwd(), 'data', 'faces.json');
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json([]);
    }

    const fileData = fs.readFileSync(filePath, 'utf8');
    const faces = JSON.parse(fileData);
    const sanitizedFaces = faces.map((face: any) => {
      const { password, ...rest } = face;
      return rest;
    });

    return NextResponse.json(sanitizedFaces);
  } catch (error) {
    console.error('Error loading faces:', error);
    return NextResponse.json({ error: 'Failed to load faces' }, { status: 500 });
  }
}
