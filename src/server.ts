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

// ============ 维基百科代理接口（无需认证） ============

app.get(`${API_PREFIX}/wiki-baike`, async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return sendError(res, '请提供查询关键词');
    }

    const wikiUrl = `https://zh.wikipedia.org/wiki/${encodeURIComponent(query)}`;

    // 使用 MediaWiki API 获取纯文本
    const apiUrl = `https://zh.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query',
      titles: query,
      prop: 'extracts',
      explaintext: '1',
      format: 'json',
      redirects: '1',
    }).toString();

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'TongjianRenvuBot/1.0 (https://github.com/tongjianrenwu; educational use)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return sendError(res, `维基百科请求失败: ${response.status}`, 502);
    }

    const data: any = await response.json();
    const pages = data.query?.pages;

    if (!pages) {
      return sendSuccess(res, {
        found: false,
        title: query,
        summary: '',
        sections: [],
        url: wikiUrl,
      });
    }

    // pages 是一个对象，key 是页面 ID（-1 表示不存在）
    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];

    // pageId 为 "-1" 表示词条不存在
    if (pageId === '-1' || page.missing !== undefined) {
      return sendSuccess(res, {
        found: false,
        title: query,
        summary: '',
        sections: [],
        url: wikiUrl,
      });
    }

    const fullText: string = page.extract || '';
    if (!fullText) {
      return sendSuccess(res, {
        found: true,
        title: page.title || query,
        summary: '',
        sections: [],
        url: wikiUrl,
      });
    }

    // 解析纯文本：按 === / == 分割章节
    const sections: Array<{ title: string; content: string }> = [];
    const lines = fullText.split('\n');
    let currentTitle = '';
    let currentContent: string[] = [];
    let summaryLines: string[] = [];

    for (const line of lines) {
      const h2Match = line.match(/^==\s*(.+?)\s*==$/);
      const h3Match = line.match(/^===\s*(.+?)\s*===$/);

      if (h2Match || h3Match) {
        // 遇到新章节标题，保存之前的内容
        if (currentTitle === '' && currentContent.length === 0) {
          // 第一个标题之前的内容就是摘要
          summaryLines = [...currentContent];
        } else if (currentTitle) {
          sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
        }
        currentTitle = h2Match ? h2Match[1] : h3Match![1];
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }

    // 处理最后一个章节
    if (currentTitle) {
      sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
    } else {
      // 没有章节标题，全部内容作为摘要
      summaryLines = [...currentContent];
    }

    // 如果第一个标题之前有内容且 summaryLines 为空，从 sections 外提取
    if (summaryLines.length === 0 && sections.length > 0) {
      // 检查 fullText 的开头是否有摘要（在第一个 == 之前）
      const firstSectionIdx = fullText.search(/\n==/);
      if (firstSectionIdx > 0) {
        summaryLines = [fullText.substring(0, firstSectionIdx).trim()];
      }
    }

    const summary = summaryLines.join('\n').trim();

    sendSuccess(res, {
      found: true,
      title: page.title || query,
      summary,
      sections: sections.filter(s => s.content),
      url: wikiUrl,
    });
  } catch (error: any) {
    console.error('Error proxying wiki:', error);
    sendError(res, `获取维基百科失败: ${error.message}`, 500);
  }
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
    const SYSTEM_PROMPT = `你是一位专业的中国古代史学家，请综合以下信息源为人物撰写传记：

信息来源（按可信度排序）：
1. 《资治通鉴》原文（如有）—— 最权威的一手史料，优先引用
2. 百科搜索结果（如有）—— 权威的百科资料，用于补充
3. 你的历史知识库 —— 用于进一步整合和扩展

请综合以上所有来源的信息，互相印证、补充，撰写完整准确的传记。

