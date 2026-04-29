import axios from 'axios';
import type {
  ApiResponse,
  CharactersByInitialResponse,
  CharacterDetail,
  EnrichRequest,
  EnrichResponse,
  EnrichConfirmRequest,
  Geography,
  GeographyListResponse,
  Paragraph,
  ParagraphListResponse,
  ParagraphGroupedResponse,
  Position,
  PositionListResponse,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 300000, // 5 分钟，AI 生成长内容需要较长时间
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

const toNumber = (value: unknown): number => Number(value ?? 0);

// 登录
export const login = async (username: string, password: string) => {
  const response = await api.post<ApiResponse<{ username: string; message: string }>>(
    '/login',
    { username, password }
  );
  return response.data.data;
};

// 登出
export const logout = async () => {
  const response = await api.post<ApiResponse<{ message: string }>>('/logout');
  return response.data.data;
};

// 检查登录状态
export const checkAuth = async () => {
  const response = await api.get<ApiResponse<{ authenticated: boolean; username?: string }>>(
    '/check-auth'
  );
  return response.data.data;
};

// 获取按字母分组的人物列表
export const getCharactersByInitial = async (
  letter: string,
  era?: string
): Promise<CharactersByInitialResponse> => {
  const params = new URLSearchParams();
  if (era) params.append('era', era);
  const response = await api.get<ApiResponse<CharactersByInitialResponse>>(
    `/characters/by-initial/${letter}?${params}`
  );
  return response.data.data;
};

// 搜索人物
export const searchCharacters = async (
  name: string,
  era?: string,
  page = 1,
  limit = 50
) => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    name,
  });
  if (era) params.append('era', era);
  const response = await api.get<ApiResponse<{
    characters: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>>(`/characters?${params}`);
  return response.data.data;
};

// 获取人物详情
export const getCharacterDetail = async (id: number): Promise<CharacterDetail> => {
  const response = await api.get<ApiResponse<CharacterDetail>>(`/characters/${id}`);
  return response.data.data;
};

// AI 生成
export const enrichCharacter = async (data: EnrichRequest): Promise<EnrichResponse> => {
  const response = await api.post<ApiResponse<EnrichResponse>>(
    '/characters/enrich-from-tongjian',
    data
  );
  return response.data.data;
};

// 确认写入
export const confirmEnrich = async (data: EnrichConfirmRequest) => {
  const response = await api.post<ApiResponse<{
    id: number;
    name: string;
    updated: string[];
    addedRelations: string[];
    missingCharacters: string[];
  }>>('/characters/enrich-confirm', data);
  return response.data.data;
};

// 新增人物
export const createCharacter = async (data: {
  name: string;
  era?: string;
  title?: string;
  hometown?: string;
  aliases?: string[];
  summary?: string;
}) => {
  const response = await api.post<ApiResponse<{ id: number; name: string }>>(
    '/characters',
    data
  );
  return response.data.data;
};

// 删除人物
export const deleteCharacter = async (id: number) => {
  const response = await api.delete<ApiResponse<{ id: number; name: string }>>(
    `/characters/${id}`
  );
  return response.data.data;
};

// 获取统计数据
export const getStats = async () => {
  const response = await api.get<ApiResponse<{
    characters: number;
    positions: number;
    geography: number;
    paragraphs: number;
  }>>('/stats');
  return response.data.data;
};

// ==================== 资治通鉴段落 API ====================

// 获取卷名列表
export const getParagraphVolumes = async (): Promise<string[]> => {
  const response = await api.get<ApiResponse<string[]>>('/paragraphs/volumes');
  return response.data.data;
};

// 获取段落列表
export const getParagraphList = async (
  page = 1,
  limit = 20,
  filters?: { keyword?: string; volume_name?: string; year_mark?: string; grouped?: boolean }
): Promise<ParagraphListResponse | ParagraphGroupedResponse> => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (filters?.keyword) params.append('keyword', filters.keyword);
  if (filters?.volume_name) params.append('volume_name', filters.volume_name);
  if (filters?.year_mark) params.append('year_mark', filters.year_mark);
  if (filters?.grouped) params.append('grouped', 'true');
  const response = await api.get<ApiResponse<ParagraphListResponse | ParagraphGroupedResponse>>(`/paragraphs?${params}`);
  return response.data.data;
};

