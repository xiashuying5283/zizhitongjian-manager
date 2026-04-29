import React, { useState, useEffect, useRef } from 'react';
import { Card, Table, Input, Button, message, Tabs, Spin, Tag, Typography, Empty, Modal } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { PlayCircleOutlined, ReloadOutlined, TableOutlined, FormatPainterOutlined, PlusOutlined, CloseOutlined, WarningOutlined } from '@ant-design/icons';
import { getTables, getTableInfo, executeQuery } from '../api';
import './DbAdmin.css';

const { TextArea } = Input;
const { Text } = Typography;

interface TableInfo {
  table_name: string;
  column_count: string;
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
  character_maximum_length: number | null;
  is_nullable: string;
  column_default: string | null;
}

interface TableDetail {
  columns: ColumnInfo[];
  indexes: Array<{ indexname: string; indexdef: string }>;
  rowCount: number;
}

interface QueryResult {
  rows: any[];
  rowCount: number;
  fields: string[];
  elapsed: number;
}

interface QueryTab {
  key: string;
  title: string;
  sql: string;
  result: QueryResult | null;
  loading: boolean;
}

let tabIdCounter = 1;

// SQL 关键字列表
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'BETWEEN', 'LIKE',
  'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'ALL',
  'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'ON',
  'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT',
  'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
  'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'TRUNCATE TABLE',
  'CREATE INDEX', 'DROP INDEX',
  'PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'DEFAULT', 'AUTO_INCREMENT', 'SERIAL',
  'INTEGER', 'INT', 'BIGINT', 'SMALLINT', 'DECIMAL', 'NUMERIC', 'REAL', 'DOUBLE PRECISION',
  'VARCHAR', 'CHAR', 'TEXT', 'BOOLEAN', 'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ',
  'ARRAY', 'JSON', 'JSONB', 'UUID',
  'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'COALESCE', 'NULLIF',
  'EXISTS', 'ANY', 'SOME', 'ALL',
  'ASC', 'DESC', 'TRUE', 'FALSE',
  'EXPLAIN', 'ANALYZE', 'VACUUM', 'REINDEX',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE',
  'GRANT', 'REVOKE', 'TO', 'FROM'
];

// 聚合函数
const SQL_FUNCTIONS = [
  'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'STRING_AGG', 'ARRAY_AGG',
  'NOW', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP',
  'DATE_TRUNC', 'EXTRACT', 'AGE', 'TO_CHAR', 'TO_DATE', 'TO_TIMESTAMP',
  'COALESCE', 'NULLIF', 'GREATEST', 'LEAST',
  'ROUND', 'TRUNC', 'ABS', 'POWER', 'SQRT', 'LOG', 'LN', 'EXP',
  'LENGTH', 'SUBSTRING', 'REPLACE', 'TRIM', 'UPPER', 'LOWER', 'CONCAT',
  'POSITION', 'STRPOS', 'SPLIT_PART', 'INITCAP'
];