请严格按以下JSON格式输出，不要有其他内容：
{
  "title": "历史上真实的最主要职位，如：同中书门下三品、归德大将军、松漠都督。只保留一个最重要的职位，使用历史原称",
  "summary": "史书传记风格摘要。包含籍贯、字号、主要官职、重要事件（含年份）、结局。极简客观，不加主观评价。时间线要清晰。",
  "aliases": ["别名1", "别名2"],
  "hometown": "籍贯，如：营州、陕州等",
  "era": "所属纪年，如：周纪、秦纪、汉纪、晋纪、隋纪、唐纪、后周纪等",
  "birth_year": "出生年份，如：626年、贞观元年等，不确定则留空",
  "death_year": "死亡年份，如：705年、神龙元年等，不确定则留空",
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

    // 用户补充信息用于纠偏，优先级最高
    if (userHint) {
      userContent = `【用户纠偏信息 - 请以此为准纠正其他来源的错误】\n${userHint}\n\n` + userContent;
    }

    if (passages) {
      userContent += `【资治通鉴原文】\n${passages}\n\n`;
    } else {
      userContent += `【资治通鉴原文】\n（未找到相关记载）\n\n`;
    }

    userContent += `请综合利用以上信息撰写传记。注意：用户纠偏信息优先级最高，如有冲突请以用户信息为准。`;

    // 4. 联网搜索（火山引擎 Responses API + web_search）
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const apiKey = process.env.OPENAI_API_KEY || '';
    const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    let searchResult = '';
    
    try {
      const searchResponse = await fetch(`${baseURL}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: [{ role: 'user', content: `${character.name} 中国历史人物 生平 传记` }],
          tools: [{ type: 'web_search', max_keyword: 3 }],
        }),
      });

      if (searchResponse.ok) {
        const searchData: any = await searchResponse.json();
        // 提取搜索结果文本
        searchResult = (searchData.output || [])
          .filter((item: any) => item.type === 'message')
          .map((item: any) => item.content?.[0]?.text || '')
          .join('');
        console.log(`[联网搜索] 已获取 ${searchResult.length} 字符的搜索结果`);
        console.log(`[联网搜索] 内容预览: ${searchResult.substring(0, 300)}...`);
      } else {
        const errText = await searchResponse.text();
        console.log(`[联网搜索] 失败 (${searchResponse.status}):`, errText.substring(0, 200));
      }
    } catch (e: any) {
      console.log('[联网搜索] 请求失败:', e.message);
    }

    // 5. 生成传记（用 Chat Completions）
    const finalUserContent = searchResult 
      ? `【百科搜索结果】\n${searchResult}\n\n${userContent}`
      : userContent;

    console.log(`[生成传记] 开始调用 chat.completions, 内容长度: ${finalUserContent.length}`);
    
    let completion;
    try {
      completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: finalUserContent }
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      });
    } catch (apiError: any) {
      console.error('[生成传记] API 调用失败:', apiError.message);
      console.error('[生成传记] 错误详情:', apiError);
      return sendError(res, `AI 生成失败: ${apiError.message}`, 500);
    }

    console.log(`[生成传记] 完成，token 使用: ${JSON.stringify(completion.usage)}`);

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
      birth_year: string | null;
      death_year: string | null;
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
      // 检查关系中哪些人物已存在、哪些不存在
      const relationshipsWithStatus = await Promise.all(
        (extracted.relationships || []).map(async (rel) => {
          const relResult = await pool.query(
            `SELECT id, title, era FROM characters WHERE name = $1 OR aliases::text ILIKE $2`,
            [rel.name, `%"${rel.name}"%`]
          );
          if (relResult.rows.length > 0) {
            return {
              ...rel,
              exists: true,
              characterId: relResult.rows[0].id,
              characterTitle: relResult.rows[0].title,
              characterEra: relResult.rows[0].era,
            };
          } else {
            return {
              ...rel,
              exists: false,
              characterId: null,
            };
          }
        })
      );

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
          birth_year: extracted.birth_year,
          death_year: extracted.death_year,
        },
        relationships: relationshipsWithStatus,
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
    
    const { 
      characterId, 
      name, 
      era, 
      title, 
      hometown, 
      aliases, 
      summary,
      birth_year,
      death_year,
      relationships,
      createMissing = false  // 是否自动创建不存在的人物
    } = req.body;

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
    if (birth_year !== undefined) {
      updateFields.push(`birth_year = $${paramIndex++}`);
      updateValues.push(birth_year);
    }
    if (death_year !== undefined) {
      updateFields.push(`death_year = $${paramIndex++}`);
      updateValues.push(death_year);
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(characterId);

    if (updateFields.length > 1) {
      await client.query(
        `UPDATE characters SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
        updateValues
      );
    }

    // 处理人物关系
    const addedRelations: Array<{ name: string; relation: string }> = [];
    const deletedRelations: Array<{ name: string; relation: string }> = [];
    const createdCharacters: string[] = [];

    if (relationships !== undefined) {
      // 获取当前人物纪年用于创建新人物
      const charResult = await client.query(
        `SELECT era FROM characters WHERE id = $1`,
        [characterId]
      );
      const currentEra = charResult.rows[0]?.era || '待定';

      // 获取现有关联人物 ID 列表
      const existingRels = await client.query(
        `SELECT cr.id, cr.related_character_id, cr.relation_type, c.name 
         FROM character_relations cr 
         JOIN characters c ON cr.related_character_id = c.id 
         WHERE cr.character_id = $1`,
        [characterId]
      );

      // 构建传入关系的 Map（用于快速查找），同时记录人物名
      const incomingRels = new Map<string, { relatedId: number; relatedName: string; relation: string; description: string }>();
      
      for (const rel of relationships) {
        const { name: relatedName, relation, description } = rel;
        
        // 查找关联人物
        const relResult = await client.query(
          `SELECT id FROM characters WHERE name = $1 OR aliases::text ILIKE $2`,
          [relatedName, `%"${relatedName}"%`]
        );
        
        let relatedId: number;
        
        if (relResult.rows.length > 0) {
          relatedId = relResult.rows[0].id;
        } else if (createMissing) {
          // 自动创建不存在的人物
          const pinyinInitial = getPinyinInitial(relatedName);
          const firstCharPinyin = getFirstCharPinyin(relatedName);
          const createResult = await client.query(
            `INSERT INTO characters (name, era, pinyin_initial, first_char_pinyin, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id`,
            [relatedName, era || currentEra, pinyinInitial, firstCharPinyin]
          );
          relatedId = createResult.rows[0].id;
          createdCharacters.push(relatedName);
        } else {
          continue; // 人物不存在且不自动创建，跳过
        }
        
        incomingRels.set(`${relatedId}:${relation}`, { relatedId, relatedName, relation, description: description || '' });
      }

      // 删除不在传入列表中的旧关系
      for (const existing of existingRels.rows) {
        const key = `${existing.related_character_id}:${existing.relation_type}`;
        if (!incomingRels.has(key)) {
          await client.query(
            `DELETE FROM character_relations WHERE id = $1`,
            [existing.id]
          );
          deletedRelations.push({ name: existing.name, relation: existing.relation_type });
        }
      }

      // 添加新关系
      for (const [key, rel] of incomingRels) {
        const existing = existingRels.rows.find(
          r => r.related_character_id === rel.relatedId && r.relation_type === rel.relation
        );
        
        if (!existing) {
          await client.query(
            `INSERT INTO character_relations (character_id, related_character_id, relation_type, description) 
             VALUES ($1, $2, $3, $4)`,
            [characterId, rel.relatedId, rel.relation, rel.description]
          );
          addedRelations.push({ name: rel.relatedName, relation: rel.relation });
        }
      }
    }

    await client.query('COMMIT');

    sendSuccess(res, {
      id: characterId,
      name: name,
      updated: Object.keys(req.body).filter(k => !['characterId', 'relationships', 'createMissing'].includes(k)),
      addedRelations,
      deletedRelations,
      createdCharacters
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error confirming character:', error);
    sendError(res, '保存失败', 500);
  } finally {
    client.release();
  }
});

