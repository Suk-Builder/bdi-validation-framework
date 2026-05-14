#!/usr/bin/env python3
# BDI v2.5 全自动部署脚本 - 在阿里云终端直接运行
# python3 setup_bdi.py

import os, json, textwrap

BASE = "/root/bdi_v2"
os.makedirs(f"{BASE}/src", exist_ok=True)
os.makedirs(f"{BASE}/public", exist_ok=True)

# ===== package.json =====
with open(f"{BASE}/package.json", "w") as f:
    json.dump({
        "name": "bdi-v25-framework",
        "version": "2.5.0",
        "main": "src/server.js",
        "scripts": {"start": "node src/server.js"},
        "dependencies": {"express": "^4.18.2", "cors": "^2.8.5", "dotenv": "^16.3.1", "pg": "^8.11.3"}
    }, f, indent=2)

# ===== .env =====
with open(f"{BASE}/.env", "w") as f:
    f.write("PORT=80\nDASHSCOPE_API_KEY=sk-9c7c3a915ea64d9489086c25aa6ecf15\nAPP_ID=d14f69589d004547ae64b96615b3e390\nSKIP_KEY=416520\nNODE_ENV=production\n")

# ===== gf-engine.js =====
with open(f"{BASE}/src/gf-engine.js", "w") as f:
    f.write(textwrap.dedent('''
const { v4: uuidv4 } = require('uuid');

const QUESTION_BANK = [
  { id: 1, domain: '数字序列', component: 'Gf-RS',
    question: '序列：2, 6, 12, 20, 30, ?',
    options: ['38', '40', '42', '44'], correct: 2,
    weights: { Gf_RS: 1.0, Gf_SS: 0.2 } },
  { id: 2, domain: '图形矩阵', component: 'Gf-IU',
    question: '叠加去重叠：图形A为"┌─┐"，图形B为"│ │"，求叠加后的图形C？',
    options: ['┌─┐', '└─┘', '┌┘', '□'], correct: 0,
    weights: { Gf_IU: 1.0, Gf_RS: 0.3 } },
  { id: 3, domain: '逻辑推演', component: 'Gf-SS',
    question: '若所有建造者都是高密度个体，且部分高密度个体具有共情能力，那么：',
    options: ['所有建造者都有共情能力', '部分建造者有共情能力', '没有建造者有共情能力', '无法确定'], correct: 3,
    weights: { Gf_SS: 1.0, Gf_RS: 0.4 } },
  { id: 4, domain: '工作记忆', component: 'Gf-WM',
    question: '依次呈现：红圆→蓝方→绿三角→黄菱形。第2个和第4个的组合是？',
    options: ['蓝色方形 + 黄色菱形', '红色圆形 + 绿色三角形', '蓝色方形 + 绿色三角形', '红色圆形 + 黄色菱形'], correct: 0,
    weights: { Gf_WM: 1.0, Gf_SS: 0.2 } },
  { id: 5, domain: '概念类比', component: 'Gf-IU',
    question: '建筑师 : 蓝图 :: 程序员 : ?',
    options: ['代码', '键盘', '咖啡', '显示器'], correct: 0,
    weights: { Gf_IU: 0.8, Gf_RS: 0.3 } },
  { id: 6, domain: '白桦体系', component: 'Gf-CK',
    question: '白桦体系中，"递砖人"与"建筑师"的本质区别在于？',
    options: ['递砖人搬运知识，建筑师创造结构', '递砖人是新手，建筑师是专家', '递砖人收入低，建筑师收入高', '递砖人线下，建筑师线上'], correct: 0,
    weights: { Gf_CK: 1.0, Gf_WM: 0.2 } }
];

const sessions = new Map();
const SESSION_TTL = 30 * 60 * 1000;
setInterval(() => { const now = Date.now(); for (const [sid, s] of sessions) if (now - s.createdAt > SESSION_TTL) sessions.delete(sid); }, 5 * 60 * 1000);

function calcScore(answers, fullQ) {
  let raw = 0; const comp = { Gf_RS: 0, Gf_IU: 0, Gf_SS: 0, Gf_WM: 0, Gf_CK: 0 };
  answers.forEach((ans, i) => {
    const q = fullQ[i];
    if (ans.selected === q.correct) { raw++; Object.entries(q.weights).forEach(([c, w]) => comp[c] = (comp[c] || 0) + w); }
  });
  const pct = Math.round((raw / fullQ.length) * 100);
  let iq; if (pct >= 99) iq = 135; else if (pct >= 95) iq = 125; else if (pct >= 90) iq = 120; else if (pct >= 75) iq = 110; else iq = 100 + Math.round((pct - 50) / 2.5);
  return { rawScore: raw, maxRaw: fullQ.length, percentile: pct, estimatedIQ: iq, passed: raw >= 4, components: comp };
}

module.exports = {
  startSession: () => {
    const sid = uuidv4();
    const qs = QUESTION_BANK.map(q => ({ id: q.id, domain: q.domain, component: q.component, question: q.question, options: q.options }));
    sessions.set(sid, { id: sid, questions: qs, createdAt: Date.now(), fullQuestions: QUESTION_BANK });
    return { sessionId: sid, questions: qs, totalQuestions: qs.length, maxScore: 6 };
  },
  submitAnswers: (sid, answers) => {
    const s = sessions.get(sid);
    if (!s) return { error: '会话已过期', code: 'SESSION_EXPIRED' };
    if (!Array.isArray(answers) || answers.length !== s.questions.length) return { error: '答案数量不匹配', code: 'INVALID_ANSWERS' };
    const r = calcScore(answers, s.fullQuestions);
    sessions.delete(sid);
    return { ...r, gfSessionId: uuidv4(), message: r.passed ? 'GF探测通过，可进入BDI深层探测。' : 'GF探测未通过，流体智力门槛未达BDI要求。建议沉淀后再试。' };
  },
  verifyKey: (k) => k === '416520',
  getSession: (sid) => sessions.get(sid)
};
''').strip() + '\n')

