import { NextResponse } from 'next/server';
import { createLogoutResponse } from '@/lib/session';

export async function POST() {
    return createLogoutResponse();
}

export async function GET() {
    return createLogoutResponse();
}
