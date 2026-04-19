import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Typography, Button, Popconfirm, Modal, Form, Input, Select, message } from 'antd';
import { LogoutOutlined, PlusOutlined } from '@ant-design/icons';
import Sidebar from './Sidebar';
import { logout, createCharacter } from '../api';
import './MainLayout.css';

const { Header } = Layout;
const { Title, Text } = Typography;

const eraOptions = [
  { value: '', label: '请选择纪年' },
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
  { value: '待定', label: '待定' },
];

interface MainLayoutProps {
  username?: string;
}

const MainLayout: React.FC<MainLayoutProps> = ({ username }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  const currentModule = location.pathname.split('/')[1] || 'dashboard';

  const handleModuleChange = (module: string) => {
    navigate(`/${module}`);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      // ignore
    }
    window.location.reload();
  };

  // 监听打开新增人物事件
  useEffect(() => {
    const handleOpenCreate = (e: CustomEvent) => {
      if (e.detail?.name) {
        createForm.setFieldsValue({ name: e.detail.name });
      }
      setCreateModalVisible(true);
    };
    window.addEventListener('openCreateCharacter', handleOpenCreate as EventListener);
    return () => window.removeEventListener('openCreateCharacter', handleOpenCreate as EventListener);
  }, [createForm]);

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreating(true);
      await createCharacter({
        name: values.name,
        era: values.era,
        title: values.title,
        hometown: values.hometown,
        aliases: values.aliases
          ? values.aliases.split('、').map((a: string) => a.trim()).filter(Boolean)
          : [],
        summary: values.summary,
      });
      message.success('创建成功');
      setCreateModalVisible(false);
      createForm.resetFields();
      // 触发页面刷新
      window.dispatchEvent(new CustomEvent('characterCreated'));
    } catch (error: any) {
      message.error(error.response?.data?.error || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const getModuleTitle = () => {
    switch (currentModule) {
      case 'characters':
        return '人物管理';
      case 'positions':
        return '官职管理';
      case 'geography':
        return '地理管理';
      case 'dba':
        return '数据库管理';
      default:
        return '控制台';
    }
  };

  return (
    <Layout className="layout">
      <Sidebar
        currentModule={currentModule}
        onModuleChange={handleModuleChange}
      />
      <Layout className="main-layout">
        <Header className="header">
          <Title level={4} style={{ margin: 0 }}>{getModuleTitle()}</Title>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {currentModule === 'characters' && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
                新增人物
              </Button>
            )}
            <Text style={{ color: '#64748b' }}>{username}</Text>
            <Popconfirm
              title="确定要退出登录吗？"
              onConfirm={handleLogout}
              okText="确定"
              cancelText="取消"
            >
              <Button type="text" icon={<LogoutOutlined />} danger>
                退出
              </Button>
            </Popconfirm>
          </div>
        </Header>
        <Layout.Content className="content">
          <Outlet />
        </Layout.Content>
      </Layout>

      <Modal
        title="新增人物"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          createForm.resetFields();
        }}
        onOk={handleCreate}
        okText="创建"
        confirmLoading={creating}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item name="era" label="纪年">
            <Select options={eraOptions} />
          </Form.Item>
          <Form.Item name="title" label="主要职位">
            <Input placeholder="请输入主要职位" />
          </Form.Item>
          <Form.Item name="hometown" label="籍贯">
            <Input placeholder="请输入籍贯" />
          </Form.Item>
          <Form.Item name="aliases" label="别名（用顿号分隔）">
            <Input placeholder="如：字子房、留侯" />
          </Form.Item>
          <Form.Item name="summary" label="传记摘要">
            <Input.TextArea rows={4} placeholder="请输入传记摘要" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
};

export default MainLayout;