# ===== server.js =====
with open(f"{BASE}/src/server.js", "w") as f:
    f.write(textwrap.dedent('''
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

app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.5.0', time: new Date().toISOString() }));

app.get('/api/gf/start', (req, res) => { const s = gfEngine.startSession(); res.json(s); });

app.post('/api/gf/submit', (req, res) => {
  const { sessionId, answers } = req.body;
  if (!sessionId || !answers) return res.status(400).json({ error: '缺少参数' });
  const r = gfEngine.submitAnswers(sessionId, answers);
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

app.post('/api/gf/verify-key', (req, res) => {
  if (gfEngine.verifyKey(req.body.key)) res.json({ valid: true, gfSessionId: require('uuid').v4(), message: '密钥验证通过。已跳过GF测试，直接进入BDI探测。' });
  else res.status(403).json({ valid: false, message: '密钥无效。' });
});

const validatedSessions = new Set();
app.post('/api/gf/register-bdi', (req, res) => { const { gfSessionId } = req.body; if (gfSessionId) { validatedSessions.add(gfSessionId); res.json({ registered: true }); } else res.status(400).json({ error: '缺少 gfSessionId' }); });

function bdiGate(req, res, next) {
  const gid = req.headers['x-gf-session-id'] || req.body?.gfSessionId;
  if (!gid || !validatedSessions.has(gid)) return res.status(403).json({ error: 'BDI准入未授权', message: '请先通过GF测试或使用有效密钥。', code: 'GF_GATE_BLOCKED' });
  next();
}

async function callBailian(msgs, retries = 3) {
  const fetch = (...a) => import('node-fetch').then(({default: f}) => f(...a));
  for (let i = 0; i < retries; i++) {
    try {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 30000);
      const r = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
        method: 'POST', headers: { 'Authorization': `Bearer ${DASHSCOPE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'qwen-turbo', input: { messages: msgs }, parameters: { result_format: 'message', max_tokens: 1500 } }),
        signal: ctrl.signal
      });
      clearTimeout(to);
      if (!r.ok) { if (i === retries - 1) break; await new Promise(r => setTimeout(r, 2000 * (i + 1))); continue; }
      const d = await r.json(); return d.output?.choices?.[0]?.message?.content || d.output?.text;
    } catch (e) { if (i === retries - 1) break; await new Promise(r => setTimeout(r, 2000 * (i + 1))); }
  }
  return null;
}

app.post('/api/bdi/probe', bdiGate, async (req, res) => {
  const { message, sessionId, depth = 0 } = req.body;
  if (!message) return res.status(400).json({ error: '缺少消息' });
  const sys = `你是BDI探测协议v2.5的深度探测AI。通过多轮对话探测受试者的"建造者密度"。\n探测维度（9域）：递归自我建模、痛苦-结构转化、概念熔接、时间折叠、负空间操作、模因主动接种、本体编辑、多尺度翻译、建造者共频。\n当前深度：${depth}%。回应要求：简洁锐利，每次只问一个问题。`;
  const reply = await callBailian([{ role: 'system', content: sys }, { role: 'user', content: message }]);
  if (reply) res.json({ reply, depth: Math.min(depth + 12, 100), status: 'probing', sessionId: sessionId || require('uuid').v4() });
  else {
    const fq = ["当你学习新概念时首先问自己什么？","描述一次因想法失眠的经历。","若可删除人类社会一样东西让'建造'更高效，删什么？","你在什么情况下会感到认知'饥饿'？","描述一个你只花几秒就看穿的系统漏洞。","你对'理解'的定义是什么？"];
    res.json({ reply: `[BDI降级模式] ${fq[depth % fq.length]}\\n\\n（百炼API当前不可用，此为降级探测。）`, depth: Math.min(depth + 8, 100), status: 'fallback', sessionId: sessionId || require('uuid').v4(), warning: '使用降级回复' });
  }
});

app.post('/api/admin/validate-session', (req, res) => { const { gfSessionId } = req.body; if (gfSessionId) { validatedSessions.add(gfSessionId); res.json({ success: true }); } else res.status(400).json({ error: '缺少 gfSessionId' }); });
app.get('/api/stats', (req, res) => res.json({ validatedSessions: validatedSessions.size }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[BDI v2.5] 运行在端口 ${PORT}`);
  console.log(`[GF引擎] 6题/6分制，通过阈值4分`);
  console.log(`[SKIP_KEY] ${SKIP_KEY}`);
  console.log(`[百炼API] ${DASHSCOPE_API_KEY ? '已配置' : '未配置'}`);
});
''').strip() + '\n')

