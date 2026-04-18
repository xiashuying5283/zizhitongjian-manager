import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Pool, QueryResult } from 'pg';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { pinyin } from 'pinyin-pro';
import crypto from 'crypto';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 9092;
const HOST = process.env.HOST || '0.0.0.0';

// 登录配置
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 小时

// OpenAI 客户端初始化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
});

// 数据库连接
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:ncG6Y6Gyb776OPdd7F@cp-loyal-storm-19a3b2eb.pg5.aidap-global.cn-beijing.volces.com:5432/postgres?sslmode=require&channel_binding=require',
  ssl: {
    rejectUnauthorized: false
  }
});

// 中间件
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// 生成 session token
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// 简单的 session 存储（生产环境建议用 Redis）
const sessions = new Map<string, { username: string; expires: number }>();

// 清理过期 session
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expires < now) {
      sessions.delete(token);
    }
  }
}, 60 * 60 * 1000); // 每小时清理一次

// 认证中间件
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.session_token;
  
  if (!token) {
    return res.status(401).json({ success: false, error: '未登录', code: 'UNAUTHORIZED' });
  }

  const session = sessions.get(token);
  if (!session || session.expires < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ success: false, error: '登录已过期', code: 'UNAUTHORIZED' });
  }

  // 续期 session
  session.expires = Date.now() + COOKIE_MAX_AGE;
  (req as any).user = { username: session.username };
  next();
};

// API 路由前缀
const API_PREFIX = '/api';

// 辅助函数：发送成功响应
function sendSuccess(res: Response, data: any) {
  res.json({ success: true, data });
}

// 辅助函数：发送错误响应
function sendError(res: Response, message: string, statusCode = 400) {
  res.status(statusCode).json({ success: false, error: message });
}

