const subjects = ["Toán","Ngữ văn","Tiếng Anh","KHTN","Lịch sử & Địa lý","Công nghệ","GDCD","Tin học","Kỹ năng sống"];
let bank = (window.QUESTION_BANK || []).filter(q => q.question && q.answers && q.answers.length === 4);
let order = [];
let currentIndex = 0, round = 1;
let current = null;
let lives = 3, coins = 0, score = 0, combo = 0, rescue = 0, streak = 1, dailyCorrect = 0, dailyTotal = 0, bestScore = 0, dailySeconds = 0;
let subjectCorrect = {}, badgesEarned = [];  // theo dõi câu đúng và huy hiệu
let totalCoinsEarned = 0;   // tổng xu tích lũy all-time (dùng cho huy hiệu Nhà Triệu Phú)
let _badgeQueue = [];       // hàng đợi huy hiệu nếu có nhiều huy hiệu cùng lúc
let _badgeShowing = false;
// ── localStorage helpers ─────────────────────────────────────────
const SAVE_KEY  = "heroGame_v1";
const todayStr  = () => new Date().toISOString().slice(0, 10);

function saveProgress() {
  try {
    bestScore = Math.max(score, bestScore);
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      coins,
      bestScore,
      streak,
      dailyCorrect,
      dailyTotal,
      dailySeconds,
      lastDate: todayStr(),
      subjectCorrect,
      badgesEarned,
      allTimeStats,
      dailyHistory,
      savedWrongAnswers,
      leaderboard,
      dailyMissions,
      missionsDate,
      currentTheme,
      unlockedThemes,
      totalCoinsEarned
    }));
  } catch(e) {}
}

function loadRaw() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}"); } catch(e) { return {}; }
}

function initProgress() {
  const s = loadRaw();
  const today     = todayStr();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (s.lastDate === today)          streak = s.streak || 1;
  else if (s.lastDate === yesterday) streak = (s.streak || 1) + 1;
  else                               streak = 1;
  dailyCorrect   = (s.lastDate === today) ? (s.dailyCorrect || 0) : 0;
  dailyTotal     = (s.lastDate === today) ? (s.dailyTotal   || 0) : 0;
  dailySeconds   = (s.lastDate === today) ? (s.dailySeconds || 0) : 0;
  coins          = s.coins || 0;
  bestScore      = s.bestScore || 0;
  subjectCorrect = s.subjectCorrect || {};
  badgesEarned   = s.badgesEarned   || [];
  allTimeStats   = s.allTimeStats   || {};
  savedWrongAnswers = s.savedWrongAnswers || [];
  leaderboard    = s.leaderboard    || [];
  currentTheme   = s.currentTheme   || "forest";
  unlockedThemes    = s.unlockedThemes    || ["forest"];
  totalCoinsEarned  = s.totalCoinsEarned  || 0;
  // Missions: generate 3 if new day
  missionsDate   = s.missionsDate   || "";
  if (missionsDate !== todayStr()) {
    dailyMissions = generateMissions();
    missionsDate  = todayStr();
  } else {
    dailyMissions = s.dailyMissions || generateMissions();
  }
  // Archive yesterday's data into dailyHistory before resetting
  let _dh = s.dailyHistory || [];
  if (s.lastDate && s.lastDate !== todayStr() && (s.dailyCorrect || 0) > 0) {
    _dh.push({ date: s.lastDate, correct: s.dailyCorrect||0, total: s.dailyTotal||0, minutes: Math.round((s.dailySeconds||0)/60) });
    _dh = _dh.slice(-7);
  }
  dailyHistory = _dh;
  saveProgress();
}
// ─────────────────────────────────────────────────────────────────

let answered = false;
let timer = 25, maxTimer = 25, timerId = null, soundOn = true;
let heroX = 70, targetX = 70, heroState = "idle", enemyShake = 0, coinBurst = 0, chestGlow = 0;
let floatTexts = [];  // [{x,y,text,color,alpha,vy,size,bold}]
let bossActive = false, bossHP = 0, bossMaxHP = 0, bossLevel = 0;
let bossFlash = 0, bossHealFlash = 0, correctSinceBoss = 0;
let selectedSubject = "Tất cả", selectedDifficulty = "Tất cả";
let wrongAnswers = [];  // lưu câu trả lời sai trong phiên
let allTimeStats = {}, dailyHistory = [], savedWrongAnswers = [];
let practiceMode = false;
let leaderboard = [];  // [{score,date,correct,total}] top 10
let dailyMissions = [], missionsDate = "";  // nhiệm vụ ngày
let currentTheme = "forest", unlockedThemes = ["forest"];
let sessionStats = {};  // {subject: {correct,total,totalTime}}
let cloudOffset = 0, groundOffset = 0, comboShield = false;

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const els = {
  lives: document.getElementById("lives"),
  coins: document.getElementById("coins"),
  score: document.getElementById("score"),
  combo: document.getElementById("combo"),
  streak: document.getElementById("streak"),
  bestScore: document.getElementById("bestScore"),
  rescueProgress: document.getElementById("rescueProgress"),
  progressText: document.getElementById("progressText"),
  questionText: document.getElementById("questionText"),
  answers: document.getElementById("answers"),
  subjectBadge: document.getElementById("subjectBadge"),
  difficultyBadge: document.getElementById("difficultyBadge"),
  timer: document.getElementById("timer"),
  timerBarFill: document.getElementById("timerBarFill"),
  gameMessage: document.getElementById("gameMessage"),
  startBtn: document.getElementById("startBtn"),
  nextBtn: document.getElementById("nextBtn"),
  worldList: document.getElementById("worldList"),
  toggleSound: document.getElementById("toggleSound"),
  dailyChest: document.getElementById("dailyChest"),
  dailyTime: document.getElementById("dailyTime"),
  dailyTotalEl: document.getElementById("dailyTotalEl")
};

function shuffle(arr) {
  return arr.map(v => [Math.random(), v]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
}

function filteredBank() {
  return bank.filter(q => {
    const subjOk = selectedSubject === "Tất cả" || q.subject === selectedSubject;
    const diffOk = selectedDifficulty === "Tất cả" || q.difficulty === selectedDifficulty;
    return subjOk && diffOk;
  });
}

function makeOrder() {
  const fb = filteredBank();
  const activeSubjects = selectedSubject === "Tất cả" ? subjects : [selectedSubject];

  // 1. Detect weak subjects (accuracy < 60% with >= 5 answered)
  const weakSet = new Set();
  if (selectedSubject === "Tất cả") {
    activeSubjects.forEach(s => {
      const d = allTimeStats[s];
      if (d && d.total >= 5 && d.correct / d.total < 0.6) weakSet.add(s);
    });
  }

  // 2. Build grouped pool; weak subjects get 2x representation
  const grouped = {};
  activeSubjects.forEach(s => {
    const pool = shuffle(fb.filter(q => q.subject === s));
    if (weakSet.has(s)) {
      const pool2 = shuffle(fb.filter(q => q.subject === s));
      grouped[s] = pool.concat(pool2);
    } else {
      grouped[s] = pool;
    }
  });

  // 3. Interleave subjects round-robin
  const base = [];
  let added = true;
  while (added) {
    added = false;
    activeSubjects.forEach(s => {
      if (grouped[s] && grouped[s].length) { base.push(grouped[s].shift()); added = true; }
    });
  }
  if (!base.length) base.push(...shuffle(fb));

  // 4. Inject savedWrongAnswers every 4 slots (review reinforcement)
  const wrongPool = shuffle(
    (savedWrongAnswers || []).filter(q =>
      (selectedSubject === "Tất cả" || q.subject === selectedSubject) &&
      (selectedDifficulty === "Tất cả" || q.difficulty === selectedDifficulty)
    ).map(wq => {
      const fresh = bank.find(bq => bq.question === wq.question);
      return fresh ? fresh : wq;
    })
  );
  const result = [];
  let wi = 0;
  base.forEach((q, i) => {
    if (i > 0 && i % 4 === 0 && wi < wrongPool.length) result.push(wrongPool[wi++]);
    result.push(q);
  });

  // 5. Difficulty ramp: push a few "Dễ" questions to the front for warm-up
  if (selectedDifficulty === "Tất cả") {
    const easyOnes = result.filter(q => q.difficulty === "Dễ").slice(0, 5);
    const others   = result.filter(q => !easyOnes.includes(q));
    return [...easyOnes, ...others];
  }
  return result;
}

function initWorldList() {
  els.worldList.innerHTML = "";
  subjects.forEach((s, i) => {
    const div = document.createElement("div");
    div.className = "world-pill";
    div.id = "world-" + i;
    const cnt = Math.min(subjectCorrect[s] || 0, 10);
    const pct = cnt * 10;
    const done = badgesEarned.includes(s);
    div.innerHTML =
      `<span class="pill-label">${iconForSubject(s)} ${shortSubject(s)}</span>` +
      `<div class="pill-prog-wrap"><div class="pill-prog-bar${done?" done":""}" id="pbar-${i}" style="width:${pct}%"></div></div>` +
      `<span class="pill-count" id="pcnt-${i}">${done ? "✅" : cnt+"/10"}</span>`;
    els.worldList.appendChild(div);
  });
}

function refreshSubjectProgress() {
  subjects.forEach((s, i) => {
    const bar = document.getElementById("pbar-" + i);
    const cnt_el = document.getElementById("pcnt-" + i);
    if (!bar || !cnt_el) return;
    const cnt = Math.min(subjectCorrect[s] || 0, 10);
    const pct = cnt * 10;
    const done = badgesEarned.includes(s);
    bar.style.width = pct + "%";
    bar.className = "pill-prog-bar" + (done ? " done" : "");
    cnt_el.textContent = done ? "✅" : cnt + "/10";
  });
}

function shortSubject(s) {
  return {
    "Lịch sử & Địa lý": "Sử-Địa",
    "Ngữ văn": "Văn",
    "Tiếng Anh": "Anh",
    "KHTN": "KHTN",
    "Công nghệ": "Công nghệ",
    "GDCD": "GDCD",
    "Tin học": "Tin",
    "Toán": "Toán",
    "Kỹ năng sống": "KNS"
  }[s] || s;
}

function iconForSubject(s) {
  return {
    "Toán": "➗",
    "Ngữ văn": "📚",
    "Tiếng Anh": "🌎",
    "KHTN": "🔬",
    "Lịch sử & Địa lý": "🗺️",
    "Công nghệ": "🛠️",
    "GDCD": "🤝",
    "Tin học": "💻",
    "Kỹ năng sống": "🛡️"
  }[s] || "⭐";
}

function updateWorldList() {
  subjects.forEach((s, i) => {
    const div = document.getElementById("world-" + i);
    if (!div) return;
    div.classList.toggle("active", current && current.subject === s);
  });
}

function setStats() {
  els.lives.textContent = practiceMode ? '∞' : lives;
  els.coins.textContent = coins;
  els.score.textContent = score;
  const _comboEl = els.combo?.parentElement;
  if (_comboEl) {
    if (combo >= 5) _comboEl.classList.add("combo-fire");
    else _comboEl.classList.remove("combo-fire");
  }
  els.combo.textContent = combo;
  els.streak.textContent = streak;
  if (els.bestScore) els.bestScore.textContent = Math.max(score, bestScore);
  if (els.dailyTotalEl) els.dailyTotalEl.textContent = dailyTotal;
  const rdEl = document.getElementById("roundDisplay"); if (rdEl) rdEl.textContent = round;
  const bossEl = document.getElementById("bossIndicator");
  if (bossEl) bossEl.style.display = bossActive ? "block" : "none";
  els.rescueProgress.style.width = rescue + "%";
  els.progressText.textContent = rescue + "%";
  updateDailyDisplay();
  saveProgress();
}

function startGame() {
  order = makeOrder();
  currentIndex = 0;
  lives = 3; score = 0; combo = 0; rescue = 0; round = 1;  // coins & dailyCorrect tích lũy theo ngày
  bossActive = false; bossHP = 0; bossLevel = 0; correctSinceBoss = 0; updateBossApproach();
  heroX = 70; targetX = 70;
  practiceMode = false;
  // Mission: play type
  dailyMissions.forEach(m => {
    if (!m.done && m.type === 'play') { m.progress++; if (m.progress >= m.count) { m.done = true; coins += m.reward; } }
  });
  checkUnlockThemes();
  renderMissions();
  wrongAnswers = [];
  sessionStats = {};
  _sessionNewBadges = [];
  const _pb = document.getElementById('practiceBanner'); if (_pb) _pb.style.display = 'none';
  els.startBtn.textContent = "🔄 Chơi lại";
  loadQuestion();
  setStats();
  updateWorldList();
  message("Vương quốc tri thức đã mở! Trả lời đúng để anh hùng tiến lên.");
  startBGMusic();
  playSound("start");
}

function loadQuestion() {
  if (!order.length) return;
  current = order[currentIndex % order.length];
  answered = false;
  // Smart timer: base on difficulty
  const _diffTime = {"Ữ Dễ": 20, "Dễ": 20, "Trung bình": 30, "Khó": 45};
  const _baseTime = _diffTime[current.difficulty] || 30;
  timer = practiceMode ? Math.min(_baseTime + 15, 60) : _baseTime;
  maxTimer = timer;
  els.timer.textContent = timer;
  if (els.timerBarFill) { els.timerBarFill.style.width = "100%"; els.timerBarFill.style.background = "#22c55e"; }
  els.subjectBadge.textContent = `${iconForSubject(current.subject)} ${current.subject}`;
  const _pbMap = {"Toán":"pb-toan","Ngữ văn":"pb-van","Tiếng Anh":"pb-anh",
    "KHTN":"pb-khtn","Lịch sử & Địa lý":"pb-su","Công nghệ":"pb-cn","GDCD":"pb-gdcd","Tin học":"pb-tin"};
  els.rescueProgress.className = "progress-bar " + (_pbMap[current.subject] || "");
  els.difficultyBadge.textContent = current.difficulty || "Trung bình";
  els.questionText.textContent = current.question;
  // Slide-in animation
  els.questionText.classList.remove("q-enter"); void els.questionText.offsetWidth;
  els.questionText.classList.add("q-enter");
  els.answers.classList.remove("q-enter"); void els.answers.offsetWidth;
  els.answers.classList.add("q-enter");
  els.answers.innerHTML = "";
  els.nextBtn.disabled = true;
  els.timer.classList.remove("danger");

  current.answers.forEach((a, i) => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    const label = String.fromCharCode(65 + i);
    btn.innerHTML = '<span class="ans-label">' + label + '</span>' + a;
    btn.addEventListener("pointerdown", function(e) {
      const r = document.createElement("span");
      r.className = "ripple";
      const rect = this.getBoundingClientRect();
      r.style.left = (e.clientX - rect.left) + "px";
      r.style.top  = (e.clientY - rect.top)  + "px";
      this.appendChild(r);
      setTimeout(() => r.remove(), 580);
    });
    btn.onclick = () => answer(i, btn);
    els.answers.appendChild(btn);
  });
  updateWorldList();
  startTimer();
}

function startTimer() {
  clearInterval(timerId);
  timerId = setInterval(() => {
    if (answered) return;
    timer--;
    dailySeconds++;
    updateDailyDisplay();
    els.timer.textContent = timer;
    // Update timer bar fill + color
    if (els.timerBarFill) {
      const pct = Math.max(0, timer / maxTimer) * 100;
      els.timerBarFill.style.width = pct + "%";
      els.timerBarFill.style.background =
        pct > 50 ? "#22c55e" : pct > 25 ? "#f59e0b" : "#ef4444";
    }
    // Danger zone: countdown visual + tick sound
    if (timer <= 5 && timer > 0) {
      els.timer.classList.add("danger");
      playSound(timer <= 2 ? "tick-urgent" : "tick");
    } else {
      els.timer.classList.remove("danger");
    }
    if (timer <= 0) {
      clearInterval(timerId);
      els.timer.classList.remove("danger");
      timeOut();
    }
  }, 1000);
}

