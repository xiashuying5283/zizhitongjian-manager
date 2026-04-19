import React, { useState, useCallback, useEffect, useRef } from 'react';
import AlphabetSidebar from './AlphabetSidebar';
import CharacterList from './CharacterList';
import EditPanel from './EditPanel';
import { getCharactersByInitial, searchCharacters } from '../api';
import type { PinyinGroup } from '../types';

const STORAGE_KEY = 'character_management_state';

// 保存状态到 localStorage
const saveState = (state: { letter?: string; q?: string; id?: number; era?: string }) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // ignore
  }
};

// 从 localStorage 读取状态
const loadState = (): { letter?: string; q?: string; id?: number; era?: string } => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
};

const CharacterManagement: React.FC = () => {
  const [currentLetter, setCurrentLetter] = useState('');
  const [groups, setGroups] = useState<PinyinGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [eraFilter, setEraFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const pendingSelectIdRef = useRef<number | null>(null);

  const handleLetterClick = useCallback(async (letter: string, saveToStorage = true) => {
    setCurrentLetter(letter);
    setSearchQuery('');
    if (saveToStorage) {
      saveState({ letter, era: eraFilter || undefined });
    }
    setLoading(true);
    try {
      const data = await getCharactersByInitial(letter, eraFilter);
      setGroups(data.groups);
      setTotal(data.total);
    } catch (error) {
      console.error('Failed to load characters:', error);
    } finally {
      setLoading(false);
    }
  }, [eraFilter]);

  const handleSearch = useCallback(async (query: string, saveToStorage = true) => {
    setSearchQuery(query);
    setCurrentLetter('');
    if (saveToStorage) {
      saveState({ q: query || undefined, era: eraFilter || undefined });
    }
    if (!query.trim()) {
      setGroups([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const data = await searchCharacters(query, eraFilter);
      setGroups([
        {
          pinyin: '搜索结果',
          count: data.characters.length,
          characters: data.characters,
        },
      ]);
      setTotal(data.total);
    } catch (error) {
      console.error('Failed to search characters:', error);
    } finally {
      setLoading(false);
    }
  }, [eraFilter]);

  const handleEraChange = useCallback((era: string) => {
    setEraFilter(era);
    saveState({ letter: currentLetter || undefined, q: searchQuery || undefined, era: era || undefined });
    if (currentLetter) {
      handleLetterClick(currentLetter, false);
    } else if (searchQuery) {
      handleSearch(searchQuery, false);
    }
  }, [currentLetter, searchQuery, handleLetterClick, handleSearch]);

  const handleSelect = useCallback((id: number) => {
    setSelectedId(id);
    setPanelVisible(true);
    saveState({ letter: currentLetter || undefined, q: searchQuery || undefined, id, era: eraFilter || undefined });
  }, [currentLetter, searchQuery, eraFilter]);

  const handleClosePanel = useCallback(() => {
    setPanelVisible(false);
    setSelectedId(null);
    saveState({ letter: currentLetter || undefined, q: searchQuery || undefined, era: eraFilter || undefined });
  }, [currentLetter, searchQuery, eraFilter]);

  const handleSuccess = useCallback((keepSelection = false) => {
    if (keepSelection && selectedId) {
      pendingSelectIdRef.current = selectedId;
    }
    if (currentLetter) {
      handleLetterClick(currentLetter, false);
    } else if (searchQuery) {
      handleSearch(searchQuery, false);
    }
  }, [currentLetter, searchQuery, handleLetterClick, handleSearch, selectedId]);

  // 数据加载完成后恢复选中状态
  useEffect(() => {
    if (!loading && pendingSelectIdRef.current) {
      setSelectedId(pendingSelectIdRef.current);
      pendingSelectIdRef.current = null;
    }
  }, [loading]);

  // 监听人物创建事件
  useEffect(() => {
    const handleCharacterCreated = () => {
      handleSuccess();
    };
    window.addEventListener('characterCreated', handleCharacterCreated);
    return () => window.removeEventListener('characterCreated', handleCharacterCreated);
  }, [handleSuccess]);

  // 初始化：从 localStorage 恢复状态或默认查询 A
  useEffect(() => {
    if (initialized) return;
    
    const saved = loadState();
    
    // 恢复纪年筛选
    if (saved.era) {
      setEraFilter(saved.era);
    }
    
    // 恢复状态
    if (saved.q) {
      // 恢复搜索
      handleSearch(saved.q, false).then(() => {
        if (saved.id) {
          setSelectedId(saved.id);
          setPanelVisible(true);
        }
      });
    } else {
      // 恢复或默认字母
      const letter = saved.letter || 'A';
      handleLetterClick(letter, false).then(() => {
        if (saved.id) {
          setSelectedId(saved.id);
          setPanelVisible(true);
        }
      });
    }
    
    setInitialized(true);
  }, [initialized, handleLetterClick, handleSearch]);

  return (
    <div className="character-management">
      <div className="management-content">
        <AlphabetSidebar
          currentLetter={currentLetter}
          onLetterClick={handleLetterClick}
        />
        <CharacterList
          groups={groups}
          loading={loading}
          selectedId={selectedId || undefined}
          currentLetter={currentLetter}
          searchQuery={searchQuery}
          eraFilter={eraFilter}
          total={total}
          onSelect={handleSelect}
          onSearch={handleSearch}
          onEraChange={handleEraChange}
        />
      </div>

      <EditPanel
        visible={panelVisible}
        characterId={selectedId}
        onClose={handleClosePanel}
        onSuccess={handleSuccess}
      />
    </div>
  );
};

export default CharacterManagement;