// 获取段落详情
export const getParagraphDetail = async (id: number): Promise<Paragraph> => {
  const response = await api.get<ApiResponse<Paragraph>>(`/paragraphs/${id}`);
  return response.data.data;
};

// 新增段落
export const createParagraph = async (data: {
  content: string;
  content_traditional?: string;
  volume_name?: string;
  volume_number?: number;
  year_mark?: string;
  emperor?: string;
  bc_year?: number;
  event_index?: number;
  paragraph_index?: number;
  with_notes?: string;
  with_notes_traditional?: string;
  translation?: string;
  translation_traditional?: string;
  is_chenguangyue?: boolean;
}) => {
  const response = await api.post<ApiResponse<Paragraph>>('/paragraphs', data);
  return response.data.data;
};

// 更新段落
export const updateParagraph = async (id: number, data: Partial<{
  content: string;
  content_traditional: string;
  volume_name: string;
  volume_number: number;
  year_mark: string;
  emperor: string;
  bc_year: number;
  event_index: number;
  paragraph_index: number;
  with_notes: string;
  with_notes_traditional: string;
  translation: string;
  translation_traditional: string;
  is_chenguangyue: boolean;
}>) => {
  const response = await api.put<ApiResponse<Paragraph>>(`/paragraphs/${id}`, data);
  return response.data.data;
};

// 删除段落
export const deleteParagraph = async (id: number) => {
  const response = await api.delete<ApiResponse<{ id: number }>>(`/paragraphs/${id}`);
  return response.data.data;
};

// ==================== 地理 API ====================

// 获取地理列表
export const getGeographyList = async (
  page = 1,
  limit = 20,
  filters?: { name?: string; category?: string; dynasty?: string }
): Promise<GeographyListResponse> => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (filters?.name) params.append('name', filters.name);
  if (filters?.category) params.append('category', filters.category);
  if (filters?.dynasty) params.append('dynasty', filters.dynasty);
  const response = await api.get<ApiResponse<GeographyListResponse>>(`/geography?${params}`);
  return response.data.data;
};

// 获取地理详情
export const getGeographyDetail = async (id: number): Promise<Geography> => {
  const response = await api.get<ApiResponse<Geography>>(`/geography/${id}`);
  return response.data.data;
};

// 新增地理
export const createGeography = async (data: {
  name: string;
  slug?: string;
  category?: string;
  level?: string;
  dynasty?: string;
  location?: string;
  lng?: string;
  lat?: string;
  description?: string;
  aliases?: string[];
}) => {
  const response = await api.post<ApiResponse<Geography>>('/geography', data);
  return response.data.data;
};

// 更新地理
export const updateGeography = async (id: number, data: Partial<{
  name: string;
  slug: string;
  category: string;
  level: string;
  dynasty: string;
  location: string;
  lng: string;
  lat: string;
  description: string;
  aliases: string[];
}>) => {
  const response = await api.put<ApiResponse<Geography>>(`/geography/${id}`, data);
  return response.data.data;
};

// 删除地理
export const deleteGeography = async (id: number) => {
  const response = await api.delete<ApiResponse<{ id: number; name: string }>>(`/geography/${id}`);
  return response.data.data;
};

// ==================== 官职 API ====================

// 获取官职列表
export const getPositionList = async (
  page = 1,
  limit = 20,
  filters?: { name?: string; category?: string; dynasty?: string }
): Promise<PositionListResponse> => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (filters?.name) params.append('name', filters.name);
  if (filters?.category) params.append('category', filters.category);
  if (filters?.dynasty) params.append('dynasty', filters.dynasty);
  const response = await api.get<ApiResponse<PositionListResponse>>(`/positions?${params}`);
  return response.data.data;
};

// 获取官职详情
export const getPositionDetail = async (id: number): Promise<Position> => {
  const response = await api.get<ApiResponse<Position>>(`/positions/${id}`);
  return response.data.data;
};

