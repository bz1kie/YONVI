import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type Auth = (request: unknown) => string | null;
const uuid = z.string().uuid();
const submitSchema = z.object({
  communityIds: z.array(uuid).min(1).max(10).refine(ids => new Set(ids).size === ids.length, 'Duplicate communities'),
}).strict();
const editSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().max(5000),
  priceKopecks: z.number().int().nonnegative().safe(),
}).strict();

/**
 * Auth is deliberately injected: current demo auth only works when
 * NODE_ENV !== production and ALLOW_DEMO_AUTH=true.
 * No server-side MAX signature verification exists yet.
 */
export function registerMarketplaceRoutes(app: FastifyInstance, pool: Pool, auth: Auth) {
  app.get('/api/me/listings', async (request, reply) => {
    const userId = auth(request);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });
    const { rows } = await pool.query(
      `SELECT l.id,l.title,l.description,l.price_kopecks,l.city,l.category,l.status,l.created_at,
        COALESCE(json_agg(json_build_object('communityId',p.community_id,'status',p.status))
        FILTER(WHERE p.id IS NOT NULL),'[]'::json) AS placements
        FROM listings l LEFT JOIN placements p ON p.listing_id=l.id
        WHERE l.seller_id=$1 GROUP BY l.id ORDER BY l.created_at DESC LIMIT 100`,
      [userId],
    );
    return { items: rows };
  });

  app.post('/api/listings/:id/submit', async (request, reply) => {
    const userId = auth(request);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });
    const id = (request.params as { id: string }).id;
    const parsed = submitSchema.safeParse(request.body);
    if (!uuid.safeParse(id).success || !parsed.success) {
      return reply.code(400).send({ error: 'Invalid listing or circle selection' });
    }
    const { communityIds } = parsed.data;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const listing = await client.query(
        'SELECT id,status FROM listings WHERE id=$1 AND seller_id=$2 FOR UPDATE',
        [id, userId],
      );
      if (!listing.rowCount) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Listing not found' });
      }
      if (!['draft', 'active'].includes(listing.rows[0].status)) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Listing cannot be submitted in this state' });
      }
      const communities = await client.query(
        "SELECT id FROM communities WHERE id = ANY($1::uuid[]) AND visibility='public'",
        [communityIds],
      );
      if (communities.rows.length !== communityIds.length) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'A community is unavailable' });
      }
      // A rejected listing may be resubmitted, but an approved placement
      // must never be reset by retrying a request.
      const { rows } = await client.query(
        `INSERT INTO placements(listing_id,community_id,status)
           SELECT $1, unnest($2::uuid[]), 'pending'
           ON CONFLICT (listing_id,community_id)
           DO UPDATE SET status='pending', reviewed_by=NULL, reviewed_at=NULL
             WHERE placements.status IN ('rejected','removed')
           RETURNING id,community_id,status`,
        [id, communityIds],
      );
      await client.query(
        "UPDATE listings SET status='active', updated_at=now() WHERE id=$1 AND status='draft'",
        [id],
      );
      await client.query('COMMIT');
      return reply.code(200).send({ ok: true, submitted: rows.length });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.patch('/api/listings/:id', async (request, reply) => {
    const userId = auth(request);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });
    const id = (request.params as { id: string }).id;
    const parsed = editSchema.safeParse(request.body);
    if (!uuid.safeParse(id).success || !parsed.success) {
      return reply.code(400).send({ error: 'Invalid edit' });
    }
    const d = parsed.data;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const listing = await client.query(
        'SELECT status FROM listings WHERE id=$1 AND seller_id=$2 FOR UPDATE',
        [id, userId],
      );
      if (!listing.rowCount) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Listing not found' });
      }
      if (!['draft','active'].includes(listing.rows[0].status)) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Listing cannot be edited' });
      }
      const { rows } = await client.query(
        `UPDATE listings SET title=$3,description=$4,price_kopecks=$5,updated_at=now()
           WHERE id=$1 AND seller_id=$2 RETURNING id,title,description,price_kopecks,status`,
        [id,userId,d.title,d.description,d.priceKopecks],
      );
      // Material changes revoke approval to prevent post-moderation bait-and-switch.
      await client.query(
        `UPDATE placements SET status='pending',reviewed_by=NULL,reviewed_at=NULL
           WHERE listing_id=$1 AND status='approved'`,
        [id],
      );
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.get('/api/moderation/queue', async (request, reply) => {
    const userId = auth(request);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });
    const parsed = z.object({ communityId: uuid }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid community' });
    const communityId = parsed.data.communityId;
    const { rows: roles } = await pool.query(
      `SELECT 1 FROM communities c WHERE c.id=$1
       AND (c.owner_id=$2 OR EXISTS (
          SELECT 1 FROM community_roles r WHERE r.community_id=c.id
          AND r.user_id=$2 AND r.role IN ('owner','moderator')
       ))`,
      [communityId,userId],
    );
    if (!roles.length) return reply.code(403).send({ error: 'Forbidden' });
    const { rows } = await pool.query(
      `SELECT p.id AS placement_id,p.community_id,l.id AS listing_id,
        l.title,l.description,l.price_kopecks,l.city,l.created_at
        FROM placements p JOIN listings l ON l.id=p.listing_id
        WHERE p.community_id=$1 AND p.status='pending' AND l.status='active'
        ORDER BY l.created_at ASC LIMIT 100`,
      [communityId],
    );
    return { items: rows };
  });
}
