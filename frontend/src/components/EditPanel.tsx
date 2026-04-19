import React, { useState, useEffect } from 'react';
import {
  Drawer,
  Form,
  Input,
  Select,
  Button,
  Divider,
  Space,
  Modal,
  message,
  Spin,
  Card,
  Tooltip,
  Alert,
  Collapse,
  AutoComplete,
} from 'antd';
import { DeleteOutlined, PlusOutlined, RobotOutlined, SearchOutlined, GlobalOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons';
import type { CharacterDetail, Relation } from '../types';
import {
  getCharacterDetail,
  enrichCharacter,
  confirmEnrich,
  deleteCharacter,
  getBaiduBaike,
  getWikiBaike,
} from '../api';
import type { BaikeResult, WikiResult } from '../api';
import './EditPanel.css';

const { TextArea } = Input;

interface EditPanelProps {
  visible: boolean;
  characterId: number | null;
  onClose: () => void;
  onSuccess: (keepSelection?: boolean) => void;
}

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

const relationOptions = [
  { value: '配偶', label: '配偶' },
  { value: '子女', label: '子女' },
  { value: '父母', label: '父母' },
  { value: '兄弟', label: '兄弟' },
  { value: '君臣', label: '君臣' },
  { value: '同僚', label: '同僚' },
  { value: '对手', label: '对手' },
  { value: '同盟', label: '同盟' },
  { value: '其他', label: '其他' },
];

const EditPanel: React.FC<EditPanelProps> = ({
  visible,
  characterId,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [character, setCharacter] = useState<CharacterDetail | null>(null);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [hintModalVisible, setHintModalVisible] = useState(false);
  const [userHint, setUserHint] = useState('');
  const [baiduQuery, setBaiduQuery] = useState('');
  const [baiduLoading, setBaiduLoading] = useState(false);
  const [baiduResult, setBaiduResult] = useState<BaikeResult | null>(null);
  const [baiduError, setBaiduError] = useState('');
  const [wikiQuery, setWikiQuery] = useState('');
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiResult, setWikiResult] = useState<WikiResult | null>(null);
  const [wikiError, setWikiError] = useState('');

  useEffect(() => {
    if (visible && characterId) {
      loadCharacter();
    }
  }, [visible, characterId]);

  const loadCharacter = async () => {
    if (!characterId) return;
    setLoading(true);
    try {
      const data = await getCharacterDetail(characterId);
      setCharacter(data);
      form.setFieldsValue({
        name: data.name,
        era: data.era,
        title: data.title,
        hometown: data.hometown,
        aliases: (data.aliases || []).join('、'),
        summary: data.summary,
        birth_year: data.birth_year,
        death_year: data.death_year,
      });
      const allRelations: Relation[] = [
        ...(data.relations || []).map((r) => ({
          id: r.id,
          name: r.related_character?.name || '',
          relation: r.relation_type,
          description: r.description || '',
        })),
        ...(data.reverseRelations || []).map((r) => ({
          id: r.id,
          name: r.character?.name || '',
          relation: r.relation_type,
          description: r.description || '',
          isReverse: true,
        })),
      ];
      setRelations(allRelations);
      setBaiduQuery(data.name);
      setWikiQuery(data.name);
    } catch (error) {
      message.error('加载人物详情失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!character) return;
    setAiLoading(true);
    try {
      const result = await enrichCharacter({
        name: character.name,
        dryRun: true,
        userHint: userHint || undefined,
      });

      form.setFieldsValue({
        era: result.proposed.era,
        title: result.proposed.title,
        hometown: result.proposed.hometown,
        aliases: (result.proposed.aliases || []).join('、'),
        summary: result.proposed.summary,
        birth_year: result.proposed.birth_year,
        death_year: result.proposed.death_year,
      });

      if (result.relationships && result.relationships.length > 0) {
        // 对 AI 生成的关系按 name 去重（已有同名人物则不追加）
        const existingNames = new Set(relations.map(r => r.name));
        const newRelations: Relation[] = result.relationships
          .filter((r) => !existingNames.has(r.name))
          .map((r) => ({
            name: r.name,
            relation: r.relation,
            description: r.description || '',
          }));
        setRelations([...relations, ...newRelations]);
      }

      message.success('AI 生成完成');
      setHintModalVisible(false);
      setUserHint('');
    } catch (error: any) {
      message.error(error.response?.data?.error || 'AI 生成失败');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    if (!character) return;
    try {
      const values = await form.validateFields();
      
      // 校验：如果有空的关系行，提示删除
      const emptyRelation = relations.find(
        (r) => !r.name && !r.relation && !r.isReverse
      );
      if (emptyRelation) {
        message.error('请删除未填写的关系');
        return;
      }
      
      // 校验关系是否填写完整
      const incompleteRelation = relations.find(
        (r) => (r.name || r.relation) && !(r.name && r.relation) && !r.isReverse
      );
      if (incompleteRelation) {
        if (!incompleteRelation.name) {
          message.error('请填写关系人物名');
        } else {
          message.error('请选择关系类型');
        }
        return;
      }
      
      setSaving(true);

      const validRelations = relations.filter(
        (r) => r.name && r.relation && !r.isReverse
      );

      await confirmEnrich({
        characterId: character.id,
        name: values.name,
        era: values.era,
        title: values.title,
        hometown: values.hometown,
        aliases: values.aliases
          ? values.aliases.split('、').map((a: string) => a.trim()).filter(Boolean)
          : [],
        summary: values.summary,
        birth_year: values.birth_year,
        death_year: values.death_year,
        relationships: validRelations.map((r) => ({
          name: r.name,
          relation: r.relation,
          description: r.description,
        })),
        createMissing: true,  // 自动创建不存在的人物
      });

      message.success('保存成功');
      onSuccess(true);  // 保持选中状态
      onClose();
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || '保存失败';
      
      // 解析缺失人物
      const match = errorMsg.match(/以下关联人物不存在：(.+)/);
      if (match) {
        const names = match[1].split('、');
        if (names.length > 0) {
          Modal.confirm({
            title: '人物不存在',
            content: `${errorMsg}，是否立即添加"${names[0]}"？`,
            okText: '添加',
            cancelText: '取消',
            onOk: () => {
              // 触发全局事件，打开新增弹窗
              window.dispatchEvent(new CustomEvent('openCreateCharacter', { 
                detail: { name: names[0] } 
              }));
            },
          });
          return;
        }
      }
      
      message.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!character) return;
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除人物"${character.name}"吗？此操作不可恢复！`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteCharacter(character.id);
          message.success('删除成功');
          onSuccess();
          onClose();
        } catch (error) {
          message.error('删除失败');
        }
      },
    });
  };

  const addRelation = () => {
    setRelations([...relations, { name: '', relation: '', description: '' }]);
  };

  const removeRelation = (index: number) => {
    const newRelations = [...relations];
    newRelations.splice(index, 1);
    setRelations(newRelations);
  };

  const updateRelation = (index: number, field: keyof Relation, value: string) => {
    const newRelations = [...relations];
    newRelations[index] = { ...newRelations[index], [field]: value };
    setRelations(newRelations);
  };

  return (
    <>
      <Drawer
        title="编辑人物"
        placement="right"
        width={800}
        open={visible}
        onClose={onClose}
        footer={
          <Space>
            <Button type="primary" onClick={handleSave} loading={saving}>
              保存
            </Button>
            <Button danger onClick={handleDelete}>
              删除
            </Button>
          </Space>
        }
      >
        {loading ? (
          <div className="loading-container">
            <Spin size="large" />
          </div>
        ) : (
          <>
            <Button
              type="primary"
              icon={<RobotOutlined />}
              block
              onClick={() => setHintModalVisible(true)}
              loading={aiLoading}
              style={{ marginBottom: 20 }}
            >
              AI 智能生成
            </Button>

            <Card 
              size="small" 
              title={
                <span>
                  <GlobalOutlined style={{ marginRight: 8, color: '#1e3a5f' }} />
                  百度百科查询
                </span>
              }
              className="baidu-card"
              extra={
                <Space size={4}>
                  {baiduResult && (
                    <Tooltip title="在新标签页打开">
                      <Button
                        type="link"
                        size="small"
                        icon={<LinkOutlined />}
                        onClick={() => window.open(baiduResult.url, '_blank')}
                      />
                    </Tooltip>
                  )}
                </Space>
              }
            >
              <div className="baidu-search-row">
                <Input.Search
                  placeholder="输入人物名查询百度百科..."
                  value={baiduQuery}
                  onChange={(e) => setBaiduQuery(e.target.value)}
                  onSearch={async (value) => {
                    if (!value?.trim()) return;
                    setBaiduLoading(true);
                    setBaiduError('');
                    setBaiduResult(null);
                    try {
                      const data = await getBaiduBaike(value.trim());
                      setBaiduResult(data);
                    } catch (err: any) {
                      setBaiduError(err.response?.data?.error || '查询失败');
                    } finally {
                      setBaiduLoading(false);
                    }
                  }}
                  enterButton={
                    <Button type="primary" size="small" icon={<SearchOutlined />} loading={baiduLoading}>
                      查询
                    </Button>
                  }
                />
                {baiduResult && (
                  <Tooltip title="重新查询">
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={async () => {
                        if (!baiduQuery.trim()) return;
                        setBaiduLoading(true);
                        setBaiduError('');
                        try {
                          const data = await getBaiduBaike(baiduQuery.trim());
                          setBaiduResult(data);
                        } catch (err: any) {
                          setBaiduError(err.response?.data?.error || '查询失败');
                        } finally {
                          setBaiduLoading(false);
                        }
                      }}
                    />
                  </Tooltip>
                )}
              </div>

              {baiduLoading && (
                <div className="baidu-loading">
                  <Spin size="small" /> <span style={{ marginLeft: 8, color: '#8c8c8c' }}>正在查询百度百科...</span>
                </div>
              )}

              {baiduError && (
                <Alert type="error" message={baiduError} style={{ marginTop: 12 }} showIcon closable onClose={() => setBaiduError('')} />
              )}

              {baiduResult && !baiduLoading && (
                <div className="baidu-content">
                  {!baiduResult.found && (
                    <Alert type="warning" message="未找到精确词条" description="可能需要更精确的名称，试试在新标签页中搜索" style={{ marginBottom: 12 }} showIcon />
                  )}
                  {baiduResult.summary && (
                    <div className="baidu-summary">
                      <div className="baidu-summary-label">摘要</div>
                      <div className="baidu-summary-text">{baiduResult.summary}</div>
                    </div>
                  )}
                  {baiduResult.sections.length > 0 && (
                    <Collapse
                      size="small"
                      className="baidu-sections"
                      defaultActiveKey={baiduResult.sections.slice(0, 2).map((_, i) => String(i))}
                    >
                      {baiduResult.sections.map((section, idx) => (
                        <Collapse.Panel header={section.title} key={String(idx)}>
                          <div className="baidu-section-text">{section.content}</div>
                        </Collapse.Panel>
                      ))}
                    </Collapse>
                  )}
                  {!baiduResult.summary && baiduResult.sections.length === 0 && (
                    <div className="baidu-empty">未能提取到正文内容</div>
                  )}
                </div>
              )}
            </Card>

            <Card 
              size="small" 
              title={
                <span>
                  <GlobalOutlined style={{ marginRight: 8, color: '#5b21b6' }} />
                  维基百科查询（需科学上网）
                </span>
              }
              className="wiki-card"
              extra={
                <Space size={4}>
                  {wikiResult && (
                    <Tooltip title="在新标签页打开">
                      <Button
                        type="link"
                        size="small"
                        icon={<LinkOutlined />}
                        onClick={() => window.open(wikiResult.url, '_blank')}
                      />
                    </Tooltip>
                  )}
                </Space>
              }
            >
              <div className="baidu-search-row">
                <Input.Search
                  placeholder="输入人物名查询维基百科..."
                  value={wikiQuery}
                  onChange={(e) => setWikiQuery(e.target.value)}
                  onSearch={async (value) => {
                    if (!value?.trim()) return;
                    setWikiLoading(true);
                    setWikiError('');
                    setWikiResult(null);
                    try {
                      const data = await getWikiBaike(value.trim());
                      setWikiResult(data);
                    } catch (err: any) {
                      setWikiError(err.response?.data?.error || '查询失败，可能无法连接维基百科');
                    } finally {
                      setWikiLoading(false);
                    }
                  }}
                  enterButton={
                    <Button type="primary" size="small" icon={<SearchOutlined />} loading={wikiLoading}>
                      查询
                    </Button>
                  }
                />
                {wikiResult && (
                  <Tooltip title="重新查询">
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={async () => {
                        if (!wikiQuery.trim()) return;
                        setWikiLoading(true);
                        setWikiError('');
                        try {
                          const data = await getWikiBaike(wikiQuery.trim());
                          setWikiResult(data);
                        } catch (err: any) {
                          setWikiError(err.response?.data?.error || '查询失败');
                        } finally {
                          setWikiLoading(false);
                        }
                      }}
                    />
                  </Tooltip>
                )}
              </div>

              {wikiLoading && (
                <div className="baidu-loading">
                  <Spin size="small" /> <span style={{ marginLeft: 8, color: '#8c8c8c' }}>正在查询维基百科...</span>
                </div>
              )}

              {wikiError && (
                <Alert type="error" message={wikiError} style={{ marginTop: 12 }} showIcon closable onClose={() => setWikiError('')} />
              )}

              {wikiResult && !wikiLoading && (
                <div className="baidu-content">
                  {!wikiResult.found && (
                    <Alert type="warning" message="未找到该词条" description="可能需要更精确的名称，试试在新标签页中搜索" style={{ marginBottom: 12 }} showIcon />
                  )}
                  {wikiResult.summary && (
                    <div className="wiki-summary">
                      <div className="baidu-summary-label">摘要</div>
                      <div className="baidu-summary-text">{wikiResult.summary}</div>
                    </div>
                  )}
                  {wikiResult.sections.length > 0 && (
                    <Collapse
                      size="small"
                      className="baidu-sections"
                      defaultActiveKey={wikiResult.sections.slice(0, 2).map((_, i) => String(i))}
                    >
                      {wikiResult.sections.map((section, idx) => (
                        <Collapse.Panel header={section.title} key={String(idx)}>
                          <div className="baidu-section-text">{section.content}</div>
                        </Collapse.Panel>
                      ))}
                    </Collapse>
                  )}
                  {!wikiResult.summary && wikiResult.sections.length === 0 && (
                    <div className="baidu-empty">未能提取到正文内容</div>
                  )}
                </div>
              )}
            </Card>

            <Form form={form} layout="vertical">
              <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
                <Input placeholder="请输入姓名" />
              </Form.Item>

              <Form.Item name="era" label="纪年">
                <Select options={eraOptions} />
              </Form.Item>

              <Form.Item label="生卒年">
                <Input.Group compact>
                  <Form.Item name="birth_year" noStyle>
                    <Input style={{ width: '45%' }} placeholder="出生年份" />
                  </Form.Item>
                  <Input
                    style={{ width: '10%', borderLeft: 0, pointerEvents: 'none', backgroundColor: '#fff' }}
                    placeholder="~"
                    disabled
                  />
                  <Form.Item name="death_year" noStyle>
                    <Input style={{ width: '45%', borderLeft: 0 }} placeholder="死亡年份" />
                  </Form.Item>
                </Input.Group>
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
                <TextArea rows={6} placeholder="请输入传记摘要" />
              </Form.Item>
            </Form>

            <Divider>人际关系</Divider>

            <div className="relations-container">
              {relations.map((rel, index) => (
                <div key={index} className="relation-item">
                  <div style={{ display: 'flex', alignItems: 'center', width: 100 }}>
                    <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>
                    <Input
                      placeholder="人物名"
                      value={rel.name}
                      onChange={(e) => updateRelation(index, 'name', e.target.value)}
                      disabled={rel.isReverse}
                      style={{ flex: 1 }}
                      status={rel.name === '' && rel.relation ? 'error' : undefined}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', width: 100 }}>
                    <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>
                    <AutoComplete
                      placeholder="关系类型"
                      value={rel.relation || undefined}
                      onChange={(value) => updateRelation(index, 'relation', value)}
                      options={relationOptions}
                      style={{ flex: 1 }}
                      filterOption={(input, option) => (option?.value as string)?.includes(input)}
                      status={rel.relation === '' && rel.name ? 'error' : undefined}
                    />
                  </div>
                  <Input
                    placeholder="关系说明"
                    value={rel.description}
                    onChange={(e) => updateRelation(index, 'description', e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeRelation(index)}
                  />
                </div>
              ))}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                block
                onClick={addRelation}
              >
                添加关系
              </Button>
            </div>

            {character?.updated_at && (
              <div style={{ 
                marginTop: 24, 
                padding: '12px 0', 
                borderTop: '1px solid #f0f0f0',
                color: '#8c8c8c',
                fontSize: 13,
                textAlign: 'center'
              }}>
                最近编辑于 {new Date(character.updated_at).toLocaleString('zh-CN')}
              </div>
            )}
          </>
        )}
      </Drawer>

      <Modal
        title="补充提示词（可选）"
        open={hintModalVisible}
        onCancel={() => {
          setHintModalVisible(false);
          setUserHint('');
        }}
        onOk={handleAiGenerate}
        confirmLoading={aiLoading}
      >
        <TextArea
          rows={4}
          placeholder="如：此人是唐太宗，开创贞观之治"
          value={userHint}
          onChange={(e) => setUserHint(e.target.value)}
        />
      </Modal>
    </>
  );
};

export default EditPanel;
