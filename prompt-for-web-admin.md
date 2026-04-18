# 资治通鉴人物数据库管理后台 — 提示词

请为我开发一个单页面 Web 应用（单个 HTML 文件，内嵌 CSS + JS），用于管理资治通鉴历史人物数据库。

---

## 一、数据库信息

**PostgreSQL 连接**：前端不可直连数据库，所有数据操作通过后端 API 完成。

### characters 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial PRIMARY KEY | 主键 |
| name | text NOT NULL | 人物姓名 |
| title | text | 主要职位 |
| summary | text | 传记摘要 |
| aliases | jsonb | 别名数组，如 ["字子房", "留侯"] |
| hometown | text | 籍贯 |
| era | text | 所属纪年 |
| birth_year | text | 出生年份 |
| death_year | text | 死亡年份 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

### character_relations 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial PRIMARY KEY | 主键 |
| character_id | integer REFERENCES characters(id) | 人物ID |
| related_character_id | integer REFERENCES characters(id) | 关联人物ID |
| relation_type | text | 关系类型（如：配偶、子女、父母、兄弟、君臣、同僚、对手、同盟） |
| description | text | 关系说明 |
| created_at | timestamptz | 创建时间 |

---

## 二、后端 API 接口

**Base URL**：`http://localhost:9091/api/v1`

### 1. 获取人物列表（分页）

```
GET /characters?page=1&limit=50&era=唐纪&name=张
```

- Query 参数：
    - `page`: number（默认1）
    - `limit`: number（默认20，最大50）
    - `era`: string（可选，按纪年筛选）
    - `name`: string（可选，搜索姓名和别名）
- 返回：
```json
{
  "success": true,
  "data": {
    "characters": [
      { "id": 1, "name": "魏斯", "title": "魏文侯", "era": "周纪", "birth_year": null, "death_year": null, "summary": "..." }
    ],
    "total": 16853,
    "page": 1,
    "limit": 50,
    "totalPages": 338
  }
}
```

### 2. 获取人物详情

```
GET /characters/:id
```

- 返回：
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "魏斯",
    "title": "魏文侯",
    "era": "周纪",
    "summary": "...",
    "aliases": ["魏文侯"],
    "hometown": "...",
    "birth_year": null,
    "death_year": null,
    "relations": [
      { "id": 1, "relation_type": "君臣", "description": "...", "related_character": { "id": 5, "name": "李悝", "title": "...", "era": "周纪" } }
    ],
    "reverseRelations": [
      { "id": 2, "relation_type": "君臣", "description": "...", "character": { "id": 5, "name": "李悝", "title": "...", "era": "周纪" } }
    ]
  }
}
```

### 3. AI 补充（预览模式，不写入数据库）

```
POST /characters/enrich-from-tongjian
Content-Type: application/json

{ "name": "张良", "dryRun": true }
```

- 返回：
```json
{
  "success": true,
  "dryRun": true,
  "data": {
    "current": { "era": "汉纪", "title": null, "summary": null, "aliases": [] },
    "proposed": {
      "era": "汉纪",
      "title": "留侯",
      "summary": "张良，字子房，韩国人...",
      "aliases": ["字子房", "留侯"],
      "hometown": "城父"
    },
    "relationships": [
      { "name": "刘邦", "relation": "君臣", "description": "张良辅佐刘邦建立汉朝" }
    ]
  }
}
```

### 4. AI 补充（带用户自定义提示词，不写入数据库）

```
POST /characters/enrich-from-tongjian
Content-Type: application/json

{ "name": "张良", "dryRun": true, "userHint": "此人是汉初三杰之一，与韩信、萧何齐名" }
```

- `userHint` 是用户自定义提示词，会被拼接到 LLM 的用户消息中，帮助 AI 更准确地生成内容
- 返回格式同上

### 5. 确认写入（保存编辑后的数据）

```
POST /characters/enrich-confirm
Content-Type: application/json

