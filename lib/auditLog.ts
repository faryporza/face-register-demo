import { getMongoClient } from '@/lib/mongodb';

type AuditStatus = 'success' | 'fail';

type AuditLogPayload = {
  event: string;
  status: AuditStatus;
  userId?: string;
  email?: string;
  errorCode?: string;
  message?: string;
  route?: string;
  method?: string;
  userAgent?: string;
  ip?: string;
  meta?: Record<string, any>;
  result?: Record<string, any>;
};

const getRequestIp = (req: Request) => {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0]?.trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  return undefined;
};

const anonymizeIp = (ip?: string) => {
  if (!ip) return undefined;
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
    return ip;
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 3) {
      return `${parts[0]}:${parts[1]}:${parts[2]}::`;
    }
    return ip;
  }
  return ip;
};

export const writeAuditLog = async (req: Request, payload: AuditLogPayload) => {
  try {
    const url = new URL(req.url);
    const client = await getMongoClient();
    const db = client.db();
    const logsCollection = db.collection('audit_logs');

    const userAgent = payload.userAgent ?? req.headers.get('user-agent') ?? '';
    const rawIp = payload.ip ?? getRequestIp(req);
    const ip = anonymizeIp(rawIp);

    await logsCollection.insertOne({
      timestamp: new Date().toISOString(),
      event: payload.event,
      status: payload.status,
      userId: payload.userId,
      email: payload.email,
      errorCode: payload.errorCode,
      message: payload.message,
      route: payload.route ?? url.pathname,
      method: payload.method ?? req.method,
      client: {
        userAgent,
        ip
      },
      meta: payload.meta,
      result: payload.result
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
};