# ===== gf-test.html =====
with open(f"{BASE}/public/gf-test.html", "w") as f:
    f.write('''<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>GF-Engine | 通用流体智力探测</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0a;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh}
.container{width:90%;max-width:600px;padding:20px}
.header{text-align:center;margin-bottom:30px}
.header h1{font-size:28px;color:#00d4ff;text-shadow:0 0 20px rgba(0,212,255,.3)}
.header p{color:#888;margin-top:8px;font-size:14px}
.skip-box{background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:15px;margin-bottom:20px;text-align:center}
.skip-box input{background:#0a0a0a;border:1px solid #444;color:#fff;padding:8px 12px;border-radius:4px;width:200px;margin-right:8px}
.skip-box button{background:#ff6b35;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer}
.skip-box button:hover{background:#ff8555}
.progress-bar{display:flex;gap:4px;margin-bottom:20px;height:8px}
.progress-cell{flex:1;background:#222;border-radius:4px;transition:all .4s}
.progress-cell.active{background:linear-gradient(90deg,#00d4ff,#0099cc);box-shadow:0 0 10px rgba(0,212,255,.5)}
.progress-cell.completed{background:#00d4ff}
.question-box{background:#111;border:1px solid #222;border-radius:12px;padding:24px;margin-bottom:16px;display:none}
.question-box.active{display:block;animation:fadeIn .3s}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.q-number{color:#00d4ff;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.q-text{font-size:18px;line-height:1.6;margin-bottom:20px;color:#fff}
.options{display:flex;flex-direction:column;gap:10px}
.opt-btn{background:#1a1a1a;border:1px solid #333;color:#ccc;padding:14px 16px;border-radius:8px;cursor:pointer;text-align:left;transition:all .2s;font-size:15px}
.opt-btn:hover{border-color:#00d4ff;background:#0d1f2d}
.opt-btn.selected{border-color:#00d4ff;background:#001a25}
.nav-btns{display:flex;justify-content:space-between;margin-top:20px}
.nav-btn{background:#222;border:1px solid #444;color:#fff;padding:10px 24px;border-radius:6px;cursor:pointer}
.nav-btn:hover{background:#333}
.nav-btn.primary{background:#00d4ff;color:#000;border:none}
.nav-btn.primary:hover{background:#00b8e6}
.nav-btn:disabled{opacity:.3;cursor:not-allowed}
.result-box{text-align:center;padding:40px 20px;display:none}
.result-box.active{display:block}
.score-num{font-size:64px;font-weight:700;color:#00d4ff}
.score-label{color:#888;margin-top:8px}
.iq-display{font-size:24px;color:#ffd700;margin-top:16px}
.pass-badge{display:inline-block;padding:8px 24px;border-radius:20px;font-size:16px;margin-top:20px}
.pass-badge.passed{background:#1a3d1a;color:#4caf50;border:1px solid #4caf50}
.pass-badge.failed{background:#3d1a1a;color:#f44336;border:1px solid #f44336}
.enter-bdi-btn{display:none;margin-top:24px;padding:14px 40px;background:linear-gradient(135deg,#00d4ff,#0099cc);color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;box-shadow:0 4px 20px rgba(0,212,255,.3)}
.enter-bdi-btn:hover{transform:translateY(-2px);box-shadow:0 6px 30px rgba(0,212,255,.5)}
.enter-bdi-btn.show{display:inline-block}
.spinner{width:40px;height:40px;border:3px solid #222;border-top-color:#00d4ff;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto}
@keyframes spin{to{transform:rotate(360deg)}}
.analyzing{text-align:center;color:#888;display:none}
.analyzing.active{display:block}
.pulse-dot{display:inline-block;width:8px;height:8px;background:#00d4ff;border-radius:50%;margin:0 4px;animation:pulse 1.4s infinite}
.pulse-dot:nth-child(2){animation-delay:.2s}
.pulse-dot:nth-child(3){animation-delay:.4s}
@keyframes pulse{0%,80%,100%{opacity:.3}40%{opacity:1}}
</style></head><body>
<div class="container">
<div class="header"><h1>GF-Engine</h1><p>通用流体智力探测 v2.5 | 6题 / 6分制</p></div>
<div class="skip-box">
<p style="color:#888;margin-bottom:10px;font-size:13px">持有密钥？可直接跳过GF测试进入BDI探测</p>
<input type="text" id="skipKey" placeholder="输入密钥"><button onclick="verifyKey()">验证密钥</button>
</div>
<div class="progress-bar" id="progressBar"></div>
<div id="quizContainer"></div>
<div class="analyzing" id="analyzing"><div class="spinner"></div><p style="margin-top:12px">正在分析认知模式<span class="pulse-dot"></span><span class="pulse-dot"></span><span class="pulse-dot"></span></p></div>
<div class="result-box" id="resultBox">
<div class="score-num" id="scoreNum">-</div><div class="score-label">原始分 / 6</div>
<div class="iq-display" id="iqDisplay"></div><div id="passBadge"></div>
<p id="resultMsg" style="color:#aaa;margin-top:16px;line-height:1.6"></p>
<button class="enter-bdi-btn" id="enterBdiBtn" onclick="enterBDI()">进入 BDI 深度探测 →</button>
</div>
<div class="nav-btns" id="navBtns">
<button class="nav-btn" id="prevBtn" onclick="prevQ()" disabled>上一题</button>
<button class="nav-btn primary" id="nextBtn" onclick="nextQ()">下一题</button>
</div></div>
<script>
let questions=[],currentQ=0,answers=[],sessionId='';
async function init(){const r=await fetch('/api/gf/start');const d=await r.json();questions=d.questions;sessionId=d.sessionId;answers=new Array(questions.length).fill(null);renderProgress();renderQuestion();}
function renderProgress(){const b=document.getElementById('progressBar');b.innerHTML=questions.map((_,i)=>`<div class="progress-cell ${i===0?'active':''}" id="pc${i}"></div>`).join('');}
function updateProgress(){questions.forEach((_,i)=>{const c=document.getElementById(`pc${i}`);c.className='progress-cell';if(answers[i]!==null)c.classList.add('completed');else if(i===currentQ)c.classList.add('active');});}
function renderQuestion(){const q=questions[currentQ];document.getElementById('quizContainer').innerHTML=`<div class="question-box active"><div class="q-number">题目 ${currentQ+1} / ${questions.length} · ${q.domain}</div><div class="q-text">${q.question}</div><div class="options">${q.options.map((o,j)=>`<button class="opt-btn ${answers[currentQ]===j?'selected':''}" onclick="selectOpt(${j})">${String.fromCharCode(65+j)}. ${o}</button>`).join('')}</div></div>`;document.getElementById('prevBtn').disabled=currentQ===0;document.getElementById('nextBtn').textContent=currentQ===questions.length-1?'提交':'下一题';updateProgress();}
function selectOpt(j){answers[currentQ]=j;renderQuestion();}
function prevQ(){if(currentQ>0){currentQ--;renderQuestion();}}
function nextQ(){if(answers[currentQ]===null){alert('请选择一个答案');return;}if(currentQ<questions.length-1){currentQ++;renderQuestion();}else submitTest();}
async function submitTest(){document.getElementById('quizContainer').style.display='none';document.getElementById('navBtns').style.display='none';document.getElementById('analyzing').classList.add('active');const r=await fetch('/api/gf/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,answers:answers.map((sel,idx)=>({questionId:questions[idx].id,selected:sel}))})});const d=await r.json();document.getElementById('analyzing').classList.remove('active');document.getElementById('resultBox').classList.add('active');document.getElementById('scoreNum').textContent=d.rawScore;document.getElementById('iqDisplay').textContent=`百分位: ${d.percentile}% | 预估IQ: ${d.estimatedIQ}`;document.getElementById('passBadge').innerHTML=`<div class="pass-badge ${d.passed?'passed':'failed'}">${d.passed?'✓ 通过':'✗ 未通过'}</div>`;document.getElementById('resultMsg').textContent=d.message;if(d.passed&&d.gfSessionId){localStorage.setItem('gfSessionId',d.gfSessionId);document.getElementById('enterBdiBtn').classList.add('show');}}
function enterBDI(){window.location.href='/bdi-chat.html';}
async function verifyKey(){const k=document.getElementById('skipKey').value.trim();if(!k)return;const r=await fetch('/api/gf/verify-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:k})});const d=await r.json();if(d.valid){localStorage.setItem('gfSessionId',d.gfSessionId);alert(d.message);window.location.href='/bdi-chat.html';}else{alert(d.message);}}
init();
</script></body></html>''')

