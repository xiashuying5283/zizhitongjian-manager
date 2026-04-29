import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Statistic, Typography, Divider, Spin } from 'antd';
import { UserOutlined, TeamOutlined, EnvironmentOutlined, ReadOutlined } from '@ant-design/icons';
import { getStats } from '../api';
import './Dashboard.css';

const { Title, Paragraph } = Typography;

interface Stats {
  characters: number;
  positions: number;
  geography: number;
  paragraphs: number;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ characters: 0, positions: 0, geography: 0, paragraphs: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await getStats();
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <Title level={3}>资治通鉴数据库管理后台</Title>
        <Paragraph type="secondary">
          《资治通鉴》是由北宋司马光主编的一部多卷本编年体史书，共294卷，历时19年完成。
          本系统旨在对书中人物、官职、地理等信息进行结构化管理。
        </Paragraph>
      </div>

      {loading ? (
        <div className="loading-container">
          <Spin size="large" />
        </div>
      ) : (
        <Row gutter={[24, 24]} className="stats-row">
          <Col xs={24} sm={12} lg={6}>
            <Card
              className="stat-card stat-card-primary"
              hoverable
              onClick={() => navigate('/characters')}
            >
              <Statistic
                title="人物数据"
                value={stats.characters}
                prefix={<UserOutlined />}
                valueStyle={{ color: '#1e3a5f' }}
              />
              <div className="stat-desc">历史人物信息库</div>
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card
              className="stat-card stat-card-success"
              hoverable
              onClick={() => navigate('/positions')}
            >
              <Statistic
                title="官职数据"
                value={stats.positions}
                prefix={<TeamOutlined />}
                valueStyle={{ color: '#059669' }}
              />
              <div className="stat-desc">历代官职体系</div>
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card
              className="stat-card stat-card-warning"
              hoverable
              onClick={() => navigate('/geography')}
            >
              <Statistic
                title="地理数据"
                value={stats.geography}
                prefix={<EnvironmentOutlined />}
                valueStyle={{ color: '#d97706' }}
              />
              <div className="stat-desc">历史地理信息</div>
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="stat-card stat-card-info">
              <Statistic
                title="段落数据"
                value={stats.paragraphs}
                prefix={<ReadOutlined />}
                valueStyle={{ color: '#7c3aed' }}
              />
              <div className="stat-desc">资治通鉴原文段落</div>
            </Card>
          </Col>
        </Row>
      )}

      <Divider />

      <div className="quick-actions">
        <Title level={4}>快速操作</Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8}>
            <Card
              className="action-card"
              hoverable
              onClick={() => navigate('/characters')}
            >
              <div className="action-icon" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a87)' }}>
                <UserOutlined />
              </div>
              <div className="action-content">
                <div className="action-title">人物管理</div>
                <div className="action-desc">管理历史人物信息、传记、人际关系</div>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card
              className="action-card"
              hoverable
              onClick={() => navigate('/positions')}
            >
              <div className="action-icon" style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}>
                <TeamOutlined />
              </div>
              <div className="action-content">
                <div className="action-title">官职管理</div>
                <div className="action-desc">管理历代官职体系、品级、职责</div>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card
              className="action-card"
              hoverable
              onClick={() => navigate('/geography')}
            >
              <div className="action-icon" style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)' }}>
                <EnvironmentOutlined />
              </div>
              <div className="action-content">
                <div className="action-title">地理管理</div>
                <div className="action-desc">管理历史地名、行政区划、地理变迁</div>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card
              className="action-card"
              hoverable
              onClick={() => navigate('/paragraphs')}
            >
              <div className="action-icon" style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)' }}>
                <ReadOutlined />
              </div>
              <div className="action-content">
                <div className="action-title">段落管理</div>
                <div className="action-desc">管理资治通鉴原文段落、校对与修订</div>
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default Dashboard;
