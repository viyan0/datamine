import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';
import { getPool } from '@/db';
import { getAuth } from '@/lib/auth';
import { digest } from '@/lib/security';
import { HttpError } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        name: z.string().trim().min(2).max(80),
        password: z.string().min(12).max(128),
      })
      .parse(await bodyJson(request));
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'SELECT * FROM invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at > NOW() FOR UPDATE',
        [digest(input.token)],
      );
      const invite = rows[0];
      if (!invite) throw new HttpError(400, 'invalidInvitation');
      const existing = await client.query('SELECT id FROM users WHERE email=$1', [invite.email]);
      let userId: string;
      if (existing.rowCount) {
        const current = await getAuth().api.getSession({ headers: request.headers });
        if (!current || current.user.id !== existing.rows[0].id)
          throw new HttpError(409, 'signInFirst');
        userId = current.user.id;
      } else {
        userId = randomUUID();
        await client.query('INSERT INTO users (id,name,email) VALUES ($1,$2,$3)', [
          userId,
          input.name,
          invite.email,
        ]);
        await client.query(
          'INSERT INTO accounts (id,account_id,provider_id,user_id,password) VALUES ($1,$2,$3,$2,$4)',
          [randomUUID(), userId, 'credential', await hashPassword(input.password)],
        );
      }
      await client.query(
        'INSERT INTO memberships (id,agency_id,user_id,role) VALUES ($1,$2,$3,$4) ON CONFLICT (agency_id,user_id) DO NOTHING',
        [randomUUID(), invite.agency_id, userId, invite.role],
      );
      await client.query('UPDATE invitations SET accepted_at=NOW() WHERE id=$1', [invite.id]);
      await client.query(
        'INSERT INTO audit_events (id,agency_id,actor_id,action) VALUES ($1,$2,$3,$4)',
        [randomUUID(), invite.agency_id, userId, 'memberJoined'],
      );
      await client.query('COMMIT');
      return Response.json({ ok: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return apiError(error);
  }
}
