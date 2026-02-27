"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const pg_1 = require("pg");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const kafkajs_1 = require("kafkajs");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)());
app.use((0, helmet_1.default)());
app.use((0, morgan_1.default)('combined'));
const pool = new pg_1.Pool({
    connectionString: process.env.POSTGRES_URL || 'postgres://connectx:connectx@localhost:5432/connectx_posts'
});
const kafka = new kafkajs_1.Kafka({
    clientId: 'post-service',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    logLevel: kafkajs_1.logLevel.ERROR
});
const producer = kafka.producer();
async function init() {
    await producer.connect();
}
init().catch((err) => {
    console.error('Failed to init post-service', err);
    process.exit(1);
});
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.replace('Bearer ', '');
    try {
        const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_PUBLIC_KEY || 'dev-public-key');
        req.userId = payload.sub;
        next();
    }
    catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
}
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'post-service' });
});
app.post('/posts', authMiddleware, async (req, res) => {
    const userId = req.userId;
    const { text, mediaBundleId, visibility = 'PUBLIC' } = req.body;
    if (!text && !mediaBundleId) {
        return res.status(400).json({ error: 'text or mediaBundleId is required' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`INSERT INTO posts (author_id, text, media_bundle_id, visibility)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`, [userId, text || null, mediaBundleId || null, visibility]);
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
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating post', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
    finally {
        client.release();
    }
});
const port = Number(process.env.PORT) || 4001;
app.listen(port, () => {
    console.log(`Post Service listening on port ${port}`);
});
