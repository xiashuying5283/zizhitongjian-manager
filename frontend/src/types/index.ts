// 人物类型
export interface Character {
  id: number;
  name: string;
  title?: string;
  era?: string;
  hometown?: string;
  summary?: string;
  aliases?: string[];
  birth_year?: string;
  death_year?: string;
  pinyinInitial?: string;
  firstCharPinyin?: string;
  updated_at?: string;
}

// 关系类型
export interface Relation {
  id?: number;
  name: string;
  relation: string;
  description?: string;
  isReverse?: boolean;
}

// 人物详情类型
export interface CharacterDetail extends Character {
  relations?: {
    id: number;
    relation_type: string;
    description?: string;
    related_character: {
      id: number;
      name: string;
      title?: string;
      era?: string;
    };
  }[];
  reverseRelations?: {
    id: number;
    relation_type: string;
    description?: string;
    character: {
      id: number;
      name: string;
      title?: string;
      era?: string;
    };
  }[];
}

// 拼音分组类型
export interface PinyinGroup {
  pinyin: string;
  count: number;
  characters: Character[];
}

// API 响应类型
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// 按字母分组的响应
export interface CharactersByInitialResponse {
  letter: string;
  total: number;
  groups: PinyinGroup[];
}

// AI 生成请求
export interface EnrichRequest {
  name: string;
  dryRun?: boolean;
  userHint?: string;
}

// AI 生成响应
export interface EnrichResponse {
  dryRun: boolean;
  current: {
    era?: string;
    title?: string;
    summary?: string;
    aliases?: string[];
  };
  proposed: {
    era?: string;
    title?: string;
    summary?: string;
    aliases?: string[];
    hometown?: string;
    birth_year?: string;
    death_year?: string;
  };
  relationships: {
    name: string;
    relation: string;
    description?: string;
  }[];
}

// 确认写入请求
export interface EnrichConfirmRequest {
  characterId: number;
  name?: string;
  era?: string;
  title?: string;
  hometown?: string;
  aliases?: string[];
  summary?: string;
  birth_year?: string;
  death_year?: string;
  relationships?: {
    name: string;
    relation: string;
    description?: string;
  }[];
  createMissing?: boolean;  // 是否自动创建不存在的人物
}

// ==================== 地理类型 ====================

export interface Geography {
  id: number;
  slug: string;
  name: string;
  aliases?: string[];
  category?: string;
  level?: string;
  dynasty?: string;
  location?: string;
  lng?: string;
  lat?: string;
  description?: string;
  stroke_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface GeographyListResponse {
  geography: Geography[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ==================== 资治通鉴段落类型 ====================

export interface Paragraph {
  id: number;
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
  created_at?: string;
}

export interface ParagraphListResponse {
  paragraphs: Paragraph[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ParagraphGroup {
  volume: string;
  count: number;
  paragraphs: Paragraph[];
}

export interface ParagraphGroupedResponse {
  groups: ParagraphGroup[];
  total: number;
}

// ==================== 官职类型 ====================

export interface Position {
  id: number;
  name: string;
  description?: string;
  category?: string;
  dynasty?: string;
  rank?: string;
  aliases?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface PositionListResponse {
  positions: Position[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CharacterSearchResponse {
  characters: Character[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type SqlValue = string | number | boolean | null | Date | Record<string, unknown> | unknown[];
export type SqlRow = Record<string, SqlValue>;

export interface SqlQueryResult {
  rows: SqlRow[];
  rowCount: number;
  fields: string[];
  elapsed: number;
}

export interface DbMonitorInfo {
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
}

export interface DbInfo {
  version: string;
  config: Array<{
    name: string;
    setting: string;
    unit: string | null;
    short_desc: string;
  }>;
}
