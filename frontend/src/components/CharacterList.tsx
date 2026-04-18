import React, { useState } from 'react';
import { Collapse, Empty, Spin, Tag, Input, Select } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { PinyinGroup } from '../types';
import './CharacterList.css';

const { Panel } = Collapse;

interface CharacterListProps {
  groups: PinyinGroup[];
  loading: boolean;
  selectedId?: number;
  currentLetter: string;
  searchQuery: string;
  eraFilter: string;
  total: number;
  onSelect: (id: number) => void;
  onSearch: (query: string) => void;
  onEraChange: (era: string) => void;
}

const eraColors: Record<string, string> = {
  周纪: 'green',
  秦纪: 'default',
  汉纪: 'red',
  魏纪: 'blue',
  晋纪: 'purple',
  宋纪: 'orange',
  齐纪: 'cyan',
  梁纪: 'magenta',
  陈纪: 'geekblue',
  隋纪: 'volcano',
  唐纪: 'gold',
  后梁纪: 'pink',
  后唐纪: 'lime',
  后晋纪: 'purple',
  后汉纪: 'red',
  后周纪: 'green',
  待定: 'default',
};

const eraOptions = [
  { value: '', label: '全部纪年' },
  { value: '周纪', label: '周纪' },
  { value: '秦纪', label: '秦纪' },
  { value: '汉纪', label: '汉纪' },
  { value: '魏纪', label: '魏纪' },
  { value: '晋纪', label: '晋纪' },
  { value: '宋纪', label: '宋纪' },
  { value: '齐纪', label: '齐纪' },
  { value: '梁纪', label: '梁纪' },
  { value: '陈纪', label: '陈纪' },
  { value: '隋纪', label: '隋纪' },
  { value: '唐纪', label: '唐纪' },
  { value: '后梁纪', label: '后梁纪' },
  { value: '后唐纪', label: '后唐纪' },
  { value: '后晋纪', label: '后晋纪' },
  { value: '后汉纪', label: '后汉纪' },
  { value: '后周纪', label: '后周纪' },
];

const CharacterList: React.FC<CharacterListProps> = ({
  groups,
  loading,
  selectedId,
  currentLetter,
  searchQuery,
  eraFilter,
  total,
  onSelect,
  onSearch,
  onEraChange,
}) => {
  const [activeKeys, setActiveKeys] = useState<string[]>([]);

  const handlePanelChange = (keys: string | string[]) => {
    setActiveKeys(Array.isArray(keys) ? keys : [keys]);
  };

  return (
    <div className="character-list">
      <div className="toolbar">
        <div className="current-info">
          {currentLetter ? (
            <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>
              {currentLetter} - {total}人
            </Tag>
          ) : searchQuery ? (
            <Tag color="green" style={{ fontSize: 14, padding: '4px 12px' }}>
              搜索: {searchQuery} - {total}人
            </Tag>
          ) : (
            <span className="hint">请点击左侧字母索引</span>
          )}
        </div>
        <Select
          value={eraFilter}
          onChange={onEraChange}
          options={eraOptions}
          style={{ width: 120 }}
        />
        <Input
          placeholder="搜索姓名或别名..."
          prefix={<SearchOutlined />}
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          style={{ width: 250 }}
          allowClear
        />
      </div>

      <div className="list-content">
        {loading ? (
          <div className="loading-container">
            <Spin size="large" tip="加载中..." />
          </div>
        ) : groups.length === 0 ? (
          <Empty description="请点击左侧字母索引或输入搜索关键词" />
        ) : (
          <Collapse
            activeKey={activeKeys.length > 0 ? activeKeys : groups.map((g) => g.pinyin)}
            onChange={handlePanelChange}
            className="pinyin-collapse"
          >
            {groups.map((group) => (
              <Panel
                header={
                  <div className="panel-header">
                    <span className="pinyin-text">{group.pinyin}</span>
                    <span className="count">{group.count}人</span>
                  </div>
                }
                key={group.pinyin}
              >
                {group.characters.map((char) => (
                  <div
                    key={char.id}
                    className={`character-item ${selectedId === char.id ? 'active' : ''}`}
                    onClick={() => onSelect(char.id)}
                  >
                    <span className="name">{char.name}</span>
                    <span className="title">{char.title || '—'}</span>
                    <Tag color={eraColors[char.era || '待定']} className="era-tag">
                      {char.era || '待定'}
                    </Tag>
                  </div>
                ))}
              </Panel>
            ))}
          </Collapse>
        )}
      </div>
    </div>
  );
};

export default CharacterList;
