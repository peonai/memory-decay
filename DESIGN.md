# Memory Decay — 模拟人类模糊记忆的 Agent 记忆系统

## 核心理念

人类记忆不是数据库。人不会 `SELECT * FROM memories WHERE topic = 'payment'`。
人的记忆是：「好像之前搞过支付的事……大概是上个月？跟 Creem 有关？」然后逐步聚焦。

这个系统模拟这个过程：**模糊命中 → 梯度展开 → 精准定位**。

## 三个核心机制

### 1. 写入打标（Birth Tag）

每条记忆写入时自带元数据：

```yaml
id: uuid
created: ISO timestamp
type: decision | experiment | reference | status | temporary
ttl: 3d | 7d | 30d | permanent
confidence: 0.0-1.0
domain: 领域标签，如 "payment", "blog", "infra"
summary: 一句话摘要（衰减后只剩这个）
```

### 2. 时间梯度衰减（Decay Tiers）

记忆随时间自动降级，不是删除，是压缩：

| 年龄 | 层级 | 保留内容 |
|------|------|----------|
| 0-3天 | fresh | 完整原文 |
| 4-14天 | recent | 原文 + 摘要（检索优先返回摘要） |
| 15-30天 | faded | 仅摘要 + 元数据（原文归档） |
| 30天+ | ghost | 仅一行索引（domain + summary + date） |
| ttl过期 | expired | 标记过期，检索时跳过 |

`permanent` 类型不衰减，永远保持 fresh。

### 3. 层次检索（Fuzzy → Focused）

检索分两步，模拟人类回忆过程：

**Step 1: 模糊扫描（Scan）**
- 输入自然语言 query
- 返回匹配的 domain 列表 + 每个 domain 下的记忆数量和最新时间
- 类似人脑的「好像跟这几个方向有关」

**Step 2: 聚焦展开（Focus）**
- 选定 domain 后，返回该 domain 下的记忆列表
- 按 tier 排序：fresh 完整展示，faded 只显示摘要，ghost 只显示一行
- 类似人脑的「对对对，就是那个……」

可以一步到位（query 足够精确时直接返回 top-k 结果），也可以两步走。

## 存储设计

用文件系统，不引入数据库。每条记忆一个 JSON 文件：

```
store/
├── index.json          # 全局索引（id, domain, summary, tier, created, ttl）
├── fresh/              # 完整记忆
│   ├── {id}.json
├── archive/            # 衰减后的原文备份
│   ├── {id}.json
└── expired/            # 过期记忆（可定期清理）
    ├── {id}.json
```

`index.json` 是检索的唯一入口，保持轻量。衰减操作只改 index 中的 tier 字段 + 移动文件。

## CLI 接口

```bash
# 写入
memory-decay write --type decision --domain payment --ttl permanent --confidence 0.9 \
  --summary "Creem 作为支付平台" \
  --body "选择 Creem 而不是 Stripe，因为..."

# 模糊检索
memory-decay scan "支付相关的决策"
# → payment (3 memories, latest: 2026-03-15)
# → chrome-extension (1 memory, latest: 2026-03-10)

# 聚焦
memory-decay focus payment
# → [fresh] 2026-03-18: Creem 作为支付平台 (full text)
# → [faded] 2026-03-05: Stripe vs Creem 对比 (summary only)
# → [ghost] 2026-02-10: 最初调研支付方案 (one-liner)

# 直接搜索（精确模式）
memory-decay search "Creem API key"
# → 直接返回 top-k 匹配

# 衰减（手动或 cron）
memory-decay decay --dry-run    # 预览会发生什么
memory-decay decay              # 执行衰减

# 统计
memory-decay stats
```

## 技术栈

- Node.js / TypeScript
- 文件系统存储（JSON）
- 模糊匹配：简单的 TF-IDF 或关键词匹配（先不上 embedding）
- 可选：后续接入 embedding search 做语义匹配

## 不做什么

- 不做 embedding / vector DB（第一版）
- 不做实时监听文件变化
- 不做 GUI
- 不接入 OpenClaw（先独立验证）

## 成功标准

1. `write` + `scan` + `focus` 闭环能跑通
2. `decay` 能正确按时间梯度压缩记忆
3. 过期记忆不会污染检索结果
4. 整个系统一个 `npm install` 就能用