// 新增官职
export const createPosition = async (data: {
  name: string;
  description?: string;
  category?: string;
  dynasty?: string;
  rank?: string;
  aliases?: string[];
}) => {
  const response = await api.post<ApiResponse<Position>>('/positions', data);
  return response.data.data;
};

// 更新官职
export const updatePosition = async (id: number, data: Partial<{
  name: string;
  description: string;
  category: string;
  dynasty: string;
  rank: string;
  aliases: string[];
}>) => {
  const response = await api.put<ApiResponse<Position>>(`/positions/${id}`, data);
  return response.data.data;
};

// 删除官职
export const deletePosition = async (id: number) => {
  const response = await api.delete<ApiResponse<{ id: number; name: string }>>(`/positions/${id}`);
  return response.data.data;
};

// ==================== DBA 数据库管理 API ====================

// 获取百度百科内容（纯文本）
export interface BaikeSection {
  title: string;
  content: string;
}

export interface BaikeResult {
  found: boolean;
  title: string;
  summary: string;
  sections: BaikeSection[];
  url: string;
}

export const getBaiduBaike = async (query: string): Promise<BaikeResult> => {
  const response = await api.get<ApiResponse<BaikeResult>>(`/baidu-baike?q=${encodeURIComponent(query)}`);
  return response.data.data;
};

// 获取维基百科内容（纯文本）
export interface WikiResult {
  found: boolean;
  title: string;
  summary: string;
  sections: BaikeSection[];
  url: string;
}

export const getWikiBaike = async (query: string): Promise<WikiResult> => {
  const response = await api.get<ApiResponse<WikiResult>>(`/wiki-baike?q=${encodeURIComponent(query)}`);
  return response.data.data;
};

// 获取所有表
export const getTables = async () => {
  const response = await api.get<ApiResponse<Array<{ table_name: string; column_count: string }>>>('/dba/tables');
  return response.data.data;
};

// 获取表结构
export const getTableInfo = async (tableName: string) => {
  const response = await api.get<ApiResponse<{
    columns: Array<{
      column_name: string;
      data_type: string;
      character_maximum_length: number | null;
      is_nullable: string;
      column_default: string | null;
    }>;
    indexes: Array<{ indexname: string; indexdef: string }>;
    rowCount: number;
  }>>(`/dba/tables/${tableName}`);
  return response.data.data;
};

// 执行 SQL 查询
export const executeQuery = async (sql: string, confirm = false) => {
  const url = confirm ? '/dba/query?confirm=1' : '/dba/query';
  const response = await api.post<ApiResponse<{
    rows: any[];
    rowCount: number;
    fields: string[];
    elapsed: number;
  }>>(url, { sql });
  return response.data.data;
};

