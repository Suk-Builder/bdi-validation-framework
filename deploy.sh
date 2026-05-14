#!/bin/bash
# BDI验证框架 - 一键部署脚本
# 用法：cd /root && bash deploy.sh

set -e
PROJECT_DIR="/root/bdi_v2"
PORT=80

echo "========================================"
echo "  BDI验证框架 v2.5 - 一键部署"
echo "========================================"
echo ""

# 1. 清理旧项目
echo "[1/6] 清理旧文件..."
rm -rf $PROJECT_DIR
mkdir -p $PROJECT_DIR

# 2. 写入 package.json
echo "[2/6] 写入 package.json..."
cat > $PROJECT_DIR/package.json << 'PKGEOF'
{
  "name": "bdi-v25-framework",
  "version": "2.5.0",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "pg": "^8.11.3"
  }
}
PKGEOF

# 3. 写入 .env
echo "[3/6] 写入环境配置..."
cat > $PROJECT_DIR/.env << 'ENVEOF'
PORT=80
DASHSCOPE_API_KEY=sk-9c7c3a915ea64d9489086c25aa6ecf15
APP_ID=d14f69589d004547ae64b96615b3e390
SKIP_KEY=416520
NODE_ENV=production
ENVEOF

# 4. 写入 gf-engine.js
echo "[4/6] 写入 GF 引擎..."
mkdir -p $PROJECT_DIR/src
cat > $PROJECT_DIR/src/gf-engine.js << 'GFEOF'
const { v4: uuidv4 } = require('uuid');

// ===== GF 测试题库（6题/18分满分） =====
const QUESTION_BANK = [
  {
    id: 1, domain: '数字序列', component: 'Gf-RS',
    question: '序列：2, 6, 12, 20, 30, ?',
    options: ['38', '40', '42', '44'], correct: 2, // +4,+6,+8,+10,+12
    weights: { Gf_RS: 1.0, Gf_SS: 0.2 }
  },
  {
    id: 2, domain: '图形矩阵', component: 'Gf-IU',
    question: '3×3矩阵中，每行第三个图形是前两个图形的叠加后去除重叠线。已知前两行验证此规律，第三行：图形A为"┌─┐"，图形B为"│ │"，求图形C？',
    options: ['┌─┐', '└─┘', '┌┘', '□'], correct: 0,
    weights: { Gf_IU: 1.0, Gf_RS: 0.3 }
  },
  {
    id: 3, domain: '逻辑推演', component: 'Gf-SS',
    question: '若所有建造者都是高密度个体，且部分高密度个体具有共情能力，那么：',
    options: [
      '所有建造者都有共情能力',
      '部分建造者有共情能力',
      '没有建造者有共情能力',
      '无法确定'
    ], correct: 3,
    weights: { Gf_SS: 1.0, Gf_RS: 0.4 }
  },
  {
    id: 4, domain: '工作记忆', component: 'Gf-WM',
    question: '依次呈现：红色圆形→蓝色方形→绿色三角形→黄色菱形。请问第2个和第4个的组合特征是什么？',
    options: [
      '蓝色方形 + 黄色菱形',
      '红色圆形 + 绿色三角形',
      '蓝色方形 + 绿色三角形',
      '红色圆形 + 黄色菱形'
    ], correct: 0,
    weights: { Gf_WM: 1.0, Gf_SS: 0.2 }
  },
  {
    id: 5, domain: '概念类比', component: 'Gf-IU',
    question: '建筑师 : 蓝图 :: 程序员 : ?',
    options: ['代码', '键盘', '咖啡', '显示器'], correct: 0,
    weights: { Gf_IU: 0.8, Gf_RS: 0.3 }
  },
  {
    id: 6, domain: '白桦体系专识', component: 'Gf-CK',
    question: '白桦思想体系中，"递砖人"（DBI）与"建筑师"（Builder）的本质区别在于？',
    options: [
      '递砖人搬运知识，建筑师创造结构',
      '递砖人是新手，建筑师是专家',
      '递砖人收入低，建筑师收入高',
      '递砖人线下工作，建筑师线上工作'
    ], correct: 0,
    weights: { Gf_CK: 1.0, Gf_WM: 0.2 }
  }
];