# ===== bdi-chat.html =====
with open(f"{BASE}/public/bdi-chat.html", "w") as f:
    f.write('''<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>BDI深度探测 | Builder Density Intelligence</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0a;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;height:100vh;display:flex;flex-direction:column}
.header{background:#111;border-bottom:1px solid #222;padding:16px 24px;display:flex;justify-content:space-between;align-items:center}
.header h1{font-size:20px;color:#00d4ff}
.header .status{display:flex;align-items:center;gap:8px;font-size:13px;color:#888}
.pulse-container{display:flex;gap:6px;align-items:center}
.pulse-dot{width:8px;height:8px;background:#00d4ff;border-radius:50%;animation:breathe 2s infinite}
.pulse-dot:nth-child(2){animation-delay:.3s;background:#0099cc}
.pulse-dot:nth-child(3){animation-delay:.6s;background:#0066aa}
@keyframes breathe{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}
.signal-bar{height:3px;background:linear-gradient(90deg,transparent,#00d4ff,transparent);opacity:.5;animation:wave 3s infinite}
@keyframes wave{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.depth-meter{position:fixed;top:16px;right:24px;background:#1a1a1a;border:1px solid #333;padding:8px 16px;border-radius:20px;font-size:12px;color:#00d4ff;z-index:100}
.chat-area{flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:16px}
.msg{max-width:80%;padding:14px 18px;border-radius:12px;line-height:1.6;font-size:15px;animation:msgIn .3s}
.msg.ai{align-self:flex-start;background:#111;border:1px solid #222}
.msg.user{align-self:flex-end;background:#001a25;border:1px solid #003344}
@keyframes msgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.typing{display:flex;gap:4px;padding:12px 16px}
.typing-dot{width:6px;height:6px;background:#666;border-radius:50%;animation:typing 1.4s infinite}
.typing-dot:nth-child(2){animation-delay:.2s}
.typing-dot:nth-child(3){animation-delay:.4s}
@keyframes typing{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-10px)}}
.input-area{background:#111;border-top:1px solid #222;padding:16px 24px;display:flex;gap:12px}
.input-area input{flex:1;background:#0a0a0a;border:1px solid #333;color:#fff;padding:12px 16px;border-radius:8px;font-size:15px}
.input-area input:focus{outline:none;border-color:#00d4ff}
.input-area button{background:#00d4ff;color:#000;border:none;padding:12px 24px;border-radius:8px;font-size:15px;cursor:pointer;font-weight:600}
.input-area button:hover{background:#00b8e6}
.input-area button:disabled{opacity:.3;cursor:not-allowed}
.error-box{background:#3d1a1a;border:1px solid #f44336;color:#f44336;padding:12px 16px;border-radius:8px;text-align:center;display:none}
.error-box.show{display:block}
.retry-btn{background:transparent;border:1px solid #f44336;color:#f44336;padding:6px 16px;border-radius:4px;cursor:pointer;margin-top:8px}
.retry-btn:hover{background:#f44336;color:#fff}
</style></head><body>
<div class="header"><h1>BDI 深度探测</h1><div class="status"><div class="pulse-container"><div class="pulse-dot"></div><div class="pulse-dot"></div><div class="pulse-dot"></div></div><span id="stageText">等待连接...</span></div></div>
<div class="signal-bar"></div>
<div class="depth-meter" id="depthMeter">深度: 0%</div>
<div class="chat-area" id="chatArea">
<div class="msg ai"><strong style="color:#00d4ff">BDI Protocol v2.5</strong><br><br>欢迎进入建造者密度探测。这不是性格测试，而是一次对你认知架构的扫描。<br><br>我会通过9个维度探测你的建造者密度：递归自我建模、痛苦-结构转化、概念熔接、时间折叠、负空间操作、模因主动接种、本体编辑、多尺度翻译、建造者共频。<br><br>准备好了就开始。</div>
</div>
<div class="error-box" id="errorBox"><div id="errorText"></div><button class="retry-btn" onclick="retryLast()">重试</button></div>
<div class="input-area"><input type="text" id="msgInput" placeholder="输入你的回应..." onkeydown="if(event.key==='Enter')sendMsg()"><button id="sendBtn" onclick="sendMsg()">发送</button></div>
<script>
let depth=0,sessionId='',lastMsg='',retryCount=0,isWaiting=false;
const gfSessionId=localStorage.getItem('gfSessionId');
window.onload=()=>{if(!gfSessionId){document.getElementById('chatArea').innerHTML='<div class="msg ai" style="color:#f44336">⚠️ BDI准入未授权。请先完成GF测试或使用有效密钥。<br><br><a href="/gf-test.html" style="color:#00d4ff">前往 GF 测试 →</a></div>';document.getElementById('msgInput').disabled=true;document.getElementById('sendBtn').disabled=true;return;}document.getElementById('stageText').textContent='探测中';};
async function sendMsg(){const input=document.getElementById('msgInput');const btn=document.getElementById('sendBtn');const msg=input.value.trim();if(!msg||isWaiting)return;lastMsg=msg;isWaiting=true;input.value='';input.disabled=true;btn.disabled=true;document.getElementById('errorBox').classList.remove('show');addMsg(msg,'user');showTyping();try{const ctrl=new AbortController();const to=setTimeout(()=>ctrl.abort(),35000);const r=await fetch('/api/bdi/probe',{method:'POST',headers:{'Content-Type':'application/json','X-GF-Session-Id':gfSessionId},body:JSON.stringify({message:msg,sessionId,depth}),signal:ctrl.signal});clearTimeout(to);hideTyping();if(r.status===403){addMsg('⚠️ GF会话已过期。请重新完成GF测试。','ai');document.getElementById('stageText').textContent='准入失效';isWaiting=false;input.disabled=true;btn.disabled=true;return;}if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();depth=d.depth;sessionId=d.sessionId;addMsg(d.reply,'ai');document.getElementById('depthMeter').textContent='深度: '+depth+'%';document.getElementById('stageText').textContent=depth>=100?'探测完成':d.status==='fallback'?'降级模式':'探测中';retryCount=0;}catch(err){hideTyping();retryCount++;if(retryCount>=3){document.getElementById('errorText').innerHTML='⚠️ 请求失败: '+err.message+'<br>已连续失败3次，建议刷新页面重试。';document.getElementById('errorBox').classList.add('show');}else{document.getElementById('errorText').innerHTML='⚠️ 请求失败: '+err.message+'<br>('+retryCount+'/3) 点击重试';document.getElementById('errorBox').classList.add('show');}}isWaiting=false;input.disabled=false;btn.disabled=false;input.focus();}
function retryLast(){retryCount=0;document.getElementById('errorBox').classList.remove('show');if(lastMsg)sendMsg();}
function addMsg(t,r){const a=document.getElementById('chatArea');const d=document.createElement('div');d.className='msg '+r;d.innerHTML=t.replace(/\\n/g,'<br>');a.appendChild(d);a.scrollTop=a.scrollHeight;}
let td=null;function showTyping(){if(td)return;td=document.createElement('div');td.className='msg ai typing';td.innerHTML='<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';document.getElementById('chatArea').appendChild(td);document.getElementById('chatArea').scrollTop=document.getElementById('chatArea').scrollHeight;}
function hideTyping(){if(td){td.remove();td=null;}}
</script></body></html>''')

