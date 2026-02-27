import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createProxyMiddleware } from 'http-proxy-middleware';
import jwt from 'jsonwebtoken';

const app = express();
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));

// Simple JWT auth middleware (validates and attaches user)
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const payload = jwt.verify(token, process.env.JWT_PUBLIC_KEY || 'dev-public-key');
    (req as any).user = payload;
  } catch {
    // ignore invalid tokens for now; downstream services can enforce auth where needed
  }

  next();
});

// Basic healthcheck
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

// Example routing to internal services (adjust targets as needed)
app.use(
  '/api/posts',
  createProxyMiddleware({
    target: process.env.POST_SERVICE_URL || 'http://localhost:4001',
    changeOrigin: true,
    pathRewrite: { '^/api/posts': '' }
  })
);

app.use(
  '/api/auth',
  createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL || 'http://localhost:4002',
    changeOrigin: true,
    pathRewrite: { '^/api/auth': '' }
  })
);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`API Gateway listening on port ${port}`);
});
