# Memory Decay — 快速开始

模拟人类模糊记忆的 AI Agent 记忆系统。

## 安装

```bash
cd ~/projects/memory-decay
npm install
```

## 初始化测试数据

```bash
# 生成 13 条模拟历史记忆
node scripts/seed-realistic.mjs

# 应用时间衰减
node bin/cli.mjs decay

# 查看统计
node bin/cli.mjs stats
```

## 基本使用

### 写入记忆

```bash
node bin/cli.mjs write \
  --type decision \
  --domain payment \
  --summary "选择 Stripe 作为支付平台" \
  --ttl permanent \
  --confidence 0.95 \
  --body "原因：1) 成熟稳定 2) 文档完善 3) 支持多币种"
```

### 检索

```bash
# 关键词检索
node bin/cli.mjs search "支付"

# 语义检索（需要先 embed）
node bin/cli.mjs embed
node bin/cli.mjs semantic "好像之前搞过收费的事"

# 混合检索（推荐）
node bin/cli.mjs hybrid "那个收费的事怎么搞的"
```

### 定期维护

```bash
# 每天运行一次
node bin/cli.mjs decay
```

## 记忆层级

| 年龄 | 层级 | 展示效果 |
|------|------|----------|
| 0-3天 | fresh 🟢 | 完整内容 |
| 4-14天 | recent 🔵 | 完整内容 |
| 15-30天 | faded 🟡 | 摘要 + [详细内容已归档] |
| 30天+ | ghost 👻 | [已归档] 前15字... |
| 超过ttl | expired | 不出现在检索结果 |

## 配置

环境变量（可选）：

```bash
export LLM_API_BASE=http://localhost:3456/v1
export LLM_API_KEY=your-key
export LLM_MODEL=gemini-3.1-pro
```

## 项目状态

**试验项目**，验证核心理念。开源化改造待后续进行。
