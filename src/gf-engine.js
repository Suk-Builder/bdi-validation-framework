/**
 * GF-Engine · 通用流体智力随机探测仪 v2.5
 * 严格遵循 BDI Protocol v2.5 的测量结构与评分哲学
 */

// ========================
// 1. 题库（Protocol v2.5 标准题）
// ========================
const QUESTIONS = [
  {
    id: 1,
    dimension: '数字序列推理',
    question: '3，7，16，32，57，？\n\n请写出下一个数字。',
    type: 'exact',
    answer: '93',
    aliases: ['93'],
    maxScore: 3.0,
  },
  {
    id: 2,
    dimension: '图形矩阵推理',
    question: '3×3九宫格：\n第一行：圆+十字 / 圆+横线 / 圆+竖线\n第二行：方+十字 / 方+横线 / 方+竖线\n第三行：三角+十字 / 三角+横线 / ?\n\n选项：A.三角+竖线  B.圆+十字  C.方+竖线  D.三角+十字\n\n请填写选项字母。',
    type: 'exact',
    answer: 'A',
    aliases: ['A', 'a', '三角+竖线', '三角加竖线'],
    maxScore: 3.0,
  },
  {
    id: 3,
    dimension: '逻辑推演',
    question: '甲、乙、丙、丁四人名次各不相同。\n条件：\n(1) 如果甲不是第一，则乙是第二；\n(2) 只有丙第三，丁才第四；\n(3) 乙不是第二。\n\n问：可推出什么？\n\n选项：A.甲是第一名  B.乙是第三名  C.丙是第二名  D.丁是第四名\n\n请填写选项字母。',
    type: 'exact',
    answer: 'A',
    aliases: ['A', 'a', '甲是第一名', '甲第一'],
    maxScore: 3.0,
  },
  {
    id: 4,
    dimension: '工作记忆广度',
    question: '初始数字为 5。\n请按顺序执行以下操作，不使用纸笔，仅凭心算：\n(1) 加3，乘以2\n(2) 减4，除以2\n(3) 加初始数字的2倍\n(4) 乘1\n(5) 减去第一次操作后得到的数字\n\n最终结果是多少？',
    type: 'exact',
    answer: '0',
    aliases: ['0', '零', '0'],
    maxScore: 3.0,
  },
  {
    id: 5,
    dimension: '概念压缩类比',
    question: '"修辞"之于"语言"，犹如"编舞"之于______。\n\n选项：A.身体  B.动作  C.舞台  D.节奏\n\n请填写选项字母，并简述你的理由（理由会影响评分）。',
    type: 'analogy',
    // 双轨评分：B=合格(2分), A=进阶(3分), C/D=干扰排除(0.5分)
    maxScore: 3.0,
  },
  {
    id: 6,
    dimension: '故事回忆与细节提取',
    question: '请仔细阅读以下短文（仅读一遍，不要记录）：\n\n> 张远山在周四傍晚收到一封没有署名的信，信里只有一句话："梧桐巷17号的灯会在十点熄灭。"他记得那条巷子早已拆迁，17号的原址上建了一座社区图书馆。当晚九点四十五分，他独自站在图书馆门前，路灯把法国梧桐的影子拉得很长。十点整，图书馆的阅读灯果然全部熄灭，但门廊灯却亮了起来，照亮了台阶上不知何时出现的一把铜钥匙。\n\n请回答：\n(1) 图书馆的阅读灯在几点熄灭？\n(2) 门廊灯亮起后照亮了什么？',
    type: 'story',
    maxScore: 3.0,
  }
];

// ========================
// 2. 评分引擎
// ========================

function scoreExact(userAnswer, correctAnswers) {
  const normalized = userAnswer.trim().replace(/\s+/g, '').replace(/[，,\.。]/g, '');
  for (const ca of correctAnswers) {
    const caNorm = ca.trim().replace(/\s+/g, '').replace(/[，,\.。]/g, '');
    if (normalized === caNorm) return { score: 3.0, detail: '回答正确', isCorrect: true };
  }
  // 数字题容错：允许计算过程正确但末位算错
  if (correctAnswers.includes('93') && normalized === '94') {
    return { score: 2.5, detail: '规律识别正确，末位加法误差', isCorrect: false };
  }
  if (correctAnswers.includes('0') && (normalized === '16' || normalized === '-16')) {
    return { score: 2.0, detail: '中间步骤正确，最终提取错误', isCorrect: false };
  }
  return { score: 0, detail: '回答错误', isCorrect: false };
}