function answer(i, btn) {
  if (answered || !current) return;
  answered = true;
  clearInterval(timerId);

  const correctIndex = "ABCD".indexOf(current.correct);
  const buttons = Array.from(document.querySelectorAll(".answer-btn"));
  buttons[correctIndex]?.classList.add("correct");

  if (i === correctIndex) {
    btn.classList.add("correct");
    const _iconC = document.createElement("span");
    _iconC.className = "ans-result-icon"; _iconC.textContent = "✓";
    _iconC.style.color = "#14532d";
    btn.appendChild(_iconC);
    const _qb = document.querySelector(".quiz-box");
    _qb.classList.remove("flash-correct","flash-wrong"); void _qb.offsetWidth;
    _qb.classList.add("flash-correct");
    // Full-screen flash + confetti
    flashScreen("correct");
    combo++;
    // Confetti burst: bigger with higher combo
    if (combo >= 3) {
      const _br = btn.getBoundingClientRect();
      const _cx = _br.left + _br.width / 2, _cy = _br.top + _br.height / 2;
      spawnConfetti(_cx, _cy, combo >= 8 ? 50 : combo >= 5 ? 35 : 20);
    }
    dailyCorrect++;
    dailyTotal++;
    checkBadge(current.subject);
    // Track sessionStats
    if (!sessionStats[current.subject]) sessionStats[current.subject] = {correct:0,total:0,totalTime:0};
    sessionStats[current.subject].correct++;
    sessionStats[current.subject].total++;
    sessionStats[current.subject].totalTime += (current.time || 25) - Math.max(0, timer);
    // Accumulate allTimeStats (persistent across sessions)
    if (!allTimeStats[current.subject]) allTimeStats[current.subject] = {correct:0,total:0,totalTime:0};
    allTimeStats[current.subject].correct++;
    allTimeStats[current.subject].total++;
    allTimeStats[current.subject].totalTime += (current.time || 25) - Math.max(0, timer);
    // Update daily mission progress
    let _missionBonusMsg = "";
    dailyMissions.forEach(m => {
      if (m.done) return;
      if (m.type === 'correct_any') m.progress++;
      else if (m.type === 'correct_subj' && m.subj === current.subject) m.progress++;
      else if (m.type === 'correct_diff' && m.diff === current.difficulty) m.progress++;
      else if (m.type === 'combo') m.progress = Math.max(m.progress, combo);
      if (!m.done && m.progress >= m.count) {
        m.done = true; coins += m.reward;
        spawnFloat("🎯 +" + m.reward + "xu!", heroX + 60, 150, "#34d399", 20);
        _missionBonusMsg = " 🎯 Nhiệm vụ xong! +" + m.reward + "xu";
      }
    });
    if (_missionBonusMsg) { setTimeout(() => message(message._last + _missionBonusMsg), 300); }
    renderMissions();
    refreshSubjectProgress();
    // Boss trigger
    if (bossActive) {
      hitBoss();
    } else {
      correctSinceBoss++;
      updateBossApproach();
      if (correctSinceBoss >= 10) { correctSinceBoss = 0; updateBossApproach(); setTimeout(startBoss, 600); }
    }
    const earned = 100 + combo * 10;
    coins += earned;
    totalCoinsEarned += earned;
    score += difficultyScore(current.difficulty) + Math.max(0, timer);
    rescue = Math.min(100, rescue + 3);
    targetX = Math.min(735, targetX + 62);
    heroState = "jump";
    coinBurst = 40;
    if (!bossActive) enemyShake = 16;  // quái bị đánh khi trả lời đúng
    // Floating text: điểm kiếm được
    spawnFloat("+" + earned + "xu", heroX + 30, 240, "#ffe347", 20);
    const pts = difficultyScore(current.difficulty) + Math.max(0, timer);
    spawnFloat("+" + pts, heroX + 30, 215, "#ffffff", 18);
    // COMBO bonus khi combo >= 3
    if (combo >= 3) {
      spawnFloat("COMBO x" + combo + "!", heroX + 30, 185, "#ff9f1c", 26);
      if (combo % 3 === 0) playSound("combo", combo);
    }
    if (dailyGoalMet()) {
      chestGlow = 80;
      message("🎉 Mở rương ngày! " + dailyCorrect + " câu + " + Math.floor(dailySeconds/60) + " phút hôm nay. +"+earned+" xu! 🎁");
    } else {
      const qLeft = Math.max(0, DAILY_Q - dailyCorrect);
      const mLeft = Math.max(0, DAILY_MIN - Math.floor(dailySeconds/60));
      let hint = "";
      if (qLeft > 0 && mLeft > 0) hint = "Còn " + qLeft + " câu & " + mLeft + " phút nữa để mở rương!";
      else if (qLeft > 0)         hint = "Còn " + qLeft + " câu nữa (đủ thời gian rồi!)";
      else                        hint = "Còn " + mLeft + " phút nữa (đủ câu rồi!)";
      message("Chính xác! +" + earned + " xu. " + hint);
    }
    playSound("correct");
    // ── Achievement badge checks khi trả lời đúng ───────────────
    if (combo >= 10) checkAchievementBadge("combo_10");
    if (score >= 200) checkAchievementBadge("best_200");
    if (timer > 0 && (current.time - timer) <= 5) checkAchievementBadge("quick_5");
    checkAllAchievements();
    if (rescue >= 100) {
      spawnFloat("💥 QUÁI BỊ ĐÁNH BẠI!", 675, 220, "#ff6b35", 24, true);
      spawnFloat("🌟 CÔNG CHÚA ĐÃ ĐƯỢC CỨU!", 400, 160, "#ffd700", 26, true);
      playSound("princess");
      setTimeout(winGame, 1400);
    }
  } else {
    btn.classList.add("wrong");
    const _iconW = document.createElement("span");
    _iconW.className = "ans-result-icon"; _iconW.textContent = "✗";
    _iconW.style.color = "#7f1d1d";
    btn.appendChild(_iconW);
    // Full-screen flash red
    flashScreen("wrong");
    const _qbW = document.querySelector(".quiz-box");
    _qbW.classList.remove("flash-correct","flash-wrong"); void _qbW.offsetWidth;
    _qbW.classList.add("flash-wrong");
    wrongAnswers.push({ subject: current.subject, question: current.question,
      yourAnswer: current.answers[i],
      correctAnswer: current.answers["ABCD".indexOf(current.correct)] });
    // Persistent wrong answers bank (for practice mode)
    if (!savedWrongAnswers.some(q => q.question === current.question)) {
      savedWrongAnswers.push({ subject: current.subject, question: current.question,
        answers: current.answers, correct: current.correct,
        difficulty: current.difficulty, time: current.time || 25 });
      if (savedWrongAnswers.length > 200) savedWrongAnswers = savedWrongAnswers.slice(-200);
    }
    if (!sessionStats[current.subject]) sessionStats[current.subject] = {correct:0,total:0,totalTime:0};
    sessionStats[current.subject].total++;
    sessionStats[current.subject].totalTime += (current.time || 25);
    // Accumulate allTimeStats
    if (!allTimeStats[current.subject]) allTimeStats[current.subject] = {correct:0,total:0,totalTime:0};
    allTimeStats[current.subject].total++;
    allTimeStats[current.subject].totalTime += (current.time || 25);
    dailyTotal++;
    if (practiceMode) {
      combo = 0;
      const _pca = current.answers["ABCD".indexOf(current.correct)];
      spawnFloat("📖 " + current.correct + ": " + _pca.substring(0,20), heroX + 30, 185, "#60a5fa", 16);
    } else if (comboShield) {
      comboShield = false;
      message("🛡️ Combo shield đã bảo vệ! Tim không mất lần này.");
      spawnFloat("🛡️ SHIELD!", heroX + 30, 220, "#a78bfa", 22);
    } else {
      combo = 0; lives--;
      spawnFloat("💔 -1", heroX + 30, 220, "#ff4444", 24);
      // Screen shake
      const _card = document.querySelector(".play-card");
      if (_card) { _card.classList.remove("shake-play"); void _card.offsetWidth; _card.classList.add("shake-play"); }
      if (bossActive) healBoss();
    }
    heroState = "hit";
    if (practiceMode) { const _pa = current.answers["ABCD".indexOf(current.correct)]; message("📖 Luyện tập: Đáp án đúng là " + current.correct + ". " + _pa); }
    else message("Gần đúng rồi! Mất 1 tim nhưng anh hùng vẫn có thể thử tiếp.");
    playSound("wrong");
    if (!practiceMode && lives <= 0) setTimeout(gameOver, 900);
  }
  setStats();
  els.nextBtn.disabled = false;
}

function timeOut() {
  answered = true;
  if (!practiceMode) lives--;
  combo = 0;
  if (current && current.subject) {
    if (!sessionStats[current.subject]) sessionStats[current.subject] = {correct:0,total:0,totalTime:0};
    sessionStats[current.subject].total++;
    sessionStats[current.subject].totalTime += (current.time || 25);
    if (!allTimeStats[current.subject]) allTimeStats[current.subject] = {correct:0,total:0,totalTime:0};
    allTimeStats[current.subject].total++;
    allTimeStats[current.subject].totalTime += (current.time || 25);
    dailyTotal++;
  }
  spawnFloat("⏰ HẾT GIỜ!", heroX + 30, 220, "#ff6b35", 22);
  if (bossActive) healBoss();
  message("Hết giờ! Hãy bình tĩnh, câu sau mình làm tốt hơn.");
  playSound("wrong");
  setStats();
  els.nextBtn.disabled = false;
  if (!practiceMode && lives <= 0) setTimeout(gameOver, 900);
}

function nextQuestion() {
  currentIndex++;
  heroState = "run";
  loadQuestion();
}

function difficultyScore(d) {
  if (d === "Dễ") return 50;
  if (d === "Khó") return 150;
  return 100;
}

function message(text) { els.gameMessage.textContent = text; }

function gameOver() {
  clearInterval(timerId);
  els.answers.innerHTML = "";
  stopBGMusic();
  playSound("gameover");
  updateLeaderboard();
  showOverlay("lose");
}

function winGame() {
  clearInterval(timerId);
  els.answers.innerHTML = "";
  chestGlow = 120;

  if (dailyGoalMet()) {
    // Đạt đủ 30 câu VÀ 30 phút → dừng hẳn, hiện overlay chiến thắng
    rescue = 100;
    setStats();
    stopBGMusic();
    playSound("win");
    updateLeaderboard();
    showOverlay("win");
  } else {
    // Chưa đạt daily goal → hoàn thành vòng, tự động chơi vòng tiếp
    const bonusCoins = 30 + round * 10;
    coins += bonusCoins;
    round++;
    rescue = 0;
    heroX = 70; targetX = 70; heroState = "idle";
    spawnFloat("🏆 Vòng " + (round-1) + " xong! +" + bonusCoins + "xu", 400, 180, "#ffd700", 28);
    const mLeft = Math.max(0, DAILY_MIN - Math.floor(dailySeconds/60));
    const qLeft = Math.max(0, DAILY_Q   - dailyCorrect);
    message("🎉 Vòng " + (round-1) + " hoàn thành! Còn " + qLeft + " câu & " + mLeft + " phút để mở rương ngày. Tiếp tục nào!");
    playSound("levelup");
    setStats();
    setTimeout(() => {
      order = makeOrder();
      currentIndex = 0;
      loadQuestion();
      startTimer();
      heroState = "run";
    }, 1800);
  }
}

// ══ AUDIO ENGINE v2 — KID-FRIENDLY SOUNDS ═══════════════════
let _audioCtx = null;
let _bgInterval = null, _bgOn = false, _bgStep = 0;

function getAC() {
  if (!_audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _audioCtx = new AC();
  }
  if (_audioCtx.state === "suspended") {
    _audioCtx.resume().catch(function(){});
  }
  return _audioCtx;
}

// Unlock AudioContext on first user gesture (mobile autoplay policy fix)
// Zalo WebView & iOS Safari require a real touch/click before AudioContext can play
var _audioUnlocked = false;
function _unlockAudio() {
  if (_audioUnlocked) return;
  _audioUnlocked = true;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!_audioCtx) { _audioCtx = new AC(); }
  if (_audioCtx.state === "suspended") {
    _audioCtx.resume().then(function() {
      // Resume nhạc nền nếu game đang chạy nhưng nhạc chưa phát
      if (typeof soundOn !== 'undefined' && soundOn && !_bgOn) {
        startBGMusic();
      }
    }).catch(function(){});
  }
}
document.addEventListener('touchstart', _unlockAudio, { once: false, passive: true });
document.addEventListener('click',      _unlockAudio, { once: false, passive: true });

// ── Helper: single oscillator note ──────────────────────────
function _note(ac, dest, freq, oscType, start, dur, vol) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = oscType; o.frequency.value = freq;
  o.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  o.start(start); o.stop(start + dur + 0.04);
}

// ── Helper: freq sweep ───────────────────────────────────────
function _sweep(ac, dest, f0, f1, oscType, start, dur, vol) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = oscType;
  o.frequency.setValueAtTime(f0, start);
  o.frequency.exponentialRampToValueAtTime(f1, start + dur);
  o.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  o.start(start); o.stop(start + dur + 0.04);
}

// ── Helper: noise burst ──────────────────────────────────────
function _noise(ac, dest, start, dur, vol, bpFreq) {
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(), flt = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf;
  flt.type = "bandpass"; flt.frequency.value = bpFreq; flt.Q.value = 1.2;
  src.connect(flt); flt.connect(g); g.connect(dest);
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  src.start(start); src.stop(start + dur);
}

// ── Background music ─────────────────────────────────────────
function startBGMusic() {
  if (_bgOn || !soundOn) return;
  _bgOn = true;
  // Giai điệu vui nhộn C-major (kiểu Mario World)
  const melody = [523,659,784,880,784,659,523,392,440,523,659,523,392,330,392,440,523,659,784,880,1047,880,784,659,523,659,523,392,330,262,294,330];
  const bass   = [131,131,131,131,165,165,165,165,196,196,196,196,220,220,220,220];
  let step = 0;
  _bgInterval = setInterval(() => {
    if (!soundOn || !_bgOn) return;
    const ac = getAC(); if (!ac) return;
    const t = ac.currentTime;
    const vol = 0.055;
    // Melody (triangle — mềm, không chói)
    _note(ac, ac.destination, melody[step % melody.length], "triangle", t, 0.28, vol);
    // Bass (sine — ấm)
    if (step % 2 === 0) _note(ac, ac.destination, bass[(step/2|0) % bass.length], "sine", t, 0.35, vol * 0.7);
    step++;
  }, 220);
}

function stopBGMusic() {
  _bgOn = false;
  if (_bgInterval) { clearInterval(_bgInterval); _bgInterval = null; }
}

// ── Tick (đếm ngược) ─────────────────────────────────────────
function playTick(urgent) {
  const ac = getAC(); if (!ac || !soundOn) return;
  const t = ac.currentTime;
  _note(ac, ac.destination, urgent ? 1200 : 900, "square", t, 0.06, urgent ? 0.5 : 0.3);
}

// ── Main sound engine ─────────────────────────────────────────
/* ══ FLASH SCREEN FX ══ */
const _flashEl = () => document.getElementById("flashOverlay");
function flashScreen(type) {
  const el = _flashEl(); if (!el) return;
  el.className = type === "correct" ? "flash-correct" : "flash-wrong";
  el.style.opacity = "1";
  setTimeout(() => { el.style.opacity = "0"; }, 130);
  setTimeout(() => { el.className = ""; }, 270);
}

/* ══ CONFETTI FX ══ */
(function(){
  const CANVAS_ID = "confettiCanvas";
  let _particles = [], _rafId = null;
  const COLORS = ["#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#f3a683","#fc5c65","#45aaf2","#fed330"];

  function _draw() {
    const c = document.getElementById(CANVAS_ID); if (!c) return;
    const ctx = c.getContext("2d");
    c.width  = window.innerWidth;
    c.height = window.innerHeight;
    ctx.clearRect(0, 0, c.width, c.height);
    _particles = _particles.filter(p => p.y < c.height + 20 && p.life > 0);
    _particles.forEach(p => {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.25;           // gravity
      p.vx *= 0.99;
      p.rot += p.dr;
      p.life -= 1.2;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life / 30);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    });
    if (_particles.length > 0) _rafId = requestAnimationFrame(_draw);
    else { _rafId = null; ctx.clearRect(0, 0, c.width, c.height); }
  }

  window.spawnConfetti = function(x, y, count) {
    count = count || 20;
    for (let i = 0; i < count; i++) {
      _particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 9,
        vy: Math.random() * -8 - 3,
        rot: Math.random() * Math.PI * 2,
        dr:  (Math.random() - 0.5) * 0.25,
        w:   5 + Math.random() * 7,
        h:   3 + Math.random() * 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 60 + Math.random() * 40
      });
    }
    if (!_rafId) _rafId = requestAnimationFrame(_draw);
  };
})();

