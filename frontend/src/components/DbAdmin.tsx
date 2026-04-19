import React, { useState, useEffect, useRef } from 'react';
import { Card, Table, Input, Button, message, Tabs, Spin, Tag, Typography, Empty } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { PlayCircleOutlined, ReloadOutlined, TableOutlined, FormatPainterOutlined, PlusOutlined, CloseOutlined } from '@ant-design/icons';
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
    } catch (error) {
      message.error('加载表列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadTableDetail = async (tableName: string) => {
    setLoading(true);
    try {
      const data = await getTableInfo(tableName);
      setTableDetail(data);
      setSelectedTable(tableName);
      // 更新当前标签页的 SQL
      updateCurrentTab({ sql: `SELECT * FROM "${tableName}" LIMIT 100;` });
    } catch (error) {
      message.error('加载表结构失败');
    } finally {
      setLoading(false);
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
    }
  };

  // 执行 SQL
  const executeSql = async () => {
    const currentTab = getCurrentTab();
    if (!currentTab) return;
    
    const sqlToExecute = selectedSqlRef.current || currentTab.sql;
    
    if (!sqlToExecute.trim()) {
      message.warning('请输入 SQL 语句');
      return;
    }
    
    updateCurrentTab({ loading: true });
    try {
      const result = await executeQuery(sqlToExecute);
      updateCurrentTab({ result, loading: false });
      message.success(`查询成功，返回 ${result.rowCount} 行，耗时 ${result.elapsed}ms`);
    } catch (error: any) {
      updateCurrentTab({ loading: false });
      message.error(error.response?.data?.error || '查询失败');
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

  // 渲染查询面板
  const renderQueryPanel = (tab: QueryTab) => (
    <div className="query-panel" ref={queryPanelRef}>
      <div 
        className={`sql-editor ${isDraggingEditor ? 'dragging' : ''}`}
        style={{ height: editorHeight }}
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
          onChange={(e) => updateCurrentTab({ sql: e.target.value })}
          onSelect={handleSelectChange}
          onBlur={handleSelectChange}
          placeholder="输入 SQL 查询语句（仅支持 SELECT/EXPLAIN/SHOW），选中部分可单独执行..."
          style={{ fontFamily: 'monospace', height: 'calc(100% - 44px)', resize: 'none' }}
        />
        <div className="sql-actions">
          <Button 
            type="primary" 
            icon={<PlayCircleOutlined />} 
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
            }}
            onClick={executeSql}
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
                  onClick={() => loadTableDetail(table.table_name)}
                >
                  <TableOutlined style={{ marginRight: 8 }} />
                  <span>{table.table_name}</span>
                  <Tag style={{ marginLeft: 'auto' }}>{table.column_count}</Tag>
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
          onChange={setActiveTabKey}
          items={[
            // 表结构标签页（固定在前面）
            {
              key: 'structure',
              label: '表结构',
              children: loading ? (
                <Spin />
              ) : tableDetail ? (
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
                <Empty description="从左侧选择一个表查看结构" />
              ),
            },
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
    </div>
  );
};

export default DbAdmin;
