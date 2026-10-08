import { wakeAutomation } from '@/lib/automation';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { HttpError } from '@/lib/access';
import { appUrl } from '@/lib/config';
import { profileFields } from '@/lib/enrollment-types';
import {
  customerCookie,
  customerProfile,
  customerSession,
  enrollmentInfo,
  optOutCustomer,
  saveCustomerProfile,
  sendEnrollmentCode,
  verifyEnrollmentCode,
} from '@/lib/enrollment';
const localeSchema = z.enum(['en', 'ar', 'ckb']);
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const response = (data: unknown) =>
  Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
export async function GET(_request: Request, { params }: { params: Promise<{ action: string }> }) {
  try {
    if ((await params).action !== 'profile') throw new HttpError(404, 'notFound');
    const { phone } = await customerSession((await cookies()).get(customerCookie)?.value);
    return response(await customerProfile(phone));
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  try {
    checkOrigin(request);
    const { action } = await params;
    const input = await bodyJson(request);
    if (action === 'access')
      return response(await enrollmentInfo(z.object({ token: tokenSchema }).parse(input).token));
    if (action === 'code') {
      const { token, locale } = z.object({ token: tokenSchema, locale: localeSchema }).parse(input);
      return response(await sendEnrollmentCode(token, locale));
    }
    if (action === 'verify') {
      const { token, code } = z
        .object({ token: tokenSchema, code: z.string().regex(/^\d{6}$/) })
        .parse(input);
      const session = await verifyEnrollmentCode(token, code);
      (await cookies()).set(customerCookie, session, {
        httpOnly: true,
        secure: new URL(appUrl()).protocol === 'https:',
        sameSite: 'strict',
        path: '/api/customer',
        maxAge: 1800,
      });
      return response({ ok: true });
    }
    const { phone } = await customerSession((await cookies()).get(customerCookie)?.value);
    if (action === 'profile') {
      const fields = profileFields.parse(input);
      const { consent, locale } = z
        .object({ consent: z.literal(true), locale: localeSchema })
        .parse(input);
      void consent;
      const profile = await saveCustomerProfile(phone, fields, locale, true);
      await wakeAutomation();
      return response({ phone, profile });
    }
    if (action === 'preferences') {
      const fields = profileFields.parse(input),
        { locale } = z.object({ locale: localeSchema }).parse(input);
      const profile = await saveCustomerProfile(phone, fields, locale, false);
      await wakeAutomation();
      return response({ phone, profile });
    }
    if (action === 'opt-out') {
      const result = await optOutCustomer(
        phone,
        z.object({ locale: localeSchema }).parse(input).locale,
      );
      await wakeAutomation();
      return response(result);
    }
    throw new HttpError(404, 'notFound');
  } catch (error) {
    return apiError(error);
  }
}
