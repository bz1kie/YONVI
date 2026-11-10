import Fastify from 'fastify';
import cors from '@fastify/cors';
import pg from 'pg';

const app = Fastify({ logger: true });
await app.register(cors, { origin: process.env.WEB_ORIGIN || 'http://localhost:5173' });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://yorvi:yorvi_local_password@localhost:5432/yorvi' });

app.get('/health', async () => ({ ok: true, app: 'YORVI', version: '2.0.0-alpha.1' }));

app.get('/api/listings', async (req, reply) => {
  try {
    const { rows } = await pool.query(
      "SELECT id,title,description,price_kopecks,city,category,status,created_at FROM listings WHERE status='active' ORDER BY created_at DESC LIMIT 30"
    );
    return { items: rows };
  } catch (error) {
    req.log.error(error);
    return reply.code(503).send({ error: 'Database unavailable' });
  }
});

app.get('/api/communities', async (req, reply) => {
  try {
    const { rows } = await pool.query("SELECT id,name,city FROM communities WHERE visibility='public' ORDER BY name");
    return { items: rows };
  } catch (error) {
    req.log.error(error);
    return reply.code(503).send({ error: 'Database unavailable' });
  }
});

// This alpha intentionally has no write endpoints or fake MAX authentication.
// Implement server-verified MAX auth, permissions and moderation before enabling mutations.
try {
  await app.listen({ port: Number(process.env.PORT || 3001), host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