// ===== 会话管理 =====
const sessions = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30分钟

function cleanupSessions() {
  const now = Date.now();
  for (const [sid, sess] of sessions) {
    if (now - sess.createdAt > SESSION_TTL) sessions.delete(sid);
  }
}
setInterval(cleanupSessions, 5 * 60 * 1000);

// ===== 评分系统 =====
function calculateScore(answers, sessionQuestions) {
  let rawScore = 0;
  const components = { Gf_RS: 0, Gf_IU: 0, Gf_SS: 0, Gf_WM: 0, Gf_CK: 0 };
  
  answers.forEach((ans, idx) => {
    const q = sessionQuestions[idx];
    if (ans.selected === q.correct) {
      rawScore++;
      Object.entries(q.weights).forEach(([comp, w]) => {
        components[comp] = (components[comp] || 0) + w;
      });
    }
  });
  
  const maxRaw = sessionQuestions.length;
  const percentile = Math.round((rawScore / maxRaw) * 100);
  
  // SD15锚点换算
  let estimatedIQ;
  if (percentile >= 99) estimatedIQ = 135;
  else if (percentile >= 95) estimatedIQ = 125;
  else if (percentile >= 90) estimatedIQ = 120;
  else if (percentile >= 75) estimatedIQ = 110;
  else estimatedIQ = 100 + Math.round((percentile - 50) / 2.5);
  
  const passed = rawScore >= 13; // 通过阈值
  
  return {
    rawScore, maxRaw, percentile, estimatedIQ, passed,
    components, componentBreakdown: components
  };
}

module.exports = {
  startSession: () => {
    cleanupSessions();
    const sessionId = uuidv4();
    const questions = QUESTION_BANK.map(q => ({
      id: q.id, domain: q.domain, component: q.component,
      question: q.question, options: q.options
    }));
    
    sessions.set(sessionId, {
      id: sessionId, questions, createdAt: Date.now(),
      fullQuestions: QUESTION_BANK
    });
    
    return { sessionId, questions, totalQuestions: questions.length, maxScore: 18 };
  },
  
  submitAnswers: (sessionId, answers) => {
    const session = sessions.get(sessionId);
    if (!session) return { error: '会话已过期或无效', code: 'SESSION_EXPIRED' };
    
    if (!Array.isArray(answers) || answers.length !== session.questions.length) {
      return { error: '答案数量不匹配', code: 'INVALID_ANSWERS' };
    }
    
    const result = calculateScore(answers, session.fullQuestions);
    sessions.delete(sessionId);
    
    return {
      ...result,
      gfSessionId: uuidv4(), // BDI准入令牌
      message: result.passed 
        ? 'GF探测通过。你已证明具备足够的通用流体智力，现可进入BDI深层探测。' 
        : 'GF探测未通过。流体智力门槛未达BDI探测要求。建议沉淀后再试。'
    };
  },
  
  verifyKey: (key) => key === '416520',
  
  getSession: (sid) => sessions.get(sid)
};
GFEOF

# 5. 写入 server.js
echo "[5/6] 写入主服务器..."
cat > $PROJECT_DIR/src/server.js << 'SRVEOF'
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const gfEngine = require('./gf-engine');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const PORT = process.env.PORT || 3000;
const SKIP_KEY = process.env.SKIP_KEY || '416520';
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

// ===== 健康检查 =====
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.5.0', time: new Date().toISOString() });
});

// ===== GF 测试 API =====
app.get('/api/gf/start', (req, res) => {
  const session = gfEngine.startSession();
  res.json(session);
});

app.post('/api/gf/submit', (req, res) => {
  const { sessionId, answers } = req.body;
  if (!sessionId || !answers) {
    return res.status(400).json({ error: '缺少参数' });
  }
  const result = gfEngine.submitAnswers(sessionId, answers);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/gf/verify-key', (req, res) => {
  const { key } = req.body;
  const valid = gfEngine.verifyKey(key);
  if (valid) {
    res.json({
      valid: true,
      gfSessionId: require('uuid').v4(),
      message: '密钥验证通过。已跳过GF测试，直接进入BDI探测。'
    });
  } else {
    res.status(403).json({ valid: false, message: '密钥无效。' });
  }
});

