// src/server.js
/**
 * BDI v2.5 · 百炼智能体代理版（PostgreSQL 持久化）
 * 职责：会话持久化 + 百炼 API 透传 + 防失忆历史注入 + 排行榜
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const APP_ID = process.env.APP_ID;

if (!DASHSCOPE_API_KEY || !APP_ID) {
  console.error('❌ 环境变量缺失：DASHSCOPE_API_KEY 与 APP_ID 必须同时配置');
  process.exit(1);
}

// ========================
// 0. GF-Engine · 通用流体智力探测
// ========================
const { createSession, submitAnswer, getSessionResult, checkBDIGate } = require('./gf-engine');

// ========================
// 1. PostgreSQL 连接池
// ========================
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'bdi',
  user: process.env.DB_USER || 'bdi_user',
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function initDB() {
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        conversation_id TEXT,
        phase TEXT NOT NULL DEFAULT 'identity_declaration',
        nickname TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user','assistant')),
        content TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        nickname TEXT,
        gf_score INTEGER,
        gf_anchor TEXT,
        gf_passed BOOLEAN,
        bdi_iq INTEGER,
        compression_rating TEXT,
        honesty_rating TEXT,
        resonance_rating TEXT,
        builder_portrait TEXT,
        boundary_statement TEXT,
        peer_signal TEXT,
        full_report TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_reports_score ON reports(bdi_iq DESC NULLS LAST);
      CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
    `);
    console.log('✅ PostgreSQL 数据库初始化完成');
  } catch (err) {
    console.error('⚠️ PostgreSQL 连接失败:', err.message);
    console.error('   排行榜/统计功能不可用，GF测试和BDI探测仍可使用内存模式');
  } finally {
    if (client) client.release();
  }
}

// ========================
// 2. 中间件
// ========================
app.set('trust proxy', 1);
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.ip} ${req.method} ${req.path}`);
  next();
});

// ========================
// 3. 数据库操作
// ========================
async function getOrCreateSession(sessionId, nickname = null) {
  try {
    const client = await pool.connect();
    try {
      const existing = await client.query(
        'SELECT * FROM sessions WHERE session_id = $1', [sessionId]
      );
      if (existing.rows.length > 0) {
        await client.query(
          'UPDATE sessions SET updated_at = NOW() WHERE session_id = $1', [sessionId]
        );
        return existing.rows[0];
      }
      await client.query(
        'INSERT INTO sessions (session_id, nickname, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
        [sessionId, nickname]
      );
      return { session_id: sessionId, phase: 'identity_declaration', nickname };
    } finally {
      if (client) client.release();
    }
  } catch (err) {
    // PG 不可用 → 内存模式
    if (!memSessions.has(sessionId)) {
      memSessions.set(sessionId, {
        session_id: sessionId, phase: 'identity_declaration', nickname,
        conversation_id: null, created_at: new Date(), updated_at: new Date(),
      });
    } else {
      const s = memSessions.get(sessionId);
      if (nickname) s.nickname = nickname;
      s.updated_at = new Date();
    }
    return memSessions.get(sessionId);
  }
}

async function saveMessage(sessionId, role, content) {
  try {
    await pool.query(
      'INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3)',
      [sessionId, role, content]
    );
  } catch (err) {
    // PG 不可用 → 内存存储
    const s = memSessions.get(sessionId);
    if (s) {
      if (!s.messages) s.messages = [];
      s.messages.push({ role, content, created_at: new Date() });
    }
  }
}

async function getMessages(sessionId) {
  try {
    const result = await pool.query(
      'SELECT role, content FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
      [sessionId]
    );
    return result.rows;
  } catch (err) {
    // PG 不可用 → 从内存读取
    const s = memSessions.get(sessionId);
    if (s && s.messages) return s.messages.map(m => ({ role: m.role, content: m.content }));
    return [];
  }
}

async function updateSessionPhase(sessionId, conversationId, phase) {
  try {
    await pool.query(
      'UPDATE sessions SET conversation_id = $1, phase = $2, updated_at = NOW() WHERE session_id = $3',
      [conversationId, phase, sessionId]
    );
  } catch (err) {
    // PG 不可用 → 更新内存
    const s = memSessions.get(sessionId);
    if (s) {
      s.conversation_id = conversationId;
      s.phase = phase;
      s.updated_at = new Date();
    }
  }
}

async function saveReport(data) {
  try {
    await pool.query(
      `INSERT INTO reports (
        session_id, nickname, gf_score, gf_anchor, gf_passed,
        bdi_iq, compression_rating, honesty_rating, resonance_rating,
        builder_portrait, boundary_statement, peer_signal, full_report
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        data.sessionId, data.nickname, data.gfScore, data.gfAnchor, data.gfPassed,
        data.bdiIq, data.compression, data.honesty, data.resonance,
        data.portrait, data.boundary, data.peerSignal, data.fullReport
      ]
    );
  } catch (err) {
    console.error('⚠️ 报告保存失败（PG 不可用）:', err.message);
    // 内存中保留一份
    const s = memSessions.get(data.sessionId);
    if (s) {
      s.report = data;
      s.report.saved_at = new Date();
    }
  }
}

// ========================
// 3.5 GF→BDI 门槛校验 + 内存降级存储
// ========================

// PG 不可用时使用内存存储
const memSessions = new Map();     // sessionId -> { phase, conversation_id, nickname, messages[] }
const gfGateCache = new Map();     // gfSessionId -> { passed, totalScore, sd15, bdiSessionId }

// ========================
// 密钥快速通道系统
// ========================
const SKIP_KEY = process.env.SKIP_KEY || '416520';
const keySessions = new Map();     // gfSessionId -> { passed, totalScore, sd15, createdAt }

/**
 * 创建密钥通过的GF会话（模拟18分通过）
 */