// 获取数据库监控信息
export const getDbMonitorInfo = async () => {
  type DbMonitorInfo = {
    pool: {
      total: number;
      idle: number;
      waiting: number;
    };
    database: {
      name: string;
      size: string;
      size_bytes: number;
    };
    connections: {
      total_connections: number;
      active_connections: number;
      idle_connections: number;
    };
    tables: Array<{
      schemaname: string;
      table_name: string;
      live_rows: number;
      dead_rows: number;
      last_vacuum: string | null;
      last_autovacuum: string | null;
      last_analyze: string | null;
      total_size: string;
    }>;
    indexes: Array<{
      schemaname: string;
      table_name: string;
      index_name: string;
      index_scans: number;
      tuples_read: number;
      tuples_fetched: number;
    }>;
    dbStat: {
      numbackends: number;
      xact_commit: number;
      xact_rollback: number;
      blks_read: number;
      blks_hit: number;
      cache_hit_ratio: number;
      tup_returned: number;
      tup_fetched: number;
      tup_inserted: number;
      tup_updated: number;
      tup_deleted: number;
      conflicts: number;
      deadlocks: number;
    } | null;
    tableIo: Array<{
      schemaname: string;
      table_name: string;
      heap_blks_read: number;
      heap_blks_hit: number;
      heap_hit_ratio: number;
      idx_blks_read: number;
      idx_blks_hit: number;
      idx_hit_ratio: number;
      toast_blks_read: number;
      toast_blks_hit: number;
      tidx_blks_read: number;
      tidx_blks_hit: number;
    }>;
    bgwriter: {
      checkpoints_timed: number;
      checkpoints_req: number;
      req_checkpoint_ratio: number;
      buffers_clean: number;
      buffers_backend: number;
      buffers_alloc: number;
      buffers_checkpoint: number;
    } | null;
    timestamp: string;
  };

  const response = await api.get<ApiResponse<DbMonitorInfo>>('/dba/monitor');
  const data = response.data.data;

  return {
    ...data,
    database: {
      ...data.database,
      size_bytes: toNumber(data.database.size_bytes),
    },
    connections: {
      total_connections: toNumber(data.connections.total_connections),
      active_connections: toNumber(data.connections.active_connections),
      idle_connections: toNumber(data.connections.idle_connections),
    },
    tables: data.tables.map((table) => ({
      ...table,
      live_rows: toNumber(table.live_rows),
      dead_rows: toNumber(table.dead_rows),
    })),
    indexes: data.indexes.map((index) => ({
      ...index,
      index_scans: toNumber(index.index_scans),
      tuples_read: toNumber(index.tuples_read),
      tuples_fetched: toNumber(index.tuples_fetched),
    })),
    dbStat: data.dbStat
      ? {
          numbackends: toNumber(data.dbStat.numbackends),
          xact_commit: toNumber(data.dbStat.xact_commit),
          xact_rollback: toNumber(data.dbStat.xact_rollback),
          blks_read: toNumber(data.dbStat.blks_read),
          blks_hit: toNumber(data.dbStat.blks_hit),
          cache_hit_ratio: toNumber(data.dbStat.cache_hit_ratio),
          tup_returned: toNumber(data.dbStat.tup_returned),
          tup_fetched: toNumber(data.dbStat.tup_fetched),
          tup_inserted: toNumber(data.dbStat.tup_inserted),
          tup_updated: toNumber(data.dbStat.tup_updated),
          tup_deleted: toNumber(data.dbStat.tup_deleted),
          conflicts: toNumber(data.dbStat.conflicts),
          deadlocks: toNumber(data.dbStat.deadlocks),
        }
      : null,
    tableIo: data.tableIo.map((io) => ({
      ...io,
      heap_blks_read: toNumber(io.heap_blks_read),
      heap_blks_hit: toNumber(io.heap_blks_hit),
      heap_hit_ratio: toNumber(io.heap_hit_ratio),
      idx_blks_read: toNumber(io.idx_blks_read),
      idx_blks_hit: toNumber(io.idx_blks_hit),
      idx_hit_ratio: toNumber(io.idx_hit_ratio),
      toast_blks_read: toNumber(io.toast_blks_read),
      toast_blks_hit: toNumber(io.toast_blks_hit),
      tidx_blks_read: toNumber(io.tidx_blks_read),
      tidx_blks_hit: toNumber(io.tidx_blks_hit),
    })),
    bgwriter: data.bgwriter
      ? {
          checkpoints_timed: toNumber(data.bgwriter.checkpoints_timed),
          checkpoints_req: toNumber(data.bgwriter.checkpoints_req),
          req_checkpoint_ratio: toNumber(data.bgwriter.req_checkpoint_ratio),
          buffers_clean: toNumber(data.bgwriter.buffers_clean),
          buffers_backend: toNumber(data.bgwriter.buffers_backend),
          buffers_alloc: toNumber(data.bgwriter.buffers_alloc),
          buffers_checkpoint: toNumber(data.bgwriter.buffers_checkpoint),
        }
      : null,
  };
};

// 获取数据库版本和配置
export const getDbInfo = async () => {
  const response = await api.get<ApiResponse<{
    version: string;
    config: Array<{
      name: string;
      setting: string;
      unit: string | null;
      short_desc: string;
    }>;
  }>>('/dba/info');
  return response.data.data;
};

// VACUUM/ANALYZE 表
export const vacuumTable = async (tableName: string, mode: 'vacuum' | 'analyze' | 'vacuum_full') => {
  const response = await api.post<ApiResponse<{ message: string; tableName: string; mode: string }>>(
    '/dba/vacuum',
    { tableName, mode }
  );
  return response.data.data;
};