// 登录接口（无需认证）
app.post(`${API_PREFIX}/login`, (req: Request, res: Response) => {
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

// 登出接口
app.post(`${API_PREFIX}/logout`, (req: Request, res: Response) => {
  const token = req.cookies.session_token;
  if (token) {
    sessions.delete(token);
  }
  res.clearCookie('session_token');
  sendSuccess(res, { message: '已登出' });
});

// 检查登录状态
app.get(`${API_PREFIX}/check-auth`, (req: Request, res: Response) => {
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

// 对其他所有 API 路由应用认证中间件
app.use(`${API_PREFIX}/*`, authMiddleware);

// 辅助函数：获取拼音首字母
function getPinyinInitial(name: string): string {
  if (!name) return '#';
  const firstChar = name[0];
  // 如果是英文字母，直接返回大写
  if (/[a-zA-Z]/.test(firstChar)) {
    return firstChar.toUpperCase();
  }
  // 如果是中文，获取拼音首字母
  const py = pinyin(firstChar, { pattern: 'first', toneType: 'none' });
  return py ? py.toUpperCase() : '#';
}

// 辅助函数：获取完整拼音（用于排序）
function getPinyinFull(name: string): string {
  if (!name) return '';
  return pinyin(name, { toneType: 'none', type: 'array' }).join('');
}

// 辅助函数：获取第一个字的拼音（不带声调，用于分组）
function getFirstCharPinyin(name: string): string {
  if (!name) return '';
  const firstChar = name[0];
  if (/[a-zA-Z]/.test(firstChar)) {
    return firstChar.toLowerCase();
  }
  return pinyin(firstChar, { toneType: 'none' }) || '';
}

// 统计接口
app.get(`${API_PREFIX}/stats`, async (req: Request, res: Response) => {
  try {
    // 获取人物数量
    const charactersResult = await pool.query('SELECT COUNT(*) as count FROM characters');

    sendSuccess(res, {
      characters: parseInt(charactersResult.rows[0].count) || 0,
      positions: 0, // 待开发
      geography: 0, // 待开发
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    sendError(res, '获取统计数据失败', 500);
  }
});

// 新增人物
app.post(`${API_PREFIX}/characters`, async (req: Request, res: Response) => {
  try {
    const { name, era, title, hometown, aliases, summary } = req.body;

    if (!name) {
      return sendError(res, '姓名不能为空');
    }

    // 检查是否已存在
    const existResult: QueryResult = await pool.query(
      'SELECT id FROM characters WHERE name = $1',
      [name]
    );

    if (existResult.rows.length > 0) {
      return sendError(res, '该人物已存在');
    }

    // 计算拼音字段
    const pinyinInitial = getPinyinInitial(name);
    const firstCharPinyin = getFirstCharPinyin(name);

    // 插入新人物
    const result: QueryResult = await pool.query(
      `INSERT INTO characters (name, era, title, hometown, aliases, summary, pinyin_initial, first_char_pinyin, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING id, name`,
      [name, era || null, title || null, hometown || null, JSON.stringify(aliases || []), summary || null, pinyinInitial, firstCharPinyin]
    );

    sendSuccess(res, result.rows[0]);
  } catch (error) {
    console.error('Error creating character:', error);
    sendError(res, '创建人物失败', 500);
  }
});

// 1. 获取人物列表（分页）
app.get(`${API_PREFIX}/characters`, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const era = req.query.era as string;
    const name = req.query.name as string;

    const offset = (page - 1) * limit;

    // 构建查询条件
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
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
    const countResult: QueryResult = await pool.query(
      `SELECT COUNT(*) as total FROM characters ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    // 查询数据
    const dataResult: QueryResult = await pool.query(
      `SELECT id, name, title, era, birth_year, death_year, summary 
       FROM characters ${whereClause} 
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

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
  } catch (error) {
    console.error('Error fetching characters:', error);
    sendError(res, '获取人物列表失败', 500);
  }
});

// 1.5 按拼音首字母获取人物列表（用于字母索引）- 使用索引优化
app.get(`${API_PREFIX}/characters/by-initial/:letter`, async (req: Request, res: Response) => {
  try {
    const { letter } = req.params;
    const upperLetter = letter.toUpperCase();

    if (!/^[A-Z]$/.test(upperLetter)) {
      return sendError(res, '无效的字母');
    }

    const era = req.query.era as string;

    // 构建查询条件 - 使用 pinyin_initial 索引字段
    let whereClause = 'WHERE pinyin_initial = $1';
    const params: any[] = [upperLetter];
    let paramIndex = 2;

    if (era) {
      whereClause += ` AND era = $${paramIndex++}`;
      params.push(era);
    }

    // 直接使用索引查询，不再全表扫描
    const dataResult: QueryResult = await pool.query(
      `SELECT id, name, title, era, birth_year, death_year, summary, updated_at, first_char_pinyin
       FROM characters ${whereClause}
       ORDER BY first_char_pinyin, name`,
      params
    );

    // 按第一个字的拼音分组（数据已排序）
    const groupedByPinyin: { [key: string]: any[] } = {};
    dataResult.rows.forEach(char => {
      const py = char.first_char_pinyin || getFirstCharPinyin(char.name);
      if (!groupedByPinyin[py]) {
        groupedByPinyin[py] = [];
      }
      groupedByPinyin[py].push({
        ...char,
        pinyinInitial: upperLetter,
        firstCharPinyin: py
      });
    });

    // 转换为数组（已按拼音排序）
    const groups = Object.entries(groupedByPinyin)
      .map(([pinyin, characters]) => ({
        pinyin,
        count: characters.length,
        characters
      }))
      .sort((a, b) => a.pinyin.localeCompare(b.pinyin));

    sendSuccess(res, {
      letter: upperLetter,
      total: dataResult.rows.length,
      groups
    });
  } catch (error) {
    console.error('Error fetching characters by initial:', error);
    sendError(res, '获取人物列表失败', 500);
  }
});

// 2. 获取人物详情
app.get(`${API_PREFIX}/characters/:id`, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 查询人物信息
    const charResult: QueryResult = await pool.query(
      `SELECT * FROM characters WHERE id = $1`,
      [id]
    );

    if (charResult.rows.length === 0) {
      return sendError(res, '人物不存在', 404);
    }

    const character = charResult.rows[0];

    // 查询该人物发出的关系
    const relationsResult: QueryResult = await pool.query(
      `SELECT cr.id, cr.relation_type, cr.description,
              c.id as "related_character_id", c.name as "related_name", c.title as "related_title", c.era as "related_era"
       FROM character_relations cr
       JOIN characters c ON cr.related_character_id = c.id
       WHERE cr.character_id = $1`,
      [id]
    );

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
    const reverseRelationsResult: QueryResult = await pool.query(
      `SELECT cr.id, cr.relation_type, cr.description,
              c.id as "character_id", c.name as "character_name", c.title as "character_title", c.era as "character_era"
       FROM character_relations cr
       JOIN characters c ON cr.character_id = c.id
       WHERE cr.related_character_id = $1`,
      [id]
    );

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
  } catch (error) {
    console.error('Error fetching character:', error);
    sendError(res, '获取人物详情失败', 500);
  }
});

// 3. AI 补充（预览模式）
app.post(`${API_PREFIX}/characters/enrich-from-tongjian`, async (req: Request, res: Response) => {
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
    const charResult: QueryResult = await pool.query(
      `SELECT * FROM characters WHERE name = $1`,
      [name]
    );

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
    let aiData: any;
    try {
      aiData = JSON.parse(content);
    } catch (e) {
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
  } catch (error) {
    console.error('Error enriching character:', error);
    sendError(res, 'AI 生成失败: ' + (error as Error).message, 500);
  }
});

// 4. 确认写入
app.post(`${API_PREFIX}/characters/enrich-confirm`, async (req: Request, res: Response) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { characterId, name, era, title, hometown, aliases, summary, relationships } = req.body;

    if (!characterId) {
      return sendError(res, 'characterId 不能为空');
    }

    // 更新人物信息
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      updateValues.push(name);
      // 姓名变更时更新拼音字段
      updateFields.push(`pinyin_initial = $${paramIndex++}`);
      updateValues.push(getPinyinInitial(name));
      updateFields.push(`first_char_pinyin = $${paramIndex++}`);
      updateValues.push(getFirstCharPinyin(name));
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
      await client.query(
        `UPDATE characters SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
        updateValues
      );
    }

    // 处理关系
    const missingCharacters: string[] = [];
    const addedRelations: string[] = [];
    
    if (relationships && Array.isArray(relationships)) {
      for (const rel of relationships) {
        const { name: relatedName, relation, description } = rel;
        
        // 查找关联人物
        const relatedResult: QueryResult = await client.query(
          `SELECT id FROM characters WHERE name = $1`,
          [relatedName]
        );

        if (relatedResult.rows.length > 0) {
          const relatedId = relatedResult.rows[0].id;
          
          // 检查关系是否已存在
          const existRel: QueryResult = await client.query(
            `SELECT id FROM character_relations 
             WHERE character_id = $1 AND related_character_id = $2 AND relation_type = $3`,
            [characterId, relatedId, relation]
          );

          if (existRel.rows.length === 0) {
            // 插入新关系
            await client.query(
              `INSERT INTO character_relations (character_id, related_character_id, relation_type, description) 
               VALUES ($1, $2, $3, $4)`,
              [characterId, relatedId, relation, description || null]
            );
            addedRelations.push(`${relatedName}（${relation}）`);
          }
        } else {
          // 人物不存在
          missingCharacters.push(relatedName);
        }
      }
    }

    // 如果有缺失人物，返回错误
    if (missingCharacters.length > 0) {
      await client.query('ROLLBACK');
      return sendError(res, `以下关联人物不存在：${missingCharacters.join('、')}`, 400);
    }

    await client.query('COMMIT');

    sendSuccess(res, {
      id: characterId,
      name: name,
      updated: Object.keys(req.body).filter(k => k !== 'characterId' && k !== 'relationships'),
      addedRelations
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error confirming character:', error);
    sendError(res, '保存失败', 500);
  } finally {
    client.release();
  }
});

// 5. 删除人物
app.delete(`${API_PREFIX}/characters/:id`, async (req: Request, res: Response) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;

    // 查询人物信息
    const charResult: QueryResult = await client.query(
      `SELECT name FROM characters WHERE id = $1`,
      [id]
    );

    if (charResult.rows.length === 0) {
      return sendError(res, '人物不存在', 404);
    }

    const name = charResult.rows[0].name;

    // 删除该人物发出的关系
    await client.query(
      `DELETE FROM character_relations WHERE character_id = $1`,
      [id]
    );

    // 删除指向该人物的关系
    await client.query(
      `DELETE FROM character_relations WHERE related_character_id = $1`,
      [id]
    );

    // 删除人物
    await client.query(
      `DELETE FROM characters WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    sendSuccess(res, { id: parseInt(id), name });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting character:', error);
    sendError(res, '删除失败', 500);
  } finally {
    client.release();
  }
});

// 错误处理中间件
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
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