function scoreAnalogy(answer) {
  const t = answer.trim();
  const upper = t.toUpperCase();

  // 选A（身体）+ 合理解释 → 进阶 3分
  if (upper.includes('A') || t.includes('身体')) {
    const hasExplanation = t.length > 5 && !(/^[A-Da-d]$/.test(t));
    if (hasExplanation) {
      return { score: 3.0, detail: '进阶：选择"身体"并给出合理解释，展现了范畴层级辨析能力', isCorrect: true };
    }
    return { score: 2.0, detail: '选择"身体"，但未给出充分解释', isCorrect: true };
  }

  // 选B（动作）+ 解释 → 合格 2分
  if (upper.includes('B') || t.includes('动作')) {
    const hasExplanation = t.length > 5;
    if (hasExplanation) {
      return { score: 2.0, detail: '合格：选择"动作"并给出合理辩护', isCorrect: true };
    }
    return { score: 1.5, detail: '选择"动作"，无解释', isCorrect: true };
  }

  // 选C/D
  if (upper.includes('C') || upper.includes('D') || t.includes('舞台') || t.includes('节奏')) {
    return { score: 0.5, detail: '干扰项，但能排除部分错误选项', isCorrect: false };
  }

  return { score: 0, detail: '无法判读选项', isCorrect: false };
}

function scoreStory(answer) {
  const t = answer.trim().toLowerCase();
  let score = 0;
  const details = [];

  // (1) 时间锚点：十点整
  if (t.includes('十点') || t.includes('10点') || t.includes('十点整') || t.includes('10')) {
    score += 1.5;
    details.push('时间锚点正确(十点整)');
  } else {
    details.push('时间锚点错误');
  }

  // (2) 物证锚点：铜钥匙
  if (t.includes('铜钥匙') || t.includes('钥匙')) {
    score += 1.5;
    details.push('物证锚点正确(铜钥匙)');
  } else {
    details.push('物证锚点错误');
  }

  // 氛围干扰检测加分
  if (!t.includes('影子') && !t.includes('梧桐树') && !t.includes('法国梧桐')) {
    score += 0.5; // 未被氛围元素干扰
    details.push('氛围/物证分离良好');
  }

  // 封顶3.0
  score = Math.min(score, 3.0);

  return {
    score,
    detail: details.join('；'),
    isCorrect: score >= 1.5
  };
}

function scoreAnswer(question, answer) {
  switch (question.type) {
    case 'exact':
      return scoreExact(answer, question.aliases);
    case 'analogy':
      return scoreAnalogy(answer);
    case 'story':
      return scoreStory(answer);
    default:
      return { score: 0, detail: '未知题型', isCorrect: false };
  }
}

// ========================
// 3. SD15 锚点换算
// ========================
function getSD15Anchor(totalScore) {
  if (totalScore >= 17) return { label: '135+', desc: '顶尖流体智力，已触及本工具测量边界' };
  if (totalScore >= 13) return { label: '125-135', desc: '优秀，高密度信息处理能力强' };
  if (totalScore >= 9)  return { label: '115-125', desc: '中上水平，模式识别与逻辑推演良好' };
  if (totalScore >= 5)  return { label: '100-115', desc: '平均水平，能处理常规认知任务' };
  return { label: '<100', desc: '抽象推理与工作记忆可能存在明显困难' };
}

// ========================
// 4. BDI 门槛判定
// ========================
function checkBDIGate(totalScore) {
  return totalScore >= 13;
}

// 查询 GF 会话的完整结果（用于 BDI 入口校验）
function getSessionResult(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const totalScore = session.scores.reduce((a, b) => a + b, 0);
  const isFinished = session.currentIndex >= QUESTIONS.length;

  return {
    sessionId,
    isFinished,
    totalScore: Math.round(totalScore * 10) / 10,
    passed: checkBDIGate(totalScore),
    sd15: isFinished ? getSD15Anchor(totalScore) : null,
    progress: { current: session.currentIndex, total: QUESTIONS.length },
    answers: session.answers,
  };
}

// ========================
// 5. 会话管理（内存存储）
// ========================
const sessions = new Map(); // sessionId → { answers[], currentIndex, scores[] }

function createSession() {
  const sessionId = 'gf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  sessions.set(sessionId, {
    answers: [],
    scores: [],
    currentIndex: 0,
    createdAt: Date.now(),
  });
  // 自动清理过期会话（30分钟）
  setTimeout(() => sessions.delete(sessionId), 30 * 60 * 1000);
  return sessionId;
}

function getSession(sessionId) {
  return sessions.get(sessionId);
}

function submitAnswer(sessionId, answer) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.currentIndex >= QUESTIONS.length) return null;

  const question = QUESTIONS[session.currentIndex];
  const result = scoreAnswer(question, answer);

  session.answers.push({ questionId: question.id, answer, score: result.score });
  session.scores.push(result.score);
  session.currentIndex++;

  const totalScore = session.scores.reduce((a, b) => a + b, 0);
  const isFinished = session.currentIndex >= QUESTIONS.length;

  return {
    result,
    totalScore: Math.round(totalScore * 10) / 10,
    isFinished,
    passedBDIGate: isFinished ? checkBDIGate(totalScore) : false,
    nextQuestion: isFinished ? null : QUESTIONS[session.currentIndex],
    progress: { current: session.currentIndex, total: QUESTIONS.length },
    sd15: isFinished ? getSD15Anchor(totalScore) : null,
  };
}

// ========================
// 6. 导出
// ========================
module.exports = {
  QUESTIONS,
  createSession,
  getSession,
  getSessionResult,
  submitAnswer,
  scoreAnswer,
  getSD15Anchor,
  checkBDIGate,
};
