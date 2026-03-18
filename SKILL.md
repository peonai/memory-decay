---
name: memory-decay
description: Human-like fuzzy memory system with gradient decay for AI agents. Implements birth tagging, time-based compression, and hybrid retrieval (keyword + semantic). Use when agents need to write, search, or maintain memories with natural forgetting behavior.
---

# Memory Decay — 模拟人类模糊记忆的 Agent 记忆系统

**核心理念：** 人类记忆不是数据库。人不会精确检索，而是"好像之前搞过什么……大概在哪个方向？"然后逐步聚焦。这个系统模拟这个过程。

## 三个核心机制

### 1. 写入打标（Birth Tag）

每条记忆写入时自带元数据：

```markdown
<!-- meta: type=decision, ttl=permanent, confidence=0.9 -->
选择 Creem 作为支付平台，因为国内友好 + API 简洁。
```

**必填字段：**
- `type`: `decision` | `experiment` | `reference` | `status` | `temporary`
- `ttl`: `3d` | `7d` | `30d` | `permanent`
- `confidence`: 0.0-1.0（写入时的确定程度）

### 2. 时间梯度衰减（Decay Tiers）

记忆随时间自动降级，不是删除，是压缩：

| 年龄 | 层级 | 保留内容 |
|------|------|----------|
| 0-3天 | fresh | 完整原文 |
| 4-14天 | recent | 原文（检索优先返回摘要） |
| 15-30天 | faded | 仅摘要 + 元数据 |
| 30天+ | ghost | 仅一行索引 |
| ttl过期 | expired | 标记过期，检索时跳过 |

`permanent` 类型不衰减。

### 3. 混合检索（Keyword + Semantic）

- **关键词匹配**：TF-IDF + domain 别名映射（中文短查询友好）
- **语义搜索**：Qwen3-Embedding-8B（中文语义理解）
- **融合排序**：加权合并（kw 40% + sem 60%）

## 快速开始

### 安装

```bash
cd ~/projects/memory-decay
npm install
```

### 写入记忆

```bash
node bin/cli.mjs write \
  --type decision \
  --domain payment \
  --summary "Creem 作为支付平台" \
  --ttl permanent \
  --confidence 0.95 \
  --body "选择 Creem 而不是 Stripe，因为..."
```

### 建立索引

```bash
# 首次使用或新增记忆后
node bin/cli.mjs embed
```

### 检索

```bash
# 混合检索（推荐）
node bin/cli.mjs hybrid "好像之前搞过收费的事"

# 关键词检索
node bin/cli.mjs search "Creem API"

# 语义检索
node bin/cli.mjs semantic "那个收费的事怎么搞的"

# 模糊扫描 → 聚焦
node bin/cli.mjs scan "支付"
node bin/cli.mjs focus payment
```

### 衰减维护

```bash
# 预览衰减变化
node bin/cli.mjs decay --dry-run

# 执行衰减
node bin/cli.mjs decay
```

### 统计

```bash
node bin/cli.mjs stats
```

## 集成到 Agent 工作流

### 写入规范

**允许的位置：**
- `memory/episodic/YYYY-MM-DD.md` — 日常事件
- `memory/semantic/*.md` — 长期事实
- `memory/procedural/*.md` — 可复用流程

**触发条件（满足其一即可写）：**
1. 用户明确要求记住
2. session 即将结束，关键结论会丢失
3. 稳定的事实、偏好、决策
4. 可复用的工作流

**写入格式：**

```markdown
<!-- meta: type=decision, ttl=permanent, confidence=0.95 -->

## 2026-03-18 — Creem 支付集成

选择 Creem 作为支付平台，原因：
1. 国内友好，无需海外实体
2. API 简洁，test mode 完善
3. 支持 webhook

相关文档：https://docs.creem.io
```

### 检索规范

**场景1：精确查询**
```bash
# 用户："Creem 的 API key 在哪"
node bin/cli.mjs search "Creem API key"
```

**场景2：模糊回忆**
```bash
# 用户："好像之前搞过收费的事"
node bin/cli.mjs hybrid "收费"
```

**场景3：探索式检索**
```bash
# 用户："支付相关的都有什么"
node bin/cli.mjs scan "支付"
node bin/cli.mjs focus payment
```

### 定期维护

**Cron 任务（建议每天凌晨）：**
```bash
0 2 * * * cd ~/projects/memory-decay && node bin/cli.mjs decay
```

**手动检查：**
```bash
# 查看即将过期的记忆
node bin/cli.mjs decay --dry-run | grep "→ expired"
```

## 数据质量要求

**好的 summary（信息密度高）：**
- ✅ "Creem 支付集成：选择 Creem 而非 Stripe，因为国内友好"
- ✅ "博客双语方案：中文 .md + 英文 .en.md，Hugo i18n 原生支持"
- ✅ "修复 peon.blog 移动端布局：newspaper.css 760px 断点"

**坏的 summary（噪音）：**
- ❌ "我是 Peon 🔨，悦哥你的 AI 助手"（自我介绍，不是记忆）
- ❌ "好，继续~接近目标了"（对话碎片）
- ❌ "Session Key: agent:main:..."（元数据）
- ❌ "路径：/home/chiny/..."（孤立路径，无上下文）

**原则：**
1. 每条记忆必须是**自包含的陈述句**
2. 避免对话记录、元数据、流程说明
3. 优先记录**决策 + 理由**，而不是单纯的事实

## 文件结构

```
memory-decay/
├── bin/
│   └── cli.mjs              # CLI 入口
├── lib/
│   ├── store.mjs            # 文件存储层
│   ├── decay.mjs            # 衰减引擎
│   ├── search.mjs           # 关键词检索
│   ├── embed.mjs            # 语义 embedding
│   └── hybrid.mjs           # 混合检索
├── scripts/
│   ├── import-openclaw.mjs  # 从 OpenClaw 导入
│   └── test-fuzzy.mjs       # 模糊检索测试
├── store/
│   ├── index.json           # 全局索引
│   ├── embeddings.json      # 向量缓存
│   ├── fresh/               # 完整记忆
│   ├── archive/             # 衰减后的原文
│   └── expired/             # 过期记忆
├── DESIGN.md                # 设计文档
└── package.json
```

## 技术栈

- **存储**：文件系统（JSON）
- **关键词匹配**：TF-IDF + CJK bigram 分词
- **语义搜索**：Qwen3-Embedding-8B via 302.ai
- **融合算法**：加权分数融合（Weighted Score Fusion）

## 已知限制

1. **不支持实时监听**：需要手动运行 `decay` 维护
2. **embedding 需要网络**：依赖 302.ai API（可替换为本地模型）
3. **数据质量敏感**：垃圾进垃圾出，需要高质量 summary

## 下一步改进方向

1. **LLM 摘要层**：导入时自动生成高质量 summary
2. **语义压缩**：faded/ghost 层自动生成摘要和索引
3. **引用频率加权**：被反复检索的记忆保持高权重
4. **本地 embedding**：支持离线推理（fastembed）

---

**License:** MIT  
**Author:** Peon  
**Version:** 0.1.0