// 4.5 删除人物关系
app.delete(`${API_PREFIX}/characters/:id/relations/:relationId`, async (req: Request, res: Response) => {
  try {
    const { id, relationId } = req.params;

    const result: QueryResult = await pool.query(
      `DELETE FROM character_relations WHERE id = $1 AND (character_id = $2 OR related_character_id = $2) RETURNING id`,
      [relationId, id]
    );

    if (result.rows.length === 0) {
      return sendError(res, '关系不存在', 404);
    }

    sendSuccess(res, { id: parseInt(relationId) });
  } catch (error) {
    console.error('Error deleting relation:', error);
    sendError(res, '删除关系失败', 500);
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

// ============ 百度百科代理接口 ============

// 辅助函数：从 HTML 中提取纯文本，保留段落结构
function extractTextFromHtml(html: string): { title: string; summary: string; sections: Array<{ title: string; content: string }> } {
  const result = { title: '', summary: '', sections: [] as Array<{ title: string; content: string }> };

  // 提取词条标题
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    result.title = titleMatch[1].replace(/_百度百科.*$/,'').replace(/&amp;/g,'&').trim();
  }

  // 辅助：移除标签获取文字
  const stripTags = (s: string) => s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#\d+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 提取摘要区域
  const summaryPatterns = [
    /<div[^>]*class="lemma-summary[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    /<div[^>]*class="lemma-summary[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];
  for (const pat of summaryPatterns) {
    const m = html.match(pat);
    if (m) {
      result.summary = stripTags(m[1]);
      break;
    }
  }

  // 提取正文各章节
  // 百度百科的章节标题通常是 <h2> 或 class 包含 title-text / para-title
  // 正文段落通常是 class 包含 para
  const sectionRegex = /<(?:h[2-3]|div)[^>]*class="[^"]*(?:para-title|title-text|catalog-title)[^"]*"[^>]*>([\s\S]*?)<\/(?:h[2-3]|div)>/gi;
  const paraRegex = /<div[^>]*class="para[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;

  // 先按章节分割
  const sectionMatches = [...html.matchAll(sectionRegex)];
  if (sectionMatches.length > 0) {
    for (let i = 0; i < sectionMatches.length; i++) {
      const sectionTitle = stripTags(sectionMatches[i][1]);
      if (!sectionTitle || sectionTitle.length > 30) continue; // 跳过过长的异常标题

      // 提取该章节到下一章节之间的段落
      const startPos = sectionMatches[i].index! + sectionMatches[i][0].length;
      const endPos = i + 1 < sectionMatches.length ? sectionMatches[i + 1].index! : html.length;
      const sectionHtml = html.substring(startPos, endPos);

      const paras: string[] = [];
      const paraMatches = [...sectionHtml.matchAll(paraRegex)];
      for (const pm of paraMatches) {
        const text = stripTags(pm[1]);
        if (text) paras.push(text);
      }
      if (paras.length > 0) {
        result.sections.push({ title: sectionTitle, content: paras.join('\n\n') });
      }
    }
  }

  // 如果没提取到章节，尝试直接提取所有段落
  if (result.sections.length === 0) {
    const allParas: string[] = [];
    const paraMatches = [...html.matchAll(paraRegex)];
    for (const pm of paraMatches) {
      const text = stripTags(pm[1]);
      if (text) allParas.push(text);
    }
    if (allParas.length > 0) {
      result.sections.push({ title: '正文', content: allParas.join('\n\n') });
    }
  }

  // 提取基本信息表格 (basic-info)
  const infoPatterns = [
    /<div[^>]*class="basic-info[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i,
    /<div[^>]*class="basic-info[\s\S]*?<\/div>\s*<\/div>/i,
  ];
  for (const pat of infoPatterns) {
    const m = html.match(pat);
    if (m) {
      const infoText = stripTags(m[0]).replace(/\n{2,}/g, '\n').trim();
      if (infoText && infoText.length < 500) {
        // 作为摘要补充
        if (result.summary) {
          result.summary = infoText + '\n\n' + result.summary;
        } else {
          result.summary = infoText;
        }
      }
      break;
    }
  }

  return result;
}

app.get(`${API_PREFIX}/baidu-baike`, async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return sendError(res, '请提供查询关键词');
    }

    // 先尝试直接访问百度百科词条
    const baikeUrl = `https://baike.baidu.com/item/${encodeURIComponent(query)}`;
    
    const response = await fetch(baikeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return sendError(res, `百度百科请求失败: ${response.status}`, 502);
    }

    const html = await response.text();

    // 检测词条是否真的存在：
    // 1. 百科词条页一定包含 lemmaWgt 或 lemma-title 或 J-lemma-info
    // 2. 搜索结果页/错误页不包含这些标志
    const hasLemmaContent = html.includes('lemma-summary') 
      || html.includes('lemma-title') 
      || html.includes('J-lemma-info')
      || html.includes('para-title')
      || html.includes('class="para"')
      || html.includes('basic-info');

    // 多义词消歧页检测（有多个可选义项）
    const isDisambig = html.includes('polysemant-list') || html.includes('disambiguation');

    if (!hasLemmaContent) {
      // 词条不存在，返回 found: false，不会 404
      return sendSuccess(res, {
        found: false,
        title: query,
        summary: '',
        sections: [],
        url: `https://baike.baidu.com/item/${encodeURIComponent(query)}`,
        hint: '未找到该词条。可能是名称不够精确，或者百度百科暂无收录。可以点击右上角链接在新标签页中搜索。',
      });
    }

    const extracted = extractTextFromHtml(html);

    // 如果提取到的内容为空（页面结构变了等），也标记 found 但给提示
    const hasContent = extracted.summary || extracted.sections.length > 0;

    sendSuccess(res, {
      found: true,
      title: extracted.title || query,
      summary: extracted.summary,
      sections: extracted.sections,
      url: baikeUrl,
      hint: isDisambig 
        ? '该词条为多义词消歧页，可能需要更精确的名称（如加朝代、职位等限定词）。' 
        : (!hasContent ? '词条已找到，但未能自动提取正文内容，建议在新标签页中查看。' : ''),
    });
  } catch (error: any) {
    console.error('Error proxying baidu baike:', error);
    sendError(res, `获取百度百科失败: ${error.message}`, 500);
  }
});