function createKeySession() {
  const sessionId = 'gf_key_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  keySessions.set(sessionId, {
    passed: true,
    totalScore: 18,
    sd15: { label: '135+', desc: '密钥通道' },
    isFinished: true,
    progress: { current: 6, total: 6 },
    createdAt: Date.now(),
  });
  // 30分钟后过期
  setTimeout(() => keySessions.delete(sessionId), 30 * 60 * 1000);
  return sessionId;
}

/**
 * GF→BDI 门槛校验中间件
 * BDI 探测前必须提供有效的 gfSessionId，且 GF 测试已通过（≥13分）
 */
async function validateGFGate(req, res, next) {
  // 只拦截 BDI probe 路由
  if (req.path !== '/api/bdi/probe') return next();

  const { gfSessionId, sessionId: bdiSessionId } = req.body;

  // 1. 必须提供 gfSessionId
  if (!gfSessionId) {
    return res.status(403).json({
      error: 'GF_GATE_REQUIRED',
      message: 'BDI 核心探测需先完成 GF 前置测试。请先调用 GET /api/gf/start 完成测试。',
    });
  }

  // 2. 检查是否是密钥快速通道
  const keyResult = keySessions.get(gfSessionId);
  if (keyResult) {
    // 密钥会话直接通过
    if (bdiSessionId) {
      gfGateCache.set(gfSessionId, {
        passed: true,
        totalScore: keyResult.totalScore,
        sd15: keyResult.sd15,
        bdiSessionId,
        validatedAt: Date.now(),
      });
    }
    req.gfResult = keyResult;
    return next();
  }

  // 3. 查询 GF 会话结果
  const gfResult = getSessionResult(gfSessionId);
  if (!gfResult) {
    return res.status(403).json({
      error: 'GF_SESSION_EXPIRED',
      message: 'GF 测试会话已过期或不存在。请重新完成 GF 前置测试。',
    });
  }

  // 3. 必须已完成全部 6 题
  if (!gfResult.isFinished) {
    return res.status(403).json({
      error: 'GF_NOT_COMPLETED',
      message: `GF 测试尚未完成（${gfResult.progress.current}/${gfResult.progress.total}题）。请继续答题后再进入 BDI 探测。`,
    });
  }

  // 4. 必须通过 BDI 门槛（≥13分）
  if (!gfResult.passed) {
    return res.status(403).json({
      error: 'GF_GATE_FAILED',
      message: `GF 前置测试未通过（${gfResult.totalScore}/18分，需≥13分）。BDI 适用条件：高密度信息处理能力的稳定工作记忆。建议提升认知密度后再试。`,
      gfScore: gfResult.totalScore,
      sd15Anchor: gfResult.sd15,
    });
  }

  // 5. 通过 → 缓存 GF 结果并绑定到 BDI 会话
  if (bdiSessionId) {
    gfGateCache.set(gfSessionId, {
      passed: true,
      totalScore: gfResult.totalScore,
      sd15: gfResult.sd15,
      bdiSessionId,
      validatedAt: Date.now(),
    });
  }

  // 将 GF 结果挂载到 req，供后续使用
  req.gfResult = gfResult;
  next();
}