function playSound(type, comboN) {
  if (!soundOn) return;
  const ac = getAC(); if (!ac) return;
  const master = ac.createGain();
  master.gain.value = 0.55;           // ← TO hơn nhiều
  master.connect(ac.destination);
  const t = ac.currentTime;

  if (type === "correct") {
    // Coin collect — sáng, vui, rõ ràng
    _sweep(ac, master, 700,  1400, "sine", t,       0.10, 0.7);
    _sweep(ac, master, 900,  1800, "sine", t+0.06,  0.10, 0.6);
    _note (ac, master, 2200, "sine", t+0.12, 0.18, 0.45);
    _noise(ac, master, t, 0.05, 0.15, 1400);
    // Shimmer
    _note(ac, master, 3000, "sine", t+0.16, 0.12, 0.20);
  }
  else if (type === "wrong") {
    // "Bụp!" rõ ràng + tiếng rít ngắn
    _sweep(ac, master, 400, 80,  "sawtooth", t,       0.20, 0.80);
    _sweep(ac, master, 280, 60,  "square",   t+0.05,  0.15, 0.55);
    _noise(ac, master, t, 0.18, 0.30, 180);
    _note (ac, master, 120, "sawtooth", t+0.10, 0.15, 0.35);
  }
  else if (type === "start") {
    // Jingle bắt đầu — 4 nốt đi lên vui tươi
    [330,440,550,660].forEach((f,i) => {
      _note(ac, master, f,   "square",   t+i*0.10, 0.12, 0.55);
      _note(ac, master, f*2, "triangle", t+i*0.10, 0.14, 0.25);
    });
    _sweep(ac, master, 660, 1320, "sine", t+0.40, 0.25, 0.40);
  }
  else if (type === "win") {
    // Victory fanfare — ascending heroic jingle (3 phrases) + triumph chord + sparkle
    master.gain.value = 0.70;
    // Phrase 1: run-up
    [392,440,523,587].forEach((f,i) => {
      _note(ac, master, f,    "square",   t+i*0.10, 0.12, 0.55);
      _note(ac, master, f*2,  "triangle", t+i*0.10, 0.10, 0.22);
    });
    // Phrase 2: climax leap
    [659,784,880,1047].forEach((f,i) => {
      _note(ac, master, f,    "square",   t+0.45+i*0.10, 0.14, 0.65);
      _note(ac, master, f*1.5,"triangle", t+0.45+i*0.10, 0.10, 0.28);
    });
    // Phrase 3: triumphant hold
    [1047,1175,1319].forEach((f,i) => {
      _note(ac, master, f,    "square",   t+0.90+i*0.14, 0.16, 0.70);
      _note(ac, master, f*2,  "sine",     t+0.90+i*0.14, 0.16, 0.25);
    });
    // Final full chord with resonance
    [523,659,784,1047,1319].forEach(f => _note(ac, master, f, "sine", t+1.38, 0.65, 0.35));
    // Crowd-cheer shimmer
    _noise(ac, master, t+0.05, 0.12, 0.20, 1400);
    _noise(ac, master, t+1.30, 0.20, 0.25, 1800);
    // Extra sparkle tail
    [2093,2637,3136].forEach((f,i) => _note(ac, master, f, "sine", t+1.55+i*0.08, 0.18, 0.20));
  }
  else if (type === "gameover") {
    // Sad "wah-wah" descending — 2-note droops then low rumble
    master.gain.value = 0.65;
    // Wah-wah pairs (hi→lo pairs dropping each time)
    [[494,370],[440,330],[392,294],[349,262]].forEach(([hi,lo],i) => {
      _sweep(ac, master, hi, lo*0.80, "sawtooth", t+i*0.35, 0.32, 0.65);
      _sweep(ac, master, hi*0.75, lo*0.60, "square", t+i*0.35+0.08, 0.30, 0.45);
      _note (ac, master, lo*0.5,  "sine",  t+i*0.35, 0.32, 0.30);
    });
    // Final low thud
    _sweep(ac, master, 200, 40, "sawtooth", t+1.45, 0.55, 0.75);
    _note (ac, master, 55,  "sine",         t+1.45, 0.60, 0.40);
    _noise(ac, master, t+1.40, 0.40, 0.25, 80);
    // Distant echo rumble
    _noise(ac, master, t, 1.60, 0.10, 120);
  }
  else if (type === "combo") {
    // Leo thang theo comboN
    const n = comboN || 3;
    if (n >= 15) {
      // SIÊU COMBO: fanfare mini
      [880,1100,1320,1760].forEach((f,i) => {
        _note(ac, master, f,   "square",   t+i*0.07, 0.10, 0.65);
        _note(ac, master, f*2, "triangle", t+i*0.07, 0.10, 0.30);
      });
      _noise(ac, master, t, 0.06, 0.20, 1800);
    } else if (n >= 10) {
      // COMBO ×10: 3 nốt sweep + shimmer
      _sweep(ac, master, 660,  1980, "sine", t,       0.22, 0.65);
      _sweep(ac, master, 880,  2640, "sine", t+0.10,  0.18, 0.55);
      _note (ac, master, 3000, "sine", t+0.25, 0.15, 0.40);
      _noise(ac, master, t, 0.06, 0.18, 2000);
    } else if (n >= 5) {
      // COMBO ×5: 2 sweep
      _sweep(ac, master, 880, 1760, "sine", t,       0.16, 0.60);
      _sweep(ac, master,1100, 2200, "sine", t+0.08,  0.16, 0.50);
      _noise(ac, master, t, 0.04, 0.12, 1600);
    } else {
      // COMBO ×3: shimmer nhẹ
      _sweep(ac, master, 800, 1600, "sine", t,       0.14, 0.55);
      _sweep(ac, master,1000, 2000, "sine", t+0.07,  0.12, 0.45);
    }
  }
  else if (type === "levelup") {
    // Level clear — vui nhộn rõ ràng
    const seq = [523,659,784,1047,1319];
    seq.forEach((f,i) => {
      _note(ac, master, f,   "square",   t+i*0.09, 0.11, 0.55);
      _note(ac, master, f*2, "triangle", t+i*0.09, 0.13, 0.22);
    });
    _note(ac, master, 1760, "sine", t+0.50, 0.30, 0.35);
  }
  else if (type === "badge") {
    // Huy hiệu — ma thuật lấp lánh
    const magic = [1047,1319,1568,2093,1568,1319,1047];
    magic.forEach((f,i) => _note(ac, master, f, "sine", t+i*0.09, 0.14, 0.45));
    [523,659,784].forEach((f,i) => _note(ac, master, f, "triangle", t+i*0.09, 0.20, 0.22));
    _noise(ac, master, t+0.50, 0.20, 0.10, 2500);
  }
  else if (type === "boss") {
    // Rầm rền + rít + drum hit đáng sợ
    _sweep(ac, master, 180,  35, "sawtooth", t,       0.55, 0.85);
    _sweep(ac, master, 120,  28, "sawtooth", t+0.15,  0.50, 0.70);
    _sweep(ac, master,  80,  20, "sawtooth", t+0.28,  0.45, 0.60);
    _noise(ac, master, t, 0.70, 0.45, 90);
    _note (ac, master, 40,  "sine", t,       0.70, 0.80);
    _note (ac, master, 55,  "sine", t+0.22,  0.55, 0.65);
    // High-freq screech (rồng gầm)
    _sweep(ac, master, 1200, 300, "sawtooth", t+0.05, 0.40, 0.35);
  }
  else if (type === "tick") {
    playTick(false);
  }
  else if (type === "tick-urgent") {
    playTick(true);
  }
  else if (type === "boss-hit") {
    // Tiếng chém kim loại + vang
    _sweep(ac, master, 800,  200, "sawtooth", t,       0.20, 0.75);
    _sweep(ac, master, 600,  150, "sawtooth", t+0.06,  0.18, 0.60);
    _noise(ac, master, t, 0.25, 0.35, 400);
    _note (ac, master, 180, "sine", t, 0.30, 0.55);
  }
  else if (type === "princess") {
    // Princess saved — magical ascending sparkle jingle
    master.gain.value = 0.60;
    // Rising arpeggio (C major pentatonic, 2 octaves)
    [523,659,784,1047,1319,1568,2093].forEach((f,i) => {
      _note(ac, master, f,    "sine",     t+i*0.09, 0.16, 0.50);
      _note(ac, master, f*2,  "triangle", t+i*0.09, 0.10, 0.18);
    });
    // Sparkle shimmer (high glitter notes)
    [2637,3136,3520,4186].forEach((f,i) => {
      _note(ac, master, f, "sine", t+0.70+i*0.07, 0.14, 0.22);
    });
    // Warm chord resolution
    [523,659,784,1047].forEach(f => _note(ac, master, f, "sine", t+1.10, 0.55, 0.30));
    // Twinkle tail
    [2093,2637,2093,1568].forEach((f,i) => _note(ac, master, f, "triangle", t+1.45+i*0.10, 0.15, 0.20));
    _noise(ac, master, t+0.65, 0.15, 0.18, 2200);
  }
  else {
    _note(ac, ac.destination, 440, "sine", t, 0.15, 0.3);
  }
}

function draw() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawSky();
  drawGround();
  drawCastle();
  drawObstacles();
  drawHero();
  if (bossActive) drawBoss(); else drawEnemy();
  drawPrincess();
  drawPet();
  drawChest();
  drawHUDText();
  drawFloats();

  if (Math.abs(heroX - targetX) > 1) {
    heroX += (targetX - heroX) * 0.065;
  } else if (heroState === "run") heroState = "idle";

  if (enemyShake > 0) enemyShake--;
  if (coinBurst > 0) coinBurst--;
  if (chestGlow > 0) chestGlow--;

  requestAnimationFrame(draw);
}