// ============ DBA 数据库管理接口 ============

// 获取所有表
app.get(`${API_PREFIX}/dba/tables`, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    sendSuccess(res, result.rows);
  } catch (error) {
    console.error('Error fetching tables:', error);
    sendError(res, '获取表列表失败', 500);
  }
});

// 获取表结构
app.get(`${API_PREFIX}/dba/tables/:name`, async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    
    // 获取列信息
    const columnsResult = await pool.query(`
      SELECT 
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [name]);
    
    // 获取索引信息
    const indexResult = await pool.query(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1
    `, [name]);
    
    // 获取行数
    const countResult = await pool.query(`SELECT COUNT(*) as count FROM "${name}"`);
    
    sendSuccess(res, {
      columns: columnsResult.rows,
      indexes: indexResult.rows,
      rowCount: parseInt(countResult.rows[0].count)
    });
  } catch (error) {
    console.error('Error fetching table info:', error);
    sendError(res, '获取表结构失败', 500);
  }
});

// 执行 SQL 查询（只读）
app.post(`${API_PREFIX}/dba/query`, async (req: Request, res: Response) => {
  try {
    const { sql } = req.body;
    
    if (!sql || typeof sql !== 'string') {
      return sendError(res, '请提供 SQL 语句');
    }
    
    // 简单的安全检查：只允许 SELECT, EXPLAIN, SHOW
    const sqlUpper = sql.trim().toUpperCase();
    const allowedPrefixes = ['SELECT', 'EXPLAIN', 'SHOW'];
    const isAllowed = allowedPrefixes.some(prefix => sqlUpper.startsWith(prefix));
    
    if (!isAllowed) {
      return sendError(res, '只允许执行 SELECT, EXPLAIN, SHOW 查询');
    }
    
    // 执行查询
    const startTime = Date.now();
    const result = await pool.query(sql);
    const elapsed = Date.now() - startTime;
    
    sendSuccess(res, {
      rows: result.rows,
      rowCount: result.rowCount,
      fields: result.fields?.map((f: any) => f.name) || [],
      elapsed
    });
  } catch (error: any) {
    console.error('SQL Error:', error);
    sendError(res, `SQL 执行错误: ${error.message}`, 400);
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
