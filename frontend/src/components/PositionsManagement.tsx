import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Input, Select, Space, Modal, Form, message, Popconfirm, Tag, Spin
} from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  getPositionList, createPosition, updatePosition, deletePosition
} from '../api';
import type { Position } from '../types';

const categoryOptions = [
  { value: '', label: '全部类别' },
  { value: '中央', label: '中央' },
  { value: '地方', label: '地方' },
  { value: '军事', label: '军事' },
  { value: '监察', label: '监察' },
  { value: '其他', label: '其他' },
];

const dynastyOptions = [
  { value: '', label: '全部朝代' },
  { value: '周', label: '周' },
  { value: '秦', label: '秦' },
  { value: '汉', label: '汉' },
  { value: '三国', label: '三国' },
  { value: '晋', label: '晋' },
  { value: '南北朝', label: '南北朝' },
  { value: '隋', label: '隋' },
  { value: '唐', label: '唐' },
  { value: '五代', label: '五代' },
];

const PositionsManagement: React.FC = () => {
  const [data, setData] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dynastyFilter, setDynastyFilter] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Position | null>(null);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getPositionList(page, pageSize, {
        name: searchQuery || undefined,
        category: categoryFilter || undefined,
        dynasty: dynastyFilter || undefined,
      });
      setData(result.positions);
      setTotal(result.total);
    } catch (error) {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchQuery, categoryFilter, dynastyFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Position) => {
    setEditingItem(record);
    form.setFieldsValue({
      ...record,
      aliases: record.aliases?.join('、') || '',
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deletePosition(id);
      message.success('删除成功');
      fetchData();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const aliases = values.aliases
        ? values.aliases.split(/[、,，]/).map((s: string) => s.trim()).filter(Boolean)
        : [];

      if (editingItem) {
        await updatePosition(editingItem.id, { ...values, aliases });
        message.success('更新成功');
      } else {
        await createPosition({ ...values, aliases });
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchData();
    } catch (error) {
      message.error(editingItem ? '更新失败' : '创建失败');
    }
  };

  const columns = [
    {
      title: '官职名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: '类别',
      dataIndex: 'category',
      key: 'category',
      width: 80,
      render: (text: string) => text ? <Tag color="purple">{text}</Tag> : '-',
    },
    {
      title: '品级',
      dataIndex: 'rank',
      key: 'rank',
      width: 80,
    },
    {
      title: '朝代',
      dataIndex: 'dynasty',
      key: 'dynasty',
      width: 80,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '别名',
      dataIndex: 'aliases',
      key: 'aliases',
      width: 150,
      render: (aliases: string[]) => 
        aliases && aliases.length > 0 ? aliases.slice(0, 2).join('、') + (aliases.length > 2 ? '...' : '') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: Position) => (
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
            title="确定删除此官职？"
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

  return (
    <div style={{ padding: 24, background: '#fff', height: '100%', overflow: 'auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Input
          placeholder="搜索名称或别名..."
          prefix={<SearchOutlined />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: 250 }}
          allowClear
        />
        <Select
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={categoryOptions}
          style={{ width: 120 }}
        />
        <Select
          value={dynastyFilter}
          onChange={setDynastyFilter}
          options={dynastyOptions}
          style={{ width: 120 }}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新增官职
        </Button>
        <span style={{ marginLeft: 'auto', color: '#8c8c8c' }}>
          共 {total} 条记录
        </span>
      </div>

      <Spin spinning={loading}>
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
            showTotal: (total) => `共 ${total} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          scroll={{ x: 800 }}
        />
      </Spin>

      <Modal
        title={editingItem ? '编辑官职' : '新增官职'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={500}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="官职名称"
            rules={[{ required: true, message: '请输入官职名称' }]}
          >
            <Input placeholder="如：丞相、太尉、刺史" />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="category" label="类别" style={{ width: 140 }}>
              <Select options={categoryOptions.filter(o => o.value)} placeholder="选择类别" />
            </Form.Item>
            <Form.Item name="rank" label="品级" style={{ width: 140 }}>
              <Input placeholder="如：正一品、从二品" />
            </Form.Item>
            <Form.Item name="dynasty" label="朝代" style={{ width: 140 }}>
              <Select options={dynastyOptions.filter(o => o.value)} placeholder="选择朝代" />
            </Form.Item>
          </Space>
          <Form.Item name="aliases" label="别名">
            <Input placeholder="多个别名用顿号分隔，如：宰相、相国" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="官职描述..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PositionsManagement;
