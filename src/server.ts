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
    // 获取各模块数量
    const charactersResult = await pool.query('SELECT COUNT(*) as count FROM characters');
    const positionsResult = await pool.query('SELECT COUNT(*) as count FROM official_posts');
    const geographyResult = await pool.query('SELECT COUNT(*) as count FROM geography');

    sendSuccess(res, {
      characters: parseInt(charactersResult.rows[0].count) || 0,
      positions: parseInt(positionsResult.rows[0].count) || 0,
      geography: parseInt(geographyResult.rows[0].count) || 0,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    sendError(res, '获取统计数据失败', 500);
  }
});

// ==================== 地理 API ====================

// 获取地理列表（分页）
app.get(`${API_PREFIX}/geography`, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const name = req.query.name as string;
    const category = req.query.category as string;
    const dynasty = req.query.dynasty as string;

    const offset = (page - 1) * limit;

    // 构建查询条件
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (name) {
      whereClause += ` AND (name ILIKE $${paramIndex} OR aliases::text ILIKE $${paramIndex})`;
      params.push(`%${name}%`);
      paramIndex++;
    }
    if (category) {
      whereClause += ` AND category = $${paramIndex++}`;
      params.push(category);
    }
    if (dynasty) {
      whereClause += ` AND dynasty = $${paramIndex++}`;
      params.push(dynasty);
    }

    // 查询总数
    const countResult: QueryResult = await pool.query(
      `SELECT COUNT(*) as total FROM geography ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    // 查询数据
    const dataResult: QueryResult = await pool.query(
      `SELECT * FROM geography ${whereClause} ORDER BY name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    sendSuccess(res, {
      geography: dataResult.rows.map(row => ({
        ...row,
        aliases: row.aliases || []
      })),
      total,
      page,
      limit,
      totalPages
    });
  } catch (error) {
    console.error('Error fetching geography:', error);
    sendError(res, '获取地理列表失败', 500);
  }
});

// 获取地理详情
app.get(`${API_PREFIX}/geography/:id`, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result: QueryResult = await pool.query(
      'SELECT * FROM geography WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return sendError(res, '地理不存在', 404);
    }

    sendSuccess(res, {
      ...result.rows[0],
      aliases: result.rows[0].aliases || []
    });
  } catch (error) {
    console.error('Error fetching geography:', error);
    sendError(res, '获取地理详情失败', 500);
  }
});

// 新增地理
app.post(`${API_PREFIX}/geography`, async (req: Request, res: Response) => {
  try {
    const { name, slug, category, level, dynasty, location, lng, lat, description, aliases } = req.body;

    if (!name) {
      return sendError(res, '名称不能为空');
    }

    // 生成 slug（如果没有提供）
    const finalSlug = slug || name.toLowerCase().replace(/\s+/g, '-');

    // 检查 slug 是否已存在
    const existResult: QueryResult = await pool.query(
      'SELECT id FROM geography WHERE slug = $1',
      [finalSlug]
    );

    if (existResult.rows.length > 0) {
      return sendError(res, '该 slug 已存在');
    }

    const result: QueryResult = await pool.query(
      `INSERT INTO geography (name, slug, category, level, dynasty, location, lng, lat, description, aliases, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING *`,
      [name, finalSlug, category || null, level || null, dynasty || null, location || null, lng || null, lat || null, description || null, JSON.stringify(aliases || [])]
    );

    sendSuccess(res, { ...result.rows[0], aliases: result.rows[0].aliases || [] });
  } catch (error) {
    console.error('Error creating geography:', error);
    sendError(res, '创建地理失败', 500);
  }
});

