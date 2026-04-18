import React from 'react';
import { Empty, Typography } from 'antd';

const { Title, Paragraph } = Typography;

const GeographyManagement: React.FC = () => {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <Title level={4}>地理管理</Title>
      <Paragraph type="secondary">
        此模块用于管理资治通鉴中的历史地理信息
      </Paragraph>
      <Empty
        description="功能开发中..."
        style={{ marginTop: 48 }}
      />
    </div>
  );
};

export default GeographyManagement;
