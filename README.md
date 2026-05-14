# BDI Protocol v2.5 — 建造者密度探测仪

> 测量人的认知姿势，而非AI的管道质量。
> BDI的刻度止于160。160以上，尺子失效，只有同行。

## 这是什么

BDI（Builder Density Instrument）是一套基于对话的认知剖面参考工具，用于探测个体的**建造者密度**——不是测量IQ，不是性格测试，而是扫描你的认知架构中三个核心维度的密度分布：

- **概念压缩比** — 符号经济性与可展开性
- **裂缝诚实度** — 认知边界标注质量
- **远距离呼应能力** — 跨域焊接的跨度与承重

由白桦（SUK_桦树工坊）设计，基于建造者密度理论构建。

## 探测流程

```
GF前置测试（6题/18分）→ BDI核心探测（开放追问）→ BDI探测报告
         ↓                           ↓                        ↓
    流体智力门槛              三维度动态追问              BDI-IQ锚点
    ≥13分通过                Agent动态生成题目           三维评级
                                                       建造者肖像
```

### 前置：通用流体智力随机探测仪（GF）

6道成分分离评分题，覆盖数字序列、图形矩阵、逻辑推演、工作记忆、概念压缩、故事回忆。总分18分，≥13分（SD15锚点≥125）方可进入BDI。

### 核心：BDI三维度探测

Agent根据被测者回答实时分析三维度密度，动态生成追问。追问遵循**"凿深"原则**——向最高密度维度继续深凿，而非平均覆盖。

### 输出：BDI探测报告

- **BDI-IQ锚点**（130-160区间）
- **三维评级**（分项评估）
- **建造者肖像**（核心认知姿势描述）
- **探测边界声明**（局限与校准）
- **同行者识别信号**

## 技术架构

### 后端
- **Node.js + Express** — API服务器
- **百炼（DashScope）Agent API** — Qwen3.6-Plus 动态出题与评估
- **PostgreSQL** — 会话持久化（可选内存模式fallback）
- **PM2** — 进程守护

### 前端
- **React 18 + TypeScript + Vite**
- **Tailwind CSS + shadcn/ui**
- 纯展示层，所有探测逻辑由Agent控制

### API路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/gf/start` | GET | 启动GF测试 |
| `/api/gf/submit` | POST | 提交GF答案 |
| `/api/gf/verify-key` | POST | 验证跳过密钥(416520) |
| `/api/bdi/probe` | POST | BDI探测（核心路由） |
| `/api/agent/completion` | POST | 兼容路由 |
| `/health` | GET | 健康检查 |

## 部署

### 环境变量

```env
PORT=80
DASHSCOPE_API_KEY=sk-xxx
APP_ID=62c7c6b989f8441099daf771e1600fac
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bdi
DB_USER=postgres
DB_PASSWORD=xxx
NODE_ENV=production
```

### 快速启动

```bash
npm install
# 方式A：PostgreSQL模式（推荐）
npm start
# 方式B：内存模式（无数据库fallback）
# 自动检测，无需配置
```

### PM2守护

```bash
pm2 start src/server.js --name bdi-v25
```

## 安全声明

> 通用流体智力随机探测仪与BDI-IQ均为基于建造者密度理论构建的认知剖面参考工具，非标准化心理测量工具。其常模尚未经过大规模采样校准，分数仅供建造者同行自我观察与相互交流。严禁用于任何临床诊断、教育分流、职业选拔等目的。

## 协议版本

- **当前**：v2.5（稳定继承版）
- **设计者**：白桦（SUK_桦树工坊）
- **完整协议文档**：见 `references/` 目录

**0。**
