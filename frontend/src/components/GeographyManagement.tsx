import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Input, Select, Space, Modal, Form, message, Popconfirm, Tag, Spin
} from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  getGeographyList, createGeography, updateGeography, deleteGeography
} from '../api';
import type { Geography } from '../types';

const categoryOptions = [
  { value: '', label: '全部类型' },
  { value: '州', label: '州' },
  { value: '郡', label: '郡' },
  { value: '县', label: '县' },
  { value: '国', label: '国' },
  { value: '城', label: '城' },
  { value: '关', label: '关' },
  { value: '山', label: '山' },
  { value: '水', label: '水' },
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

const GeographyManagement: React.FC = () => {
  const [data, setData] = useState<Geography[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dynastyFilter, setDynastyFilter] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Geography | null>(null);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getGeographyList(page, pageSize, {
        name: searchQuery || undefined,
        category: categoryFilter || undefined,
        dynasty: dynastyFilter || undefined,
      });
      setData(result.geography);
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

  const handleEdit = (record: Geography) => {
    setEditingItem(record);
    form.setFieldsValue({
      ...record,
      aliases: record.aliases?.join('、') || '',
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteGeography(id);
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
        await updateGeography(editingItem.id, { ...values, aliases });
        message.success('更新成功');
      } else {
        await createGeography({ ...values, aliases });
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
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: '类别',
      dataIndex: 'category',
      key: 'category',
      width: 80,
      render: (text: string) => text ? <Tag color="blue">{text}</Tag> : '-',
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 80,
    },
    {
      title: '朝代',
      dataIndex: 'dynasty',
      key: 'dynasty',
      width: 80,
    },
    {
      title: '位置',
      dataIndex: 'location',
      key: 'location',
      ellipsis: true,
    },
    {
      title: '坐标',
      key: 'coords',
      width: 140,
      render: (_: any, record: Geography) => 
        record.lng && record.lat ? `${record.lng}, ${record.lat}` : '-',
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: Geography) => (
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
            title="确定删除此地理？"
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
          新增地理
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
          scroll={{ x: 1000 }}
        />
      </Spin>

      <Modal
        title={editingItem ? '编辑地理' : '新增地理'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：长安、洛阳" />
          </Form.Item>
          <Form.Item name="slug" label="Slug（可选，自动生成）">
            <Input placeholder="URL标识，如：chang-an" />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="category" label="类别" style={{ width: 160 }}>
              <Select options={categoryOptions.filter(o => o.value)} placeholder="选择类别" />
            </Form.Item>
            <Form.Item name="level" label="级别" style={{ width: 160 }}>
              <Input placeholder="如：京、都、府" />
            </Form.Item>
            <Form.Item name="dynasty" label="朝代" style={{ width: 160 }}>
              <Select options={dynastyOptions.filter(o => o.value)} placeholder="选择朝代" />
            </Form.Item>
          </Space>
          <Form.Item name="location" label="位置描述">
            <Input placeholder="如：今陕西省西安市" />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="lng" label="经度" style={{ width: 200 }}>
              <Input placeholder="如：108.9402" />
            </Form.Item>
            <Form.Item name="lat" label="纬度" style={{ width: 200 }}>
              <Input placeholder="如：34.3416" />
            </Form.Item>
          </Space>
          <Form.Item name="aliases" label="别名">
            <Input placeholder="多个别名用顿号分隔，如：镐京、西京" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="地理描述..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default GeographyManagement;