function drawSkyForest() {
  // Nền trời gradient xanh đẹp hơn
  const g = ctx.createLinearGradient(0,0,0,310);
  g.addColorStop(0,   "#3fc8ff");
  g.addColorStop(0.5, "#8ce4ff");
  g.addColorStop(1,   "#d4f4ff");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // ☀️ Mặt trời
  const sunX = 70, sunY = 58;
  const sunGlow = ctx.createRadialGradient(sunX,sunY,8, sunX,sunY,60);
  sunGlow.addColorStop(0,   "rgba(255,240,100,.60)");
  sunGlow.addColorStop(1,   "rgba(255,230,80,0)");
  ctx.fillStyle = sunGlow; ctx.beginPath(); ctx.arc(sunX,sunY,60,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = "#ffe93a";
  ctx.beginPath(); ctx.arc(sunX,sunY,22,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = "#ffd000";
  ctx.beginPath(); ctx.arc(sunX,sunY,17,0,Math.PI*2); ctx.fill();
  // rays
  ctx.strokeStyle = "#ffe040"; ctx.lineWidth = 3; ctx.lineCap = "round";
  for (let r=0; r<8; r++) {
    const a = r/8*Math.PI*2 + Date.now()/4000;
    ctx.beginPath(); ctx.moveTo(sunX+Math.cos(a)*27,sunY+Math.sin(a)*27);
    ctx.lineTo(sunX+Math.cos(a)*40,sunY+Math.sin(a)*40); ctx.stroke();
  }

  // Mây di chuyển
  const co = cloudOffset % 900;
  drawCloud(( 90+co)%900, 60,  1.0);
  drawCloud((350+co)%900, 45,  .75);
  drawCloud((650+co)%900, 75, 1.05);
  drawCloud((co-200+900)%900, 55, .85);

  // Cuộn nền khi chạy
  if (heroState === "run") { cloudOffset += 0.4; groundOffset = (groundOffset + 1.2) % 50; }

  // 🌈 Cầu vồng đẹp hơn (opacity thấp, tinh tế)
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 10;
  ["#ff5d73","#ffa340","#ffd447","#54d66f","#54b6ff","#8b5cf6"].forEach((c,i)=>{
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.arc(455, 340, 255-i*12, Math.PI*1.08, Math.PI*1.92);
    ctx.stroke();
  });
  ctx.globalAlpha = 1.0;

  // Đồi cỏ
  ctx.fillStyle = "#6ed55e";
  ctx.beginPath(); ctx.arc(140,348,115,Math.PI,0); ctx.fill();
  ctx.fillStyle = "#5ac84a";
  ctx.beginPath(); ctx.arc(380,356,155,Math.PI,0); ctx.fill();
  ctx.fillStyle = "#7ee566";
  ctx.beginPath(); ctx.arc(690,354,138,Math.PI,0); ctx.fill();

  // Hoa nhỏ trên đồi
  const flowers = [[130,310],[185,308],[320,315],[450,312],[670,310],[730,308]];
  flowers.forEach(([fx,fy],idx) => {
    const fc = ["#ff6b9d","#ff9f43","#ffd43b","#ff4c4c","#a29bfe","#fd79a8"][idx%6];
    ctx.fillStyle = fc;
    ctx.beginPath(); ctx.arc(fx, fy, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(fx, fy, 2, 0, Math.PI*2); ctx.fill();
  });
}

function drawCloud(x,y,s) {
  // Bóng mờ
  ctx.fillStyle = "rgba(130,200,240,.22)";
  ctx.beginPath();
  ctx.arc(x+3, y+5, 22*s, 0, Math.PI*2);
  ctx.arc(x+28*s+3, y-8*s+5, 30*s, 0, Math.PI*2);
  ctx.arc(x+58*s+3, y+5, 22*s, 0, Math.PI*2);
  ctx.fill();
  // Thân mây
  ctx.fillStyle = "rgba(255,255,255,.95)";
  ctx.beginPath();
  ctx.arc(x, y, 22*s, 0, Math.PI*2);
  ctx.arc(x+28*s, y-8*s, 30*s, 0, Math.PI*2);
  ctx.arc(x+58*s, y, 22*s, 0, Math.PI*2);
  ctx.fill();
  // Viền sáng
  ctx.fillStyle = "rgba(255,255,255,.50)";
  ctx.beginPath();
  ctx.arc(x+28*s, y-12*s, 22*s, 0, Math.PI*2);
  ctx.fill();
}

function drawGroundForest() {
  // Đất nâu + gradient
  const dg = ctx.createLinearGradient(0,310,0,430);
  dg.addColorStop(0, "#7fd870");
  dg.addColorStop(0.15, "#54ba46");
  dg.addColorStop(0.3, "#9a6230");
  dg.addColorStop(1, "#7a4c22");
  ctx.fillStyle = dg;
  ctx.fillRect(0,305,900,125);

  // Đường viền cỏ
  ctx.fillStyle = "#5fcf50";
  ctx.fillRect(0,300,900,10);
  ctx.fillStyle = "#7ce86c";
  ctx.fillRect(0,297,900,5);

  // Gạch đất cuộn
  ctx.fillStyle = "rgba(255,255,255,.16)";
  for (let i=-50;i<950;i+=50) ctx.fillRect(i+groundOffset%50,355,28,10);

  // Viền sáng đất
  ctx.fillStyle = "rgba(255,230,160,.30)";
  ctx.fillRect(0,355,900,4);

  // Cỏ nhấp nhô nhỏ
  ctx.fillStyle = "#6de25c";
  for (let i=0;i<900;i+=18) {
    const h = 5 + Math.abs(Math.sin(i*0.4+groundOffset*0.1))*4;
    ctx.beginPath();
    ctx.moveTo(i,305); ctx.lineTo(i+6,305-h); ctx.lineTo(i+12,305); ctx.fill();
  }
}

function drawObstacles() {
  const bricks = [185, 300, 430, 560];
  bricks.forEach((x, idx) => {
    ctx.fillStyle = idx % 2 ? "#d98435" : "#c96c2b";
    roundedRect(x,265,48,40,7);
    ctx.fill();
    ctx.strokeStyle = "#7b3b17";
    ctx.lineWidth = 3;
    ctx.strokeRect(x,265,48,40);
    ctx.beginPath(); ctx.moveTo(x,285); ctx.lineTo(x+48,285); ctx.moveTo(x+24,265); ctx.lineTo(x+24,305); ctx.stroke();
  });

  // floating reward coins
  for (let i=0;i<5;i++) {
    const x = 230 + i*78;
    ctx.save();
    ctx.translate(x,222 + Math.sin(Date.now()/250+i)*5);
    ctx.fillStyle = "#ffd93d";
    ctx.beginPath(); ctx.ellipse(0,0,13,18,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#b77c00"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#fff6a5"; ctx.fillRect(-3,-10,6,20);
    ctx.restore();
  }

  if (coinBurst > 0) {
    for (let i=0;i<10;i++) {
      const ang = i/10*Math.PI*2;
      ctx.fillStyle = "#ffd93d";
      ctx.beginPath();
      ctx.arc(heroX+38+Math.cos(ang)*(48-coinBurst), 250+Math.sin(ang)*(48-coinBurst), 7,0,Math.PI*2);
      ctx.fill();
    }
  }
}

function drawHero() {
  const yBase = 300;
  const jump = heroState === "jump" ? Math.sin(Date.now()/110)*18 + 18 : 0;
  const hitOffset = heroState === "hit" ? Math.sin(Date.now()/35)*7 : 0;
  const runBob = heroState === "run" ? Math.sin(Date.now()/85)*3 : 0;
  const x = heroX + hitOffset;
  const y = yBase - Math.abs(jump) + runBob;

  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.beginPath(); ctx.ellipse(x+38, 327, 38, 10, 0,0,Math.PI*2); ctx.fill();

  // cape
  ctx.fillStyle = "#ffcc00";
  ctx.beginPath();
  ctx.moveTo(x+18,y-86); ctx.lineTo(x-10,y-54); ctx.lineTo(x+19,y-42); ctx.fill();

  // legs
  ctx.fillStyle = "#2354d4";
  roundedRect(x+18, y-45, 18, 42, 6); ctx.fill();
  roundedRect(x+44, y-45, 18, 42, 6); ctx.fill();

  // shoes
  ctx.fillStyle = "#5a2d12";
  roundedRect(x+10, y-5, 31, 12, 6); ctx.fill();
  roundedRect(x+40, y-5, 31, 12, 6); ctx.fill();

  // body
  ctx.fillStyle = "#f04444";
  roundedRect(x+17, y-94, 52, 55, 13); ctx.fill();

  // overalls
  ctx.fillStyle = "#2365e8";
  roundedRect(x+24, y-79, 38, 39, 8); ctx.fill();

  // buttons
  ctx.fillStyle = "#ffd447";
  ctx.beginPath(); ctx.arc(x+31,y-63,4,0,Math.PI*2); ctx.arc(x+55,y-63,4,0,Math.PI*2); ctx.fill();

  // arms / gloves
  ctx.strokeStyle = "#f04444"; ctx.lineWidth = 12; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x+18,y-76); ctx.lineTo(x+4,y-54); ctx.moveTo(x+68,y-76); ctx.lineTo(x+82,y-57); ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(x+2,y-53,9,0,Math.PI*2); ctx.arc(x+84,y-56,9,0,Math.PI*2); ctx.fill();

  // neck/head
  ctx.fillStyle = "#ffd2a6";
  roundedRect(x+35,y-104,16,14,5); ctx.fill();
  ctx.beginPath(); ctx.arc(x+43, y-122, 30, 0, Math.PI*2); ctx.fill();

  // hair
  ctx.fillStyle = "#5b2d10";
  ctx.beginPath(); ctx.arc(x+31,y-122,9,0,Math.PI*2); ctx.arc(x+55,y-124,9,0,Math.PI*2); ctx.fill();

  // cap
  ctx.fillStyle = "#f04444";
  roundedRect(x+14, y-153, 58, 20, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(x+43, y-137, 30, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(x+43, y-137, 11,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = "#f04444"; ctx.font = "bold 13px Arial"; ctx.textAlign = "center"; ctx.fillText("H", x+43, y-132);

  // face
  ctx.fillStyle = "#111";
  ctx.beginPath(); ctx.arc(x+34, y-124, 3,0,Math.PI*2); ctx.arc(x+53, y-124, 3,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#8a3d18"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x+43, y-112, 10, 0.1, Math.PI-0.1); ctx.stroke();

  // Sparkle / shield khi combo cao
  if (combo >= 5) {
    const t = Date.now()/400;
    ctx.globalAlpha = 0.7 + Math.sin(t)*0.3;
    ctx.strokeStyle = combo >= 10 ? "#ff6f00" : "#ffd447";
    ctx.lineWidth = combo >= 10 ? 5 : 3;
    ctx.beginPath(); ctx.arc(x+43, y-70, 65, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 1.0;
  }
  if (combo >= 3) {
    ctx.font = "20px Arial"; ctx.textAlign="center";
    ctx.fillText("✨", x+80, y-138);
  }
}

function drawEnemy() {
  if (rescue >= 100 && !bossActive) return;  // đã bị đánh bại

  // Quái yếu dần theo rescue: khoẻ (0%) → sắp chết (100%)
  const hp = Math.max(0, 1 - rescue / 100);   // 1.0 → 0.0
  const sc = 0.45 + hp * 0.55;                // scale 1.0 → 0.45
  const al = rescue < 50 ? 1 : Math.max(0.25, 1 - (rescue - 50) / 60);
  const wobble = rescue > 55 ? Math.sin(Date.now() / 130) * ((rescue - 55) / 45) * 10 : 0;

  const cx = 675, cy = 286;
  const shake = enemyShake ? Math.sin(Date.now() / 28) * 12 : 0;

  ctx.save();
  ctx.globalAlpha = al;
  // Scale + wobble từ tâm quái
  ctx.translate(cx + shake + wobble, cy);
  ctx.scale(sc, sc);

  const x = 0, y = 0;
  const bob = Math.sin(Date.now() / 320) * 3;

  // Màu sắc thay đổi theo sức khoẻ
  const bodyC1 = rescue < 40 ? "#9b6ef0" : rescue < 70 ? "#a08080" : "#888";
  const bodyC2 = rescue < 40 ? "#4a1fb0" : rescue < 70 ? "#664444" : "#555";
  const hornC  = rescue < 40 ? "#ff6b35" : "#999";
  const eyeC   = rescue < 40 ? "#e60000" : "#888";  // mắt đỏ → xám khi sắp chết

  // Bóng đổ (thu nhỏ theo scale)
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.beginPath(); ctx.ellipse(0, 40, 45, 11, 0, 0, Math.PI*2); ctx.fill();

  // Đuôi
  ctx.strokeStyle = rescue < 40 ? "#4a2a9e" : "#666";
  ctx.lineWidth = 7; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(30, y+8+bob);
  ctx.bezierCurveTo(62, y+18+bob, 68, y-12+bob, 52, y-24+bob);
  ctx.stroke();

  // Thân
  const eg = ctx.createRadialGradient(0,y+bob,0, 0,y+bob,48);
  eg.addColorStop(0, bodyC1); eg.addColorStop(1, bodyC2);
  ctx.fillStyle = eg;
  ctx.beginPath(); ctx.arc(0, y+bob, 38, 0, Math.PI*2); ctx.fill();

  // Vết thương (hiện từ rescue 40%)
  if (rescue > 40) {
    ctx.strokeStyle = "rgba(255,80,80," + Math.min(0.8, (rescue-40)/50) + ")";
    ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-10, y-5+bob); ctx.lineTo(10, y+12+bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, y-5+bob); ctx.lineTo(-10, y+12+bob); ctx.stroke();
  }

  // Chân
  ctx.fillStyle = rescue < 40 ? "#5f37b8" : "#666";
  ctx.beginPath();
  ctx.arc(-18, y+30+bob, 20, 0, Math.PI*2);
  ctx.arc(18, y+30+bob, 20, 0, Math.PI*2);
  ctx.fill();

  // Sừng nhọn
  ctx.fillStyle = hornC;
  ctx.beginPath(); ctx.moveTo(-22,y-30+bob); ctx.lineTo(-28,y-58+bob); ctx.lineTo(-10,y-32+bob); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(22,y-30+bob);  ctx.lineTo(28,y-58+bob);  ctx.lineTo(10,y-32+bob);  ctx.closePath(); ctx.fill();

  // Mắt
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(-14, y-8+bob, 12, 0, Math.PI*2); ctx.arc(14, y-8+bob, 12, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = eyeC;
  ctx.beginPath(); ctx.arc(-13, y-7+bob, 6, 0, Math.PI*2); ctx.arc(13, y-7+bob, 6, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath(); ctx.arc(-12, y-6+bob, 3, 0, Math.PI*2); ctx.arc(12, y-6+bob, 3, 0, Math.PI*2); ctx.fill();
  // Mắt xoáy khi gần chết (rescue > 70%)
  if (rescue > 70) {
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-17, y-11+bob); ctx.lineTo(-9, y-3+bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-9, y-11+bob);  ctx.lineTo(-17,y-3+bob);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(9,  y-11+bob);  ctx.lineTo(17, y-3+bob);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(17, y-11+bob);  ctx.lineTo(9,  y-3+bob);  ctx.stroke();
  }

  // Miệng
  ctx.fillStyle = rescue < 40 ? "#ff3c3c" : "#884444";
  roundedRect(-16, y+10+bob, 32, 10, 5); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(-8, y+10+bob, 4, 0, Math.PI*2); ctx.arc(8, y+10+bob, 4, 0, Math.PI*2); ctx.fill();

  // Lông mày — cau khi khoẻ, thõng xuống khi sắp chết
  ctx.strokeStyle = "#222"; ctx.lineWidth = 3; ctx.lineCap = "round";
  if (rescue < 60) {
    // Cau lại (hung hăng)
    ctx.beginPath(); ctx.moveTo(-22,y-19+bob); ctx.lineTo(-8,y-24+bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(22,y-19+bob);  ctx.lineTo(8,y-24+bob);  ctx.stroke();
  } else {
    // Thõng xuống (yếu đuối)
    ctx.beginPath(); ctx.moveTo(-22,y-24+bob); ctx.lineTo(-8,y-19+bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(22,y-24+bob);  ctx.lineTo(8,y-19+bob);  ctx.stroke();
  }

  ctx.restore();
}

function drawCastle() {
  // Bóng lâu đài
  ctx.fillStyle = "rgba(0,0,0,.12)";
  roundedRect(760,308,110,8,4); ctx.fill();

  // Tháp phụ trái
  ctx.fillStyle = "#e8a23c";
  roundedRect(748,228,38,80,6); ctx.fill();
  ctx.fillStyle = "#c0392b";
  ctx.beginPath(); ctx.moveTo(748,228); ctx.lineTo(767,200); ctx.lineTo(786,228); ctx.fill();

  // Tháp phụ phải
  ctx.fillStyle = "#e8a23c";
  roundedRect(846,228,38,80,6); ctx.fill();
  ctx.fillStyle = "#c0392b";
  ctx.beginPath(); ctx.moveTo(846,228); ctx.lineTo(865,200); ctx.lineTo(884,228); ctx.fill();

  // Thân lâu đài chính (gradient)
  const cg = ctx.createLinearGradient(763,200,860,308);
  cg.addColorStop(0, "#ffe08a");
  cg.addColorStop(1, "#d4882a");
  ctx.fillStyle = cg;
  roundedRect(763,205,108,103,8); ctx.fill();

  // Viền tường
  ctx.strokeStyle = "#b8720a"; ctx.lineWidth = 2;
  roundedRect(763,205,108,103,8); ctx.stroke();

  // Đỉnh tháp chính
  ctx.fillStyle = "#c0392b";
  ctx.beginPath(); ctx.moveTo(763,205); ctx.lineTo(817,158); ctx.lineTo(871,205); ctx.fill();
  ctx.strokeStyle = "#9a1c14"; ctx.lineWidth = 2; ctx.stroke();

  // Cờ trên đỉnh
  ctx.strokeStyle = "#5a2d0a"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(817,158); ctx.lineTo(817,136); ctx.stroke();
  ctx.fillStyle = "#ff3c3c";
  ctx.beginPath(); ctx.moveTo(817,136); ctx.lineTo(840,143); ctx.lineTo(817,152); ctx.fill();

  // Cửa vòm
  const doorG = ctx.createLinearGradient(797,255,830,308);
  doorG.addColorStop(0,"#3a1a00"); doorG.addColorStop(1,"#6b3810");
  ctx.fillStyle = doorG;
  ctx.beginPath();
  ctx.arc(814, 268, 16, Math.PI, 0);
  ctx.rect(798, 268, 32, 36);
  ctx.fill();
  ctx.strokeStyle = "#7b4a18"; ctx.lineWidth = 2; ctx.stroke();

  // Đinh cửa
  ctx.fillStyle = "#ffd447";
  [[804,272],[824,272],[804,284],[824,284]].forEach(([px,py])=>{
    ctx.beginPath(); ctx.arc(px,py,2.5,0,Math.PI*2); ctx.fill();
  });

  // Cửa sổ tháp phụ
  ctx.fillStyle = "#7dd8ff";
  ctx.fillRect(758,240,14,16); ctx.fillRect(860,240,14,16);
  ctx.strokeStyle = "#5ab0d4"; ctx.lineWidth = 1.5;
  ctx.strokeRect(758,240,14,16); ctx.strokeRect(860,240,14,16);

  // Cửa sổ tháp chính
  ctx.fillStyle = "#7dd8ff";
  ctx.fillRect(776,222,16,18); ctx.fillRect(840,222,16,18);
  ctx.strokeStyle = "#5ab0d4"; ctx.lineWidth = 1.5;
  ctx.strokeRect(776,222,16,18); ctx.strokeRect(840,222,16,18);

  // Khối gạch trang trí
  ctx.strokeStyle = "rgba(160,100,20,.30)"; ctx.lineWidth = 1;
  for (let row=0; row<3; row++) {
    for (let col=0; col<3; col++) {
      ctx.strokeRect(768+col*34, 218+row*26, 32, 22);
    }
  }
}

function drawPrincess() {
  // 4 trạng thái cảm xúc theo rescue%
  // 0-30: buồn bã (tay thõng, miệng cúp)
  // 30-60: hy vọng (một tay vẫy, miệng bình)
  // 60-90: vui mừng (hai tay giơ lên, cười)
  // 90-100: hân hoan (nhảy cao, sparkle nhiều)
  const bobSpeed = rescue < 30 ? 600 : rescue < 60 ? 380 : rescue < 90 ? 220 : 140;
  const bobAmp   = rescue < 30 ? 3   : rescue < 60 ? 5   : rescue < 90 ? 8   : 14;
  const x = 812, y = 170 + Math.sin(Date.now() / bobSpeed) * bobAmp;

  // Bóng đổ (to hơn khi nhảy)
  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath(); ctx.ellipse(x, 252, 22 + bobAmp * 0.5, 7, 0, 0, Math.PI*2); ctx.fill();

  // Glow hào quang khi rescue cao
  if (rescue >= 60) {
    const glowA = Math.min(0.5, (rescue - 60) / 80);
    const glowG = ctx.createRadialGradient(x, y, 10, x, y, 55);
    glowG.addColorStop(0, "rgba(255,200,80," + glowA + ")");
    glowG.addColorStop(1, "rgba(255,200,80,0)");
    ctx.fillStyle = glowG;
    ctx.beginPath(); ctx.arc(x, y, 55, 0, Math.PI*2); ctx.fill();
  }

  // Váy dưới
  const skirtG = ctx.createLinearGradient(x-32, y+20, x+32, y+80);
  skirtG.addColorStop(0, rescue < 30 ? "#c0c0d8" : "#ff8ed4");
  skirtG.addColorStop(1, rescue < 30 ? "#8888aa" : "#e0268c");
  ctx.fillStyle = skirtG;
  ctx.beginPath(); ctx.moveTo(x, y+18); ctx.lineTo(x-34, y+82); ctx.lineTo(x+34, y+82); ctx.fill();

  // Eo (thân trên)
  ctx.fillStyle = rescue < 30 ? "#9090b0" : "#ff5ab8";
  ctx.beginPath(); ctx.arc(x, y+22, 18, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#ffd447";
  ctx.fillRect(x-18, y+20, 36, 6);

  // Tay — thay đổi theo trạng thái
  ctx.strokeStyle = "#ffd2a6"; ctx.lineWidth = 9; ctx.lineCap = "round";
  if (rescue < 30) {
    // Tay thõng xuống — buồn
    ctx.beginPath(); ctx.moveTo(x-14,y+6); ctx.lineTo(x-22,y+38); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+14,y+6); ctx.lineTo(x+22,y+38); ctx.stroke();
  } else if (rescue < 60) {
    // Tay trái giơ vẫy — hy vọng
    const wave = Math.sin(Date.now()/220) * 12;
    ctx.beginPath(); ctx.moveTo(x-14,y+6); ctx.lineTo(x-32, y-14 + wave); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+14,y+6); ctx.lineTo(x+26,y+30); ctx.stroke();
  } else if (rescue < 90) {
    // Cả hai tay giơ lên — vui
    const wv = Math.sin(Date.now()/180) * 10;
    ctx.beginPath(); ctx.moveTo(x-14,y+6); ctx.lineTo(x-32, y-18+wv); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+14,y+6); ctx.lineTo(x+32, y-18-wv); ctx.stroke();
  } else {
    // Hai tay giơ cao vẫy mạnh — hân hoan
    const wv = Math.sin(Date.now()/120) * 16;
    ctx.beginPath(); ctx.moveTo(x-14,y+6); ctx.lineTo(x-36, y-28+wv); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+14,y+6); ctx.lineTo(x+36, y-28-wv); ctx.stroke();
  }

  // Đầu
  ctx.fillStyle = "#ffd2a6";
  ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI*2); ctx.fill();

  // Tóc vàng dài
  ctx.fillStyle = "#ffcc00";
  ctx.beginPath();
  ctx.arc(x, y, 18, Math.PI*0.9, Math.PI*2.1);
  ctx.lineTo(x+22, y+50); ctx.lineTo(x-22, y+50); ctx.fill();
  ctx.fillStyle = "#e6b800";
  ctx.beginPath(); ctx.arc(x, y, 18, Math.PI, Math.PI*2); ctx.fill();

  // Vương miện
  ctx.fillStyle = "#ffd447";
  ctx.beginPath();
  ctx.moveTo(x-18,y-16); ctx.lineTo(x-18,y-32); ctx.lineTo(x-9,y-24);
  ctx.lineTo(x,y-36);    ctx.lineTo(x+9,y-24);  ctx.lineTo(x+18,y-32);
  ctx.lineTo(x+18,y-16); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#e0a000"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = "#ff4fa3"; ctx.beginPath(); ctx.arc(x, y-34, 4, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#54b6ff"; ctx.beginPath(); ctx.arc(x-16,y-26,3,0,Math.PI*2); ctx.arc(x+16,y-26,3,0,Math.PI*2); ctx.fill();

  // Mắt
  ctx.fillStyle = "#111";
  ctx.beginPath(); ctx.arc(x-6,y-2,2.5,0,Math.PI*2); ctx.arc(x+6,y-2,2.5,0,Math.PI*2); ctx.fill();

  // Miệng — buồn → bình thường → cười → cười to
  ctx.strokeStyle = "#c96040"; ctx.lineWidth = 1.8;
  if (rescue < 30) {
    // Miệng cúp — buồn
    ctx.beginPath(); ctx.arc(x, y+8, 5, Math.PI+0.3, -0.3); ctx.stroke();
    // Giọt nước mắt
    if (Math.sin(Date.now()/700) > 0.4) {
      ctx.fillStyle = "#54b6ff";
      ctx.beginPath(); ctx.ellipse(x-7, y+8, 2, 4, 0, 0, Math.PI*2); ctx.fill();
    }
  } else if (rescue < 60) {
    // Miệng thẳng — bình thường
    ctx.beginPath(); ctx.moveTo(x-5, y+5); ctx.lineTo(x+5, y+5); ctx.stroke();
  } else if (rescue < 90) {
    // Cười nhẹ
    ctx.beginPath(); ctx.arc(x, y+3, 5, 0.2, Math.PI-0.2); ctx.stroke();
  } else {
    // Cười to
    ctx.beginPath(); ctx.arc(x, y+3, 7, 0.1, Math.PI-0.1); ctx.stroke();
    ctx.fillStyle = "#ff6090";
    ctx.beginPath(); ctx.arc(x, y+6, 4, 0, Math.PI); ctx.fill();
  }

  // Má hồng
  ctx.fillStyle = "rgba(255,100,130,.30)";
  ctx.beginPath(); ctx.arc(x-11,y+3,5,0,Math.PI*2); ctx.arc(x+11,y+3,5,0,Math.PI*2); ctx.fill();

  // Sparkle — tăng theo rescue
  const sparkCount = rescue < 30 ? 0 : rescue < 60 ? 2 : rescue < 90 ? 3 : 5;
  const sparkColors = ["#ffd447","#ff79c6","#54b6ff","#a8ff78","#ff9f43"];
  const t = Date.now() / (rescue > 60 ? 400 : 600);
  for (let i = 0; i < sparkCount; i++) {
    const sa = t + i * (Math.PI*2 / sparkCount);
    const r  = rescue > 90 ? 36 : 28;
    ctx.fillStyle = sparkColors[i % sparkColors.length];
    ctx.font = (rescue > 90 ? "15px" : "12px") + " Arial";
    ctx.textAlign = "center";
    ctx.fillText("✨", x + Math.cos(sa)*r, y + Math.sin(sa)*r);
  }
}

function drawPet() {
  // Kích thước pet tăng theo streak
  let sz = 14; let color = "#ffcf54"; let earColor = "#ff9f1c"; let label = "";
  if (streak >= 3  && streak <= 6)  { sz = 18; color = "#ffc436"; earColor = "#ff8800"; label = "★"; }
  if (streak >= 7  && streak <= 13) { sz = 24; color = "#ffaa00"; earColor = "#e65c00"; label = "★★"; }
  if (streak >= 14)                 { sz = 30; color = "#ff7f00"; earColor = "#c40000"; label = "♛"; }

  const x = Math.max(sz + 8, heroX - 42);
  const y = 312 + Math.sin(Date.now()/180)*4;

  // Bóng đổ
  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath(); ctx.ellipse(x, 326, sz*1.2+3, 6, 0, 0, Math.PI*2); ctx.fill();

  // Tai
  ctx.fillStyle = earColor;
  ctx.beginPath(); ctx.moveTo(x-sz*0.7, y-sz*1.2); ctx.lineTo(x-sz*0.2, y-sz*2.8); ctx.lineTo(x+sz*0.1, y-sz*1.1); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x+sz*0.7, y-sz*1.2); ctx.lineTo(x+sz*0.2, y-sz*2.8); ctx.lineTo(x-sz*0.1, y-sz*1.1); ctx.fill();

  // Thân
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y-sz*1.1, sz, 0, Math.PI*2); ctx.fill();

  // Mắt
  ctx.fillStyle = "#111";
  ctx.beginPath(); ctx.arc(x-sz*0.35, y-sz*1.3, sz*0.12, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x+sz*0.35, y-sz*1.3, sz*0.12, 0, Math.PI*2); ctx.fill();

  // Miệng cười
  ctx.strokeStyle = "#333"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y-sz*0.95, sz*0.3, 0.1, Math.PI-0.1); ctx.stroke();

  // Nhãn streak
  if (label) {
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(sz*0.7)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText(label, x, y-sz*2.1);
  }

  // Viền phát sáng khi streak >= 14
  if (streak >= 14) {
    ctx.save();
    ctx.shadowColor = "#ffcc00"; ctx.shadowBlur = 18;
    ctx.strokeStyle = "#ffcc00"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y-sz*1.1, sz+4, 0, Math.PI*2); ctx.stroke();
    ctx.restore();
  }
}

function drawChest() {
  const x = 55, y = 240;
  if (chestGlow > 0) {
    ctx.fillStyle = "rgba(255, 230, 80, .35)";
    ctx.beginPath(); ctx.arc(x+30,y+28,55 + Math.sin(Date.now()/80)*8,0,Math.PI*2); ctx.fill();
  }
  ctx.fillStyle = "#b86a22"; roundedRect(x,y+20,62,40,7); ctx.fill();
  ctx.fillStyle = "#e6a23c"; roundedRect(x,y,62,30,9); ctx.fill();
  ctx.fillStyle = "#ffd447"; ctx.fillRect(x+25,y,12,60);
  ctx.fillStyle = "#fff2a4"; roundedRect(x+22,y+28,18,14,4); ctx.fill();
}


function drawBoss() {
  if (!bossActive) return;
  const tier = Math.min(bossLevel - 1, 2);
  const shake = enemyShake ? Math.sin(Date.now()/25)*14 : 0;
  const bx = 665 + shake;
  const by = 270;

  // Flash khi trúng đòn (trắng) hoặc hồi máu (xanh)
  if (bossFlash > 0 || bossHealFlash > 0) {
    ctx.save();
    ctx.globalAlpha = (bossFlash > 0 ? bossFlash : bossHealFlash) / 18 * 0.55;
    ctx.fillStyle = bossFlash > 0 ? "#ffffff" : "#4ade80";
    ctx.beginPath(); ctx.arc(bx, by, 58, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    if (bossFlash     > 0) bossFlash--;
    if (bossHealFlash > 0) bossHealFlash--;
  }

  if (tier === 0) {
    // ── QUỶ XANH ──────────────────────────────
    ctx.fillStyle = "#16a34a";
    ctx.beginPath(); ctx.arc(bx, by, 44, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#15803d";
    ctx.beginPath(); ctx.arc(bx-22,by+16,22,0,Math.PI*2);
                     ctx.arc(bx+22,by+16,22,0,Math.PI*2); ctx.fill();
    // Sừng
    ctx.fillStyle = "#854d0e";
    [[bx-28,by-36,bx-14,by-60,bx-4,by-33],[bx+28,by-36,bx+14,by-60,bx+4,by-33]].forEach(p=>{
      ctx.beginPath(); ctx.moveTo(p[0],p[1]); ctx.lineTo(p[2],p[3]); ctx.lineTo(p[4],p[5]); ctx.fill();
    });
    // Mắt đỏ
    ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(bx-16,by-8,12,0,Math.PI*2); ctx.arc(bx+16,by-8,12,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#ef4444"; ctx.beginPath(); ctx.arc(bx-16,by-8,6,0,Math.PI*2); ctx.arc(bx+16,by-8,6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#111"; ctx.beginPath(); ctx.arc(bx-14,by-10,3,0,Math.PI*2); ctx.arc(bx+18,by-10,3,0,Math.PI*2); ctx.fill();
    // Răng
    ctx.fillStyle="#fff";
    [-12,-4,4,12].forEach(dx=>{ ctx.beginPath(); ctx.moveTo(bx+dx,by+12); ctx.lineTo(bx+dx-5,by+24); ctx.lineTo(bx+dx+5,by+24); ctx.fill(); });

  } else if (tier === 1) {
    // ── HIỆP SĨ BÓNG TỐI ──────────────────────
    // Thân giáp
    ctx.fillStyle = "#312e81";
    roundedRect(bx-30,by-30,60,70,8); ctx.fill();
    ctx.fillStyle = "#4338ca";
    roundedRect(bx-26,by-26,52,62,6); ctx.fill();
    // Đầu + mũ
    ctx.fillStyle = "#1e1b4b";
    ctx.beginPath(); ctx.arc(bx,by-38,28,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#6d28d9";
    roundedRect(bx-30,by-60,60,12,6); ctx.fill();
    // Khe mắt đỏ
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(bx-20,by-44,40,8);
    ctx.fillStyle="#fff";
    ctx.fillRect(bx-18,by-43,36,6);
    ctx.fillStyle="#ef4444";
    ctx.fillRect(bx-16,by-42,32,4);
    // Kiếm
    ctx.strokeStyle="#94a3b8"; ctx.lineWidth=5;
    ctx.beginPath(); ctx.moveTo(bx+36,by-50); ctx.lineTo(bx+36,by+50); ctx.stroke();
    ctx.strokeStyle="#fbbf24"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(bx+24,by-5); ctx.lineTo(bx+48,by-5); ctx.stroke();

  } else {
    // ── RỒNG LỬA ──────────────────────────────
    // Thân
    ctx.fillStyle = "#991b1b";
    ctx.beginPath(); ctx.ellipse(bx,by+10,42,52,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#dc2626";
    ctx.beginPath(); ctx.ellipse(bx,by+5,34,44,0,0,Math.PI*2); ctx.fill();
    // Cánh
    ctx.fillStyle = "#7f1d1d";
    [[bx-42,by-20,bx-80,by-60,bx-20,by-30],[bx+42,by-20,bx+80,by-60,bx+20,by-30]].forEach(p=>{
      ctx.beginPath(); ctx.moveTo(p[0],p[1]); ctx.lineTo(p[2],p[3]); ctx.lineTo(p[4],p[5]); ctx.fill();
    });
    // Đầu
    ctx.fillStyle = "#b91c1c";
    ctx.beginPath(); ctx.arc(bx,by-42,30,0,Math.PI*2); ctx.fill();
    // Sừng
    ctx.fillStyle="#78350f";
    [[bx-14,by-60,bx-8,by-84,bx-2,by-60],[bx+14,by-60,bx+8,by-84,bx+2,by-60]].forEach(p=>{
      ctx.beginPath(); ctx.moveTo(p[0],p[1]); ctx.lineTo(p[2],p[3]); ctx.lineTo(p[4],p[5]); ctx.fill();
    });
    // Mắt
    ctx.fillStyle="#fbbf24"; ctx.beginPath(); ctx.arc(bx-12,by-46,9,0,Math.PI*2); ctx.arc(bx+12,by-46,9,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#111"; ctx.beginPath(); ctx.arc(bx-12,by-46,5,0,Math.PI*2); ctx.arc(bx+12,by-46,5,0,Math.PI*2); ctx.fill();
    // Lửa
    const t = Date.now()/80;
    ["#ff6b35","#ffd447","#ff4500"].forEach((c,i)=>{
      ctx.fillStyle=c;
      ctx.beginPath();
      ctx.arc(bx-52+(i*8),by-42+Math.sin(t+i)*5, 8-i*1.5, 0, Math.PI*2);
      ctx.fill();
    });
  }

  // Bóng
  ctx.fillStyle="rgba(0,0,0,.18)";
  ctx.beginPath(); ctx.ellipse(bx,329,50,10,0,0,Math.PI*2); ctx.fill();

  // ── HP BAR ────────────────────────────────────
  const barW = 120, barH = 14, barX = bx - barW/2, barY = by - 98;
  // nền
  ctx.fillStyle="rgba(0,0,0,.45)";
  roundedRect(barX-2,barY-2,barW+4,barH+4,5); ctx.fill();
  // fill
  const pct = Math.max(0, bossHP / bossMaxHP);
  const barColor = pct > 0.6 ? "#4ade80" : pct > 0.3 ? "#facc15" : "#ef4444";
  ctx.fillStyle = barColor;
  roundedRect(barX, barY, barW * pct, barH, 4); ctx.fill();
  // text HP
  ctx.fillStyle="#fff"; ctx.font="bold 11px Arial"; ctx.textAlign="center";
  ctx.fillText(BOSS_NAMES[tier] + "  " + bossHP + "/" + bossMaxHP, bx, barY - 5);
}

function drawHUDText() {
  ctx.fillStyle = "rgba(0,0,0,.50)";
  ctx.font = "bold 20px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Đúng → nhảy qua thử thách, ăn xu, mở rương ngày!", 20, 32);
}

function roundedRect(x,y,w,h,r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}



// ══ BOSS APPROACH & COMBO GLOW ═══════════════════════════════
function updateBossApproach() {
  const pct = Math.min(100, correctSinceBoss / 10 * 100);
  const fill = document.getElementById("bossProgFill");
  const text = document.getElementById("bossProgText");
  const wrap = document.getElementById("bossApproach");
  const warn = document.getElementById("bossWarning");
  if (fill) fill.style.width = pct + "%";
  if (text) text.textContent = correctSinceBoss + "/10";
  if (wrap) {
    if (bossActive || correctSinceBoss === 0) wrap.classList.remove("show");
    else wrap.classList.add("show");
  }
  // Warning banner khi gần boss
  if (warn) {
    if (!bossActive && correctSinceBoss >= 7) warn.classList.add("show");
    else warn.classList.remove("show");
  }
  // Cảnh báo âm thanh khi đúng 7 câu
  if (correctSinceBoss === 7 && !bossActive) {
    spawnFloat("⚠️ BOSS SẮP ĐẾN!", heroX + 30, 165, "#ff3333", 22, true);
  }
}

// ══ BOSS BATTLE ════════════════════════════════════════════════
const BOSS_NAMES  = ["👺 Quỷ Xanh", "🧟 Hiệp Sĩ Bóng Tối", "🐉 Rồng Lửa"];
const BOSS_COLORS = ["#22c55e",      "#6366f1",               "#ef4444"];

function startBoss() {
  bossLevel++;
  const tier = Math.min(bossLevel - 1, 2);
  bossMaxHP = 2 + tier + 1;   // tier0=3, tier1=4, tier2=5
  bossHP    = bossMaxHP;
  bossActive = true;
  bossFlash = 0; bossHealFlash = 0;
  spawnFloat("👹 BOSS!", 680, 160, "#ff3333", 36, true);
  message("⚔️ " + BOSS_NAMES[tier] + " xuất hiện! Trả lời đúng để đánh boss!");
  playSound("boss");
  // Flash overlay đỏ + boss warning ẩn
  const _bfo = document.getElementById("bossFlashOverlay");
  if (_bfo) { _bfo.classList.remove("flash"); void _bfo.offsetWidth; _bfo.classList.add("flash"); }
  const _bw = document.getElementById("bossWarning");
  if (_bw) _bw.classList.remove("show");
  updateBossApproach();
  setStats();
}

function hitBoss() {
  bossHP--;
  bossFlash = 18;
  const tier = Math.min(bossLevel - 1, 2);
  spawnFloat("💥 -1", 680 + (Math.random()-0.5)*40, 220, "#fff", 22, true);
  // Âm thanh đánh boss (khác với đúng câu thường)
  playSound("boss-hit");
  if (bossHP <= 0) setTimeout(defeatBoss, 500);
}

function defeatBoss() {
  const tier  = Math.min(bossLevel - 1, 2);
  const bonus = 60 + tier * 30;     // 60 / 90 / 120 xu
  const resc  = 15 + tier * 5;      // 15 / 20 / 25% rescue
  coins  += bonus;
  totalCoinsEarned += bonus;
  rescue  = Math.min(100, rescue + resc);
  bossActive = false;
  chestGlow  = 80;
  spawnFloat("🏆 +" + bonus + "xu!", 680, 180, "#ffd700", 30, true);
  spawnFloat("+" + resc + "% ❤️",   680, 210, "#ff79c6", 22, true);
  message("🎉 " + BOSS_NAMES[tier] + " đã bị hạ! +" + bonus + " xu, thanh giải cứu +" + resc + "%!");
  playSound("win");
  setStats();
  // Badge: Đả Long Thần — khi bossLevel >= 3 (tier 2 = Rồng Lửa)
  if (tier >= 2) setTimeout(() => checkAchievementBadge("boss_dragon"), 600);
  // Cập nhật xu tích lũy
  setTimeout(checkAllAchievements, 700);
  if (rescue >= 100) setTimeout(winGame, 900);
}

function healBoss() {
  if (bossHP < bossMaxHP) {
    bossHP = Math.min(bossMaxHP, bossHP + 1);
    bossHealFlash = 18;
    spawnFloat("💚 +1", 680 + (Math.random()-0.5)*30, 220, "#4ade80", 20, true);
  }
}
// ══════════════════════════════════════════════════════════════
// ══ DAILY GOAL ════════════════════════════════════════════════
const DAILY_Q   = 30;   // câu đúng cần đạt
const DAILY_MIN = 30;   // phút học cần đạt

function dailyGoalMet() {
  return dailyCorrect >= DAILY_Q && Math.floor(dailySeconds / 60) >= DAILY_MIN;
}

function updateDailyDisplay() {
  const mins = Math.floor(dailySeconds / 60);
  const secs = dailySeconds % 60;
  const qDone  = Math.min(dailyCorrect, DAILY_Q);
  const mDone  = Math.min(mins, DAILY_MIN);
  if (els.dailyTime)  els.dailyTime.textContent  = mDone + "/" + DAILY_MIN + "ph";
  if (els && els.dailyTotalEl) els.dailyTotalEl.textContent = dailyTotal;
  if (els.dailyChest) els.dailyChest.innerHTML   =
    "<b>" + qDone + "/" + DAILY_Q + " câu</b> &amp; " + mDone + "/" + DAILY_MIN + " phút";
}
// ══════════════════════════════════════════════════════════════
// ══ FLOAT TEXT ════════════════════════════════════════════════
function spawnFloat(text, x, y, color, size, bold) {
  floatTexts.push({
    x: x + (Math.random()-0.5)*20,
    y: y,
    text: text,
    color: color || "#fff700",
    alpha: 1.0,
    vy: -1.8 - Math.random()*0.8,
    size: size || 22,
    bold: bold !== false
  });
}

function drawFloats() {
  ctx.save();
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const f = floatTexts[i];
    f.y  += f.vy;
    f.vy *= 0.96;
    f.alpha -= 0.018;
    if (f.alpha <= 0) { floatTexts.splice(i, 1); continue; }
    ctx.globalAlpha = f.alpha;
    ctx.font = `${f.bold ? "bold " : ""}${f.size}px Arial`;
    ctx.textAlign = "center";
    // drop shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillText(f.text, f.x+2, f.y+2);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.restore();
}
// ══════════════════════════════════════════════════════════════
// ══ ACHIEVEMENT BADGES ════════════════════════════════════════
const ACHIEVEMENT_BADGES = {
  "streak_7":           { icon: "🔥", name: "Ngọn Lửa Bất Diệt",  desc: "Duy trì streak học 7 ngày liên tiếp" },
  "combo_10":           { icon: "🎯", name: "Bắn Tỉa Thần Sầu",   desc: "Combo 10 câu đúng liên tiếp trong 1 ván" },
  "best_200":           { icon: "🏆", name: "Chiến Thần",          desc: "Đạt 200 điểm trong 1 ván chơi" },
  "all_themes":         { icon: "🌈", name: "Nhà Du Lịch",         desc: "Mở khóa cả 4 chủ đề bản đồ" },
  "total_100":          { icon: "📚", name: "Học Giả",             desc: "Trả lời đúng tổng cộng 100 câu" },
  "boss_dragon":        { icon: "🐉", name: "Đả Long Thần",        desc: "Đánh bại Rồng Lửa — boss mạnh nhất!" },
  "quick_5":            { icon: "⚡", name: "Siêu Tốc",            desc: "Trả lời đúng trong vòng 5 giây" },
  "all_subject_badges": { icon: "🎓", name: "Toàn Năng",           desc: "Kiếm đủ huy hiệu tất cả 9 môn học" },
  "coins_500":          { icon: "💰", name: "Nhà Triệu Phú",       desc: "Kiếm tổng cộng 500 xu qua các ván" },
  "total_500":          { icon: "🌟", name: "Huyền Thoại",         desc: "Trả lời đúng tổng cộng 500 câu" },
  "daily_complete":     { icon: "📅", name: "Chuyên Cần",          desc: "Hoàn thành mục tiêu học tập trong ngày" },
};

// ── Huy hiệu môn học (8 cái cũ) ──────────────────────────────
const SUBJECT_BADGE_ICONS = {
  "Toán":"🔢","Ngữ văn":"📖","Tiếng Anh":"🇬🇧","KHTN":"🔬",
  "Lịch sử & Địa lý":"🗺️","GDCD":"⚖️","Tin học":"💻","Công nghệ":"🔧","Kỹ năng sống":"🛡️"
};
const SUBJECT_LIST = Object.keys(SUBJECT_BADGE_ICONS);

// ── Hiển thị overlay animation mở huy hiệu ────────────────────
let _badgeAutoClose = null;

function showBadgeUnlock(id) {
  const data = ACHIEVEMENT_BADGES[id] || { icon: SUBJECT_BADGE_ICONS[id]||"🏅", name: id, desc: "Huy hiệu môn học" };
  const ovEl = document.getElementById("badgeUnlockOverlay");
  document.getElementById("badgeUnlockIcon").textContent = data.icon;
  document.getElementById("badgeUnlockName").textContent = data.name;
  document.getElementById("badgeUnlockDesc").textContent = data.desc;
  // Reset animation bằng cách clone node
  const iconEl = document.getElementById("badgeUnlockIcon");
  const clone = iconEl.cloneNode(true);
  iconEl.parentNode.replaceChild(clone, iconEl);
  // Tạo các ngôi sao bắn ra
  const box = document.getElementById("badgeUnlockBox");
  const stars = ["⭐","✨","💫","🌟"];
  for (let i = 0; i < 6; i++) {
    const s = document.createElement("span");
    s.className = "badge-star";
    s.textContent = stars[i % stars.length];
    s.style.left = (20 + Math.random() * 240) + "px";
    s.style.top  = (20 + Math.random() * 160) + "px";
    s.style.animationDelay = (Math.random() * 0.4) + "s";
    box.appendChild(s);
    setTimeout(() => s.remove(), 1200);
  }
  ovEl.classList.add("show");
  playSound("badge");
  if (_badgeAutoClose) clearTimeout(_badgeAutoClose);
  _badgeAutoClose = setTimeout(closeBadgeUnlock, 3500);
}

function closeBadgeUnlock() {
  clearTimeout(_badgeAutoClose);
  const ovEl = document.getElementById("badgeUnlockOverlay");
  ovEl.classList.remove("show");
  _badgeShowing = false;
  // Nếu còn huy hiệu trong hàng đợi, hiện cái tiếp theo sau 400ms
  if (_badgeQueue.length > 0) {
    const next = _badgeQueue.shift();
    setTimeout(() => { _badgeShowing = true; showBadgeUnlock(next); }, 400);
  }
}

function checkAchievementBadge(id) {
  if (badgesEarned.includes(id)) return;
  badgesEarned.push(id);
  _sessionNewBadges.push(id);   // track để hiện trong overlay cuối ván
  saveProgress();
  updateBadgeCard();
  if (_badgeShowing) {
    _badgeQueue.push(id);
  } else {
    _badgeShowing = true;
    showBadgeUnlock(id);
  }
}

// ── Kiểm tra tất cả achievement dựa trên state hiện tại ────────
function checkAllAchievements() {
  // Streak
  if (streak >= 7) checkAchievementBadge("streak_7");
  // Chiến Thần: điểm >= 200 trong ván này
  if (score >= 200) checkAchievementBadge("best_200");
  // Học Giả: tổng đúng all-time >= 100
  const totalC = Object.values(allTimeStats).reduce((a,b)=>a+(b.correct||0),0);
  if (totalC >= 100)  checkAchievementBadge("total_100");
  if (totalC >= 500)  checkAchievementBadge("total_500");
  // Nhà Du Lịch: đủ 4 theme
  if (unlockedThemes.length >= 4) checkAchievementBadge("all_themes");
  // Nhà Triệu Phú: totalCoinsEarned >= 500
  if (totalCoinsEarned >= 500) checkAchievementBadge("coins_500");
  // Daily goal
  if (dailyGoalMet()) checkAchievementBadge("daily_complete");
}

// ══ BADGE LOGIC ═══════════════════════════════════════════════
function checkBadge(subject) {
  subjectCorrect[subject] = (subjectCorrect[subject] || 0) + 1;
  if (badgesEarned.includes(subject)) return;
  if (subjectCorrect[subject] >= 10) {
    badgesEarned.push(subject);
    _sessionNewBadges.push(subject);   // track để hiện trong overlay cuối ván
    saveProgress();
    const icon = SUBJECT_BADGE_ICONS[subject] || "🏅";
    message("🏅 Huy hiệu: " + icon + " " + subject + "! Đã đúng 10 câu môn này!");
    updateBadgeCard();
    // Hiện animation overlay cho huy hiệu môn học
    if (_badgeShowing) {
      _badgeQueue.push(subject);
    } else {
      _badgeShowing = true;
      showBadgeUnlock(subject);
    }
    // Kiểm tra có đủ 8 huy hiệu môn chưa
    const subjectBadgesCount = SUBJECT_LIST.filter(s => badgesEarned.includes(s)).length;
    if (subjectBadgesCount >= 8) {
      setTimeout(() => checkAchievementBadge("all_subject_badges"), 400);
    }
  }
}

function updateBadgeCard() {
  const subjectCount     = SUBJECT_LIST.filter(s => badgesEarned.includes(s)).length;
  const achievementCount = Object.keys(ACHIEVEMENT_BADGES).filter(id => badgesEarned.includes(id)).length;
  const total = subjectCount + achievementCount;
  const maxTotal = SUBJECT_LIST.length + Object.keys(ACHIEVEMENT_BADGES).length; // 8 + 11 = 19
  const el = document.getElementById("badgeCount");
  if (el) el.textContent = total + "/" + maxTotal + " huy hiệu";
  const el2 = document.getElementById("badgeList");
  if (el2) {
    el2.innerHTML = badgesEarned.map(function(s) {
      const icon = SUBJECT_BADGE_ICONS[s] || (ACHIEVEMENT_BADGES[s] ? ACHIEVEMENT_BADGES[s].icon : "🏅");
      const label = ACHIEVEMENT_BADGES[s] ? ACHIEVEMENT_BADGES[s].name : s;
      return '<span title="' + label + '">' + icon + '</span>';
    }).join(" ");
  }
}
// ══════════════════════════════════════════════════════════════
// ══ OVERLAY WIN / LOSE ═══════════════════════════════

// Huy hiệu vừa kiếm được trong ván này (reset khi startGame)
let _sessionNewBadges = [];

const BAR_COLORS = {"Toán":"#4dd66d","Ngữ văn":"#f59e0b","Tiếng Anh":"#3b82f6",
  "KHTN":"#a78bfa","Lịch sử & Địa lý":"#fb923c","Công nghệ":"#64748b",
  "GDCD":"#f472b6","Tin học":"#22d3ee"};

function _calcGrade(pct) {
  if (pct >= 85) return { letter:"A", color:"#16a34a", msg:"Xuất sắc! 🌟" };
  if (pct >= 70) return { letter:"B", color:"#2563eb", msg:"Tốt lắm! 👍" };
  if (pct >= 50) return { letter:"C", color:"#d97706", msg:"Khá — cố thêm!" };
  return             { letter:"D", color:"#dc2626", msg:"Cần luyện tập thêm 💪" };
}

function _buildDonutSVG(correct, total) {
  const wrong = total - correct;
  const pct   = total > 0 ? correct / total : 0;
  const R = 46, CX = 56, CY = 56, r = 28;
  const circumference = 2 * Math.PI * R;
  const dash = pct * circumference;
  const gap  = circumference - dash;
  // Rotate start at -90deg
  return `<svg width="112" height="112" viewBox="0 0 112 112" style="flex-shrink:0">
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#e2e8f0" stroke-width="14"/>
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#46c96f" stroke-width="14"
      stroke-dasharray="${dash.toFixed(1)} ${gap.toFixed(1)}"
      stroke-dashoffset="${(circumference/4).toFixed(1)}"
      stroke-linecap="round" transform="rotate(-90 ${CX} ${CY})"/>
    <text x="${CX}" y="${CY}" text-anchor="middle" dominant-baseline="middle"
      font-size="16" font-weight="900" fill="#1e293b">${Math.round(pct*100)}%</text>
    <text x="${CX}" y="${CY+16}" text-anchor="middle" font-size="9" fill="#64748b">${correct}/${total} câu</text>
  </svg>`;
}

function switchOvTab(idx) {
  [0,1,2].forEach(i => {
    document.getElementById("ovTab"+i).classList.toggle("active", i===idx);
    document.getElementById("ovPanel"+i).classList.toggle("show", i===idx);
  });
}

function showOverlay(type) {
  const ov   = document.getElementById("overlay");
  const box  = document.getElementById("ovBox");
  const btn1 = document.getElementById("ovBtn1");
  const btn2 = document.getElementById("ovBtn2");

  // Header
  document.getElementById("ovEmoji").textContent = type === "win" ? "🎉" : "😢";
  document.getElementById("ovTitle").textContent = type === "win" ? "Chiến thắng!" : "Hết mạng!";
  document.getElementById("ovTitle").style.color = type === "win" ? "#ff5757" : "#e60023";
  document.getElementById("ovSub").textContent   = type === "win"
    ? "Công chúa đã được cứu nhờ tri thức! 👸"
    : "Đừng nản — học giỏi là biết thử lại!";

  // Buttons
  btn1.textContent = type === "win" ? "🔄 Chơi lại" : "🔄 Thử lại ngay";
  btn2.style.display = "inline-block";
  btn2.textContent   = type === "win" ? "📚 Học tiếp" : "🏃 Luyện tập ngay";

  if (type === "win") spawnConfetti(box);

  // Stats bar
  document.getElementById("ovStats").innerHTML =
    `<div class="ov-stat">⭐ ${score}</div>` +
    `<div class="ov-stat">🪙 ${coins}</div>` +
    `<div class="ov-stat">🔥 Streak ${streak}</div>` +
    `<div class="ov-stat">🎯 ${dailyCorrect}/${DAILY_Q} câu</div>` +
    `<div class="ov-stat">⏱️ ${Math.floor(dailySeconds/60)}/${DAILY_MIN} phút</div>` +
    `<div class="ov-stat">🔁 ${round} vòng</div>`;

  // Reset tabs to 0
  switchOvTab(0);

  // ── Tính dữ liệu chung ──────────────────────────────────────
  const subjsPlayed = Object.keys(sessionStats).filter(s => sessionStats[s].total > 0);
  let totalQ = 0, totalC = 0, totalT = 0;
  let best = null, worst = null;
  subjsPlayed.forEach(s => {
    const d   = sessionStats[s];
    const pct = d.total ? Math.round(d.correct / d.total * 100) : 0;
    totalQ += d.total; totalC += d.correct; totalT += d.totalTime;
    if (best  === null || pct > best.pct)  best  = { s, pct };
    if (worst === null || pct < worst.pct) worst = { s, pct };
  });
  const avgTime  = totalQ ? (totalT / totalQ).toFixed(1) : "—";
  const accPct   = totalQ ? Math.round(totalC / totalQ * 100) : 0;
  const grade    = _calcGrade(accPct);

  // ── PANEL 0: Tổng quan ───────────────────────────────────────
  const newBadgesHtml = _sessionNewBadges.length
    ? `<div class="ov-new-badges">
        <span>🏅 Huy hiệu mới:</span>
        ${_sessionNewBadges.map(id => {
          const b = ACHIEVEMENT_BADGES[id] || { icon: SUBJECT_BADGE_ICONS[id]||"🏅", name: id };
          return `<span class="nb-icon" title="${b.name}">${b.icon}</span>`;
        }).join("")}
      </div>` : "";

  const hlBest  = best  ? `<div class="ov-hl best"><span class="hl-val">🌟 ${shortSubject(best.s)}</span>Môn mạnh nhất<br><b>${best.pct}%</b></div>` : "";
  const hlWorst = (worst && worst.s !== best?.s) ? `<div class="ov-hl worst"><span class="hl-val">💪 ${shortSubject(worst.s)}</span>Cần luyện thêm<br><b>${worst.pct}%</b></div>` : "";
  const hlSpeed = `<div class="ov-hl speed"><span class="hl-val">⚡ ${avgTime}s</span>Thời gian TB/câu</div>`;

  document.getElementById("ovPanel0").innerHTML = totalQ === 0
    ? `<div style="color:#94a3b8;font-size:13px;padding:12px 0">Chưa trả lời câu nào.</div>`
    : `${newBadgesHtml}
       <div class="ov-grade-wrap">
         ${_buildDonutSVG(totalC, totalQ)}
         <div>
           <div class="ov-grade ${grade.letter}">${grade.letter}</div>
         </div>
         <div class="ov-grade-info">
           <strong style="color:${grade.color}">${grade.msg}</strong>
           <span style="color:#64748b">Độ chính xác: <b>${accPct}%</b></span>
         </div>
       </div>
       <div class="ov-highlights" style="margin-top:4px">${hlBest}${hlWorst}${hlSpeed}</div>`;

  // ── PANEL 1: Theo môn ────────────────────────────────────────
  document.getElementById("ovPanel1").innerHTML = subjsPlayed.length === 0
    ? `<div style="color:#94a3b8;font-size:13px;padding:12px 0">Chưa có dữ liệu theo môn.</div>`
    : `<div class="ov-detail" style="margin-top:4px">
        ${subjsPlayed.map(s => {
          const d     = sessionStats[s];
          const pct   = d.total ? Math.round(d.correct / d.total * 100) : 0;
          const color = BAR_COLORS[s] || "#94a3b8";
          return `<div class="subj-row">
            <span class="sr-label">${shortSubject(s)}</span>
            <div class="sr-bar-wrap"><div class="sr-bar" style="width:${pct}%;background:${color}"></div></div>
            <span class="sr-pct" style="color:${color}">${pct}%</span>
            <span style="font-size:11px;color:#94a3b8">(${d.correct}/${d.total})</span>
          </div>`;
        }).join("")}
      </div>`;

  // ── PANEL 2: Câu sai inline ──────────────────────────────────
  const maxShow = 5;
  const wrongToShow = wrongAnswers.slice(0, maxShow);
  const moreCount  = wrongAnswers.length - maxShow;

  let wrongHtml = "";
  if (wrongAnswers.length === 0) {
    wrongHtml = `<div class="ov-wrong-empty">🎉<br><span style="font-size:14px;color:#16a34a;font-weight:700">Không sai câu nào!</span></div>`;
  } else {
    wrongHtml = `<div class="ov-wrong-list">
      ${wrongToShow.map(w => {
        return `<div class="ov-wrong-item">
          <div class="ov-wrong-q">${w.question}</div>
          <div class="ov-wrong-ans">
            <span class="ov-wrong-wrong">✗ ${w.yourAnswer || "—"}</span>
            <span class="ov-wrong-right">✓ ${w.correctAnswer || ""}</span>
          </div>
          <div class="ov-wrong-subj">${iconForSubject(w.subject)} ${w.subject}</div>
        </div>`;
      }).join("")}
      ${moreCount > 0 ? `<div style="text-align:center;font-size:12px;color:#94a3b8;padding:4px">…và ${moreCount} câu sai khác</div>` : ""}
    </div>
    <button class="ov-practice-btn" ${wrongAnswers.length === 0 ? "disabled" : ""}
      onclick="hideOverlay(); startPractice('wrong')">
      📝 Ôn luyện ${wrongAnswers.length} câu sai này
    </button>`;
  }
  document.getElementById("ovPanel2").innerHTML = wrongHtml;

  // ── Đổi tab "Câu sai" title ──────────────────────────────────
  document.getElementById("ovTab2").textContent =
    wrongAnswers.length ? `❌ Câu sai (${wrongAnswers.length})` : "✅ Không sai";

  ov.classList.add("show");
}

function hideOverlay() {
  document.getElementById("overlay").classList.remove("show");
}

function overlayAction1() { hideOverlay(); startGame(); }
function overlayAction2() {
  hideOverlay();
  if (document.getElementById("ovBtn2").textContent.includes("Luyện tập")) {
    openPractice();
  } else {
    startGame();
  }
}

function spawnConfetti(parent) {
  const colors = ["#ff5757","#ffd447","#54d66f","#54b6ff","#c49cff","#ff79c6"];
  for (let i = 0; i < 40; i++) {
    const el = document.createElement("div");
    el.className = "conf";
    el.style.cssText = `
      left:${Math.random()*100}%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      animation-duration:${0.8+Math.random()*1.4}s;
      animation-delay:${Math.random()*0.6}s;
      width:${6+Math.random()*10}px;
      height:${6+Math.random()*10}px;
      border-radius:${Math.random()>.5?'50%':'2px'};
    `;
    parent.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }
}

// ══ SHOP ═════════════════════════════════════════════
function openShop() {
  document.getElementById("shopCoinsDisplay").textContent = coins;
  updateShopButtons();
  document.getElementById("shopOverlay").classList.add("show");
}
function closeShop() {
  document.getElementById("shopOverlay").classList.remove("show");
}
function updateShopButtons() {
  document.getElementById("buy1heart").disabled  = coins < 50;
  document.getElementById("buy3heart").disabled  = coins < 120;
  document.getElementById("buyscore").disabled   = coins < 80;
  document.getElementById("buycombo").disabled   = coins < 60;
}
function buyItem(item) {
  if (item === "heart1"  && coins >= 50)  { coins -= 50;  lives = Math.min(lives+1, 9); }
  if (item === "heart3"  && coins >= 120) { coins -= 120; lives = Math.min(lives+3, 9); }
  if (item === "score"   && coins >= 80)  { coins -= 80;  score += 50; }
  if (item === "combo"   && coins >= 60)  { coins -= 60;  comboShield = true; message("🛡️ Combo được bảo vệ cho câu tiếp theo!"); }
  setStats();
  document.getElementById("shopCoinsDisplay").textContent = coins;
  updateShopButtons();
  playSound("levelup");
}

els.startBtn.onclick = openSelectModal;
els.nextBtn.onclick = nextQuestion;
els.toggleSound.onclick = () => {
  soundOn = !soundOn;
  els.toggleSound.textContent = soundOn ? "🔊 Âm thanh" : "🔇 Tắt tiếng";
  if (!soundOn) stopBGMusic(); else if (answered !== undefined) startBGMusic();
};

// ── Constants needed before init ──────────────────────────────
const THEME_UNLOCK = {forest:0, ocean:300, desert:600, space:1000};
const THEME_INFO   = {forest:{emoji:"🌳",name:"Rừng"},ocean:{emoji:"🌊",name:"Biển"},desert:{emoji:"🏜️",name:"Sa mạc"},space:{emoji:"🌌",name:"Vũ trụ"}};
const MISSION_POOL = [
  {type:"correct_any",  count:10, reward:80,  text:"Trả lời đúng 10 câu"},
  {type:"correct_any",  count:20, reward:150, text:"Trả lời đúng 20 câu"},
  {type:"correct_subj", count:5,  reward:120, subj:"Toán",       text:"Đúng 5 câu Toán"},
  {type:"correct_subj", count:5,  reward:120, subj:"Ngữ văn",    text:"Đúng 5 câu Ngữ văn"},
  {type:"correct_subj", count:5,  reward:120, subj:"KHTN",       text:"Đúng 5 câu KHTN"},
  {type:"correct_subj", count:5,  reward:120, subj:"GDCD",       text:"Đúng 5 câu GDCD"},
  {type:"correct_subj", count:5,  reward:120, subj:"Tin học",    text:"Đúng 5 câu Tin học"},
  {type:"correct_diff", count:3,  reward:180, diff:"Khó",        text:"Đúng 3 câu Khó"},
  {type:"correct_diff", count:5,  reward:200, diff:"Trung bình", text:"Đúng 5 câu Trung bình"},
  {type:"combo",        count:5,  reward:150, text:"Đạt combo x5"},
  {type:"combo",        count:8,  reward:250, text:"Đạt combo x8"},
  {type:"play",         count:2,  reward:100, text:"Chơi 2 ván hôm nay"},
];
// ──────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────
function _hideLoadingScreen() {
  var ls = document.getElementById("loadingScreen");
  if (ls) { ls.classList.add("hidden"); ls.style.display = "none"; }
}

// Báo hiệu JS đang chạy - nếu bạn thấy dòng này, JS OK!
(function(){ var d=document.getElementById('ls-debug'); if(d) d.textContent='✅ JS đang chạy! Đang khởi tạo...'; })();

try {
  initProgress();
  initWorldList();
  setStats();
  updateBadgeCard();
  refreshSubjectProgress();
  updateDailyDisplay();
  if (streak >= 7) checkAchievementBadge("streak_7");
  draw();
} catch(e) {
  console.error('Lỗi khởi động game:', e);
}
// Ẩn loading screen ngay lập tức (không dùng setTimeout)
_hideLoadingScreen();
setTimeout(_hideLoadingScreen, 500);
setTimeout(_hideLoadingScreen, 1500);


// ══════════════════════════════════════════════════════════════
// ══ MODAL CHỌN MÔN & ĐỘ KHÓ ══════════════════════════════════
function openSelectModal() {
  const chips = document.getElementById("subjectChips");
  if (chips && !chips.dataset.built) {
    chips.dataset.built = "1";
    ["Tất cả", ...subjects].forEach(s => {
      const sp = document.createElement("span");
      sp.className = "sel-chip" + (s === "Tất cả" ? " active" : "");
      sp.textContent = (s === "Tất cả" ? "🌟 Tất cả" : iconForSubject(s) + " " + s);
      sp.onclick = () => selectSubj(sp, s);
      chips.appendChild(sp);
    });
  }
  updateSelInfo();
  document.getElementById("selectModal").classList.add("show");
}
function closeSelectModal() { document.getElementById("selectModal").classList.remove("show"); }
function selectSubj(el, val) {
  el.closest(".sel-chips").querySelectorAll(".sel-chip").forEach(c => c.classList.remove("active"));
  el.classList.add("active"); selectedSubject = val; updateSelInfo();
}
function selectDiff(el, val) {
  el.closest(".sel-chips").querySelectorAll(".sel-chip").forEach(c => c.classList.remove("active"));
  el.classList.add("active"); selectedDifficulty = val; updateSelInfo();
}
function updateSelInfo() {
  const count = filteredBank().length;
  const el = document.getElementById("selInfo");
  if (el) el.textContent = count + " câu phù hợp với lựa chọn của bạn";
}
function confirmSelect() { closeSelectModal(); startGame(); }

// ══════════════════════════════════════════════════════════════
// ══ MODAL XEM LẠI CÂU SAI ════════════════════════════════════
function openReview() {
  const list = document.getElementById("reviewList");
  list.innerHTML = "";
  if (!wrongAnswers.length) {
    list.innerHTML = '<div class="review-empty">🎉<p>Bạn không sai câu nào!</p></div>';
  } else {
    wrongAnswers.forEach((w, i) => {
      const d = document.createElement("div");
      d.className = "review-item";
      d.innerHTML = `<div class="ri-subj">${iconForSubject(w.subject)} ${w.subject}</div>`
        + `<div class="ri-q">${i+1}. ${w.question}</div>`
        + `<div class="ri-wrong">❌ Bạn chọn: ${w.yourAnswer}</div>`
        + `<div class="ri-correct">✅ Đáp án đúng: ${w.correctAnswer}</div>`;
      list.appendChild(d);
    });
  }
  document.getElementById("reviewModal").classList.add("show");
}
function closeReview() { document.getElementById("reviewModal").classList.remove("show"); }

// ══ THEME SYSTEM ═══════════════════════════════════════════════
function checkUnlockThemes() {
  const bs = Math.max(score, bestScore);
  Object.keys(THEME_UNLOCK).forEach(t => {
    if (bs >= THEME_UNLOCK[t] && !unlockedThemes.includes(t)) {
      unlockedThemes.push(t);
      spawnFloat(THEME_INFO[t].emoji + " Mở khoá: " + THEME_INFO[t].name + "!", heroX+30, 145, "#ffd700", 22);
    }
  });
  renderThemeStrip();
  // Badge: Nhà Du Lịch — mở đủ 4 theme
  if (unlockedThemes.length >= 4) setTimeout(() => checkAchievementBadge("all_themes"), 500);
}
function renderThemeStrip() {
  Object.keys(THEME_UNLOCK).forEach(t => {
    const btn = document.getElementById("theme-"+t);
    if (!btn) return;
    const unlocked = unlockedThemes.includes(t);
    const active = currentTheme === t;
    btn.className = "theme-btn" + (active ? " active" : "") + (!unlocked ? " locked" : "");
    btn.textContent = THEME_INFO[t].emoji + " " + THEME_INFO[t].name + (!unlocked ? " 🔒" : "");
    const threshold = THEME_UNLOCK[t];
    btn.title = unlocked ? (active ? "Đang dùng" : "Nhấn để chọn") : "Mở khoá tại " + threshold + " điểm";
  });
}
function selectTheme(t) {
  if (!unlockedThemes.includes(t)) {
    spawnFloat("🔒 Cần " + THEME_UNLOCK[t] + " điểm", heroX+30, 200, "#f87171", 18);
    return;
  }
  currentTheme = t;
  renderThemeStrip();
  saveProgress();
}

// Sky/Ground dispatchers
function drawSky()    { if(currentTheme==="ocean") drawSkyOcean(); else if(currentTheme==="desert") drawSkyDesert(); else if(currentTheme==="space") drawSkySpace(); else drawSkyForest(); }
function drawGround() { if(currentTheme==="ocean") drawGroundOcean(); else if(currentTheme==="desert") drawGroundDesert(); else if(currentTheme==="space") drawGroundSpace(); else drawGroundForest(); }

// 🌊 OCEAN SKY
function drawSkyOcean() {
  const g = ctx.createLinearGradient(0,0,0,310);
  g.addColorStop(0,"#005b9e"); g.addColorStop(.5,"#0088cc"); g.addColorStop(1,"#40b4e0");
  ctx.fillStyle=g; ctx.fillRect(0,0,canvas.width,canvas.height);
  // Sun (low, warm)
  const sx=820,sy=70;
  const sg=ctx.createRadialGradient(sx,sy,10,sx,sy,70); sg.addColorStop(0,"rgba(255,220,80,.5)"); sg.addColorStop(1,"rgba(255,180,40,0)");
  ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(sx,sy,70,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#ffe566"; ctx.beginPath(); ctx.arc(sx,sy,20,0,Math.PI*2); ctx.fill();
  // Seagulls
  [[120,80],[200,55],[320,90],[500,65],[680,75]].forEach(([x,y])=>{
    ctx.strokeStyle="rgba(255,255,255,.8)"; ctx.lineWidth=2; ctx.lineCap="round";
    const bob=Math.sin(Date.now()/600+x)*4;
    ctx.beginPath(); ctx.moveTo(x,y+bob); ctx.quadraticCurveTo(x+12,y-5+bob,x+22,y+bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+22,y+bob); ctx.quadraticCurveTo(x+32,y-5+bob,x+44,y+bob); ctx.stroke();
  });
  // Clouds
  const co=cloudOffset%900;
  drawCloud((100+co)%900,55,.9); drawCloud((380+co)%900,40,.7); drawCloud((650+co)%900,65,1.0);
  if(heroState==="run"){cloudOffset+=0.4; groundOffset=(groundOffset+1.2)%50;}
  // Water shimmer on hills
  ctx.fillStyle="rgba(0,100,180,.35)";
  ctx.beginPath(); ctx.arc(180,355,130,Math.PI,0); ctx.fill();
  ctx.fillStyle="rgba(0,120,200,.30)";
  ctx.beginPath(); ctx.arc(440,360,160,Math.PI,0); ctx.fill();
  ctx.fillStyle="rgba(0,80,160,.35)";
  ctx.beginPath(); ctx.arc(730,358,140,Math.PI,0); ctx.fill();
}
function drawGroundOcean() {
  const t=Date.now()/1200;
  // Deep water
  const dg=ctx.createLinearGradient(0,305,0,430);
  dg.addColorStop(0,"#006994"); dg.addColorStop(.3,"#004e73"); dg.addColorStop(1,"#002f47");
  ctx.fillStyle=dg; ctx.fillRect(0,305,900,125);
  // Wave tops
  ctx.strokeStyle="rgba(255,255,255,.55)"; ctx.lineWidth=3;
  for(let k=0;k<3;k++){
    ctx.beginPath();
    for(let x=0;x<=900;x+=4){const y=305+k*14+Math.sin((x/60)+t+k*1.2)*6; if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);}
    ctx.stroke();
  }
  // Sea foam strips
  ctx.fillStyle="rgba(255,255,255,.25)"; ctx.fillRect(0,297,900,8);
  ctx.fillStyle="rgba(255,255,255,.15)"; ctx.fillRect(0,294,900,4);
  // Sparkles
  for(let i=0;i<8;i++){const x=(i*120+groundOffset*2)%900; ctx.fillStyle="rgba(255,255,255,.6)"; ctx.beginPath(); ctx.arc(x,310+i%3*12,2,0,Math.PI*2); ctx.fill();}
}

// 🏜️ DESERT SKY
function drawSkyDesert() {
  const g=ctx.createLinearGradient(0,0,0,310);
  g.addColorStop(0,"#c2440e"); g.addColorStop(.35,"#e87820"); g.addColorStop(.7,"#f5b042"); g.addColorStop(1,"#fce087");
  ctx.fillStyle=g; ctx.fillRect(0,0,canvas.width,canvas.height);
  // Large sun
  const sx=100,sy=65;
  const sg=ctx.createRadialGradient(sx,sy,18,sx,sy,90); sg.addColorStop(0,"rgba(255,200,50,.65)"); sg.addColorStop(1,"rgba(255,140,0,0)");
  ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(sx,sy,90,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#ffdd44"; ctx.beginPath(); ctx.arc(sx,sy,28,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#ffcc00"; ctx.beginPath(); ctx.arc(sx,sy,22,0,Math.PI*2); ctx.fill();
  // Heat shimmer wisps
  ctx.globalAlpha=0.18; ctx.strokeStyle="#fff"; ctx.lineWidth=2;
  [200,380,560,720].forEach((x,i)=>{ctx.beginPath(); ctx.moveTo(x,320); ctx.bezierCurveTo(x+10,280,x-10,260,x+5,240); ctx.stroke();});
  ctx.globalAlpha=1;
  // Dunes on horizon
  ctx.fillStyle="rgba(230,160,60,.45)";
  ctx.beginPath(); ctx.arc(150,352,120,Math.PI,0); ctx.fill();
  ctx.fillStyle="rgba(210,140,40,.40)";
  ctx.beginPath(); ctx.arc(420,360,160,Math.PI,0); ctx.fill();
  ctx.fillStyle="rgba(240,170,70,.45)";
  ctx.beginPath(); ctx.arc(720,355,135,Math.PI,0); ctx.fill();
  // Clouds (sparse)
  const co=cloudOffset%900;
  ctx.globalAlpha=0.45; drawCloud((200+co)%900,50,.75); ctx.globalAlpha=1;
  if(heroState==="run"){cloudOffset+=0.4; groundOffset=(groundOffset+1.2)%50;}
}
function drawGroundDesert() {
  const dg=ctx.createLinearGradient(0,305,0,430);
  dg.addColorStop(0,"#e8b96a"); dg.addColorStop(.2,"#c9933d"); dg.addColorStop(.5,"#9e6425"); dg.addColorStop(1,"#7a4c1a");
  ctx.fillStyle=dg; ctx.fillRect(0,305,900,125);
  // Sand surface
  ctx.fillStyle="#e8c07a"; ctx.fillRect(0,297,900,10);
  ctx.fillStyle="#f0cc88"; ctx.fillRect(0,294,900,5);
  // Sand ripples
  ctx.strokeStyle="rgba(255,220,140,.35)"; ctx.lineWidth=1.5;
  for(let i=0;i<8;i++){ctx.beginPath(); for(let x=0;x<=900;x+=6){const y=320+i*10+Math.sin((x/30)+(groundOffset/20))*2; if(x===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.stroke();}
  // Cacti
  [[120,268],[290,272],[500,265],[710,270],[840,268]].forEach(([cx,cy],idx)=>{
    if(idx%2===0){
      ctx.fillStyle="#2d7a3a"; ctx.fillRect(cx-5,cy,10,35); // trunk
      ctx.fillRect(cx-15,cy+10,10,7); ctx.fillRect(cx+5,cy+14,10,7); // arms
      ctx.fillRect(cx-20,cy+3,6,12); ctx.fillRect(cx+9,cy+7,6,12);
    } else {
      ctx.fillStyle="#2d7a3a"; ctx.fillRect(cx-4,cy+5,8,28);
      ctx.fillRect(cx-12,cy+15,8,6);
    }
  });
}

// 🌌 SPACE SKY
function drawSkySpace() {
  const g=ctx.createLinearGradient(0,0,0,310);
  g.addColorStop(0,"#04040f"); g.addColorStop(.4,"#0d0530"); g.addColorStop(1,"#1a0840");
  ctx.fillStyle=g; ctx.fillRect(0,0,canvas.width,canvas.height);
  // Stars
  const starSeed=42;
  for(let i=0;i<80;i++){
    const x=(i*137+starSeed)%900; const y=(i*97+starSeed)%280;
    const tw=0.5+Math.abs(Math.sin(Date.now()/800+i))*1.5;
    ctx.fillStyle=`rgba(255,255,255,${0.4+Math.abs(Math.sin(i+Date.now()/1200))*.5})`;
    ctx.beginPath(); ctx.arc(x,y,tw,0,Math.PI*2); ctx.fill();
  }
  // Moon
  const mx=820,my=60;
  ctx.fillStyle="#d4d4e8"; ctx.beginPath(); ctx.arc(mx,my,28,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#b8b8d0"; ctx.beginPath(); ctx.arc(mx+8,my,24,0,Math.PI*2); ctx.fill();
  // Craters
  [[mx-8,my-8,5],[mx+4,my+10,4],[mx-12,my+6,3]].forEach(([x,y,r])=>{ctx.fillStyle="rgba(0,0,0,.25)"; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();});
  // Planets
  [[180,60,18,"#c0392b","#922b21"],[420,45,14,"#8e44ad","#6c3483"],[640,70,12,"#1a8cd8","#1565c0"]].forEach(([px,py,pr,c1,c2])=>{
    const pg=ctx.createRadialGradient(px-pr/3,py-pr/3,1,px,py,pr);
    pg.addColorStop(0,c1); pg.addColorStop(1,c2);
    ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(px,py,pr,0,Math.PI*2); ctx.fill();
    // Ring for first planet
    if(pr===18){ctx.strokeStyle="rgba(220,100,60,.5)"; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(px,py,pr+10,4,-.3,0,Math.PI*2); ctx.stroke();}
  });
  // Moving nebula wisps
  ctx.globalAlpha=0.08;
  ctx.fillStyle="#6a0dad"; ctx.beginPath(); ctx.arc(300+cloudOffset%100,140,80,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#0055aa"; ctx.beginPath(); ctx.arc(600+cloudOffset%80,110,65,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha=1;
  // Rocky silhouettes on horizon
  ctx.fillStyle="rgba(25,10,50,.8)";
  ctx.beginPath(); ctx.arc(180,362,110,Math.PI,0); ctx.fill();
  ctx.fillStyle="rgba(20,8,45,.8)";
  ctx.beginPath(); ctx.arc(500,368,145,Math.PI,0); ctx.fill();
  ctx.fillStyle="rgba(30,12,55,.8)";
  ctx.beginPath(); ctx.arc(760,364,128,Math.PI,0); ctx.fill();
  if(heroState==="run"){cloudOffset+=0.4; groundOffset=(groundOffset+1.2)%50;}
}
function drawGroundSpace() {
  const dg=ctx.createLinearGradient(0,305,0,430);
  dg.addColorStop(0,"#3d3550"); dg.addColorStop(.25,"#2a2040"); dg.addColorStop(.6,"#1a1228"); dg.addColorStop(1,"#0e0a1a");
  ctx.fillStyle=dg; ctx.fillRect(0,305,900,125);
  // Alien ground surface
  ctx.fillStyle="#4a3a60"; ctx.fillRect(0,297,900,10);
  ctx.fillStyle="#5a4870"; ctx.fillRect(0,294,900,5);
  // Crater pits
  [[80,320,18],[240,325,12],[430,318,22],[650,322,15],[820,320,18]].forEach(([x,y,r])=>{
    ctx.fillStyle="rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(x,y,r,r/2,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="rgba(150,120,200,.3)"; ctx.lineWidth=1.5; ctx.beginPath(); ctx.ellipse(x,y,r,r/2,0,0,Math.PI*2); ctx.stroke();
  });
  // Ground glow lines
  for(let i=0;i<6;i++){
    ctx.strokeStyle=`rgba(${120+i*10},${60+i*15},${220+i*5},.12)`; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,310+i*18); ctx.lineTo(900,310+i*18); ctx.stroke();
  }
}

// ══ LEADERBOARD ══════════════════════════════════════════════════
function updateLeaderboard() {
  if (practiceMode || score === 0) return;
  leaderboard.push({
    score: Math.max(score, bestScore),
    date: todayStr(),
    correct: dailyCorrect,
    total: dailyTotal
  });
  leaderboard.sort((a, b) => b.score - a.score);
  if (leaderboard.length > 10) leaderboard = leaderboard.slice(0, 10);
  saveProgress();
  const el = document.getElementById("statsLeaderboard");
  const modal = document.getElementById("statsModal");
  if (el && modal && modal.style.display !== "none") renderStatsLeaderboard(el);
}

function renderStatsLeaderboard(el) {
  if (!leaderboard.length) {
    el.innerHTML = '<div style="color:#6366f1;font-size:13px;text-align:center;padding:10px">Chưa có kết quả nào. Chơi thêm để xem bảng xếp hạng!</div>';
    return;
  }
  const medals = ["🥇","🥈","🥉"];
  el.innerHTML = leaderboard.map((e, i) =>
    `<div style="display:flex;align-items:center;gap:8px;background:${i===0?"rgba(253,216,53,.12)":"rgba(255,255,255,.04)"};border-radius:8px;padding:6px 10px;font-size:12px">
      <span style="font-size:15px;width:22px;text-align:center">${medals[i]||"#"+(i+1)}</span>
      <span style="font-weight:700;color:#fbbf24;flex:0 0 50px">${e.score} đ</span>
      <span style="color:#94a3b8;flex:1">${e.date}</span>
      <span style="color:#86efac">${e.correct} câu đúng</span>
    </div>`
  ).join("");
}

// ══ MISSIONS ═════════════════════════════════════════════════════
function generateMissions() {
  const pool = MISSION_POOL.map(m => Object.assign({}, m));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3).map(m => Object.assign({}, m, { progress: 0, done: false }));
}

function renderMissions() {
  const el = document.getElementById("missionsList");
  if (!el || !dailyMissions) return;
  let doneCount = 0;
  el.innerHTML = "";
  dailyMissions.forEach(m => {
    if (m.done) doneCount++;
    const pct = Math.min(100, Math.round((m.progress / m.count) * 100));
    const d = document.createElement("div");
    d.className = "m-item";
    d.innerHTML =
      `<span style="flex:0 0 14px;font-size:11px">${m.done ? "✅" : "○"}</span>` +
      `<span style="flex:1;color:${m.done?"#86efac":"#e2e8f0"}">${m.text}</span>` +
      `<div class="m-bar-bg"><div class="m-bar-fill${m.done?" done":""}" style="width:${pct}%"></div></div>` +
      `<span style="flex:0 0 auto;color:#fbbf24;font-size:10px">+${m.reward}xu</span>`;
    el.appendChild(d);
  });
  const cnt = document.getElementById("missionsDoneCount");
  if (cnt) cnt.textContent = doneCount + "/3 xong";
}

// ══ STATS MODAL ═══════════════════════════════════════════════════
function openStats() {
  const modal = document.getElementById("statsModal");
  if (!modal) return;
  const totalC = Object.values(allTimeStats).reduce((a, b) => a + (b.correct || 0), 0);
  const totalQ = Object.values(allTimeStats).reduce((a, b) => a + (b.total   || 0), 0);
  const acc    = totalQ > 0 ? Math.round(totalC / totalQ * 100) : 0;
  const summaryEl = document.getElementById("statsSummary");
  if (summaryEl) {
    const items = [
      ["🎯 Tổng câu đúng", totalC],
      ["📝 Tổng câu đã làm", totalQ],
      ["✅ Độ chính xác", acc + "%"],
      ["🏆 Điểm cao nhất", bestScore],
      ["🔥 Streak hiện tại", streak + " ngày"],
      ["🪙 Xu tích lũy", totalCoinsEarned],
    ];
    summaryEl.innerHTML = items.map(([label, val]) =>
      `<div style="background:rgba(255,255,255,.05);border-radius:10px;padding:9px 12px">
        <div style="font-size:11px;color:#94a3b8">${label}</div>
        <div style="font-size:18px;font-weight:800;color:#fbbf24">${val}</div>
      </div>`
    ).join("");
  }
  const barColors = {"Toán":"#4dd66d","Ngữ văn":"#f59e0b","Tiếng Anh":"#3b82f6",
    "KHTN":"#a78bfa","Lịch sử & Địa lý":"#fb923c","Công nghệ":"#64748b","GDCD":"#f472b6","Tin học":"#22d3ee"};
  const subjEl = document.getElementById("statsSubjects");
  if (subjEl) {
    subjEl.innerHTML = subjects.map(s => {
      const d = allTimeStats[s] || { correct: 0, total: 0 };
      const pct = d.total > 0 ? Math.round(d.correct / d.total * 100) : 0;
      const color = barColors[s] || "#6366f1";
      return `<div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
          <span>${iconForSubject(s)} ${shortSubject(s)}</span>
          <span style="color:${color}">${d.correct}/${d.total} (${pct}%)</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width .5s"></div>
        </div>
      </div>`;
    }).join("");
  }
  const histEl = document.getElementById("statsHistory");
  if (histEl) {
    const recent = dailyHistory.slice(-7);
    const maxC = Math.max(1, ...recent.map(h => h.correct || 0));
    histEl.innerHTML = recent.length === 0
      ? '<div style="color:#6366f1;font-size:12px;margin:auto">Chưa có dữ liệu</div>'
      : recent.map(h => {
          const ht = Math.round(((h.correct || 0) / maxC) * 55);
          const dateLabel = (h.date || "").slice(5);
          return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1">
            <div style="font-size:10px;color:#fbbf24;font-weight:700">${h.correct || 0}</div>
            <div style="width:100%;height:${ht}px;background:linear-gradient(#6366f1,#4f46e5);border-radius:3px 3px 0 0;min-height:2px"></div>
            <div style="font-size:9px;color:#6b7280">${dateLabel}</div>
          </div>`;
        }).join("");
  }
  const lbEl = document.getElementById("statsLeaderboard");
  if (lbEl) renderStatsLeaderboard(lbEl);
  modal.style.display = "flex";
}

function closeStats() {
  const modal = document.getElementById("statsModal");
  if (modal) modal.style.display = "none";
}

// ══ PRACTICE MODAL ════════════════════════════════════════════════
function openPractice() {
  const modal = document.getElementById("practiceModal");
  if (!modal) return;
  const btn = document.getElementById("btnPracticeWrong");
  if (btn) {
    const n = savedWrongAnswers.length;
    btn.textContent = n ? "📝 Ôn " + n + " câu sai đã lưu" : "📝 Ôn câu sai (chưa có)";
    btn.disabled = n === 0;
    btn.style.opacity = n ? "1" : "0.45";
  }
  modal.style.display = "flex";
}

function closePractice() {
  const modal = document.getElementById("practiceModal");
  if (modal) modal.style.display = "none";
}

function startPractice(type) {
  closePractice();
  if (type === "wrong") {
    if (!savedWrongAnswers.length) {
      message("Chưa có câu sai nào được lưu. Chơi thêm rồi thử lại nhé!");
      return;
    }
    startGame();
    practiceMode = true;
    order = savedWrongAnswers.map(q => Object.assign({}, q));
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    currentIndex = 0;
    loadQuestion();
  } else if (type === "weak") {
    let weakSubj = null, weakAcc = 1;
    subjects.forEach(s => {
      const d = allTimeStats[s];
      if (d && d.total >= 3) {
        const a = d.correct / d.total;
        if (a < weakAcc) { weakAcc = a; weakSubj = s; }
      }
    });
    if (weakSubj) { selectedSubject = weakSubj; selectedDifficulty = "Tất cả"; }
    startGame();
    practiceMode = true;
  } else {
    selectedSubject = "Tất cả"; selectedDifficulty = "Tất cả";
    startGame();
    practiceMode = true;
  }
  const pb = document.getElementById("practiceBanner");
  if (pb) pb.style.display = "block";
  setStats();
  message("🏃 Chế độ luyện tập! Không mất tim khi sai. Cố lên!");
}

// ── Intro screen logic ──
// ── Intro screen logic ──
function closeIntro() {
  var el = document.getElementById('introScreen');
  if (el) {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.4s';
    setTimeout(function(){ el.style.display = 'none'; }, 420);
  }
  try { localStorage.setItem('introSeen_v1', '1'); } catch(e) {}
}
(function() {
  try {
    if (localStorage.getItem('introSeen_v1')) {
      var el = document.getElementById('introScreen');
      if (el) el.style.display = 'none';
    }
  } catch(e) {}
})();