{
  "characterId": 1,
  "name": "张良",
  "era": "汉纪",
  "title": "留侯",
  "summary": "张良，字子房...",
  "aliases": ["字子房", "留侯"],
  "hometown": "城父",
  "relationships": [
    { "name": "刘邦", "relation": "君臣", "description": "张良辅佐刘邦建立汉朝" }
  ]
}
```

- 所有字段都是可选的（characterId 除外），只传需要更新的字段
- `relationships` 中的 name 会在数据库中查找对应人物，如果找到就建立关系，找不到则跳过
- 返回：
```json
{
  "success": true,
  "data": { "id": 1, "name": "张良", "updated": ["era", "title", "summary", "aliases", "hometown"] }
}
```

### 6. 删除人物

```
DELETE /characters/:id
```

- 会同时删除该人物的所有关系（发出的 + 指向的）
- 返回：
```json
{
  "success": true,
  "data": { "id": 1, "name": "张良" }
}
```

---

## 三、功能需求

### 主列表页

1. **分页加载**：每次加载 50 条，支持翻页（上一页 / 下一页 / 跳转到指定页码）
2. **按汉字字典序排序**：按 name 字段拼音排序（Unicode 排序也可以接受，但最好是 `localeCompare('zh-CN')`）。页面顶部有 A B C D E F G ... 字母索引条，点击跳转到对应拼音首字母的人物
3. **纪年筛选**：顶部有纪年下拉选择器，选项包括：全部、周纪、秦纪、汉纪、魏纪、晋纪、宋纪、齐纪、梁纪、陈纪、隋纪、唐纪、后梁纪、后唐纪、后晋纪、后汉纪、后周纪
4. **搜索**：支持按姓名 / 别名搜索
5. **列表项显示**：每行显示 name + title + era 标签，点击进入编辑

### 编辑面板（右侧滑出或 Modal）

1. **可编辑字段**：
    - 姓名（name）— 文本输入
    - 纪年（era）— 下拉选择（同上方纪年列表）
    - 主要职位（title）— 文本输入
    - 籍贯（hometown）— 文本输入
    - 别名（aliases）— 文本输入，用顿号分隔，前端自行 split/join
    - 传记摘要（summary）— 多行文本域
    - 人际关系（relationships）— 可增删的列表，每条包含：人物名、关系类型、关系说明

2. **AI 生成按钮**：
    - 位置：传记摘要字段旁边，或编辑面板顶部
    - 点击后：
      a. 先弹出一个输入框，让用户可以输入**补充提示词**（如"此人是唐太宗，开创贞观之治"），也可以留空
      b. 然后调用 `POST /enrich-from-tongjian` (dryRun=true)，把用户提示词通过 `userHint` 字段传入
      c. AI 返回后，将 proposed 中的各字段填入对应的编辑框（不覆盖用户已手动修改的内容 — 或者直接覆盖也行，由你决定）
      d. relationships 从返回的 `data.relationships`（不在 proposed 内部，在 data 同级）获取
    - 加载过程中显示 loading 动画

3. **保存按钮**：
    - 调用 `POST /enrich-confirm`，将编辑面板中的数据提交
    - 保存成功后刷新列表

4. **删除按钮**：
    - 红色，放在编辑面板底部
    - 点击后二次确认
    - 调用 `DELETE /characters/:id`
    - 成功后关闭编辑面板，刷新列表

### 人际关系编辑

- 关系类型建议用下拉选择：配偶、子女、父母、兄弟、君臣、同僚、对手、同盟、其他
- 支持添加新关系行（空行）、删除关系行
- 人物名是文本输入（后端会按 name 在数据库查找匹配）

---

## 四、UI 设计要求

1. **整体风格**：管理后台风格，简洁专业，以功能为主。左侧列表 + 右侧编辑面板的经典布局
2. **配色**：浅灰背景 + 白色卡片 + 蓝色主色调（#4F46E5），删除按钮红色
3. **响应式**：至少支持 1280px+ 宽度正常使用
4. **字母索引条**：固定在列表左侧或顶部，A-Z 横向排列，点击跳转
5. **纪年标签**：用小彩色标签显示，不同纪年用不同颜色（如周纪-绿、秦纪-黑、汉纪-红、唐纪-金等）
6. **分页器**：底部居中，显示当前页/总页数，支持跳页
7. **AI 生成状态**：按钮点击后变为 loading，AI 返回后恢复，生成的文字逐字/逐步填入编辑框（如果可行的话）
8. **用户提示词输入**：用 Modal 或内联输入框，标题为"补充提示词（可选）"，placeholder："如：此人是唐太宗，开创贞观之治"

---

## 五、技术要求

1. **单 HTML 文件**：所有 CSS 和 JS 内嵌，不依赖外部资源（可以用 CDN 引入 Vue/React 等）
2. **纯前端**：所有数据通过上面的 API 获取/提交，不需要连接数据库
3. **中文拼音排序**：使用 `Array.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))` 或类似方案
4. **错误处理**：API 调用失败时显示错误提示
5. **防抖搜索**：搜索输入框 300ms 防抖

---

## 六、额外说明

- 数据库有约 16,800 条人物记录
- 部分人物的 summary / title / aliases 为空，这些是 AI 补充的主要目标
- era 字段有 5800+ 条为"待定"，AI 可以帮助确定纪年
- AI 生成大约需要 10-30 秒，需要良好的 loading 状态反馈
- 后端的 enrich-from-tongjian 接口会同时搜索资治通鉴原文和百科资料，然后用 LLM 生成传记
- 数据库连接串：DATABASE_URL=postgresql://postgres:ncG6Y6Gyb776OPdd7F@cp-loyal-storm-19a3b2eb.pg5.aidap-global.cn-beijing.volces.com:5432/postgres?sslmode=require&channel_binding=require
