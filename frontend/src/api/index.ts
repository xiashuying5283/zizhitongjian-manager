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
  Position,
  PositionListResponse,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

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
  }>>('/stats');
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