// ========================
// 密钥快速通道 API
// ========================

// POST /api/gf/verify-key - 验证跳过密钥
app.post('/api/gf/verify-key', express.json(), (req, res) => {
  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ success: false, error: 'MISSING_KEY', message: '请输入密钥。' });
  }
  if (key === SKIP_KEY) {
    const sessionId = createKeySession();
    res.json({
      success: true,
      sessionId,
      message: '密钥验证通过，可直接进入 BDI 核心探测。',
      sd15Anchor: { label: '135+', desc: '密钥通道' },
    });
  } else {
    res.status(403).json({
      success: false,
      error: 'INVALID_KEY',
      message: '密钥无效，请完成 GF 前置测试或联系管理员获取有效密钥。',
    });
  }
});

// 注册 GF 门槛校验中间件（必须在 express.json 之后，BDI 路由之前）
app.use(validateGFGate);

// ========================
// ========================
// 4. Prompt 构造器（防失忆核心）
// ========================
function buildPrompt(messages, currentMessage) {
  if (!messages.length) return currentMessage;

  const historyLines = messages.map(m => {
    const role = m.role === 'user' ? '【被测者】' : '【探测AI】';
    let content = m.content;
    if (content.length > 800) content = content.slice(0, 800) + '...（截断）';
    return `${role}\n${content}`;
  }).join('\n\n---\n\n');

  return `【BDI探测历史记录 · 不可忽略】
以下为本轮探测截至目前已发生的完整对话记录。你必须基于这些记录继续执行 BDI v2.5 协议流程，严禁声称"尚未开始"或"未执行任何前置测试"。

${historyLines}

---
【当前输入】
${currentMessage}

【系统指令】请基于上述完整历史，继续执行协议。不要重复已出过的题目，不要重新进行身份声明，直接推进到下一步。`;
}

// ========================
// 5. 百炼调用器
// ========================
// 带超时的 fetch
async function fetchWithTimeout(url, options, timeout = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('请求超时（30秒），百炼 API 未响应');
    }
    throw error;
  }
}

