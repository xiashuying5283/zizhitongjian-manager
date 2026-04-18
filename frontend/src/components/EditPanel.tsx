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
} from 'antd';
import { DeleteOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons';
import type { CharacterDetail, Relation } from '../types';
import {
  getCharacterDetail,
  enrichCharacter,
  confirmEnrich,
  deleteCharacter,
} from '../api';
import './EditPanel.css';

const { TextArea } = Input;

interface EditPanelProps {
  visible: boolean;
  characterId: number | null;
  onClose: () => void;
  onSuccess: () => void;
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
      });

      if (result.relationships && result.relationships.length > 0) {
        const newRelations: Relation[] = result.relationships.map((r) => ({
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
        relationships: validRelations.map((r) => ({
          name: r.name,
          relation: r.relation,
          description: r.description,
        })),
      });

      message.success('保存成功');
      onSuccess();
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

            <Form form={form} layout="vertical">
              <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
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
                    <Select
                      placeholder="关系类型"
                      value={rel.relation || undefined}
                      onChange={(value) => updateRelation(index, 'relation', value)}
                      options={relationOptions}
                      style={{ flex: 1 }}
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
