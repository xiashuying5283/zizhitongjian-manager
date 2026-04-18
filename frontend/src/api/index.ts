import axios from 'axios';
import type {
  ApiResponse,
  CharactersByInitialResponse,
  CharacterDetail,
  EnrichRequest,
  EnrichResponse,
  EnrichConfirmRequest,
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
