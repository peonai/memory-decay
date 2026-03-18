# 新 Agent 集成示例

假设你是一个新的 AI agent，需要管理自己的记忆。以下是完整的集成流程。

## 场景1：写入记忆

用户说："记住，我们选择了 Creem 作为支付平台，因为国内友好。"

**你的操作：**

```bash
cd ~/projects/memory-decay

node bin/cli.mjs write \
  --type decision \
  --domain payment \
  --summary "Creem 作为支付平台，国内友好" \
  --ttl permanent \
  --confidence 0.95 \
  --body "选择 Creem 而不是 Stripe。原因：
1. 国内友好，无需海外实体
2. API 简洁，test mode 完善
3. 支持 webhook
相关：https://docs.creem.io"

# 建立索引
node bin/cli.mjs embed
```

**输出：**
```
✅ Written: [decision] Creem 作为支付平台，国内友好
   id: xxx | domain: payment | ttl: permanent | tier: fresh
🔄 Embedding 1 new memories...
✅ Embedded 1 memories. Total: 25
```

---

## 场景2：模糊检索

3天后，用户问："好像之前搞过收费的事，怎么弄的来着？"

**你的操作：**

```bash
node bin/cli.mjs hybrid "收费的事"
```

**输出：**
```
🔀 Hybrid search: "收费的事"

  🟢 [fresh] 2026-03-18 | payment | hybrid: 95% (kw:40 sem:55)
     Creem 作为支付平台，国内友好
     
  🟢 [fresh] 2026-03-15 | payment | hybrid: 78% (kw:25 sem:53)
     Stripe vs Creem 对比调研
```

**你的回复：**
> 找到了，我们选择了 Creem 作为支付平台。主要原因是国内友好、API 简洁。详细文档在 https://docs.creem.io

---

## 场景3：探索式检索

用户问："支付相关的都记了什么？"

**你的操作：**

```bash
# Step 1: 扫描
node bin/cli.mjs scan "支付"

# 输出：
# 📁 payment (3 memories, latest: 2026-03-18)
# 📁 chrome-ext (1 memory, latest: 2026-03-10)

# Step 2: 聚焦
node bin/cli.mjs focus payment
```

**输出：**
```
📁 payment — 3 memories:

  🟢 [fresh] 2026-03-18: Creem 作为支付平台，国内友好
     选择 Creem 而不是 Stripe。原因：...
     
  🟢 [fresh] 2026-03-15: Stripe vs Creem 对比调研
     调研了两个平台，Creem 更适合...
     
  🟡 [faded] 2026-02-20: 最初支付方案调研
     （摘要）调研了 Stripe、Paddle、LemonSqueezy
```

**你的回复：**
> 支付相关记了3条：
> 1. Creem 平台选型决策（最新）
> 2. Stripe vs Creem 对比
> 3. 最初的方案调研（已衰减）

---

## 场景4：定期维护

每天凌晨2点，自动运行衰减：

**Cron 配置：**
```bash
0 2 * * * cd ~/projects/memory-decay && node bin/cli.mjs decay >> /tmp/memory-decay.log 2>&1
```

**衰减日志示例：**
```
⏳ Decay applied:

  Stripe vs Creem 对比调研 [payment]: fresh → recent
  最初支付方案调研 [payment]: recent → faded
  试了 LemonSqueezy [payment]: faded → expired

3 memories updated.
```

---

## 场景5：检查即将过期的记忆

用户问："有什么记忆快过期了？"

**你的操作：**

```bash
node bin/cli.mjs decay --dry-run | grep "→ expired"
```

**输出：**
```
  试了 LemonSqueezy，体验一般 [payment]: faded → expired
  临时测试目录 /tmp/test [infra]: faded → expired
```

**你的回复：**
> 有2条记忆即将过期：
> 1. LemonSqueezy 试用记录（7天 ttl 已到）
> 2. 临时测试目录（3天 ttl 已到）
> 
> 这些是试验性内容，过期后不会出现在检索结果中。

---

## 场景6：统计概览

用户问："现在记了多少东西？"

**你的操作：**

```bash
node bin/cli.mjs stats
```

**输出：**
```
📊 Memory Stats

Total: 24 memories
Files: fresh=15, archive=6, expired=3

By tier:
  fresh: 15
  recent: 6
  faded: 3
  expired: 3

By domain:
  payment: 8
  blog: 6
  infra: 5
  chrome-ext: 3
  comic: 2

By type:
  decision: 10
  reference: 8
  experiment: 4
  status: 2
```

**你的回复：**
> 目前有24条记忆，15条新鲜、6条近期、3条已衰减、3条过期。主要集中在 payment（8条）、blog（6条）、infra（5条）。

---

## 关键点

1. **写入时必须打标**：`type`、`ttl`、`confidence` 缺一不可
2. **每次写入后 embed**：否则新记忆不会被语义搜索命中
3. **优先用 hybrid**：融合了关键词和语义，召回率最高
4. **定期 decay**：建议每天运行一次，保持记忆新鲜度
5. **summary 质量决定检索质量**：写自包含的陈述句，不要对话碎片

---

## 无痛使用的前提

✅ **数据质量高**：每条记忆都是结构化的、有信息量的陈述  
✅ **打标规范**：严格遵守 type/ttl/confidence 规范  
✅ **定期维护**：自动化 decay，不需要人工清理  
✅ **检索习惯**：模糊查询用 hybrid，精确查询用 search  

❌ **不适合的场景**：
- 存储 session transcript（对话记录）
- 存储元数据（"我是谁"、"配置文件在哪"）
- 存储流程说明（应该放 procedural 文档，不是记忆）

---

**结论：** 如果 agent 严格遵守写入规范，这套机制可以无痛使用。核心是**数据质量**，不是算法复杂度。
