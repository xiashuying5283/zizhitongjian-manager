"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.startPoolHealthCheck = startPoolHealthCheck;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    max: 5,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5000,
});
exports.pool.on('error', (err) => {
    console.error('[数据库连接池错误]', err.message);
});
function startPoolHealthCheck(intervalMs = 30000) {
    return setInterval(async () => {
        try {
            await exports.pool.query('SELECT 1');
        }
        catch (e) {
            console.error('[数据库健康检查失败]', e.message);
        }
    }, intervalMs);
}
//# sourceMappingURL=db.js.map