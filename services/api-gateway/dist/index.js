"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const http_proxy_middleware_1 = require("http-proxy-middleware");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use((0, helmet_1.default)());
app.use((0, morgan_1.default)('combined'));
// Simple JWT auth middleware (validates and attaches user)
app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return next();
    }
    const token = authHeader.replace('Bearer ', '');
    try {
        const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_PUBLIC_KEY || 'dev-public-key');
        req.user = payload;
    }
    catch {
        // ignore invalid tokens for now; downstream services can enforce auth where needed
    }
    next();
});
// Basic healthcheck
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'api-gateway' });
});
// Example routing to internal services (adjust targets as needed)
app.use('/api/posts', (0, http_proxy_middleware_1.createProxyMiddleware)({
    target: process.env.POST_SERVICE_URL || 'http://localhost:4001',
    changeOrigin: true,
    pathRewrite: { '^/api/posts': '' }
}));
app.use('/api/auth', (0, http_proxy_middleware_1.createProxyMiddleware)({
    target: process.env.AUTH_SERVICE_URL || 'http://localhost:4002',
    changeOrigin: true,
    pathRewrite: { '^/api/auth': '' }
}));
const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
    console.log(`API Gateway listening on port ${port}`);
});
