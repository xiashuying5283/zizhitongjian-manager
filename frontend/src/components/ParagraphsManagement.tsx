import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Input, Select, Space, Modal, Form, message, Popconfirm, Tag, Spin, Tabs, Collapse, Switch, Typography, InputNumber, Checkbox
} from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, UnorderedListOutlined, AppstoreOutlined } from '@ant-design/icons';
import {
  getParagraphList, getParagraphVolumes, createParagraph, updateParagraph, deleteParagraph
} from '../api';
import type { Paragraph, ParagraphGroup } from '../types';
import { getApiErrorMessage, hasFormValidationError } from '../utils/errors';

const { TextArea } = Input;
const { Panel } = Collapse;
const { Text } = Typography;

const ParagraphsManagement: React.FC = () => {
  const [data, setData] = useState<Paragraph[]>([]);
  const [groups, setGroups] = useState<ParagraphGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [volumeFilter, setVolumeFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'group'>('list');

  const [volumeOptions, setVolumeOptions] = useState<{ value: string; label: string }[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Paragraph | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    getParagraphVolumes()
      .then((volumes) => {
        setVolumeOptions([
          { value: '', label: '全部卷' },
          ...volumes.map((v) => ({ value: v, label: v })),
        ]);
      })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getParagraphList(page, pageSize, {
        keyword: searchKeyword || undefined,
        volume_name: volumeFilter || undefined,
        year_mark: yearFilter || undefined,
        grouped: viewMode === 'group' ? true : undefined,
      });

      if (viewMode === 'group') {
        const groupedResult = result as { groups: ParagraphGroup[]; total: number };
        setGroups(groupedResult.groups || []);
        setTotal(groupedResult.total || 0);
        setData([]);
      } else {
        const listResult = result as { paragraphs: Paragraph[]; total: number; page: number; limit: number; totalPages: number };
        setData(listResult.paragraphs);
        setTotal(listResult.total);
        setGroups([]);
      }
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchKeyword, volumeFilter, yearFilter, viewMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Paragraph) => {
    setEditingItem(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteParagraph(id);
      message.success('删除成功');
      fetchData();
    } catch {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (editingItem) {
        await updateParagraph(editingItem.id, values);
        message.success('更新成功');
      } else {
        await createParagraph(values);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchData();
    } catch (error: unknown) {
      if (!hasFormValidationError(error)) {
        message.error(getApiErrorMessage(error, editingItem ? '更新失败' : '创建失败'));
      }
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
    },
    {
      title: '卷名',
      dataIndex: 'volume_name',
      key: 'volume_name',
      width: 110,
      render: (text: string) => text ? <Tag color="blue">{text}</Tag> : '-',
    },
    {
      title: '年号',
      dataIndex: 'year_mark',
      key: 'year_mark',
      width: 100,
      render: (text: string) => text || '-',
    },
    {
      title: '帝王',
      dataIndex: 'emperor',
      key: 'emperor',
      width: 80,
      render: (text: string) => text || '-',
    },
    {
      title: '原文',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
    },
    {
      title: '注解',
      dataIndex: 'with_notes',
      key: 'with_notes',
      width: 150,
      ellipsis: true,
      render: (text: string) => text ? <Text type="secondary">{text.substring(0, 40)}{text.length > 40 ? '...' : ''}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: '译文',
      dataIndex: 'translation',
      key: 'translation',
      width: 150,
      ellipsis: true,
      render: (text: string) => text ? <Text type="secondary">{text.substring(0, 40)}{text.length > 40 ? '...' : ''}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: '臣光曰',
      dataIndex: 'is_chenguangyue',
      key: 'is_chenguangyue',
      width: 70,
      render: (v: boolean) => v ? <Tag color="orange">臣光曰</Tag> : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, record: Paragraph) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此段落？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderParagraphCard = (p: Paragraph) => (
    <div
      key={p.id}
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid #f0f0f0',
        cursor: 'pointer',
        transition: 'background 0.2s',
      }}
      onClick={() => handleEdit(p)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Space>
          <Text type="secondary">#{p.id}</Text>
          {p.year_mark && <Tag>{p.year_mark}</Tag>}
          {p.emperor && <Text type="secondary">{p.emperor}</Text>}
          {p.is_chenguangyue && <Tag color="orange">臣光曰</Tag>}
        </Space>
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); handleEdit(p); }} />
          <Popconfirm
            title="确定删除此段落？"
            onConfirm={(e) => { e?.stopPropagation(); handleDelete(p.id); }}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
        </Space>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.8 }}>
        {p.content}
      </div>
      {(p.with_notes || p.translation) && (
        <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {p.with_notes && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              注：{p.with_notes.length > 60 ? p.with_notes.substring(0, 60) + '...' : p.with_notes}
            </Text>
          )}
          {p.translation && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              译：{p.translation.length > 60 ? p.translation.substring(0, 60) + '...' : p.translation}
            </Text>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ padding: 24, background: '#fff', height: '100%', overflow: 'auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          placeholder="搜索原文/注解/译文..."
          prefix={<SearchOutlined />}
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          style={{ width: 260 }}
          allowClear
        />
        <Select
          value={volumeFilter}
          onChange={setVolumeFilter}
          options={volumeOptions}
          style={{ width: 160 }}
          placeholder="按卷名筛选"
          showSearch
        />
        <Input
          placeholder="年号筛选..."
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          style={{ width: 140 }}
          allowClear
        />
        <Space>
          <Switch
            checkedChildren={<AppstoreOutlined />}
            unCheckedChildren={<UnorderedListOutlined />}
            checked={viewMode === 'group'}
            onChange={(checked) => setViewMode(checked ? 'group' : 'list')}
          />
          <Text type="secondary">{viewMode === 'group' ? '按卷分组' : '列表'}</Text>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新增段落
        </Button>
        <span style={{ marginLeft: 'auto', color: '#8c8c8c' }}>
          共 {total} 条记录
        </span>
      </div>

      <Spin spinning={loading}>
        {viewMode === 'list' ? (
          <Table
            columns={columns}
            dataSource={data}
            rowKey="id"
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
            scroll={{ x: 1100 }}
          />
        ) : (
          <Collapse
            defaultActiveKey={groups.slice(0, 3).map((g) => g.volume)}
            style={{ background: '#fff' }}
          >
            {groups.map((group) => (
              <Panel
                header={
                  <Space>
                    <Tag color="blue">{group.volume}</Tag>
                    <Text>{group.count} 段</Text>
                  </Space>
                }
                key={group.volume}
              >
                {group.paragraphs.map(renderParagraphCard)}
              </Panel>
            ))}
          </Collapse>
        )}
      </Spin>

      <Modal
        title={editingItem ? '编辑段落' : '新增段落'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={860}
        destroyOnClose
        okText="保存"
      >
        <Form form={form} layout="vertical">
          {/* 基础信息行 */}
          <Space style={{ width: '100%' }} size="middle" wrap>
            <Form.Item name="volume_name" label="卷名" style={{ width: 160 }}>
              <Input placeholder="如：唐纪二十三" />
            </Form.Item>
            <Form.Item name="volume_number" label="卷号" style={{ width: 90 }}>
              <InputNumber placeholder="1-294" min={1} max={294} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="year_mark" label="年号" style={{ width: 140 }}>
              <Input placeholder="如：开元元年" />
            </Form.Item>
            <Form.Item name="emperor" label="帝王" style={{ width: 100 }}>
              <Input placeholder="如：玄宗" />
            </Form.Item>
            <Form.Item name="bc_year" label="公元年" style={{ width: 100 }}>
              <InputNumber placeholder="-722" style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="middle" wrap>
            <Form.Item name="event_index" label="事件序号" style={{ width: 100 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="paragraph_index" label="段落序号" style={{ width: 100 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="is_chenguangyue" label=" " valuePropName="checked" style={{ width: 120 }}>
              <Checkbox>臣光曰</Checkbox>
            </Form.Item>
          </Space>

          {/* 内容区：用 Tabs 分页 */}
          <Tabs
            items={[
              {
                key: 'content',
                label: '原文（简体）',
                children: (
                  <Form.Item name="content" rules={[{ required: true, message: '请输入原文' }]}>
                    <TextArea rows={5} placeholder="资治通鉴原文（简体）..." />
                  </Form.Item>
                ),
              },
              {
                key: 'content_traditional',
                label: '原文（繁体）',
                children: (
                  <Form.Item name="content_traditional">
                    <TextArea rows={5} placeholder="資治通鑑原文（繁體）..." />
                  </Form.Item>
                ),
              },
              {
                key: 'with_notes',
                label: '注解（简体）',
                children: (
                  <Form.Item name="with_notes">
                    <TextArea rows={5} placeholder="注解说明（简体）..." />
                  </Form.Item>
                ),
              },
              {
                key: 'with_notes_traditional',
                label: '注解（繁体）',
                children: (
                  <Form.Item name="with_notes_traditional">
                    <TextArea rows={5} placeholder="註解說明（繁體）..." />
                  </Form.Item>
                ),
              },
              {
                key: 'translation',
                label: '译文（简体）',
                children: (
                  <Form.Item name="translation">
                    <TextArea rows={5} placeholder="白话译文（简体）..." />
                  </Form.Item>
                ),
              },
              {
                key: 'translation_traditional',
                label: '译文（繁体）',
                children: (
                  <Form.Item name="translation_traditional">
                    <TextArea rows={5} placeholder="白話譯文（繁體）..." />
                  </Form.Item>
                ),
              },
            ]}
          />
        </Form>
      </Modal>
    </div>
  );
};

export default ParagraphsManagement;