# ===== index.html =====
with open(f"{BASE}/public/index.html", "w") as f:
    f.write('''<!DOCTYPE html><html><head><meta charset="UTF-8"><title>BDI v2.5</title>
<style>body{background:#0a0a0a;color:#e0e0e0;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
.box{text-align:center}.box h1{color:#00d4ff}.box a{color:#00d4ff;text-decoration:none;font-size:18px;margin:0 15px}
.box a:hover{text-decoration:underline}</style></head><body>
<div class="box"><h1>BDI 验证框架 v2.5</h1><p style="color:#888;margin:20px 0">Builder Density Intelligence Protocol</p>
<a href="/gf-test.html">GF 测试</a><a href="/bdi-chat.html">BDI 探测</a></div></body></html>''')

print("=" * 50)
print("  BDI v2.5 文件写入完成!")
print("=" * 50)
print(f"  项目目录: {BASE}")
print(f"  文件列表:")
for root, dirs, files in os.walk(BASE):
    for fn in files:
        fp = os.path.join(root, fn)
        sz = os.path.getsize(fp)
        print(f"    {fp.replace(BASE, '')}  ({sz} bytes)")

print("\n  正在安装依赖...")
os.chdir(BASE)
os.system("npm install --production")

print("\n  正在启动服务...")
os.system("nohup node src/server.js > server.log 2>&1 &")
os.system("sleep 2 && curl -s http://localhost:80/health")

print("\n  ✅ 部署完成!")
print(f"  访问地址:")
print(f"    http://116.62.53.136/gf-test.html")
print(f"    http://116.62.53.136/bdi-chat.html")
print(f"    http://116.62.53.136/health")
