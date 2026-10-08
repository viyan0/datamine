import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from '@/db';
import * as schema from '@/db/schema';
import { appUrl, requiredSecret } from './config';

let instance: ReturnType<typeof buildAuth> | undefined;
function buildAuth() {
  return betterAuth({
    appName: 'Datamine',
    baseURL: appUrl(),
    secret: requiredSecret('BETTER_AUTH_SECRET'),
    database: drizzleAdapter(getDb(), { provider: 'pg', schema }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
    user: {
      additionalFields: { platformRole: { type: 'string', defaultValue: 'staff', input: false } },
    },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
    trustedOrigins: [appUrl()],
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 30 },
    advanced: { useSecureCookies: appUrl().startsWith('https://') },
  });
}
export function getAuth() {
  return (instance ??= buildAuth());
}