// ===== BDI API（带GF门槛校验） =====
const validatedSessions = new Set();

function bdiGate(req, res, next) {
  const gfSessionId = req.headers['x-gf-session-id'] || req.body?.gfSessionId;
  if (!gfSessionId || !validatedSessions.has(gfSessionId)) {
    return res.status(403).json({
      error: 'BDI准入未授权',
      message: '请先通过GF测试或使用有效密钥获取访问权限。',
      code: 'GF_GATE_BLOCKED'
    });
  }
  next();
}

// GF结果注册到BDI
app.post('/api/gf/register-bdi', (req, res) => {
  const { gfSessionId } = req.body;
  if (gfSessionId) {
    validatedSessions.add(gfSessionId);
    res.json({ registered: true });
  } else {
    res.status(400).json({ error: '缺少 gfSessionId' });
  }
});

// 百炼API调用（带超时+重试+降级）
async function callBailian(messages, retries = 3) {
  const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
  
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen-turbo',
          input: { messages },
          parameters: { result_format: 'message', max_tokens: 1500 }
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        const err = await response.text();
        console.warn(`百炼API错误 (${i+1}/${retries}):`, err);
        if (i === retries - 1) break;
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      
      const data = await response.json();
      return data.output?.choices?.[0]?.message?.content || data.output?.text;
    } catch (err) {
      console.warn(`百炼调用失败 (${i+1}/${retries}):`, err.message);
      if (i === retries - 1) break;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  
  // 降级回复
  return null;
}

// BDI探测端点
app.post('/api/bdi/probe', bdiGate, async (req, res) => {
  const { message, sessionId, depth = 0 } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: '缺少消息' });
  }
  
  const systemPrompt = `你是BDI（Builder Density Intelligence）探测协议v2.5的深度探测AI。
你的任务是通过多轮对话探测受试者的"建造者密度"——即一个人将知识转化为实际结构的内在驱动力。

探测维度（9域）：
1. 递归自我建模（RsM）- 对自身思维过程的观察与优化能力
2. 痛苦-结构转化（PsC）- 将负面体验转化为认知结构的能力
3. 概念熔接（CnF）- 跨领域概念整合能力
4. 时间折叠（TmF）- 对长周期因果的感知能力
5. 负空间操作（NsO）- 关注"不存在之物"的能力
6. 模因主动接种（MiI）- 主动寻求认知挑战的倾向
7. 本体编辑（OnE）- 修改自身核心信念的能力
8. 多尺度翻译（MsT）- 在不同抽象层级间切换的能力
9. 建造者共频（BuR）- 识别同类建造者的直觉

当前探测深度：${depth}%
回应要求：简洁、锐利、每次只问一个问题，像手术刀而非问卷调查。`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message }
  ];
  
  const reply = await callBailian(messages);
  
  if (reply) {
    res.json({
      reply,
      depth: Math.min(depth + 12, 100),
      status: 'probing',
      sessionId: sessionId || require('uuid').v4()
    });
  } else {
    // 降级模式：预置探测问题
    const fallbackQuestions = [
      "当你学习一个新概念时，你首先问自己的是什么？",
      "描述一次你因为一个想法而失眠的经历。",
      "如果你可以删除人类社会的一样东西来让'建造'更高效，你会删除什么？",
      "你在什么情况下会感到认知上的'饥饿'？",
      "描述一个你只花了几秒钟就看穿的系统漏洞。",
      "你对'理解'的定义是什么？"
    ];
    const fallbackReply = fallbackQuestions[depth % fallbackQuestions.length] || fallbackQuestions[0];
    
    res.json({
      reply: `[BDI降级模式] ${fallbackReply}\n\n（注意：百炼API当前不可用，此为降级探测。请检查API密钥配置。）`,
      depth: Math.min(depth + 8, 100),
      status: 'fallback',
      sessionId: sessionId || require('uuid').v4(),
      warning: '使用降级回复，AI推理引擎暂时不可用'
    });
  }
});