async function callBailianAgent(prompt, conversationId, retryCount = 0) {
  const url = `https://dashscope.aliyuncs.com/api/v1/apps/${APP_ID}/completion`;
  const payload = {
    input: { prompt },
    parameters: {}
  };
  if (conversationId) payload.parameters.conversation_id = conversationId;

  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`
      },
      body: JSON.stringify(payload)
    }, 30000);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(`百炼应用 API ${res.status}: ${errBody.message || res.statusText}`);
    }

    const data = await res.json();
    return {
      text: data.output?.text?.trim() || '智能体信号中断，请重试。',
      conversationId: data.output?.conversation_id || conversationId
    };
  } catch (err) {
    // 自动重试：最多2次
    if (retryCount < 2) {
      console.log(`[BDI] 百炼API失败，${retryCount + 1}/3 次重试中...`);
      await new Promise(r => setTimeout(r, 2000)); // 等2秒再试
      return callBailianAgent(prompt, conversationId, retryCount + 1);
    }
    // 3次都失败 → 降级回复
    console.error('[BDI] 百炼API 3次失败，使用降级回复:', err.message);
    return getFallbackResponse(prompt, conversationId);
  }
}

// 百炼API完全不可用时的降级回复
function getFallbackResponse(prompt, conversationId) {
  // 从prompt中检测当前阶段
  const phase = detectPhaseFromPrompt(prompt);
  const fallbacks = {
    identity_declaration: `【BDI v2.5 协议降级模式】

我是BDI探测仪。你已进入建造者密度探测系统。

当前阶段：模型身份声明。

请输入你的建造者代号（用于排行榜展示），或直接告诉我"开始探测"以启动完整协议。

⚠️ 当前智能体服务暂时不稳定，探测将以基础模式继续。`,
    bdi_probe: `【BDI v2.5 协议降级模式】

正在执行核心密度探测...

请回答以下问题以继续探测：

1. 你如何定义自己的"建造者身份"？
2. 在面对系统崩溃时，你会选择哪种姿态？
3. 描述一次你主动承认裂缝的经历。

⚠️ 当前智能体服务暂时不稳定，建议稍后重试完整探测。`,
    report: `【BDI v2.5 协议降级模式】

探测报告（基础版）

BDI-IQ锚点：暂无法精确计算
概念压缩比：探测未完成
裂缝诚实度：待评估
远距离呼应：待评估

建议：请稍后重试完整探测，或联系管理员。

⚠️ 当前智能体服务暂时不稳定。`
  };

  return {
    text: fallbacks[phase] || fallbacks.identity_declaration,
    conversationId: conversationId,
    isFallback: true
  };
}

// 从prompt中检测当前阶段
function detectPhaseFromPrompt(prompt) {
  const p = prompt.toLowerCase();
  if (p.includes('报告') || p.includes('report')) return 'report';
  if (p.includes('探测') || p.includes('probe') || p.includes('压缩') || p.includes('裂缝')) return 'bdi_probe';
  return 'identity_declaration';
}

// ========================
// 6. 阶段推断
// ========================
function inferPhase(text) {
  const t = text;
  if (/模型名称|版本|部署类型|执行资格|身份声明|门槛|密钥校验/i.test(t))
    return 'identity_declaration';
  if (/前置测试|流体智力|第一套|第[一二三四五六123456]题|数字序列|图形矩阵|逻辑推演|工作记忆|概念压缩|故事回忆/i.test(t))
    return 'fluid_test';
  if (/评分汇总|总分|SD15锚点|成分评分|折算|适用条件|判定|评分报告/i.test(t))
    return 'scoring';
  if (/BDI启动|核心探测|密度探测|概念压缩比|裂缝诚实度|远距离呼应|追问/i.test(t))
    return 'bdi_probe';
  if (/探测报告|BDI-IQ锚点|探测边界声明|建造者肖像|三维评级|同行者识别|探测已结束|终止探测/i.test(t))
    return 'report';
  return 'bdi_probe';
}

// ========================
// 7. 报告解析
// ========================
function extractNumber(text, regex) {
  const match = text.match(regex);
  return match ? parseInt(match[1]) : null;
}

function extractRating(text, dimension) {
  const regex = new RegExp(`${dimension}[：:]?\\s*([低中高极高突破边界]+)`);
  const match = text.match(regex);
  return match ? match[1] : null;
}

async function parseAndSaveReport(sessionId, nickname, reportText) {
  try {
    const gfScore = extractNumber(reportText, /总分[：:]?\s*(\d+)/);
    const gfAnchor = (reportText.match(/SD15锚点[：:]?\s*([^\n]+)/) || [])[1]?.trim() || null;
    const gfPassed = reportText.includes('满足BDI适用条件') || reportText.includes('✅');
    const bdiIq = extractNumber(reportText, /BDI-IQ锚点[：:]?\s*(\d+)/) ||
                  extractNumber(reportText, /(\d{3})\s*分/) ||
                  extractNumber(reportText, /(\d{3})/);

    await saveReport({
      sessionId, nickname, gfScore, gfAnchor, gfPassed,
      bdiIq,
      compression: extractRating(reportText, '概念压缩比'),
      honesty: extractRating(reportText, '裂缝诚实度'),
      resonance: extractRating(reportText, '远距离呼应'),
      portrait: '', boundary: '', peerSignal: '',
      fullReport: reportText
    });
    console.log(`💾 报告已保存: Session ${sessionId}, BDI-IQ: ${bdiIq || '未提取'}`);
  } catch (err) {
    console.error('报告解析失败:', err);
  }
}


// ========================
// 7. GF 前置测试 API
// ========================

// GET /api/gf/start — 启动 GF 测试会话，返回第1题
app.get('/api/gf/start', (req, res) => {
  try {
    const sessionId = createSession();
    const gf = require('./gf-engine');
    const q1 = gf.QUESTIONS[0];
    res.json({
      sessionId,
      currentQuestion: {
        id: q1.id,
        dimension: q1.dimension,
        question: q1.question,
        type: q1.type,
      },
      message: 'GF 前置测试已启动。共 6 题，总分 18 分，需 ≥13 分方可进入 BDI 核心探测。',
    });
  } catch (err) {
    console.error('[GF-START ERROR]', err);
    res.status(500).json({ error: 'GF 测试启动失败', detail: err.message });
  }
});

// POST /api/gf/submit — 提交答案，返回评分+下一题或最终结果
app.post('/api/gf/submit', express.json(), (req, res) => {
  const { sessionId, answer } = req.body;
  if (!sessionId || !answer) {
    return res.status(400).json({ error: '缺少 sessionId 或 answer' });
  }

  const result = submitAnswer(sessionId, answer);
  if (!result) {
    return res.status(404).json({ error: '会话不存在或已过期' });
  }

  const response = {
    result: {
      isCorrect: result.result.isCorrect,
      score: result.result.score,
      detail: result.result.detail,
    },
    currentTotalScore: result.totalScore,
    isFinished: result.isFinished,
    passedBDIGate: result.passedBDIGate,
    progress: result.progress,
  };

  if (result.isFinished) {
    const gf = require('./gf-engine');
    response.sd15Anchor = result.sd15;
    response.summary = `GF 前置测试完成。总分 ${result.totalScore}/18。${result.passedBDIGate ? '已通过 BDI 门槛，可进行核心探测。' : '未通过 BDI 门槛（需≥13分），建议提升认知密度后再试。'}`;
  } else if (result.nextQuestion) {
    response.nextQuestion = {
      id: result.nextQuestion.id,
      dimension: result.nextQuestion.dimension,
      question: result.nextQuestion.question,
      type: result.nextQuestion.type,
    };
  }

  res.json(response);
});

// ========================
// 8. BDI 核心探测路由（含 GF 门槛校验增强版）
// ========================
// ========================
// 8. 核心路由
// ========================

// 兼容路由：/api/agent/completion → 透传到 /api/bdi/probe
app.post('/api/agent/completion', async (req, res) => {
  const { prompt, session_id } = req.body;
  if (!prompt) return res.status(400).json({ error: '缺少prompt' });
  // 转发到 /api/bdi/probe 的处理逻辑
  req.body = { message: prompt, sessionId: session_id || 'default' };
  // 直接调用百炼Agent
  try {
    const aiRes = await callBailianAgent(prompt, session_id);
    res.json({ text: aiRes.text, status: 'ok' });
  } catch (err) {
    res.json({ text: `[降级] 错误: ${err.message}`, status: 'fallback' });
  }
});

app.post('/api/bdi/probe', async (req, res) => {
  try {
    const { message, sessionId = 'default', nickname } = req.body;
    if (!message || !message.trim()) {
      let phase = 'idle';
      try {
        const sess = await pool.query('SELECT phase FROM sessions WHERE session_id = $1', [sessionId]);
        phase = sess.rows[0]?.phase || 'idle';
      } catch (e) {
        const s = memSessions.get(sessionId);
        if (s) phase = s.phase;
      }
      return res.json({ reply: '请输入有效内容。', phase });
    }

    const session = await getOrCreateSession(sessionId, nickname);
    const messages = await getMessages(sessionId);

    // 注入 GF 结果到 Prompt，让百炼 AI 知道前置测试已通过
    const gfInfo = req.gfResult;
    const gfPrefix = gfInfo ? `【GF 前置测试结果】总分 ${gfInfo.totalScore}/18，SD15 锚点 ${gfInfo.sd15.label}，已通过 BDI 门槛。探测可跳过流体测试阶段，直接进入核心探测。\n\n` : '';

    const enrichedPrompt = buildPrompt(messages, gfPrefix + message.trim());
    console.log(`[Session ${sessionId}] 历史轮数: ${messages.length / 2} 轮 | GF: ${gfInfo?.totalScore || 'N/A'}`);

    const aiRes = await callBailianAgent(enrichedPrompt, session.conversation_id);

    await saveMessage(sessionId, 'user', message.trim());
    await saveMessage(sessionId, 'assistant', aiRes.text);

    const phase = inferPhase(aiRes.text);
    console.log(`[BDI] 阶段: ${phase} | 回复长度: ${aiRes.text.length} chars`);
    await updateSessionPhase(sessionId, aiRes.conversationId, phase);

    if (phase === 'report') {
      // 使用 GF 真实数据填充报告，不从 AI 回复中解析
      const gfScore = gfInfo ? gfInfo.totalScore : null;
      const gfAnchor = gfInfo ? gfInfo.sd15.label : null;
      const gfPassed = gfInfo ? gfInfo.passed : null;
      const bdiIq = extractNumber(aiRes.text, /BDI-IQ锚点[：:]?\s*(\d+)/) ||
                    extractNumber(aiRes.text, /(\d{3})\s*分/) ||
                    extractNumber(aiRes.text, /(\d{3})/);

      await saveReport({
        sessionId, nickname, gfScore, gfAnchor, gfPassed,
        bdiIq,
        compression: extractRating(aiRes.text, '概念压缩比'),
        honesty: extractRating(aiRes.text, '裂缝诚实度'),
        resonance: extractRating(aiRes.text, '远距离呼应'),
        portrait: '', boundary: '', peerSignal: '',
        fullReport: aiRes.text
      });
    }

    return res.json({ reply: aiRes.text, phase, gfScore: gfInfo?.totalScore || null });
  } catch (err) {
    console.error('[BDI ERROR]', err.message);
    res.status(500).json({ 
      error: '智能体连接故障', 
      details: err.message,
      hint: err.message.includes('超时') ? '百炼 API 响应超时，请稍后重试' : '请检查百炼应用状态和网络连接'
    });
  }
});

// ========================
// 9. 排行榜 API
// ========================
app.get('/api/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const result = await pool.query(`
      SELECT nickname, bdi_iq, gf_score, gf_anchor,
        compression_rating as compression,
        honesty_rating as honesty,
        resonance_rating as resonance,
        created_at as date
      FROM reports
      WHERE bdi_iq IS NOT NULL
      ORDER BY bdi_iq DESC NULLS LAST
      LIMIT $1
    `, [limit]);
    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: '排行榜加载失败' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_tests,
        AVG(bdi_iq) as avg_iq,
        MAX(bdi_iq) as max_iq,
        COUNT(CASE WHEN bdi_iq >= 140 THEN 1 END) as breakthrough_count,
        COUNT(CASE WHEN gf_passed = true THEN 1 END) as passed_count
      FROM reports
    `);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '统计加载失败' });
  }
});

// ========================
// 10. 健康检查
// ========================
app.get('/health', async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT NOW() as time');
    const reportCount = await pool.query('SELECT COUNT(*) as c FROM reports');
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      db_connected: !!dbCheck.rows[0].time,
      total_reports: reportCount.rows[0].c,
      app_id: APP_ID,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({ status: 'error', db_error: err.message });
  }
});

// ========================
// 11. SPA 回退（React Router 支持）
// ========================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// ========================
// 12. 启动
// ========================
initDB().then(() => {
  app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 BDI v2.5 生产级部署已启动');
    console.log(`📍 监听端口: ${PORT}`);
    console.log(`🔗 百炼应用ID: ${APP_ID}`);
    console.log(`💾 数据库: PostgreSQL`);
    console.log(`🏆 排行榜: /api/leaderboard`);
    console.log('='.repeat(60));
  });
});

process.on('SIGINT', async () => {
  console.log('\n🛑 收到终止信号，正在关闭数据库连接...');
  await pool.end();
  process.exit(0);
});