"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const pg_1 = require("pg");
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
const pinyin_pro_1 = require("pinyin-pro");
// 加载环境变量
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 9091;
const HOST = process.env.HOST || '0.0.0.0'; // 允许外部访问
// OpenAI 客户端初始化（支持火山引擎等兼容API）
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY || '',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
});
// 数据库连接
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:ncG6Y6Gyb776OPdd7F@cp-loyal-storm-19a3b2eb.pg5.aidap-global.cn-beijing.volces.com:5432/postgres?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});
// 中间件
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// IP 白名单配置
const IP_WHITELIST = (process.env.IP_WHITELIST || '')
    .split(',')
    .map(ip => ip.trim())
    .filter(Boolean);
// 开发模式下允许所有 IP
const isDev = process.env.NODE_ENV !== 'production';
// 是否信任代理（如果服务器在 Nginx/Cloudflare 后面，设为 true）
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
// IP 白名单中间件
const ipWhitelistMiddleware = (req, res, next) => {
    // 开发模式或未配置白名单时，允许所有请求
    if (isDev || IP_WHITELIST.length === 0) {
        return next();
    }
    // 获取客户端 IP（更安全的方式）
    let clientIp = '';
    if (TRUST_PROXY) {
        // 信任代理时，从 X-Forwarded-For 获取（需要确保代理正确设置）
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            // 取第一个IP（最左边的客户端IP）
            clientIp = forwarded.split(',')[0].trim();
        }
    }
    // 回退到 socket IP
    if (!clientIp) {
        clientIp = req.socket.remoteAddress || '';
    }
    // IPv6 映射的 IPv4 地址转换 (::ffff:192.168.1.1 -> 192.168.1.1)
    if (clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.substring(7);
    }
    // 本地地址放行
    if (clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === 'localhost') {
        return next();
    }
    // 检查是否在白名单中
    if (IP_WHITELIST.includes(clientIp) || IP_WHITELIST.includes('*')) {
        return next();
    }
    // 拒绝访问
    console.log(`[IP白名单] 拒绝访问: ${clientIp}`);
    res.status(403).json({
        success: false,
        error: '访问被拒绝，IP不在白名单中'
    });
};
// API 路由前缀
const API_PREFIX = '/api';
// 辅助函数：发送成功响应
function sendSuccess(res, data) {
    res.json({ success: true, data });
}
// 辅助函数：发送错误响应
function sendError(res, message, statusCode = 400) {
    res.status(statusCode).json({ success: false, error: message });
}
// 应用 IP 白名单中间件到所有 API 路由
app.use(`${API_PREFIX}/*`, ipWhitelistMiddleware);
// 辅助函数：获取拼音首字母
function getPinyinInitial(name) {
    if (!name)
        return '#';
    const firstChar = name[0];
    // 如果是英文字母，直接返回大写
    if (/[a-zA-Z]/.test(firstChar)) {
        return firstChar.toUpperCase();
    }
    // 如果是中文，获取拼音首字母
    const py = (0, pinyin_pro_1.pinyin)(firstChar, { pattern: 'first', toneType: 'none' });
    return py ? py.toUpperCase() : '#';
}
// 辅助函数：获取完整拼音（用于排序）
function getPinyinFull(name) {
    if (!name)
        return '';
    return (0, pinyin_pro_1.pinyin)(name, { toneType: 'none', type: 'array' }).join('');
}
// 辅助函数：获取第一个字的拼音（不带声调，用于分组）
function getFirstCharPinyin(name) {
    if (!name)
        return '';
    const firstChar = name[0];
    if (/[a-zA-Z]/.test(firstChar)) {
        return firstChar.toLowerCase();
    }
    return (0, pinyin_pro_1.pinyin)(firstChar, { toneType: 'none' }) || '';
}
// 统计接口
app.get(`${API_PREFIX}/stats`, async (req, res) => {
    try {
        // 获取人物数量
        const charactersResult = await pool.query('SELECT COUNT(*) as count FROM characters');
        sendSuccess(res, {
            characters: parseInt(charactersResult.rows[0].count) || 0,
            positions: 0, // 待开发
            geography: 0, // 待开发
        });
    }
    catch (error) {
        console.error('Error fetching stats:', error);
        sendError(res, '获取统计数据失败', 500);
    }
});
// 1. 获取人物列表（分页）
app.get(`${API_PREFIX}/characters`, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const era = req.query.era;
        const name = req.query.name;
        const offset = (page - 1) * limit;
        // 构建查询条件
        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        if (era) {
            whereClause += ` AND era = $${paramIndex++}`;
            params.push(era);
        }
        if (name) {
            whereClause += ` AND (name ILIKE $${paramIndex} OR aliases::text ILIKE $${paramIndex})`;
            params.push(`%${name}%`);
            paramIndex++;
        }
        // 查询总数
        const countResult = await pool.query(`SELECT COUNT(*) as total FROM characters ${whereClause}`, params);
        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);
        // 查询数据
        const dataResult = await pool.query(`SELECT id, name, title, era, birth_year, death_year, summary 
       FROM characters ${whereClause} 
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, [...params, limit, offset]);
        // 添加拼音首字母并按拼音排序
        const characters = dataResult.rows.map(char => ({
            ...char,
            pinyinInitial: getPinyinInitial(char.name)
        })).sort((a, b) => {
            const pinyinA = getPinyinFull(a.name);
            const pinyinB = getPinyinFull(b.name);
            return pinyinA.localeCompare(pinyinB);
        });
        sendSuccess(res, {
            characters,
            total,
            page,
            limit,
            totalPages
        });
    }
    catch (error) {
        console.error('Error fetching characters:', error);
        sendError(res, '获取人物列表失败', 500);
    }
});
// 1.5 按拼音首字母获取人物列表（用于字母索引）
app.get(`${API_PREFIX}/characters/by-initial/:letter`, async (req, res) => {
    try {
        const { letter } = req.params;
        const upperLetter = letter.toUpperCase();
        if (!/^[A-Z]$/.test(upperLetter)) {
            return sendError(res, '无效的字母');
        }
        const era = req.query.era;
        // 构建查询条件
        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        if (era) {
            whereClause += ` AND era = $${paramIndex++}`;
            params.push(era);
        }
        // 查询所有数据（需要在应用层过滤拼音首字母）
        const dataResult = await pool.query(`SELECT id, name, title, era, birth_year, death_year, summary
       FROM characters ${whereClause}`, params);
        // 筛选并添加拼音信息
        const filteredCharacters = dataResult.rows
            .map(char => ({
            ...char,
            pinyinInitial: getPinyinInitial(char.name),
            firstCharPinyin: getFirstCharPinyin(char.name)
        }))
            .filter(char => char.pinyinInitial === upperLetter);
        // 按拼音排序
        filteredCharacters.sort((a, b) => {
            const pinyinA = getPinyinFull(a.name);
            const pinyinB = getPinyinFull(b.name);
            return pinyinA.localeCompare(pinyinB);
        });
        // 按第一个字的拼音分组
        const groupedByPinyin = {};
        filteredCharacters.forEach(char => {
            const py = char.firstCharPinyin;
            if (!groupedByPinyin[py]) {
                groupedByPinyin[py] = [];
            }
            groupedByPinyin[py].push(char);
        });
        // 转换为数组并按拼音排序
        const groups = Object.entries(groupedByPinyin)
            .map(([pinyin, characters]) => ({
            pinyin,
            count: characters.length,
            characters
        }))
            .sort((a, b) => a.pinyin.localeCompare(b.pinyin));
        sendSuccess(res, {
            letter: upperLetter,
            total: filteredCharacters.length,
            groups
        });
    }
    catch (error) {
        console.error('Error fetching characters by initial:', error);
        sendError(res, '获取人物列表失败', 500);
    }
});
// 2. 获取人物详情
app.get(`${API_PREFIX}/characters/:id`, async (req, res) => {
    try {
        const { id } = req.params;
        // 查询人物信息
        const charResult = await pool.query(`SELECT * FROM characters WHERE id = $1`, [id]);
        if (charResult.rows.length === 0) {
            return sendError(res, '人物不存在', 404);
        }
        const character = charResult.rows[0];
        // 查询该人物发出的关系
        const relationsResult = await pool.query(`SELECT cr.id, cr.relation_type, cr.description,
              c.id as "related_character_id", c.name as "related_name", c.title as "related_title", c.era as "related_era"
       FROM character_relations cr
       JOIN characters c ON cr.related_character_id = c.id
       WHERE cr.character_id = $1`, [id]);
        const relations = relationsResult.rows.map(r => ({
            id: r.id,
            relation_type: r.relation_type,
            description: r.description,
            related_character: {
                id: r.related_character_id,
                name: r.related_name,
                title: r.related_title,
                era: r.related_era
            }
        }));
        // 查询指向该人物的关系
        const reverseRelationsResult = await pool.query(`SELECT cr.id, cr.relation_type, cr.description,
              c.id as "character_id", c.name as "character_name", c.title as "character_title", c.era as "character_era"
       FROM character_relations cr
       JOIN characters c ON cr.character_id = c.id
       WHERE cr.related_character_id = $1`, [id]);
        const reverseRelations = reverseRelationsResult.rows.map(r => ({
            id: r.id,
            relation_type: r.relation_type,
            description: r.description,
            character: {
                id: r.character_id,
                name: r.character_name,
                title: r.character_title,
                era: r.character_era
            }
        }));
        sendSuccess(res, {
            ...character,
            aliases: character.aliases || [],
            relations,
            reverseRelations
        });
    }
    catch (error) {
        console.error('Error fetching character:', error);
        sendError(res, '获取人物详情失败', 500);
    }
});
// 3. AI 补充（预览模式）
app.post(`${API_PREFIX}/characters/enrich-from-tongjian`, async (req, res) => {
    try {
        const { name, dryRun = true, userHint } = req.body;
        if (!name) {
            return sendError(res, '姓名不能为空');
        }
        // 检查 OpenAI API Key
        if (!process.env.OPENAI_API_KEY) {
            return sendError(res, '未配置 OPENAI_API_KEY 环境变量', 500);
        }
        // 查询当前人物信息
        const charResult = await pool.query(`SELECT * FROM characters WHERE name = $1`, [name]);
        const current = charResult.rows[0] || {
            era: null,
            title: null,
            summary: null,
            aliases: []
        };
        // 构建 prompt
        const prompt = `你是一个资治通鉴历史专家。请根据资治通鉴和历史资料，为历史人物"${name}"生成详细的人物传记。

${userHint ? `用户补充信息：${userHint}` : ''}

请以 JSON 格式返回以下信息：
{
  "era": "人物所属纪年（周纪/秦纪/汉纪/魏纪/晋纪/宋纪/齐纪/梁纪/陈纪/隋纪/唐纪/后梁纪/后唐纪/后晋纪/后汉纪/后周纪）",
  "title": "主要官职或封号",
  "summary": "详细的传记摘要（100-300字，包括生平事迹、主要成就、历史评价）",
  "aliases": ["别名1", "别名2"],
  "hometown": "籍贯",
  "relationships": [
    {
      "name": "相关人物姓名",
      "relation": "关系类型（配偶/子女/父母/兄弟/君臣/同僚/对手/同盟）",
      "description": "关系说明"
    }
  ]
}

注意：
1. 所有字段都必须填写，如果不确定可以填写"待考"
2. relationships 最多返回 5 个最重要的关系
3. 只返回 JSON，不要其他解释文字`;
        // 调用 OpenAI API
        const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
        const completion = await openai.chat.completions.create({
            model: model,
            messages: [
                {
                    role: 'system',
                    content: '你是一个专业的中国古代史研究专家，精通资治通鉴。你的任务是为历史人物生成准确的传记信息。'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 2000,
            response_format: { type: 'json_object' }
        });
        const content = completion.choices[0].message.content;
        if (!content) {
            return sendError(res, 'AI 未返回有效内容', 500);
        }
        // 解析 AI 返回的 JSON
        let aiData;
        try {
            aiData = JSON.parse(content);
        }
        catch (e) {
            console.error('Failed to parse AI response:', content);
            return sendError(res, 'AI 返回格式错误', 500);
        }
        const proposed = {
            era: aiData.era || current.era || '待定',
            title: aiData.title || current.title || null,
            summary: aiData.summary || current.summary || null,
            aliases: aiData.aliases || current.aliases || [],
            hometown: aiData.hometown || null
        };
        const relationships = aiData.relationships || [];
        sendSuccess(res, {
            dryRun,
            current: {
                era: current.era,
                title: current.title,
                summary: current.summary,
                aliases: current.aliases || []
            },
            proposed,
            relationships
        });
    }
    catch (error) {
        console.error('Error enriching character:', error);
        sendError(res, 'AI 生成失败: ' + error.message, 500);
    }
});
// 4. 确认写入
app.post(`${API_PREFIX}/characters/enrich-confirm`, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { characterId, name, era, title, hometown, aliases, summary, relationships } = req.body;
        if (!characterId) {
            return sendError(res, 'characterId 不能为空');
        }
        // 更新人物信息
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;
        if (name !== undefined) {
            updateFields.push(`name = $${paramIndex++}`);
            updateValues.push(name);
        }
        if (era !== undefined) {
            updateFields.push(`era = $${paramIndex++}`);
            updateValues.push(era);
        }
        if (title !== undefined) {
            updateFields.push(`title = $${paramIndex++}`);
            updateValues.push(title);
        }
        if (hometown !== undefined) {
            updateFields.push(`hometown = $${paramIndex++}`);
            updateValues.push(hometown);
        }
        if (aliases !== undefined) {
            updateFields.push(`aliases = $${paramIndex++}`);
            updateValues.push(JSON.stringify(aliases));
        }
        if (summary !== undefined) {
            updateFields.push(`summary = $${paramIndex++}`);
            updateValues.push(summary);
        }
        updateFields.push(`updated_at = NOW()`);
        updateValues.push(characterId);
        if (updateFields.length > 1) {
            await client.query(`UPDATE characters SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`, updateValues);
        }
        // 处理关系
        if (relationships && Array.isArray(relationships)) {
            for (const rel of relationships) {
                const { name: relatedName, relation, description } = rel;
                // 查找关联人物
                const relatedResult = await client.query(`SELECT id FROM characters WHERE name = $1`, [relatedName]);
                if (relatedResult.rows.length > 0) {
                    const relatedId = relatedResult.rows[0].id;
                    // 检查关系是否已存在
                    const existRel = await client.query(`SELECT id FROM character_relations 
             WHERE character_id = $1 AND related_character_id = $2 AND relation_type = $3`, [characterId, relatedId, relation]);
                    if (existRel.rows.length === 0) {
                        // 插入新关系
                        await client.query(`INSERT INTO character_relations (character_id, related_character_id, relation_type, description) 
               VALUES ($1, $2, $3, $4)`, [characterId, relatedId, relation, description || null]);
                    }
                }
            }
        }
        await client.query('COMMIT');
        sendSuccess(res, {
            id: characterId,
            name: name,
            updated: Object.keys(req.body).filter(k => k !== 'characterId' && k !== 'relationships')
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Error confirming character:', error);
        sendError(res, '保存失败', 500);
    }
    finally {
        client.release();
    }
});
// 5. 删除人物
app.delete(`${API_PREFIX}/characters/:id`, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;
        // 查询人物信息
        const charResult = await client.query(`SELECT name FROM characters WHERE id = $1`, [id]);
        if (charResult.rows.length === 0) {
            return sendError(res, '人物不存在', 404);
        }
        const name = charResult.rows[0].name;
        // 删除该人物发出的关系
        await client.query(`DELETE FROM character_relations WHERE character_id = $1`, [id]);
        // 删除指向该人物的关系
        await client.query(`DELETE FROM character_relations WHERE related_character_id = $1`, [id]);
        // 删除人物
        await client.query(`DELETE FROM characters WHERE id = $1`, [id]);
        await client.query('COMMIT');
        sendSuccess(res, { id: parseInt(id), name });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting character:', error);
        sendError(res, '删除失败', 500);
    }
    finally {
        client.release();
    }
});
// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    sendError(res, '服务器内部错误', 500);
});
// 启动服务器
app.listen(Number(PORT), HOST, () => {
    console.log('');
    console.log('🚀 资治通鉴人物数据库 API 服务已启动');
    console.log('─'.repeat(50));
    console.log(`📚 API 地址:   http://localhost:${PORT}/api`);
    console.log('─'.repeat(50));
});
// 优雅关闭
process.on('SIGTERM', async () => {
    console.log('SIGTERM signal received: closing HTTP server');
    await pool.end();
    process.exit(0);
});
//# sourceMappingURL=server.js.map