const DbAdmin: React.FC = () => {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableDetail, setTableDetail] = useState<TableDetail | null>(null);
  const [loading, setLoading] = useState(false);

  // 多查询标签页
  const [queryTabs, setQueryTabs] = useState<QueryTab[]>([
    { key: '1', title: '查询 1', sql: '', result: null, loading: false }
  ]);
  const [activeTabKey, setActiveTabKey] = useState('1');
  const [hasSelection, setHasSelection] = useState(false);
  const [structureModalOpen, setStructureModalOpen] = useState(false);

  // 左右拖拽布局状态
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 上下拖拽布局状态
  const [editorHeight, setEditorHeight] = useState(300);
  const [isDraggingEditor, setIsDraggingEditor] = useState(false);
  const queryPanelRef = useRef<HTMLDivElement>(null);
  const sqlBeforeFormatRef = useRef<string | null>(null);
  const textAreaRef = useRef<TextAreaRef>(null);
  const selectedSqlRef = useRef<string | null>(null);

  // SQL 关键字提示相关
  const [tableNames, setTableNames] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionList, setSuggestionList] = useState<string[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState({ left: 0, top: 0 });
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTables();
  }, []);

  // 获取当前活动的标签页
  const getCurrentTab = () => queryTabs.find(t => t.key === activeTabKey);
  const updateCurrentTab = (updates: Partial<QueryTab>) => {
    setQueryTabs(tabs => tabs.map(t =>
      t.key === activeTabKey ? { ...t, ...updates } : t
    ));
  };

  const focusSqlEditor = () => {
    setTimeout(() => {
      const textarea = getTextAreaElement();
      textarea?.focus();
    }, 0);
  };

  // 左右拖拽逻辑
  const handleMouseDown = () => setIsDragging(true);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      if (newWidth >= 200 && newWidth <= 500) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // 上下拖拽逻辑
  const handleEditorMouseDown = () => setIsDraggingEditor(true);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingEditor || !queryPanelRef.current) return;
      const rect = queryPanelRef.current.getBoundingClientRect();
      const newHeight = e.clientY - rect.top;
      if (newHeight >= 100 && newHeight <= 500) {
        setEditorHeight(newHeight);
      }
    };
    const handleMouseUp = () => setIsDraggingEditor(false);

    if (isDraggingEditor) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingEditor]);

  const loadTables = async () => {
    setLoading(true);
    try {
      const data = await getTables();
      setTables(data);
      // 提取表名用于提示
      setTableNames(data.map((t: TableInfo) => t.table_name));
    } catch (error) {
      message.error('加载表列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadTableDetail = async (tableName: string): Promise<boolean> => {
    setLoading(true);
    try {
      const data = await getTableInfo(tableName);
      setTableDetail(data);
      setSelectedTable(tableName);
      return true;
    } catch (error) {
      message.error('加载表结构失败');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const appendSelectQuery = (tableName: string) => {
    const currentTab = getCurrentTab();
    if (!currentTab) return;

    setSelectedTable(tableName);
    const query = `SELECT * FROM "${tableName}" LIMIT 100;`;
    const nextSql = currentTab.sql.trim()
      ? `${currentTab.sql.replace(/\s*$/, '')}\n\n${query}`
      : query;

    updateCurrentTab({ sql: nextSql });
    setActiveTabKey(currentTab.key);
    setTimeout(() => {
      const textarea = getTextAreaElement();
      if (!textarea) return;
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = nextSql.length;
    }, 0);
  };

  const viewTableStructure = async (tableName: string) => {
    const loaded = await loadTableDetail(tableName);
    if (loaded) {
      setStructureModalOpen(true);
    }
  };

  // 新增查询标签页
  const addQueryTab = () => {
    tabIdCounter++;
    const newTab: QueryTab = {
      key: String(tabIdCounter),
      title: `查询 ${tabIdCounter}`,
      sql: '',
      result: null,
      loading: false
    };
    setQueryTabs([...queryTabs, newTab]);
    setActiveTabKey(newTab.key);
    focusSqlEditor();
  };

  // 关闭查询标签页
  const removeQueryTab = (targetKey: string) => {
    if (queryTabs.length <= 1) {
      message.warning('至少保留一个查询窗口');
      return;
    }
    const newTabs = queryTabs.filter(t => t.key !== targetKey);
    setQueryTabs(newTabs);
    if (activeTabKey === targetKey) {
      setActiveTabKey(newTabs[0].key);
    }
  };

  // 格式化 SQL
  const formatSql = () => {
    const currentTab = getCurrentTab();
    if (!currentTab) return;

    sqlBeforeFormatRef.current = currentTab.sql;

    const keywords = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'ON', 'AS', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM'];
    let formatted = currentTab.sql.trim();

    keywords.forEach(kw => {
      const regex = new RegExp(`\\b${kw}\\b`, 'gi');
      formatted = formatted.replace(regex, kw);
    });

    const lineBreakKeywords = ['SELECT', 'FROM', 'WHERE', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN'];
    lineBreakKeywords.forEach(kw => {
      const regex = new RegExp(`\\s+${kw}\\b`, 'g');
      formatted = formatted.replace(regex, `\n${kw}`);
    });

    formatted = formatted.replace(/\n\s*\n/g, '\n').trim();
    updateCurrentTab({ sql: formatted });
  };

  // Ctrl+Z 撤销格式化
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && sqlBeforeFormatRef.current !== null) {
        updateCurrentTab({ sql: sqlBeforeFormatRef.current! });
        sqlBeforeFormatRef.current = null;
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabKey]);

  // 获取原生 textarea 元素
  const getTextAreaElement = (): HTMLTextAreaElement | null => {
    const ref = textAreaRef.current as any;
    return ref?.resizableTextArea?.textArea || ref;
  };

  // 保存选中内容
  const saveSelection = () => {
    const textarea = getTextAreaElement();
    if (textarea && textarea.selectionStart !== textarea.selectionEnd) {
      selectedSqlRef.current = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
    } else {
      selectedSqlRef.current = null;
    }
  };

  // 监听选中状态变化
  const handleSelectChange = () => {
    const textarea = getTextAreaElement();
    if (textarea) {
      setHasSelection(textarea.selectionStart !== textarea.selectionEnd);
      if (textarea.selectionStart !== textarea.selectionEnd) {
        selectedSqlRef.current = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
      } else {
        selectedSqlRef.current = null;
      }
    }
  };

  // 处理 SQL 输入，更新提示
  const handleSqlInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    updateCurrentTab({ sql: value });

    // 获取当前光标位置
    const textarea = e.target;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);

    // 匹配最后一个词
    const match = textBeforeCursor.match(/\b([a-zA-Z_]\w*)$/);
    if (!match) {
      setShowSuggestions(false);
      return;
    }

    const partialWord = match[1].toUpperCase();
    if (partialWord.length < 1) {
      setShowSuggestions(false);
      return;
    }

    // 获取上下文
    const textUpper = textBeforeCursor.toUpperCase();
    const lastKeyword = textUpper.match(/\b(SELECT|FROM|WHERE|JOIN|INSERT|UPDATE|DELETE|SET|VALUES|AND|OR|ON|GROUP|ORDER|HAVING|LIMIT|OFFSET)\b/g);
    const context = lastKeyword ? lastKeyword[lastKeyword.length - 1] : '';

    // 根据上下文智能推荐
    let candidates: string[] = [];

    if (context === 'FROM' || context === 'JOIN') {
      candidates = tableNames.filter(t => t.toLowerCase().startsWith(partialWord.toLowerCase()));
    } else if (context === 'SELECT' || context === 'WHERE' || context === 'AND' || context === 'OR') {
      if (selectedTable && tableDetail) {
        const columnNames = tableDetail.columns.map(c => c.column_name);
        candidates = columnNames.filter(c => c.toLowerCase().startsWith(partialWord.toLowerCase()));
      }
      if (candidates.length < 10) {
        candidates = [...candidates, ...SQL_KEYWORDS, ...SQL_FUNCTIONS];
      }
    } else {
      candidates = [...SQL_KEYWORDS, ...SQL_FUNCTIONS];
    }

    const filtered = candidates
      .filter(kw => kw.toUpperCase().startsWith(partialWord))
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 10);

    if (filtered.length > 0) {
      setSuggestionList(filtered);
      setSuggestionIndex(0);
      setShowSuggestions(true);

      // 计算提示框位置
      const lines = textBeforeCursor.split('\n');
      const currentLine = lines[lines.length - 1];
      const charWidth = 8;
      const lineHeight = 20;
      const left = currentLine.length * charWidth;
      const top = lines.length * lineHeight;
      setCursorPosition({ left, top });
    } else {
      setShowSuggestions(false);
    }
  };

  // 选择提示项
  const selectSuggestion = (suggestion: string) => {
    const textarea = getTextAreaElement();
    if (!textarea) return;

    const currentTab = getCurrentTab();
    if (!currentTab) return;

    const value = currentTab.sql;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const textAfterCursor = value.substring(cursorPos);

    // 替换最后一个词
    const newTextBefore = textBeforeCursor.replace(/\b([a-zA-Z_]\w*)$/, suggestion + ' ');
    const newValue = newTextBefore + textAfterCursor;

    updateCurrentTab({ sql: newValue });
    setShowSuggestions(false);

    // 设置光标位置
    setTimeout(() => {
      const newPos = newTextBefore.length;
      textarea.selectionStart = textarea.selectionEnd = newPos;
      textarea.focus();
    }, 0);
  };

  // 键盘导航提示
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSuggestionIndex(prev => (prev + 1) % suggestionList.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSuggestionIndex(prev => (prev - 1 + suggestionList.length) % suggestionList.length);
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      selectSuggestion(suggestionList[suggestionIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // 点击外部关闭提示
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 执行 SQL
  const executeSql = async (confirmWrite = false) => {
    const currentTab = getCurrentTab();
    if (!currentTab) return;

    const sqlToExecute = selectedSqlRef.current || currentTab.sql;

    if (!sqlToExecute.trim()) {
      message.warning('请输入 SQL 语句');
      return;
    }

    // 检测是否为写操作
    const sqlUpper = sqlToExecute.trim().toUpperCase();
    const isWrite = ['INSERT', 'UPDATE', 'DELETE'].some(kw => sqlUpper.startsWith(kw));

    if (isWrite && !confirmWrite) {
      Modal.confirm({
        title: '确认执行写操作',
        icon: <WarningOutlined />,
        content: <div><p>即将执行写操作，此操作会直接修改数据：</p><pre style={{ maxHeight: 200, overflow: 'auto', background: '#f5f5f5', padding: 8, borderRadius: 4, fontSize: 12 }}>{sqlToExecute.substring(0, 500)}{sqlToExecute.length > 500 ? '...' : ''}</pre></div>,
        okText: '确认执行',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => executeSql(true),
      });
      return;
    }

    updateCurrentTab({ loading: true });
    try {
      const result = await executeQuery(sqlToExecute, confirmWrite);
      updateCurrentTab({ result, loading: false });
      message.success(`执行成功，${result.rowCount} 行受影响，耗时 ${result.elapsed}ms`);
    } catch (error: any) {
      updateCurrentTab({ loading: false });
      message.error(error.response?.data?.error || '执行失败');
    }
  };

  const formatDataType = (col: ColumnInfo) => {
    if (col.character_maximum_length) {
      return `${col.data_type}(${col.character_maximum_length})`;
    }
    return col.data_type;
  };

  const columnColumns = [
    { title: '列名', dataIndex: 'column_name', key: 'column_name', width: 180 },
    {
      title: '类型',
      key: 'type',
      width: 180,
      render: (_: any, record: ColumnInfo) => <Tag color="blue">{formatDataType(record)}</Tag>
    },
    {
      title: '可空',
      dataIndex: 'is_nullable',
      key: 'is_nullable',
      width: 80,
      render: (v: string) => v === 'YES' ? <Tag color="green">是</Tag> : <Tag color="red">否</Tag>
    },
    {
      title: '默认值',
      dataIndex: 'column_default',
      key: 'column_default',
      render: (v: string | null) => v ? <Text code>{v}</Text> : <Text type="secondary">-</Text>
    },
  ];

  const renderQueryResult = (result: QueryResult | null) => {
    if (!result) {
      return <Empty description="执行查询查看结果" />;
    }

    const columns = result.fields.map(field => ({
      title: field,
      dataIndex: field,
      key: field,
      ellipsis: true,
      render: (value: any) => {
        if (value === null) return <Text type="secondary">NULL</Text>;
        if (typeof value === 'object') return <Text code>{JSON.stringify(value)}</Text>;
        return String(value);
      }
    }));

    return (
      <div>
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">
            返回 {result.rowCount} 行，耗时 {result.elapsed}ms
          </Text>
        </div>
        <Table
          columns={columns}
          dataSource={result.rows.map((row, i) => ({ ...row, _key: i }))}
          rowKey="_key"
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        />
      </div>
    );
  };

  const renderStructurePanel = () => (
    tableDetail ? (
      <div className="structure-panel">
        <Card size="small" style={{ marginBottom: 16 }}>
          <Text>表名: <Text strong>{selectedTable}</Text></Text>
          <Text style={{ marginLeft: 24 }}>行数: <Text strong>{tableDetail.rowCount.toLocaleString()}</Text></Text>
        </Card>
        <Card title="列信息" size="small">
          <Table
            columns={columnColumns}
            dataSource={tableDetail.columns}
            rowKey="column_name"
            size="small"
            pagination={false}
          />
        </Card>
        {tableDetail.indexes.length > 0 && (
          <Card title="索引" size="small" style={{ marginTop: 16 }}>
            <Table
              columns={[
                { title: '索引名', dataIndex: 'indexname', key: 'indexname' },
                { title: '定义', dataIndex: 'indexdef', key: 'indexdef', ellipsis: true },
              ]}
              dataSource={tableDetail.indexes}
              rowKey="indexname"
              size="small"
              pagination={false}
            />
          </Card>
        )}
      </div>
    ) : (
      <Empty description="选择一个表查看结构" />
    )
  );

  // 渲染查询面板
  const renderQueryPanel = (tab: QueryTab) => (
    <div className="query-panel" ref={queryPanelRef}>
      <div
        className={`sql-editor ${isDraggingEditor ? 'dragging' : ''}`}
        style={{ height: editorHeight, position: 'relative' }}
        onMouseDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          if (e.clientY >= rect.bottom - 12) {
            handleEditorMouseDown();
            e.preventDefault();
          }
        }}
      >
        <TextArea
          ref={textAreaRef}
          value={tab.sql}
          onChange={handleSqlInput}
          onSelect={handleSelectChange}
          onKeyDown={handleKeyDown}
          placeholder="输入 SQL 语句（支持 SELECT/INSERT/UPDATE/DELETE），选中部分可单独执行...&#10;输入关键字自动提示，Tab/Enter选择，Esc关闭"
          style={{ fontFamily: 'monospace', height: 'calc(100% - 44px)', resize: 'none' }}
        />
        {showSuggestions && (
          <div
            ref={suggestionsRef}
            className="sql-suggestions"
            style={{
              position: 'absolute',
              left: cursorPosition.left,
              top: cursorPosition.top + 10,
              zIndex: 1000,
              background: '#fff',
              border: '1px solid #d9d9d9',
              borderRadius: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              maxHeight: 200,
              overflow: 'auto',
              minWidth: 150,
            }}
          >
            {suggestionList.map((suggestion, index) => (
              <div
                key={suggestion}
                className={`suggestion-item ${index === suggestionIndex ? 'active' : ''}`}
                onClick={() => selectSuggestion(suggestion)}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  backgroundColor: index === suggestionIndex ? '#e6f4ff' : 'transparent',
                  borderBottom: '1px solid #f0f0f0',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{suggestion}</span>
                <span style={{ fontSize: 10, color: '#999', marginLeft: 12 }}>
                  {SQL_KEYWORDS.includes(suggestion) ? '关键字' : tableNames.includes(suggestion) ? '表' : '函数'}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="sql-actions">
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
            }}
            onClick={() => executeSql()}
            loading={tab.loading}
          >
            {hasSelection ? '执行选中的查询' : '执行查询'}
          </Button>
          <Button icon={<FormatPainterOutlined />} onClick={formatSql}>格式化</Button>
          <Button onClick={() => updateCurrentTab({ sql: '' })}>清空</Button>
        </div>
      </div>
      <Card title="查询结果" size="small" style={{ marginTop: 16, flex: 1, overflow: 'auto' }}>
        {renderQueryResult(tab.result)}
      </Card>
    </div>
  );

  return (
    <div className="db-admin" ref={containerRef}>
      <div className="db-sidebar" style={{ width: sidebarWidth, flexShrink: 0 }}>
        <Card
          title="数据表"
          size="small"
          extra={<Button type="text" icon={<ReloadOutlined />} onClick={loadTables} loading={loading} />}
        >
          {loading && !tables.length ? (
            <Spin />
          ) : (
            <div className="table-list">
              {tables.map(table => (
                <div
                  key={table.table_name}
                  className={`table-item ${selectedTable === table.table_name ? 'active' : ''}`}
                  onClick={() => appendSelectQuery(table.table_name)}
                >
                  <TableOutlined style={{ marginRight: 8 }} />
                  <span className="table-name">{table.table_name}</span>
                  <Tag style={{ marginLeft: 'auto' }}>{table.column_count}</Tag>
                  <Button
                    type="text"
                    size="small"
                    className="table-structure-button"
                    title="查看表结构"
                    onClick={(e) => {
                      e.stopPropagation();
                      viewTableStructure(table.table_name);
                    }}
                  >
                    结构
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 可拖拽分割线 */}
      <div
        className={`resize-handle ${isDragging ? 'dragging' : ''}`}
        onMouseDown={handleMouseDown}
      />

      <div className="db-main">
        <Tabs
          activeKey={activeTabKey}
          onChange={(key) => {
            if (key === '__add__') return;
            setActiveTabKey(key);
            focusSqlEditor();
          }}
          items={[
            // 查询标签页
            ...queryTabs.map(tab => ({
              key: tab.key,
              label: (
                <span className="query-tab-title">
                  {tab.title}
                  <CloseOutlined
                    className="query-tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeQueryTab(tab.key);
                    }}
                  />
                </span>
              ),
              children: renderQueryPanel(tab),
            })),
            // 新增按钮标签页
            {
              key: '__add__',
              label: <PlusOutlined />,
              children: null,
            },
          ]}
          onTabClick={(key) => {
            if (key === '__add__') {
              addQueryTab();
            }
          }}
        />
      </div>
      <Modal
        title="表结构"
        open={structureModalOpen}
        onCancel={() => setStructureModalOpen(false)}
        footer={null}
        width={900}
      >
        {loading ? <Spin /> : renderStructurePanel()}
      </Modal>
    </div>
  );
};

export default DbAdmin;
