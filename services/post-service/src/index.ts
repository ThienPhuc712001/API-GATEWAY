import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { Kafka, logLevel } from 'kafkajs';

const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || 'postgres://connectx:connectx@localhost:5432/connectx_posts'
});

const kafka = new Kafka({
  clientId: 'post-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  logLevel: logLevel.ERROR
});

const producer = kafka.producer();

async function init() {
  await producer.connect();
}

init().catch((err) => {
  console.error('Failed to init post-service', err);
  process.exit(1);
});

function authMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const payload = jwt.verify(token, process.env.JWT_PUBLIC_KEY || 'dev-public-key') as any;
    (req as any).userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'post-service' });
});

app.post('/posts', authMiddleware, async (req, res) => {
  const userId = (req as any).userId as string;
  const { text, mediaBundleId, visibility = 'PUBLIC' } = req.body;

  if (!text && !mediaBundleId) {
    return res.status(400).json({ error: 'text or mediaBundleId is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO posts (author_id, text, media_bundle_id, visibility)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [userId, text || null, mediaBundleId || null, visibility]
    );

    const row = result.rows[0];

    await producer.send({
      topic: 'post_created',
      messages: [
        {
          key: String(row.id),
          value: JSON.stringify({
            postId: row.id,
            authorId: userId,
            visibility,
            createdAt: row.created_at
          })
        }
      ]
    });

    await client.query('COMMIT');

    res.status(201).json({
      id: row.id,
      createdAt: row.created_at
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating post', err);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();
  }
});

const port = Number(process.env.PORT) || 4001;
app.listen(port, () => {
  console.log(`Post Service listening on port ${port}`);
});
