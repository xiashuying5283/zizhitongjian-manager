import React from 'react';
import { Empty, Typography } from 'antd';

const { Title, Paragraph } = Typography;

const PositionsManagement: React.FC = () => {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <Title level={4}>官职管理</Title>
      <Paragraph type="secondary">
        此模块用于管理资治通鉴中的历代官职体系
      </Paragraph>
      <Empty
        description="功能开发中..."
        style={{ marginTop: 48 }}
      />
    </div>
  );
};

export default PositionsManagement;
