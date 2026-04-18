import React from 'react';
import { Menu } from 'antd';
import { UserOutlined, TeamOutlined, EnvironmentOutlined, HomeOutlined } from '@ant-design/icons';
import './Sidebar.css';

interface SidebarProps {
  currentModule: string;
  onModuleChange: (module: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentModule, onModuleChange }) => {
  const menuItems = [
    {
      key: '',
      icon: <HomeOutlined />,
      label: '控制台',
    },
    {
      key: 'characters',
      icon: <UserOutlined />,
      label: '人物管理',
    },
    {
      key: 'positions',
      icon: <TeamOutlined />,
      label: '官职管理',
    },
    {
      key: 'geography',
      icon: <EnvironmentOutlined />,
      label: '地理管理',
    },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">资</span>
        <span className="logo-text">资治通鉴数据后台</span>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[currentModule]}
        items={menuItems}
        onClick={({ key }) => onModuleChange(key)}
        className="sidebar-menu"
      />
      <div className="sidebar-footer">
        <span>© 2026 资治通鉴数据库</span>
      </div>
    </div>
  );
};

export default Sidebar;