// 更新地理
app.put(`${API_PREFIX}/geography/:id`, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, slug, category, level, dynasty, location, lng, lat, description, aliases } = req.body;

    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      updateValues.push(name);
    }
    if (slug !== undefined) {
      updateFields.push(`slug = $${paramIndex++}`);
      updateValues.push(slug);
    }
    if (category !== undefined) {
      updateFields.push(`category = $${paramIndex++}`);
      updateValues.push(category);
    }
    if (level !== undefined) {
      updateFields.push(`level = $${paramIndex++}`);
      updateValues.push(level);
    }
    if (dynasty !== undefined) {
      updateFields.push(`dynasty = $${paramIndex++}`);
      updateValues.push(dynasty);
    }
    if (location !== undefined) {
      updateFields.push(`location = $${paramIndex++}`);
      updateValues.push(location);
    }
    if (lng !== undefined) {
      updateFields.push(`lng = $${paramIndex++}`);
      updateValues.push(lng);
    }
    if (lat !== undefined) {
      updateFields.push(`lat = $${paramIndex++}`);
      updateValues.push(lat);
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      updateValues.push(description);
    }
    if (aliases !== undefined) {
      updateFields.push(`aliases = $${paramIndex++}`);
      updateValues.push(JSON.stringify(aliases));
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(id);

    if (updateFields.length > 1) {
      const result: QueryResult = await pool.query(
        `UPDATE geography SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        updateValues
      );

      if (result.rows.length === 0) {
        return sendError(res, '地理不存在', 404);
      }

      sendSuccess(res, { ...result.rows[0], aliases: result.rows[0].aliases || [] });
    } else {
      sendError(res, '没有要更新的字段', 400);
    }
  } catch (error) {
    console.error('Error updating geography:', error);
    sendError(res, '更新地理失败', 500);
  }
});

// 删除地理
app.delete(`${API_PREFIX}/geography/:id`, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result: QueryResult = await pool.query(
      'DELETE FROM geography WHERE id = $1 RETURNING id, name',
      [id]
    );

    if (result.rows.length === 0) {
      return sendError(res, '地理不存在', 404);
    }

    sendSuccess(res, result.rows[0]);
  } catch (error) {
    console.error('Error deleting geography:', error);
    sendError(res, '删除地理失败', 500);
  }
});

// ==================== 官职 API ====================

// 获取官职列表（分页）
app.get(`${API_PREFIX}/positions`, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const name = req.query.name as string;
    const category = req.query.category as string;
    const dynasty = req.query.dynasty as string;

    const offset = (page - 1) * limit;

    // 构建查询条件
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (name) {
      whereClause += ` AND (name ILIKE $${paramIndex} OR aliases::text ILIKE $${paramIndex})`;
      params.push(`%${name}%`);
      paramIndex++;
    }
    if (category) {
      whereClause += ` AND category = $${paramIndex++}`;
      params.push(category);
    }
    if (dynasty) {
      whereClause += ` AND dynasty = $${paramIndex++}`;
      params.push(dynasty);
    }

    // 查询总数
    const countResult: QueryResult = await pool.query(
      `SELECT COUNT(*) as total FROM official_posts ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    // 查询数据
    const dataResult: QueryResult = await pool.query(
      `SELECT * FROM official_posts ${whereClause} ORDER BY name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    sendSuccess(res, {
      positions: dataResult.rows.map(row => ({
        ...row,
        aliases: row.aliases || []
      })),
      total,
      page,
      limit,
      totalPages
    });
  } catch (error) {
    console.error('Error fetching positions:', error);
    sendError(res, '获取官职列表失败', 500);
  }
});

// 获取官职详情
app.get(`${API_PREFIX}/positions/:id`, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result: QueryResult = await pool.query(
      'SELECT * FROM official_posts WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return sendError(res, '官职不存在', 404);
    }

    sendSuccess(res, {
      ...result.rows[0],
      aliases: result.rows[0].aliases || []
    });
  } catch (error) {
    console.error('Error fetching position:', error);
    sendError(res, '获取官职详情失败', 500);
  }
});

// 新增官职
app.post(`${API_PREFIX}/positions`, async (req: Request, res: Response) => {
  try {
    const { name, description, category, dynasty, rank, aliases } = req.body;

    if (!name) {
      return sendError(res, '名称不能为空');
    }

    // 检查是否已存在
    const existResult: QueryResult = await pool.query(
      'SELECT id FROM official_posts WHERE name = $1',
      [name]
    );

    if (existResult.rows.length > 0) {
      return sendError(res, '该官职已存在');
    }

    const result: QueryResult = await pool.query(
      `INSERT INTO official_posts (name, description, category, dynasty, rank, aliases, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [name, description || null, category || null, dynasty || null, rank || null, JSON.stringify(aliases || [])]
    );

    sendSuccess(res, { ...result.rows[0], aliases: result.rows[0].aliases || [] });
  } catch (error) {
    console.error('Error creating position:', error);
    sendError(res, '创建官职失败', 500);
  }
});

// 更新官职
app.put(`${API_PREFIX}/positions/:id`, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, category, dynasty, rank, aliases } = req.body;

    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      updateValues.push(name);
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      updateValues.push(description);
    }
    if (category !== undefined) {
      updateFields.push(`category = $${paramIndex++}`);
      updateValues.push(category);
    }
    if (dynasty !== undefined) {
      updateFields.push(`dynasty = $${paramIndex++}`);
      updateValues.push(dynasty);
    }
    if (rank !== undefined) {
      updateFields.push(`rank = $${paramIndex++}`);
      updateValues.push(rank);
    }
    if (aliases !== undefined) {
      updateFields.push(`aliases = $${paramIndex++}`);
      updateValues.push(JSON.stringify(aliases));
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(id);

    if (updateFields.length > 1) {
      const result: QueryResult = await pool.query(
        `UPDATE official_posts SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        updateValues
      );

      if (result.rows.length === 0) {
        return sendError(res, '官职不存在', 404);
      }

      sendSuccess(res, { ...result.rows[0], aliases: result.rows[0].aliases || [] });
    } else {
      sendError(res, '没有要更新的字段', 400);
    }
  } catch (error) {
    console.error('Error updating position:', error);
    sendError(res, '更新官职失败', 500);
  }
});

// 删除官职
app.delete(`${API_PREFIX}/positions/:id`, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result: QueryResult = await pool.query(
      'DELETE FROM official_posts WHERE id = $1 RETURNING id, name',
      [id]
    );

    if (result.rows.length === 0) {
      return sendError(res, '官职不存在', 404);
    }

    sendSuccess(res, result.rows[0]);
  } catch (error) {
    console.error('Error deleting position:', error);
    sendError(res, '删除官职失败', 500);
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

// 3. AI 补充（从资治通鉴原文 + LLM知识库）
app.post(`${API_PREFIX}/characters/enrich-from-tongjian`, async (req: Request, res: Response) => {
  try {
    const { name, dryRun = false, userHint } = req.body;

    if (!name) {
      return sendError(res, '请提供人物姓名');
    }

    // 检查 OpenAI API Key
    if (!process.env.OPENAI_API_KEY) {
      return sendError(res, '未配置 OPENAI_API_KEY 环境变量', 500);
    }

    // 1. 查找人物（支持按名称或别名查找）
    const charResult: QueryResult = await pool.query(
      `SELECT id, name, era, title, summary, aliases, hometown FROM characters WHERE name = $1 OR aliases::text ILIKE $2`,
      [name, `%"${name}"%`]
    );

    if (charResult.rows.length === 0) {
      return sendError(res, '未找到该人物', 404);
    }
    const character = charResult.rows[0];

    // 2. 从资治通鉴搜索相关段落
    let passages = '';
    let tongjianCount = 0;
    try {
      const paraResult: QueryResult = await pool.query(
        `SELECT content, volume_name, year_mark FROM zizhitongjian_paragraphs 
         WHERE content ILIKE $1 ORDER BY id LIMIT 20`,
        [`%${character.name}%`]
      );
      tongjianCount = paraResult.rows.length;
      if (paraResult.rows.length > 0) {
        passages = paraResult.rows.map((r: any) => 
          `【${r.volume_name}·${r.year_mark || ''}】${r.content}`
        ).join('\n\n');
      }
    } catch (e) {
      console.log('资治通鉴段落表不存在或查询失败，跳过');
    }

    // 3. 构建 prompt
    const SYSTEM_PROMPT = `你是一位专业的中国古代史学家，请综合利用以下信息源为人物撰写传记：

信息来源（按可信度排序）：
1. 《资治通鉴》原文（如有）—— 最权威的一手史料
2. 你的历史知识库 —— 用于补充和整合

请严格按以下JSON格式输出，不要有其他内容：
{
  "title": "历史上真实的最主要职位，如：同中书门下三品、归德大将军、松漠都督。只保留一个最重要的职位，使用历史原称",
  "summary": "史书传记风格摘要。包含籍贯、字号、主要官职、重要事件（含年份）、结局。极简客观，不加主观评价。时间线要清晰。",
  "aliases": ["别名1", "别名2"],
  "hometown": "籍贯，如：营州、陕州等",
  "era": "所属纪年，如：周纪、秦纪、汉纪、晋纪、隋纪、唐纪、后周纪等",
  "relationships": [
    {"name": "相关人物姓名", "relation": "关系类型", "description": "关系说明"}
  ]
}

注意事项：
1. title只用历史上真实存在的官职名称，保留最重要的一个即可
2. summary要精炼但完整，关键事件要标注年份
3. aliases包含字、号、别称、可汗号等
4. relationships提取与此人相关的重要人物，如亲属、君臣、敌对、盟友等
5. era必须从以下选择：周纪、秦纪、汉纪、魏纪、晋纪、宋纪、齐纪、梁纪、陈纪、隋纪、唐纪、后梁纪、后唐纪、后晋纪、后汉纪、后周纪
6. 只返回JSON`;

    let userContent = `人物：${character.name}\n当前纪年：${character.era || '未知'}\n当前title：${character.title || '无'}\n当前summary：${character.summary || '无'}\n当前aliases：${character.aliases ? JSON.stringify(character.aliases) : '无'}\n\n`;

    if (passages) {
      userContent += `【资治通鉴原文】\n${passages}\n\n`;
    } else {
      userContent += `【资治通鉴原文】\n（未找到相关记载）\n\n`;
    }

    if (userHint) {
      userContent += `【用户补充信息】\n${userHint}\n\n`;
    }

    userContent += `请综合利用以上信息和你的历史知识，为该人物撰写完整传记。`;

    // 4. 调用 OpenAI
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent }
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      return sendError(res, 'AI 未返回有效内容', 500);
    }

    // 5. 解析结果
    let extracted: {
      title: string | null;
      summary: string | null;
      aliases: string[];
      hometown: string | null;
      era: string | null;
      relationships: Array<{ name: string; relation: string; description: string }>;
    };

    try {
      extracted = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse AI response:', content);
      return sendError(res, 'AI 返回格式错误', 500);
    }

    // dryRun模式：只返回结果，不写入数据库
    if (dryRun) {
      return sendSuccess(res, {
        dryRun: true,
        characterId: character.id,
        characterName: character.name,
        current: {
          era: character.era,
          title: character.title,
          summary: character.summary,
          aliases: character.aliases,
          hometown: character.hometown,
        },
        proposed: {
          era: extracted.era || character.era,
          title: extracted.title,
          summary: extracted.summary,
          aliases: extracted.aliases,
          hometown: extracted.hometown,
        },
        relationships: extracted.relationships || [],
        sources: {
          tongjian_passages: tongjianCount,
        },
      });
    }

    // 6. 写入模式：直接更新数据库
    const updateFields: string[] = ['updated_at = NOW()'];
    const updateParams: any[] = [];
    let paramIndex = 1;

    if (extracted.title) {
      updateFields.push(`title = $${paramIndex++}`);
      updateParams.push(extracted.title);
    }
    if (extracted.summary) {
      updateFields.push(`summary = $${paramIndex++}`);
      updateParams.push(extracted.summary);
    }
    if (extracted.aliases && extracted.aliases.length > 0) {
      updateFields.push(`aliases = $${paramIndex++}`);
      updateParams.push(JSON.stringify(extracted.aliases));
    }
    if (extracted.hometown) {
      updateFields.push(`hometown = $${paramIndex++}`);
      updateParams.push(extracted.hometown);
    }
    if (extracted.era) {
      updateFields.push(`era = $${paramIndex++}`);
      updateParams.push(extracted.era);
    }

    if (updateParams.length > 0) {
      updateParams.push(character.id);
      await pool.query(
        `UPDATE characters SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
        updateParams
      );
    }

    // 7. 处理人物关系
    const addedRelations: Array<{ name: string; relation: string; found: boolean; created: boolean }> = [];
    
    for (const rel of extracted.relationships || []) {
      const relResult = await pool.query(
        `SELECT id FROM characters WHERE name = $1 OR aliases::text ILIKE $2`,
        [rel.name, `%"${rel.name}"%`]
      );
      
      let relatedId: number;
      let created = false;
      
      if (relResult.rows.length > 0) {
        relatedId = relResult.rows[0].id;
      } else {
        // 自动创建不存在的人物
        const pinyinInitial = getPinyinInitial(rel.name);
        const firstCharPinyin = getFirstCharPinyin(rel.name);
        const createResult = await pool.query(
          `INSERT INTO characters (name, era, pinyin_initial, first_char_pinyin, created_at, updated_at) 
           VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id`,
          [rel.name, extracted.era || character.era || '待定', pinyinInitial, firstCharPinyin]
        );
        relatedId = createResult.rows[0].id;
        created = true;
      }
      
      // 检查关系是否已存在
      const existResult = await pool.query(
        `SELECT id FROM character_relations WHERE character_id = $1 AND related_character_id = $2`,
        [character.id, relatedId]
      );
      
      if (existResult.rows.length === 0) {
        await pool.query(
          `INSERT INTO character_relations (character_id, related_character_id, relation_type, description, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [character.id, relatedId, rel.relation, rel.description]
        );
      }
      
      addedRelations.push({ 
        name: rel.name, 
        relation: rel.relation, 
        found: true, 
        created 
      });
    }

    sendSuccess(res, {
      dryRun: false,
      character: {
        id: character.id,
        name: character.name,
        title: extracted.title || character.title,
        summary: extracted.summary || character.summary,
        aliases: extracted.aliases,
        hometown: extracted.hometown,
        era: extracted.era || character.era,
      },
      sources: {
        tongjian_passages: tongjianCount,
      },
      relationships: addedRelations,
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
