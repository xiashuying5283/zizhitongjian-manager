import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Button, Switch, Empty, Alert, message, Tooltip, Popconfirm, Typography, Progress } from 'antd';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import {
  ReloadOutlined, DatabaseOutlined, ClockCircleOutlined, DashboardOutlined,
  WarningOutlined, CloudServerOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import { getDbMonitorInfo, getDbInfo, vacuumTable } from '../api';
import './DatabaseMonitor.css';

const { Text } = Typography;
const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'];
const HISTORY_STORAGE_KEY = 'database-monitor-history-v1';
const REFRESH_INTERVAL_MS = 10000;
const HISTORY_WINDOW_MS = 60 * 60 * 1000;
const MAX_HISTORY_POINTS = HISTORY_WINDOW_MS / REFRESH_INTERVAL_MS;

const formatPieLabel = ({ name, percent }: { name?: string; percent?: number }) =>
  `${name ?? ''} ${((percent ?? 0) * 100).toFixed(1)}%`;

const formatPercentTooltip = (value: unknown) => `${Number(value ?? 0).toFixed(2)}%`;
const formatChartTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const getIoHealth = (hitRatio: number, readBlocks: number) => {
  if (readBlocks >= 10000 && hitRatio < 90) {
    return { color: '#f5222d', weight: 'bold' as const, level: 'danger' };
  }
  if (readBlocks >= 1000 && hitRatio < 95) {
    return { color: '#faad14', weight: 'bold' as const, level: 'warning' };
  }
  return { color: '#52c41a', weight: 'normal' as const, level: 'normal' };
};

const CONFIG_LABELS: Record<string, string> = {
  max_connections: '最大连接数',
  shared_buffers: '共享缓冲区',
  work_mem: '单次操作内存',
  maintenance_work_mem: '维护操作内存',
  effective_cache_size: '预计可用缓存',
  wal_buffers: 'WAL 缓冲区',
};

const CONFIG_DESCRIPTIONS: Record<string, string> = {
  max_connections: '允许同时连接到数据库的最大客户端数量。连接数越高，预留资源越多。',
  shared_buffers: 'PostgreSQL 用于缓存数据页的内存区域。表和索引命中率偏低时，可以重点关注这个值。',
  work_mem: '每个排序、哈希聚合等查询操作可使用的内存。复杂查询较多时过小会产生临时文件，过大则可能放大并发内存压力。',
  maintenance_work_mem: 'VACUUM、CREATE INDEX、ALTER TABLE 等维护操作可使用的内存。调大可加快维护任务，但会增加维护期间内存占用。',
  effective_cache_size: '优化器估算系统可用于缓存数据的总量，包含操作系统缓存。它不实际分配内存，只影响查询计划选择。',
  wal_buffers: '写入 WAL 日志前使用的缓冲区大小。写入量较高时，合适的缓冲区有助于减少 WAL 写入压力。',
};

interface MonitorData {
  pool: {
    total: number;
    idle: number;
    waiting: number;
  };
  database: {
    name: string;
    size: string;
    size_bytes: number;
  };
  connections: {
    total_connections: number;
    active_connections: number;
    idle_connections: number;
  };
  tables: Array<{
    schemaname: string;
    table_name: string;
    live_rows: number;
    dead_rows: number;
    last_vacuum: string | null;
    last_autovacuum: string | null;
    last_analyze: string | null;
    total_size: string;
  }>;
  indexes: Array<{
    schemaname: string;
    table_name: string;
    index_name: string;
    index_scans: number;
    tuples_read: number;
    tuples_fetched: number;
  }>;
  dbStat: {
    numbackends: number;
    xact_commit: number;
    xact_rollback: number;
    blks_read: number;
    blks_hit: number;
    cache_hit_ratio: number;
    tup_returned: number;
    tup_fetched: number;
    tup_inserted: number;
    tup_updated: number;
    tup_deleted: number;
    conflicts: number;
    deadlocks: number;
  } | null;
  tableIo: Array<{
    schemaname: string;
    table_name: string;
    heap_blks_read: number;
    heap_blks_hit: number;
    heap_hit_ratio: number;
    idx_blks_read: number;
    idx_blks_hit: number;
    idx_hit_ratio: number;
    toast_blks_read: number;
    toast_blks_hit: number;
    tidx_blks_read: number;
    tidx_blks_hit: number;
  }>;
  bgwriter: {
    checkpoints_timed: number;
    checkpoints_req: number;
    req_checkpoint_ratio: number;
    buffers_clean: number;
    buffers_backend: number;
    buffers_alloc: number;
    buffers_checkpoint: number;
  } | null;
  timestamp: string;
}

interface DbInfo {
  version: string;
  config: Array<{
    name: string;
    setting: string;
    unit: string | null;
    short_desc: string;
  }>;
}

// 历史数据点
interface HistoryPoint {
  time: string;
  timestamp: number;
  connections: number;
  activeConnections: number;
  idleConnections: number;
  databaseSize: number;
  cacheHitRatio: number;
  tps: number;
  rollbackRate: number;
}

const DatabaseMonitor: React.FC = () => {
  const [monitorData, setMonitorData] = useState<MonitorData | null>(null);
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [historyData, setHistoryData] = useState<HistoryPoint[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!saved) return [];
      const cutoff = Date.now() - HISTORY_WINDOW_MS;
      return (JSON.parse(saved) as HistoryPoint[])
        .filter((point) => typeof point.timestamp === 'number' && point.timestamp >= cutoff)
        .slice(-MAX_HISTORY_POINTS);
    } catch {
      return [];
    }
  });
  const [error, setError] = useState<string | null>(null);

  // 上一次的事务提交数（用于计算 TPS）
  const [prevXactCommit, setPrevXactCommit] = useState<number | null>(null);
  const [prevTimestamp, setPrevTimestamp] = useState<number | null>(null);

  // 加载监控数据
  const loadData = async () => {
    try {
      setError(null);
      const [monitor, info] = await Promise.all([
        getDbMonitorInfo(),
        getDbInfo()
      ]);
      setMonitorData(monitor);
      setDbInfo(info);

      // 更新历史数据
      const now = new Date();
      const nowMs = now.getTime();
      const nowStr = now.toLocaleTimeString();

      // 计算 TPS（每秒事务数）
      let tps = 0;
      if (prevXactCommit !== null && prevTimestamp !== null && monitor.dbStat) {
        const xactDelta = monitor.dbStat.xact_commit - prevXactCommit;
        const timeDelta = (nowMs - prevTimestamp) / 1000;
        if (timeDelta > 0 && xactDelta >= 0) {
          tps = Math.round(xactDelta / timeDelta * 10) / 10;
        }
      }
      if (monitor.dbStat) {
        setPrevXactCommit(monitor.dbStat.xact_commit);
        setPrevTimestamp(nowMs);
      }

      // 回滚率
      const rollbackRate = monitor.dbStat && (monitor.dbStat.xact_commit + monitor.dbStat.xact_rollback) > 0
        ? (monitor.dbStat.xact_rollback / (monitor.dbStat.xact_commit + monitor.dbStat.xact_rollback)) * 100
        : 0;

      setHistoryData(prev => {
        const newPoint: HistoryPoint = {
          time: nowStr,
          timestamp: nowMs,
          connections: monitor.connections?.total_connections || 0,
          activeConnections: monitor.connections?.active_connections || 0,
          idleConnections: monitor.connections?.idle_connections || 0,
          databaseSize: monitor.database?.size_bytes || 0,
          cacheHitRatio: monitor.dbStat?.cache_hit_ratio || 0,
          tps,
          rollbackRate
        };
        const cutoff = nowMs - HISTORY_WINDOW_MS;
        const newData = [...prev, newPoint]
          .filter((point) => point.timestamp >= cutoff)
          .slice(-MAX_HISTORY_POINTS);
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newData));
        return newData;
      });
    } catch (err: any) {
      setError(err.message || '加载监控数据失败');
    }
  };

  // 初始加载
  useEffect(() => {
    loadData();
  }, []);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      loadData();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoRefresh]);

  // 刷新按钮
  const handleRefresh = () => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  };

  // 格式化字节数
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 连接数趋势图数据
  const connectionChartData = historyData.map(d => ({
    timestamp: d.timestamp,
    总连接: d.connections,
    活跃连接: d.activeConnections,
    空闲连接: d.idleConnections
  }));

  // 数据库大小趋势
  const sizeChartData = historyData.map(d => ({
    timestamp: d.timestamp,
    大小: d.databaseSize / (1024 * 1024) // MB
  }));

  // 缓存命中率趋势
  const cacheHitChartData = historyData.map(d => ({
    timestamp: d.timestamp,
    命中率: d.cacheHitRatio
  }));

  // TPS 趋势
  const tpsChartData = historyData.map(d => ({
    timestamp: d.timestamp,
    TPS: d.tps,
    累计回滚率: d.rollbackRate
  }));

  const chartEndTime = historyData.length > 0
    ? historyData[historyData.length - 1].timestamp
    : Date.now();
  const chartTimeDomain: [number, number] = [chartEndTime - HISTORY_WINDOW_MS, chartEndTime];
  const chartXAxisProps = {
    dataKey: 'timestamp',
    type: 'number' as const,
    domain: chartTimeDomain,
    tickFormatter: formatChartTime,
    tick: { fontSize: 10 },
  };

  // 表大小分布（Top 10）
  const tableSizeData = monitorData?.tables?.slice(0, 10).map(t => ({
    name: t.table_name,
    行数: t.live_rows,
    死行: t.dead_rows
  })) || [];

  // 索引使用情况（Top 10）
  const indexUsageData = monitorData?.indexes?.slice(0, 10).map(i => ({
    name: i.index_name.substring(0, 20),
    扫描次数: i.index_scans
  })) || [];

  const renderOverviewCards = () => {
    const cacheHitRatio = monitorData?.dbStat?.cache_hit_ratio ?? null;
    const tps = historyData.length > 0 ? historyData[historyData.length - 1].tps : 0;
    const deadlocks = monitorData?.dbStat?.deadlocks ?? 0;

    return (
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8} xl={4}>
          <Card size="small" className="overview-card">
            <Statistic
              title="数据库版本"
              value={dbInfo?.version?.split(' ')[0] || '-'}
              prefix={<DatabaseOutlined />}
              valueStyle={{ fontSize: 13 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} xl={4}>
          <Card size="small" className="overview-card">
            <Statistic
              title="数据库大小"
              value={monitorData?.database?.size || '-'}
              prefix={<CloudServerOutlined />}
              valueStyle={{ fontSize: 13 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} xl={4}>
          <Card size="small" className="overview-card">
            <Statistic
              title="总连接数"
              value={monitorData?.connections?.total_connections || 0}
              prefix={<DashboardOutlined />}
              suffix={`/ ${dbInfo?.config?.find(c => c.name === 'max_connections')?.setting || '?'}`}
              valueStyle={{ fontSize: 13, color: (monitorData?.connections?.total_connections || 0) > 80 ? '#f5222d' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} xl={4}>
          <Card size="small" className="overview-card">
            <Statistic
              title="缓存命中率"
              value={cacheHitRatio !== null ? cacheHitRatio : '-'}
              suffix={cacheHitRatio !== null ? '%' : ''}
              prefix={<DatabaseOutlined />}
              valueStyle={{ fontSize: 13, color: cacheHitRatio !== null && cacheHitRatio < 99 ? '#f5222d' : '#52c41a' }}
            />
            {cacheHitRatio !== null && (
              <Progress
                percent={cacheHitRatio}
                size="small"
                strokeColor={cacheHitRatio >= 99 ? '#52c41a' : cacheHitRatio >= 95 ? '#faad14' : '#f5222d'}
                showInfo={false}
                style={{ marginTop: 4 }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} xl={4}>
          <Card size="small" className="overview-card">
            <Statistic
              title="TPS (事务/秒)"
              value={tps}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ fontSize: 13 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} xl={4}>
          <Card size="small" className="overview-card">
            <Statistic
              title="死锁"
              value={deadlocks}
              prefix={<WarningOutlined />}
              valueStyle={{ fontSize: 13, color: deadlocks > 0 ? '#f5222d' : '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>
    );
  };

  // 数据库级统计卡片
  const renderDbStatCard = () => {
    const stat = monitorData?.dbStat;
    if (!stat) {
      return (
        <Card size="small" title="数据库事务与 I/O 统计">
          <Empty description="当前数据库不支持 pg_stat_database 查询" />
        </Card>
      );
    }

    const totalTx = stat.xact_commit + stat.xact_rollback;
    const rollbackRate = totalTx > 0 ? (stat.xact_rollback / totalTx * 100) : 0;
    const totalBlocks = stat.blks_read + stat.blks_hit;
    const diskReadRatio = totalBlocks > 0 ? (stat.blks_read / totalBlocks * 100) : 0;
    const totalTuples = stat.tup_inserted + stat.tup_updated + stat.tup_deleted;

    // 堆块命中 vs 磁盘读取饼图数据
    const blockPieData = totalBlocks > 0 ? [
      { name: '缓存命中', value: stat.blks_hit, color: COLORS[1] },
      { name: '磁盘读取', value: stat.blks_read, color: COLORS[3] },
    ] : [];

    // DML 操作分布饼图
    const dmlPieData = totalTuples > 0 ? [
      { name: 'INSERT', value: stat.tup_inserted, color: COLORS[0] },
      { name: 'UPDATE', value: stat.tup_updated, color: COLORS[1] },
      { name: 'DELETE', value: stat.tup_deleted, color: COLORS[3] },
    ] : [];

    return (
      <Card size="small" title="数据库事务与 I/O 统计">
        <Row gutter={[16, 12]}>
          <Col span={12}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>缓冲区命中 vs 磁盘读取</Text>
            </div>
            {blockPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={blockPieData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" label={formatPieLabel} labelLine={false} style={{ fontSize: 10 }}>
                    {blockPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Col>
          <Col span={12}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>DML 操作分布</Text>
            </div>
            {dmlPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={dmlPieData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" label={formatPieLabel} labelLine={false} style={{ fontSize: 10 }}>
                    {dmlPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Col>
        </Row>
        <Row gutter={[8, 8]} style={{ marginTop: 12 }}>
          <Col span={8}>
            <Statistic title="提交事务" value={stat.xact_commit.toLocaleString()} valueStyle={{ fontSize: 12 }} />
          </Col>
          <Col span={8}>
            <Statistic
              title="累计回滚率"
              value={rollbackRate.toFixed(2)}
              suffix="%"
              valueStyle={{ fontSize: 12, color: rollbackRate > 1 ? '#f5222d' : '#52c41a' }}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="磁盘读取占比"
              value={diskReadRatio.toFixed(2)}
              suffix="%"
              valueStyle={{ fontSize: 12, color: diskReadRatio > 5 ? '#faad14' : '#52c41a' }}
            />
          </Col>
        </Row>
      </Card>
    );
  };

  // 表级 I/O 统计
  const renderTableIoStats = () => {
    const ioData = monitorData?.tableIo || [];
    if (ioData.length === 0) return null;

    const columns = [
      {
        title: '表名',
        dataIndex: 'table_name',
        width: 130,
        render: (name: string) => <Text code style={{ fontSize: 12 }}>{name}</Text>
      },
      {
        title: '堆块命中率',
        dataIndex: 'heap_hit_ratio',
        width: 110,
        render: (v: number, record: { heap_blks_read: number }) => {
          const health = getIoHealth(v, record.heap_blks_read);
          return (
            <span style={{ color: health.color, fontWeight: health.weight }}>
              {v.toFixed(1)}%
            </span>
          );
        },
        sorter: (a: any, b: any) => a.heap_hit_ratio - b.heap_hit_ratio,
      },
      {
        title: '堆块磁盘读',
        dataIndex: 'heap_blks_read',
        width: 100,
        render: (v: number) => (
          <span style={{ color: v > 1000 ? '#f5222d' : v > 100 ? '#faad14' : '#52c41a' }}>
            {v.toLocaleString()}
          </span>
        ),
        sorter: (a: any, b: any) => a.heap_blks_read - b.heap_blks_read,
      },
      {
        title: '堆块缓存读',
        dataIndex: 'heap_blks_hit',
        width: 100,
        render: (v: number) => v.toLocaleString(),
        sorter: (a: any, b: any) => a.heap_blks_hit - b.heap_blks_hit,
      },
      {
        title: '索引命中率',
        dataIndex: 'idx_hit_ratio',
        width: 110,
        render: (v: number, record: { idx_blks_read: number }) => {
          const health = getIoHealth(v, record.idx_blks_read);
          return (
            <span style={{ color: health.color, fontWeight: health.weight }}>
              {v.toFixed(1)}%
            </span>
          );
        },
        sorter: (a: any, b: any) => a.idx_hit_ratio - b.idx_hit_ratio,
      },
      {
        title: '索引磁盘读',
        dataIndex: 'idx_blks_read',
        width: 100,
        render: (v: number) => (
          <span style={{ color: v > 1000 ? '#f5222d' : v > 100 ? '#faad14' : '#52c41a' }}>
            {v.toLocaleString()}
          </span>
        ),
        sorter: (a: any, b: any) => a.idx_blks_read - b.idx_blks_read,
      },
      {
        title: '索引缓存读',
        dataIndex: 'idx_blks_hit',
        width: 100,
        render: (v: number) => v.toLocaleString(),
      },
    ];

    return (
      <Card
        size="small"
        title={
          <span>
            <CloudServerOutlined style={{ marginRight: 8 }} />
            表级 I/O 统计（缓冲区命中 vs 磁盘读取）
          </span>
        }
        extra={
          <Tooltip title="命中率会结合磁盘读块数量判断：读块很少时不告警；读块超过 1000 且命中率低于 95% 才提示关注；超过 10000 且低于 90% 才判为严重。">
            <Tag color="blue" style={{ cursor: 'help' }}>说明</Tag>
          </Tooltip>
        }
        loading={loading}
        style={{ marginBottom: 16 }}
      >
        <Table
          columns={columns}
          dataSource={ioData}
          rowKey="table_name"
          size="small"
          pagination={{ pageSize: 8, showSizeChanger: false }}
          scroll={{ x: 750 }}
          rowClassName={(record) => {
            const heapHealth = getIoHealth(record.heap_hit_ratio, record.heap_blks_read);
            const indexHealth = getIoHealth(record.idx_hit_ratio, record.idx_blks_read);
            return heapHealth.level !== 'normal' || indexHealth.level !== 'normal' ? 'row-needs-vacuum' : '';
          }}
        />
      </Card>
    );
  };

  // 后台写入器统计
  const renderBgwriterStats = () => {
    const bg = monitorData?.bgwriter;
    if (!bg) return null;

    const totalCheckpoints = bg.checkpoints_timed + bg.checkpoints_req;
    const totalBuffers = bg.buffers_checkpoint + bg.buffers_clean + bg.buffers_backend;

    const checkpointPieData = totalCheckpoints > 0 ? [
      { name: '定时检查点', value: bg.checkpoints_timed, color: COLORS[0] },
      { name: '请求检查点', value: bg.checkpoints_req, color: COLORS[3] },
    ] : [];

    const bufferPieData = totalBuffers > 0 ? [
      { name: '检查点写入', value: bg.buffers_checkpoint, color: COLORS[0] },
      { name: '后台写入', value: bg.buffers_clean, color: COLORS[1] },
      { name: '后端写入', value: bg.buffers_backend, color: COLORS[3] },
    ] : [];

    return (
      <Card
        size="small"
        title="后台写入器统计（Background Writer）"
        loading={loading}
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[16, 12]}>
          <Col span={12}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>检查点分布</Text>
            </div>
            {checkpointPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={checkpointPieData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" label={formatPieLabel} labelLine={false} style={{ fontSize: 10 }}>
                    {checkpointPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
            <div style={{ textAlign: 'center' }}>
              <Tooltip title="请求检查点占比过高说明 checkpoint 间隔过短或写入量过大">
                <Tag color={bg.req_checkpoint_ratio > 50 ? 'warning' : 'success'}>
                  请求检查点占比: {bg.req_checkpoint_ratio?.toFixed(1) ?? '-'}%
                </Tag>
              </Tooltip>
            </div>
          </Col>
          <Col span={12}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>缓冲区写入来源</Text>
            </div>
            {bufferPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={bufferPieData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" label={formatPieLabel} labelLine={false} style={{ fontSize: 10 }}>
                    {bufferPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
            <div style={{ textAlign: 'center' }}>
              <Tooltip title="后端写入占比高说明 bgwriter 清理不够及时，后端进程自己被迫写盘">
                <Tag color={totalBuffers > 0 && (bg.buffers_backend / totalBuffers * 100) > 50 ? 'warning' : 'success'}>
                  总缓冲区分配: {bg.buffers_alloc?.toLocaleString() ?? '-'}
                </Tag>
              </Tooltip>
            </div>
          </Col>
        </Row>
      </Card>
    );
  };

  const renderCharts = () => (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={12}>
          <Card
            size="small"
            title="连接数趋势（最近1小时）"
            loading={loading}
          >
            {connectionChartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={connectionChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis {...chartXAxisProps} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RechartsTooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="总连接" stroke={COLORS[0]} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="活跃连接" stroke={COLORS[1]} dot={false} />
                  <Line type="monotone" dataKey="空闲连接" stroke={COLORS[2]} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description="数据采集中..." />
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card
            size="small"
            title="缓存命中率趋势（最近1小时）"
            extra={<Tag color={monitorData?.dbStat?.cache_hit_ratio && monitorData.dbStat.cache_hit_ratio >= 99 ? 'success' : 'warning'}>
              当前: {monitorData?.dbStat?.cache_hit_ratio?.toFixed(2) ?? '-'}%
            </Tag>}
            loading={loading}
          >
            {cacheHitChartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={cacheHitChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis {...chartXAxisProps} />
                  <YAxis domain={[95, 100]} tick={{ fontSize: 10 }} />
                  <RechartsTooltip formatter={formatPercentTooltip} />
                  <Area type="monotone" dataKey="命中率" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.3} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description="数据采集中..." />
              </div>
            )}
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={12}>
          <Card
            size="small"
            title="TPS 趋势（最近1小时）"
            loading={loading}
          >
            {tpsChartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={tpsChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis {...chartXAxisProps} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RechartsTooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="TPS" stroke={COLORS[0]} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="累计回滚率" stroke={COLORS[3]} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description="需等待两次采样..." />
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card
            size="small"
            title="数据库大小趋势（最近1小时）"
            loading={loading}
          >
            {sizeChartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={sizeChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis {...chartXAxisProps} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RechartsTooltip formatter={(v) => formatBytes((v as number) * 1024 * 1024)} />
                  <Area type="monotone" dataKey="大小" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description="数据采集中..." />
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </>
  );

  const renderTableStats = () => (
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      <Col span={12}>
        <Card
          size="small"
          title="表数据分布（Top 10）"
          loading={loading}
        >
          {tableSizeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={tableSizeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                <RechartsTooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="行数" fill={COLORS[0]} />
                <Bar dataKey="死行" fill={COLORS[3]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Empty />
            </div>
          )}
        </Card>
      </Col>
      <Col span={12}>
        <Card
          size="small"
          title="索引使用情况（Top 10）"
          loading={loading}
        >
          {indexUsageData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={indexUsageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 10 }} />
                <RechartsTooltip />
                <Bar dataKey="扫描次数" fill={COLORS[4]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Empty />
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );

  // VACUUM 操作
  const [vacuumLoading, setVacuumLoading] = useState<string | null>(null);

  const handleVacuum = async (tableName: string, mode: 'vacuum' | 'analyze' | 'vacuum_full') => {
    setVacuumLoading(tableName);
    try {
      const result = await vacuumTable(tableName, mode);
      message.success(result.message || `${tableName} ${mode} 操作成功`);
      // 刷新监控数据
      await loadData();
    } catch (err: any) {
      message.error(err?.response?.data?.error || `${mode} 操作失败`);
    } finally {
      setVacuumLoading(null);
    }
  };

  // 表健康度/碎片率
  const renderTableHealth = () => {
    const healthData = monitorData?.tables?.slice(0, 15).map(t => {
      const liveRows = t.live_rows || 0;
      const deadRows = t.dead_rows || 0;
      const totalRows = liveRows + deadRows;
      const fragmentation = totalRows > 0 ? (deadRows / totalRows) * 100 : 0;

      return {
        name: t.table_name,
        liveRows,
        deadRows,
        totalSize: t.total_size,
        fragmentation,
        lastVacuum: t.last_vacuum || t.last_autovacuum,
        lastAnalyze: t.last_analyze,
        needsVacuum: deadRows > 1000 || fragmentation > 20
      };
    }) || [];

    const columns = [
      {
        title: '表名',
        dataIndex: 'name',
        width: 150,
        render: (name: string) => <Text code style={{ fontSize: 12 }}>{name}</Text>
      },
      {
        title: '活跃行数',
        dataIndex: 'liveRows',
        width: 100,
        render: (v: number) => v.toLocaleString()
      },
      {
        title: '死行数',
        dataIndex: 'deadRows',
        width: 100,
        render: (v: number) => (
          <span style={{ color: v > 1000 ? '#f5222d' : v > 100 ? '#faad14' : '#52c41a', fontWeight: v > 1000 ? 'bold' : 'normal' }}>
            {v.toLocaleString()}
          </span>
        )
      },
      {
        title: '碎片率',
        dataIndex: 'fragmentation',
        width: 100,
        render: (v: number) => {
          let color = '#52c41a';
          let bg = '#f6ffed';
          if (v > 50) { color = '#f5222d'; bg = '#fff1f0'; }
          else if (v > 20) { color = '#faad14'; bg = '#fffbe6'; }
          else if (v > 5) { color = '#1890ff'; bg = '#e6f7ff'; }
          return (
            <Tag style={{ color, background: bg, borderColor: color, fontWeight: v > 20 ? 'bold' : 'normal', minWidth: 60, textAlign: 'center' }}>
              {v.toFixed(1)}%
            </Tag>
          );
        }
      },
      {
        title: '磁盘大小',
        dataIndex: 'totalSize',
        width: 100,
      },
      {
        title: '最后 VACUUM',
        dataIndex: 'lastVacuum',
        width: 130,
        render: (v: string | null) => v ? (
          <Tooltip title={new Date(v).toLocaleString()}>
            {new Date(v).toLocaleDateString()}
          </Tooltip>
        ) : <Tag color="warning">未清理</Tag>
      },
      {
        title: '最后 ANALYZE',
        dataIndex: 'lastAnalyze',
        width: 130,
        render: (v: string | null) => v ? (
          <Tooltip title={new Date(v).toLocaleString()}>
            {new Date(v).toLocaleDateString()}
          </Tooltip>
        ) : <Tag color="default">未分析</Tag>
      },
      {
        title: '健康状态',
        width: 90,
        render: (_: any, record: { needsVacuum: boolean; deadRows: number; fragmentation: number }) => (
          record.needsVacuum ? (
            <Tag color={record.deadRows > 10000 || record.fragmentation > 50 ? 'error' : 'warning'}>
              {record.deadRows > 10000 || record.fragmentation > 50 ? '需优化' : '轻微碎片'}
            </Tag>
          ) : (
            <Tag color="success">健康</Tag>
          )
        )
      },
      {
        title: '操作',
        width: 200,
        fixed: 'right' as const,
        render: (_: any, record: { name: string; needsVacuum: boolean; fragmentation: number; deadRows: number }) => {
          const showVacuumFull = record.fragmentation > 50 || record.deadRows > 10000;

          return (
            <div style={{ display: 'flex', gap: 4 }}>
              <Popconfirm
                title={`确认对 ${record.name} 执行 VACUUM？`}
                description="回收死行占用的空间，不锁表"
                onConfirm={() => handleVacuum(record.name, 'vacuum')}
                okText="确认"
                cancelText="取消"
              >
                <Button
                  size="small"
                  type={record.needsVacuum ? 'primary' : 'default'}
                  danger={record.fragmentation > 50}
                  icon={<ThunderboltOutlined />}
                  loading={vacuumLoading === record.name}
                  disabled={!!vacuumLoading}
                >
                  VACUUM
                </Button>
              </Popconfirm>
              <Tooltip title="更新统计信息，优化查询计划">
                <Button
                  size="small"
                  onClick={() => handleVacuum(record.name, 'analyze')}
                  loading={vacuumLoading === record.name}
                  disabled={!!vacuumLoading}
                >
                  ANALYZE
                </Button>
              </Tooltip>
              {showVacuumFull && (
                <Popconfirm
                  title={`确认对 ${record.name} 执行 VACUUM FULL？`}
                  description="完全重建表，回收所有空间但会锁表！可能导致服务短暂不可用"
                  onConfirm={() => handleVacuum(record.name, 'vacuum_full')}
                  okText="确认执行"
                  okType="danger"
                  cancelText="取消"
                >
                  <Button
                    size="small"
                    danger
                    disabled={!!vacuumLoading}
                  >
                    FULL
                  </Button>
                </Popconfirm>
              )}
            </div>
          );
        }
      },
    ];

    // 计算汇总统计
    const totalLiveRows = healthData.reduce((s, t) => s + t.liveRows, 0);
    const totalDeadRows = healthData.reduce((s, t) => s + t.deadRows, 0);
    const overallFragmentation = (totalLiveRows + totalDeadRows) > 0
      ? (totalDeadRows / (totalLiveRows + totalDeadRows)) * 100
      : 0;
    const needVacuumCount = healthData.filter(t => t.needsVacuum).length;

    return (
      <Card
        size="small"
        title={
          <span>
            <WarningOutlined style={{ color: needVacuumCount > 0 ? '#faad14' : '#52c41a', marginRight: 8 }} />
            表健康度（碎片率分析）
          </span>
        }
        extra={
          <span style={{ fontSize: 12, color: '#666' }}>
            整体碎片率: <span style={{ color: overallFragmentation > 20 ? '#f5222d' : '#52c41a', fontWeight: 'bold' }}>
              {overallFragmentation.toFixed(1)}%
            </span>
            {' | '}
            需优化表: <span style={{ color: needVacuumCount > 0 ? '#faad14' : '#52c41a', fontWeight: 'bold' }}>
              {needVacuumCount}/{healthData.length}
            </span>
          </span>
        }
        loading={loading}
      >
        {healthData.length > 0 ? (
          <Table
            columns={columns}
            dataSource={healthData}
            rowKey="name"
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 1000, y: 300 }}
            rowClassName={(record) => record.needsVacuum ? 'row-needs-vacuum' : ''}
          />
        ) : (
          <Empty description="暂无表健康数据" />
        )}
      </Card>
    );
  };

  const renderConfigInfo = () => {
    const configData = dbInfo?.config?.map(c => ({
      name: c.name,
      label: CONFIG_LABELS[c.name] || c.name,
      value: c.setting + (c.unit || ''),
      desc: CONFIG_DESCRIPTIONS[c.name] || c.short_desc,
    })) || [];

    return (
      <Card
        size="small"
        title="数据库配置"
        loading={loading}
      >
        <Table
          columns={[
            {
              title: '参数',
              dataIndex: 'name',
              width: 190,
              render: (_: string, record: { name: string; label: string }) => (
                <div>
                  <div>{record.label}</div>
                  <Text code style={{ fontSize: 11 }}>{record.name}</Text>
                </div>
              ),
            },
            { title: '当前值', dataIndex: 'value', width: 120 },
            {
              title: '说明',
              dataIndex: 'desc',
              render: (desc: string) => (
                <span className="config-description">{desc}</span>
              ),
            },
          ]}
          dataSource={configData}
          rowKey="name"
          size="small"
          pagination={false}
          scroll={{ y: 200 }}
        />
      </Card>
    );
  };

  return (
    <div className="database-monitor">
      <div className="monitor-header">
        <div>
          <h2>
            <DashboardOutlined /> 数据库监控中心
          </h2>
          <div className="monitor-subtitle">
            最近 1 小时趋势，10 秒采样，适合日常健康巡检
          </div>
        </div>
        <div className="monitor-actions">
          <span style={{ marginRight: 16 }}>
            自动刷新
            <Switch
              checked={autoRefresh}
              onChange={setAutoRefresh}
              style={{ marginLeft: 8 }}
            />
          </span>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={loading}
          >
            刷新
          </Button>
        </div>
      </div>

      {error && (
        <Alert
          message="错误"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          closable
        />
      )}

      <section className="monitor-section">
        <div className="monitor-section-title">运行总览</div>
        {renderOverviewCards()}
      </section>

      <section className="monitor-section">
        <div className="monitor-section-title">趋势观察</div>
        {renderCharts()}
      </section>

      <section className="monitor-section">
        <div className="monitor-section-title">表与索引</div>
        {renderTableStats()}
      </section>

      <section className="monitor-section">
        <div className="monitor-section-title">维护重点</div>
        {renderTableHealth()}
        {renderTableIoStats()}
      </section>

      <section className="monitor-section">
        <div className="monitor-section-title">内部统计与配置</div>
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={12}>
            {renderDbStatCard()}
          </Col>
          <Col xs={24} xl={12}>
            {renderBgwriterStats()}
          </Col>
          <Col span={24}>
            {renderConfigInfo()}
          </Col>
        </Row>
      </section>

      <div className="monitor-footer">
        上次更新: {monitorData?.timestamp ? new Date(monitorData.timestamp).toLocaleString() : '-'}
        {autoRefresh ? ' | 每10秒自动刷新 | 保留最近1小时趋势' : ' | 保留最近1小时趋势'}
      </div>
    </div>
  );
};


export default DatabaseMonitor;
