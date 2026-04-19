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
