"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
exports.registerAuthRoutes = registerAuthRoutes;
const crypto_1 = __importDefault(require("crypto"));
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000;
const sessions = new Map();
function generateToken() {
    return crypto_1.default.randomBytes(32).toString('hex');
}
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions) {
        if (session.expires < now) {
            sessions.delete(token);
        }
    }
}, 60 * 60 * 1000);
const authMiddleware = (req, res, next) => {
    const token = req.cookies.session_token;
    if (!token) {
        return res.status(401).json({ success: false, error: '未登录', code: 'UNAUTHORIZED' });
    }
    const session = sessions.get(token);
    if (!session || session.expires < Date.now()) {
        sessions.delete(token);
        return res.status(401).json({ success: false, error: '登录已过期', code: 'UNAUTHORIZED' });
    }
    session.expires = Date.now() + COOKIE_MAX_AGE;
    req.user = { username: session.username };
    next();
};
exports.authMiddleware = authMiddleware;
function registerAuthRoutes(app, apiPrefix, sendSuccess, sendError) {
    app.post(`${apiPrefix}/login`, (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) {
            return sendError(res, '用户名和密码不能为空');
        }
        if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
            console.log(`[登录失败] 用户名或密码错误: ${username}`);
            return sendError(res, '用户名或密码错误', 401);
        }
        const token = generateToken();
        sessions.set(token, {
            username,
            expires: Date.now() + COOKIE_MAX_AGE
        });
        res.cookie('session_token', token, {
            httpOnly: true,
            maxAge: COOKIE_MAX_AGE,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production'
        });
        console.log(`[登录成功] ${username}`);
        sendSuccess(res, { username, message: '登录成功' });
    });
    app.post(`${apiPrefix}/logout`, (req, res) => {
        const token = req.cookies.session_token;
        if (token) {
            sessions.delete(token);
        }
        res.clearCookie('session_token');
        sendSuccess(res, { message: '已登出' });
    });
    app.get(`${apiPrefix}/check-auth`, (req, res) => {
        const token = req.cookies.session_token;
        if (!token) {
            return sendSuccess(res, { authenticated: false });
        }
        const session = sessions.get(token);
        if (!session || session.expires < Date.now()) {
            sessions.delete(token);
            return sendSuccess(res, { authenticated: false });
        }
        sendSuccess(res, { authenticated: true, username: session.username });
    });
}
//# sourceMappingURL=auth.js.map