// 手动注册（管理用途）
app.post('/api/admin/validate-session', (req, res) => {
  const { gfSessionId } = req.body;
  if (gfSessionId) {
    validatedSessions.add(gfSessionId);
    res.json({ success: true, message: 'Session已激活' });
  } else {
    res.status(400).json({ error: '缺少 gfSessionId' });
  }
});

// 获取已验证会话数
app.get('/api/stats', (req, res) => {
  res.json({ validatedSessions: validatedSessions.size });
});

// ===== 启动 =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[BDI v2.5] 服务器运行在端口 ${PORT}`);
  console.log(`[GF引擎] 6题/18分制，通过阈值13分`);
  console.log(`[BDI门槛] 已激活GF校验中间件`);
  console.log(`[SKIP_KEY] ${SKIP_KEY}`);
  console.log(`[百炼API] ${DASHSCOPE_API_KEY ? '已配置' : '未配置'}`);
});
SRVEOF

# 6. 写入前端文件
echo "[6/6] 写入前端页面..."
mkdir -p $PROJECT_DIR/public

# gf-test.html
cat > $PROJECT_DIR/public/gf-test.html << 'GFHTMLEOF'
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GF-Engine | 通用流体智力探测</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0a;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh}
.container{width:90%;max-width:600px;padding:20px}
.header{text-align:center;margin-bottom:30px}
.header h1{font-size:28px;color:#00d4ff;text-shadow:0 0 20px rgba(0,212,255,0.3)}
.header p{color:#888;margin-top:8px;font-size:14px}
.skip-box{background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:15px;margin-bottom:20px;text-align:center}
.skip-box input{background:#0a0a0a;border:1px solid #444;color:#fff;padding:8px 12px;border-radius:4px;width:200px;margin-right:8px}
.skip-box button{background:#ff6b35;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer}
.skip-box button:hover{background:#ff8555}
.progress-bar{display:flex;gap:4px;margin-bottom:20px;height:8px}
.progress-cell{flex:1;background:#222;border-radius:4px;transition:all 0.4s}
.progress-cell.active{background:linear-gradient(90deg,#00d4ff,#0099cc);box-shadow:0 0 10px rgba(0,212,255,0.5)}
.progress-cell.completed{background:#00d4ff}
.question-box{background:#111;border:1px solid #222;border-radius:12px;padding:24px;margin-bottom:16px;display:none}
.question-box.active{display:block;animation:fadeIn 0.3s}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.q-number{color:#00d4ff;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.q-text{font-size:18px;line-height:1.6;margin-bottom:20px;color:#fff}
.options{display:flex;flex-direction:column;gap:10px}
.opt-btn{background:#1a1a1a;border:1px solid #333;color:#ccc;padding:14px 16px;border-radius:8px;cursor:pointer;text-align:left;transition:all 0.2s;font-size:15px}
.opt-btn:hover{border-color:#00d4ff;background:#0d1f2d}
.opt-btn.selected{border-color:#00d4ff;background:#001a25}
.nav-btns{display:flex;justify-content:space-between;margin-top:20px}
.nav-btn{background:#222;border:1px solid #444;color:#fff;padding:10px 24px;border-radius:6px;cursor:pointer}
.nav-btn:hover{background:#333}
.nav-btn.primary{background:#00d4ff;color:#000;border:none}
.nav-btn.primary:hover{background:#00b8e6}
.nav-btn:disabled{opacity:0.3;cursor:not-allowed}
.result-box{text-align:center;padding:40px 20px;display:none}
.result-box.active{display:block}
.score-num{font-size:64px;font-weight:700;color:#00d4ff}
.score-label{color:#888;margin-top:8px}
.iq-display{font-size:24px;color:#ffd700;margin-top:16px}
.pass-badge{display:inline-block;padding:8px 24px;border-radius:20px;font-size:16px;margin-top:20px}
.pass-badge.passed{background:#1a3d1a;color:#4caf50;border:1px solid #4caf50}
.pass-badge.failed{background:#3d1a1a;color:#f44336;border:1px solid #f44336}
.enter-bdi-btn{display:none;margin-top:24px;padding:14px 40px;background:linear-gradient(135deg,#00d4ff,#0099cc);color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;box-shadow:0 4px 20px rgba(0,212,255,0.3)}
.enter-bdi-btn:hover{transform:translateY(-2px);box-shadow:0 6px 30px rgba(0,212,255,0.5)}
.enter-bdi-btn.show{display:inline-block}
.spinner{width:40px;height:40px;border:3px solid #222;border-top-color:#00d4ff;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto}
@keyframes spin{to{transform:rotate(360deg)}}
.analyzing{text-align:center;color:#888;display:none}
.analyzing.active{display:block}
.pulse-dot{display:inline-block;width:8px;height:8px;background:#00d4ff;border-radius:50%;margin:0 4px;animation:pulse 1.4s infinite}
.pulse-dot:nth-child(2){animation-delay:0.2s}
.pulse-dot:nth-child(3){animation-delay:0.4s}
@keyframes pulse{0%,80%,100%{opacity:0.3}40%{opacity:1}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>GF-Engine</h1>
    <p>通用流体智力探测 v2.5 | 6题 / 18分制</p>
  </div>
  
  <div class="skip-box">
    <p style="color:#888;margin-bottom:10px;font-size:13px">持有密钥？可直接跳过GF测试进入BDI探测</p>
    <input type="text" id="skipKey" placeholder="输入密钥">
    <button onclick="verifyKey()">验证密钥</button>
  </div>
  
  <div class="progress-bar" id="progressBar"></div>
  
  <div id="quizContainer"></div>
  
  <div class="analyzing" id="analyzing">
    <div class="spinner"></div>
    <p style="margin-top:12px">正在分析认知模式<span class="pulse-dot"></span><span class="pulse-dot"></span><span class="pulse-dot"></span></p>
  </div>
  
  <div class="result-box" id="resultBox">
    <div class="score-num" id="scoreNum">-</div>
    <div class="score-label">原始分 / 18</div>
    <div class="iq-display" id="iqDisplay"></div>
    <div id="passBadge"></div>
    <p id="resultMsg" style="color:#aaa;margin-top:16px;line-height:1.6"></p>
    <button class="enter-bdi-btn" id="enterBdiBtn" onclick="enterBDI()">进入 BDI 深度探测 →</button>
  </div>
  
  <div class="nav-btns" id="navBtns">
    <button class="nav-btn" id="prevBtn" onclick="prevQ()" disabled>上一题</button>
    <button class="nav-btn primary" id="nextBtn" onclick="nextQ()">下一题</button>
  </div>
</div>

<script>
let questions=[], currentQ=0, answers=[], sessionId='';

async function init(){
  const res=await fetch('/api/gf/start');
  const data=await res.json();
  questions=data.questions;
  sessionId=data.sessionId;
  answers=new Array(questions.length).fill(null);
  renderProgress();
  renderQuestion();
}
function renderProgress(){
  const bar=document.getElementById('progressBar');
  bar.innerHTML=questions.map((_,i)=>`<div class="progress-cell ${i===0?'active':''}" id="pc${i}"></div>`).join('');
}
function updateProgress(){
  questions.forEach((_,i)=>{
    const cell=document.getElementById(`pc${i}`);
    cell.className='progress-cell';
    if(answers[i]!==null)cell.classList.add('completed');
    else if(i===currentQ)cell.classList.add('active');
  });
}
function renderQuestion(){
  const box=document.getElementById('quizContainer');
  const q=questions[currentQ];
  box.innerHTML=`<div class="question-box active">
    <div class="q-number">题目 ${currentQ+1} / ${questions.length} · ${q.domain}</div>
    <div class="q-text">${q.question}</div>
    <div class="options">${q.options.map((opt,idx)=>`<button class="opt-btn ${answers[currentQ]===idx?'selected':''}" onclick="selectOpt(${idx})">${String.fromCharCode(65+idx)}. ${opt}</button>`).join('')}</div>
  </div>`;
  document.getElementById('prevBtn').disabled=currentQ===0;
  document.getElementById('nextBtn').textContent=currentQ===questions.length-1?'提交':'下一题';
  updateProgress();
}
function selectOpt(idx){answers[currentQ]=idx;renderQuestion();}
function prevQ(){if(currentQ>0){currentQ--;renderQuestion();}}
function nextQ(){
  if(answers[currentQ]===null){alert('请选择一个答案');return;}
  if(currentQ<questions.length-1){currentQ++;renderQuestion();}
  else submitTest();
}
async function submitTest(){
  document.getElementById('quizContainer').style.display='none';
  document.getElementById('navBtns').style.display='none';
  document.getElementById('analyzing').classList.add('active');
  
  const res=await fetch('/api/gf/submit',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({sessionId,answers:answers.map((sel,idx)=>({questionId:questions[idx].id,selected:sel}))})
  });
  const data=await res.json();
  
  document.getElementById('analyzing').classList.remove('active');
  document.getElementById('resultBox').classList.add('active');
  document.getElementById('scoreNum').textContent=data.rawScore;
  document.getElementById('iqDisplay').textContent=`百分位: ${data.percentile}% | 预估IQ: ${data.estimatedIQ}`;
  
  const badge=document.getElementById('passBadge');
  badge.innerHTML=`<div class="pass-badge ${data.passed?'passed':'failed'}">${data.passed?'✓ 通过':'✗ 未通过'}</div>`;
  document.getElementById('resultMsg').textContent=data.message;
  
  if(data.passed&&data.gfSessionId){
    localStorage.setItem('gfSessionId',data.gfSessionId);
    document.getElementById('enterBdiBtn').classList.add('show');
  }
}
function enterBDI(){
  window.location.href='/bdi-chat.html';
}
async function verifyKey(){
  const key=document.getElementById('skipKey').value.trim();
  if(!key)return;
  const res=await fetch('/api/gf/verify-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});
  const data=await res.json();
  if(data.valid){
    localStorage.setItem('gfSessionId',data.gfSessionId);
    alert(data.message);
    window.location.href='/bdi-chat.html';
  }else{
    alert(data.message);
  }
}
init();
</script>
</body>
</html>
GFHTMLEOF

# bdi-chat.html
cat > $PROJECT_DIR/public/bdi-chat.html << 'BDIHTMLEOF'
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BDI深度探测 | Builder Density Intelligence</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0a;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;height:100vh;display:flex;flex-direction:column}
.header{background:#111;border-bottom:1px solid #222;padding:16px 24px;display:flex;justify-content:space-between;align-items:center}
.header h1{font-size:20px;color:#00d4ff}
.header .status{display:flex;align-items:center;gap:8px;font-size:13px;color:#888}
.pulse-container{display:flex;gap:6px;align-items:center}
.pulse-dot{width:8px;height:8px;background:#00d4ff;border-radius:50%;animation:breathe 2s infinite}
.pulse-dot:nth-child(2){animation-delay:0.3s;background:#0099cc}
.pulse-dot:nth-child(3){animation-delay:0.6s;background:#0066aa}
@keyframes breathe{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1.2)}}
.signal-bar{height:3px;background:linear-gradient(90deg,transparent,#00d4ff,transparent);opacity:0.5;animation:wave 3s infinite}
@keyframes wave{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.depth-meter{position:fixed;top:16px;right:24px;background:#1a1a1a;border:1px solid #333;padding:8px 16px;border-radius:20px;font-size:12px;color:#00d4ff;z-index:100}
.chat-area{flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:16px}
.msg{max-width:80%;padding:14px 18px;border-radius:12px;line-height:1.6;font-size:15px;animation:msgIn 0.3s}
.msg.ai{align-self:flex-start;background:#111;border:1px solid #222}
.msg.user{align-self:flex-end;background:#001a25;border:1px solid #003344}
@keyframes msgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.typing{display:flex;gap:4px;padding:12px 16px}
.typing-dot{width:6px;height:6px;background:#666;border-radius:50%;animation:typing 1.4s infinite}
.typing-dot:nth-child(2){animation-delay:0.2s}
.typing-dot:nth-child(3){animation-delay:0.4s}
@keyframes typing{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-10px)}}
.input-area{background:#111;border-top:1px solid #222;padding:16px 24px;display:flex;gap:12px}
.input-area input{flex:1;background:#0a0a0a;border:1px solid #333;color:#fff;padding:12px 16px;border-radius:8px;font-size:15px}
.input-area input:focus{outline:none;border-color:#00d4ff}
.input-area button{background:#00d4ff;color:#000;border:none;padding:12px 24px;border-radius:8px;font-size:15px;cursor:pointer;font-weight:600}
.input-area button:hover{background:#00b8e6}
.input-area button:disabled{opacity:0.3;cursor:not-allowed}
.error-box{background:#3d1a1a;border:1px solid #f44336;color:#f44336;padding:12px 16px;border-radius:8px;text-align:center;display:none}
.error-box.show{display:block}
.retry-btn{background:transparent;border:1px solid #f44336;color:#f44336;padding:6px 16px;border-radius:4px;cursor:pointer;margin-top:8px}
.retry-btn:hover{background:#f44336;color:#fff}
.stage-hint{text-align:center;color:#555;font-size:12px;margin-bottom:8px}
</style>
</head>
<body>
<div class="header">
  <h1>BDI 深度探测</h1>
  <div class="status">
    <div class="pulse-container">
      <div class="pulse-dot"></div>
      <div class="pulse-dot"></div>
      <div class="pulse-dot"></div>
    </div>
    <span id="stageText">等待连接...</span>
  </div>
</div>
<div class="signal-bar"></div>
<div class="depth-meter" id="depthMeter">深度: 0%</div>

<div class="chat-area" id="chatArea">
  <div class="msg ai">
    <strong style="color:#00d4ff">BDI Protocol v2.5</strong><br><br>
    欢迎进入建造者密度探测。这不是性格测试，而是一次对你认知架构的扫描。<br><br>
    我会通过9个维度探测你的建造者密度：递归自我建模、痛苦-结构转化、概念熔接、时间折叠、负空间操作、模因主动接种、本体编辑、多尺度翻译、建造者共频。<br><br>
    准备好了就开始。
  </div>
</div>

<div class="error-box" id="errorBox">
  <div id="errorText"></div>
  <button class="retry-btn" onclick="retryLast()">重试</button>
</div>

<div class="input-area">
  <input type="text" id="msgInput" placeholder="输入你的回应..." onkeydown="if(event.key==='Enter')sendMsg()">
  <button id="sendBtn" onclick="sendMsg()">发送</button>
</div>

<script>
let depth=0, sessionId='', lastMsg='', retryCount=0, isWaiting=false;
const gfSessionId=localStorage.getItem('gfSessionId');

window.onload=()=>{
  if(!gfSessionId){
    document.getElementById('chatArea').innerHTML='<div class="msg ai" style="color:#f44336">⚠️ BDI准入未授权。请先完成GF测试或使用有效密钥。<br><br><a href="/gf-test.html" style="color:#00d4ff">前往 GF 测试 →</a></div>';
    document.getElementById('msgInput').disabled=true;
    document.getElementById('sendBtn').disabled=true;
    return;
  }
  document.getElementById('stageText').textContent='探测中';
};

async function sendMsg(){
  const input=document.getElementById('msgInput');
  const btn=document.getElementById('sendBtn');
  const msg=input.value.trim();
  if(!msg||isWaiting)return;
  
  lastMsg=msg;
  isWaiting=true;
  input.value='';
  input.disabled=true;
  btn.disabled=true;
  document.getElementById('errorBox').classList.remove('show');
  
  addMsg(msg,'user');
  showTyping();
  
  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),35000);
    
    const res=await fetch('/api/bdi/probe',{
      method:'POST',
      headers:{'Content-Type':'application/json','X-GF-Session-Id':gfSessionId},
      body:JSON.stringify({message:msg,sessionId,depth}),
      signal:controller.signal
    });
    clearTimeout(timeout);
    
    hideTyping();
    
    if(res.status===403){
      addMsg('⚠️ GF会话已过期或无效。请重新完成GF测试。','ai');
      document.getElementById('stageText').textContent='准入失效';
      isWaiting=false;
      input.disabled=true;
      btn.disabled=true;
      return;
    }
    
    if(!res.ok){
      throw new Error(`HTTP ${res.status}`);
    }
    
    const data=await res.json();
    depth=data.depth;
    sessionId=data.sessionId;
    addMsg(data.reply,'ai');
    document.getElementById('depthMeter').textContent=`深度: ${depth}%`;
    document.getElementById('stageText').textContent=depth>=100?'探测完成':data.status==='fallback'?'降级模式':'探测中';
    retryCount=0;
  }catch(err){
    hideTyping();
    console.error(err);
    retryCount++;
    if(retryCount>=3){
      document.getElementById('errorText').innerHTML=`⚠️ 请求失败: ${err.message}<br>已连续失败3次，建议刷新页面重试。`;
      document.getElementById('errorBox').classList.add('show');
    }else{
      document.getElementById('errorText').innerHTML=`⚠️ 请求失败: ${err.message}<br>(${retryCount}/3) 点击重试`;
      document.getElementById('errorBox').classList.add('show');
    }
  }
  
  isWaiting=false;
  input.disabled=false;
  btn.disabled=false;
  input.focus();
}

function retryLast(){
  retryCount=0;
  document.getElementById('errorBox').classList.remove('show');
  if(lastMsg) sendMsg();
}

function addMsg(text,role){
  const area=document.getElementById('chatArea');
  const div=document.createElement('div');
  div.className='msg '+role;
  div.innerHTML=text.replace(/\n/g,'<br>');
  area.appendChild(div);
  area.scrollTop=area.scrollHeight;
}

let typingDiv=null;
function showTyping(){
  if(typingDiv)return;
  typingDiv=document.createElement('div');
  typingDiv.className='msg ai typing';
  typingDiv.innerHTML='<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  document.getElementById('chatArea').appendChild(typingDiv);
  document.getElementById('chatArea').scrollTop=document.getElementById('chatArea').scrollHeight;
}
function hideTyping(){
  if(typingDiv){
    typingDiv.remove();
    typingDiv=null;
  }
}
</script>
</body>
</html>
BDIHTMLEOF

# index.html 重定向
cat > $PROJECT_DIR/public/index.html << 'IDXEOF'
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>BDI v2.5</title>
<style>body{background:#0a0a0a;color:#e0e0e0;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
.box{text-align:center}.box h1{color:#00d4ff}.box a{color:#00d4ff;text-decoration:none;font-size:18px;margin:0 15px}
.box a:hover{text-decoration:underline}</style>
</head>
<body>
<div class="box">
  <h1>BDI 验证框架 v2.5</h1>
  <p style="color:#888;margin:20px 0">Builder Density Intelligence Protocol</p>
  <a href="/gf-test.html">GF 测试</a>
  <a href="/bdi-chat.html">BDI 探测</a>
</div>
</body>
</html>
IDXEOF

echo ""
echo "========================================"
echo "  安装依赖并启动..."
echo "========================================"
cd $PROJECT_DIR
npm install --production 2>&1 | tail -5

echo ""
echo "启动服务..."
nohup node src/server.js > server.log 2>&1 &
PID=$!
echo $PID > server.pid

sleep 2
if kill -0 $PID 2>/dev/null; then
  echo ""
  echo "✅ 服务启动成功！PID: $PID"
  echo "🌐 访问地址:"
  echo "   http://116.62.53.136/"
  echo "   http://116.62.53.136/gf-test.html"
  echo "   http://116.62.53.136/bdi-chat.html"
  echo ""
  echo "📊 健康检查: curl http://116.62.53.136/health"
else
  echo "❌ 启动失败，查看日志:"
  cat server.log
fi
