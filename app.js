import { SAMPLE_DECKS } from "./samples.js";

const SUPABASE_ESM = "./vendor/supabase.js";
const ANTHROPIC_ESM = "./vendor/anthropic.js";
const DAY = 86400000;
const INTERVALS = [0, 1, 2, 4, 8, 16, 32, 64].map(d => d * DAY);

// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
function toast(msg, ms = 2200) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), ms);
}
let audioCtx;
function playSound(kind) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioCtx ||= new AudioContext();
    const runSound = () => {
    const sounds = {
      click: [[720, 0, 0.04, 0.08]],
      correct: [[660, 0.05, 0.11, 0.12], [880, 0.18, 0.15, 0.12]],
      wrong: [[220, 0.05, 0.13, 0.11], [165, 0.20, 0.17, 0.11]], flip: [[520, 0, 0.06, 0.07]], navigate: [[440, 0, 0.045, 0.045]], done: [[660, 0, 0.1, 0.08], [880, 0.12, 0.16, 0.08], [1040, 0.32, 0.22, 0.08]],
    };
    const now = audioCtx.currentTime;
    for (const [frequency, delay, duration, volume] of sounds[kind] || []) {
      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + delay);
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(volume * (settings.soundVolume ?? 30) / 30, now + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
      oscillator.connect(gain);
      gain.connect(audioCtx.destination);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + duration + 0.01);
    }
      };
    if (audioCtx.state === "suspended") audioCtx.resume().then(runSound).catch(() => {});
    else runSound();
} catch {}
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// ＿词＿ 或 <u>词</u> 显示为下划线
function richQ(s) { return esc(s).replace(/＿([^＿\n]+)＿/g, '<span class="ul">$1</span>').replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, '<span class="ul">$1</span>'); }
// 把题目拆成「题干（作答要求）」和「正文」：第一段是短的说明就当作题干
function splitQ(q) {
  q = String(q || "");
  const parts = q.split(/\n\s*\n/);
  if (parts.length > 1 && parts[0].trim().length <= 80) return { stem: parts[0].trim(), body: parts.slice(1).join("\n\n").trim() };
  const lines = q.split("\n");
  if (lines.length > 1 && /(なさい|選べ|选择|选出|choose|select)[。.:：]?\s*$/i.test(lines[0].trim())) return { stem: lines[0].trim(), body: lines.slice(1).join("\n").trim() };
  return { stem: "", body: q };
}
const qBody = q => splitQ(q).body;
function md(s) {
  const lines = esc(s).split("\n"); let out = "", inList = false;
  const inline = t => t.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
  for (const raw of lines) {
    const l = raw.trimEnd();
    const li = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (li) { if (!inList) { out += "<ul>"; inList = true; } out += `<li>${inline(li[1])}</li>`; continue; }
    if (inList) { out += "</ul>"; inList = false; }
    const h = l.match(/^#{1,4}\s+(.*)/);
    if (h) out += `<h4>${inline(h[1])}</h4>`;
    else if (l.trim()) out += `<p>${inline(l)}</p>`;
  }
  if (inList) out += "</ul>";
  return out;
}

// ---------- settings (per device) ----------
const SETTINGS_KEY = "sc_settings";
const defaults = { provider: "claude", keys: {}, models: {}, customBase: "", apiKey: "", model: "claude-opus-5-5", effort: "low", supabaseUrl: "", supabaseKey: "", shuffleOptions: true, soundVolume: 30 };
let settings = { ...defaults };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); } catch {}
// 旧版本只存了 Claude 的 key
if (settings.apiKey && !settings.keys?.claude) { settings.keys = { ...(settings.keys || {}), claude: settings.apiKey }; settings.models = { ...(settings.models || {}), claude: settings.model }; }
const PROVIDERS = {
  claude: { name: "Claude（Anthropic）", keyHint: "sk-ant-…", keyUrl: "https://console.anthropic.com",
    models: [["claude-opus-5-5", "Claude Opus 5.5（最准确）"], ["claude-sonnet-5-5", "Claude Sonnet 5.5（便宜一半）"], ["claude-haiku-5-5", "Claude Haiku 5.5（最便宜最快）"]] },
  deepseek: { name: "DeepSeek", base: "https://api.deepseek.com/v1", keyHint: "sk-…", keyUrl: "https://platform.deepseek.com",
    models: [["deepseek-chat", "Flash（快速）"], ["deepseek-reasoner", "Flash（思考）"], ["deepseek-flash", "deepseek-flash"], ["deepseek-v4-pro", "deepseek-v4-pro"]] },
  qwen: { name: "通义千问（阿里云百炼）", base: "https://dashscope.aliyuncs.com/compatible-mode/v1", keyHint: "sk-…", keyUrl: "https://bailian.console.aliyun.com",
    models: [["qwen-plus", "qwen-plus（推荐）"], ["qwen-max", "qwen-max（最强）"], ["qwen-turbo", "qwen-turbo（最便宜）"]] },
  custom: { name: "其他（OpenAI 兼容接口）", keyHint: "API Key", models: [] },
};
const aiKey = () => (settings.keys || {})[settings.provider] || "";
const aiModel = () => (settings.models || {})[settings.provider] || PROVIDERS[settings.provider]?.models[0]?.[0] || "";
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} };
const sbUrl = () => settings.supabaseUrl || window.APP_CONFIG?.SUPABASE_URL || "";
const sbKey = () => settings.supabaseKey || window.APP_CONFIG?.SUPABASE_ANON_KEY || "";

// ---------- local store (IndexedDB) ----------
// item: { id, kind: 'deck'|'card'|'prog', data, updated_at, deleted, dirty }
const items = new Map();
let idb;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("study-cards", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("items", { keyPath: "id" }); r.result.createObjectStore("meta"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function idbPutMany(list) {
  if (!list.length) return Promise.resolve();
  return new Promise((res, rej) => {
    const tx = idb.transaction("items", "readwrite"); const st = tx.objectStore("items");
    for (const it of list) st.put(it);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
function idbAll() {
  return new Promise((res, rej) => { const r = idb.transaction("items").objectStore("items").getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
function meta(key, val) {
  return new Promise((res, rej) => {
    const tx = idb.transaction("meta", val === undefined ? "readonly" : "readwrite"); const st = tx.objectStore("meta");
    const r = val === undefined ? st.get(key) : st.put(val, key);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const live = it => it && !it.deleted;
function all(kind) { const out = []; for (const it of items.values()) if (it.kind === kind && live(it)) out.push(it); return out; }
function get(id) { const it = items.get(id); return live(it) ? it : null; }
function put(kind, id, data) {
  const it = { id, kind, data, updated_at: Date.now(), deleted: false, dirty: true };
  items.set(id, it); idbPutMany([it]); scheduleSync(); return it;
}
function putMany(list) { // [{kind,id,data}]
  const now = Date.now(); const its = list.map(x => ({ id: x.id, kind: x.kind, data: x.data, updated_at: now, deleted: false, dirty: true }));
  its.forEach(it => items.set(it.id, it)); idbPutMany(its); scheduleSync(); return its;
}
function remove(ids) {
  const now = Date.now(); const its = [];
  for (const id of ids) { const old = items.get(id); if (!old) continue; const it = { ...old, deleted: true, updated_at: now, dirty: true }; items.set(id, it); its.push(it); }
  idbPutMany(its); scheduleSync();
}
// ---------- 题库标签：考试 / 年份 / 题型 ----------
// 卡片可带 exam("N1") src("2021-12") no(题号) mondai("問題1")；没有时从题目开头的【2021年12月 N1 問1】解析
const MONDAI_NAMES = { N1: { "問題1": "漢字読み", "問題2": "文脈規定", "問題3": "言い換え類義", "問題4": "用法", "問題5": "文法形式の判断", "問題6": "文の組み立て", "問題7": "文章の文法" } };
const MONDAI_ENDS = { N1: [6, 13, 19, 25, 35, 40, 45] }; // 2010 年后新题型每个大题的最后一题号
const tagCache = new WeakMap();
function tagsOf(d) {
  if (tagCache.has(d)) return tagCache.get(d);
  let t = null;
  const m = /^【(\d{4})年(\d{1,2})月\s*(N\d)\s*問(\d+)】/.exec(d.q || "");
  if (d.exam || m) {
    const exam = d.exam || m[3], src = d.src || (m && `${m[1]}-${m[2].padStart(2, "0")}`), no = d.no ?? (m ? +m[4] : null);
    let mondai = d.mondai || null;
    if (!mondai && no != null && MONDAI_ENDS[exam]) { const i = MONDAI_ENDS[exam].findIndex(e => no <= e); if (i >= 0) mondai = `問題${i + 1}`; }
    t = { exam, src, no, mondai };
  }
  tagCache.set(d, t);
  return t;
}
const mondaiLabel = (exam, m) => `${m}${MONDAI_NAMES[exam]?.[m] ? " " + MONDAI_NAMES[exam][m] : ""}`;
function matchFilter(d, f) {
  const t = tagsOf(d); if (!t) return false;
  if (f.exam && t.exam !== f.exam) return false;
  if (f.mondai?.length && !f.mondai.includes(t.mondai)) return false;
  if (f.src?.length && !f.src.includes(t.src)) return false;
  return true;
}
const isFilterDeck = deckId => !!get(deckId)?.data.filter;
const cardsOf = deckId => {
  const f = get(deckId)?.data.filter;
  if (f) return all("card").filter(c => matchFilter(c.data, f)).sort((a, b) => { const x = tagsOf(a.data), y = tagsOf(b.data); return (x.src || "").localeCompare(y.src || "") || (x.no ?? 0) - (y.no ?? 0); });
  return all("card").filter(c => c.data.deckId === deckId).sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));
};
const progOf = cardId => get("p_" + cardId)?.data;

// ---------- cloud sync (Supabase) ----------
let sb = null, sbUser = null, syncing = false, syncTimer = null;
const setDot = s => { const d = $("#sync-dot"); d.className = s || ""; };
async function initSupabase() {
  if (!sbUrl() || !sbKey()) { sb = null; sbUser = null; setDot(""); return; }
  try {
    const { createClient } = await import(SUPABASE_ESM);
    sb = createClient(sbUrl(), sbKey(), { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await sb.auth.getSession();
    sbUser = data.session?.user || null;
    sb.auth.onAuthStateChange((_e, session) => { sbUser = session?.user || null; });
  } catch (e) { console.error(e); sb = null; setDot("err"); }
}
function scheduleSync(delay = 4000) { if (!sb || !sbUser) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), delay); }
async function syncNow(manual = false) {
  if (!sb || !sbUser) { if (manual) toast("请先在设置里登录云同步"); return; }
  if (syncing) return; syncing = true; setDot("busy");
  try {
    const metaKey = "lastPull_" + sbUser.id;
    let since = (await meta(metaKey)) || "1970-01-01T00:00:00Z";
    // pull
    let changed = false;
    for (;;) {
      const { data, error } = await sb.from("items").select("id,kind,data,updated_at,deleted,server_ts").gt("server_ts", since).order("server_ts").limit(1000);
      if (error) throw error;
      const toSave = [];
      for (const r of data) {
        const cur = items.get(r.id);
        const ru = Number(r.updated_at);
        if (!cur || !cur.dirty || ru >= cur.updated_at) {
          const it = { id: r.id, kind: r.kind, data: r.data, updated_at: ru, deleted: r.deleted, dirty: false };
          items.set(r.id, it); toSave.push(it); changed = true;
        }
        since = r.server_ts;
      }
      await idbPutMany(toSave);
      if (data.length < 1000) break;
    }
    await meta(metaKey, since);
    // push
    const dirty = [...items.values()].filter(it => it.dirty);
    for (let i = 0; i < dirty.length; i += 500) {
      const chunk = dirty.slice(i, i + 500);
      const rows = chunk.map(it => ({ user_id: sbUser.id, id: it.id, kind: it.kind, data: it.data, updated_at: it.updated_at, deleted: it.deleted }));
      const { error } = await sb.from("items").upsert(rows, { onConflict: "user_id,id" });
      if (error) throw error;
      const saved = [];
      for (const it of chunk) { const cur = items.get(it.id); if (cur && cur.updated_at === it.updated_at) { cur.dirty = false; saved.push(cur); } }
      await idbPutMany(saved);
    }
    setDot("ok");
    if (manual) toast("同步完成");
    if (changed && !document.body.classList.contains("studying")) route();
  } catch (e) {
    console.error(e); setDot("err"); if (manual) toast("同步失败：" + (e.message || e));
  } finally { syncing = false; }
}

// ---------- spaced repetition ----------
function grade(card, correct) {
  const now = Date.now();
  const p = { ...(progOf(card.id) || { cardId: card.id, deckId: card.data.deckId, box: 0, seen: 0, right: 0, wrong: 0, streak: 0, inBook: false, firstAt: now }) };
  p.deckId = card.data.deckId; p.seen++; p.lastAt = now;
  if (correct) {
    p.right++; p.streak++; p.box = Math.min(p.box + 1, INTERVALS.length - 1); p.due = now + INTERVALS[p.box];
    if (p.inBook && p.streak >= 2) p.inBook = false; // 连续答对 2 次自动移出错题本
  } else {
    p.wrong++; p.streak = 0; p.box = 0; p.due = now + 10 * 60000; p.inBook = true;
  }
  put("prog", "p_" + card.id, p);
  return p;
}
function deckStats(deckId) {
  const cards = cardsOf(deckId); const now = Date.now(); const today = startOfToday();
  let fresh = 0, due = 0, book = 0, newToday = 0;
  for (const c of cards) {
    const p = progOf(c.id);
    if (!p) fresh++; else { if (p.due <= now) due++; if (p.inBook) book++; if (p.firstAt >= today) newToday++; }
  }
  return { total: cards.length, fresh, due, book, newToday };
}
function buildQueue(deckId, mode) {
  const deck = get(deckId); const size = deck?.data.sessionSize || 20; const newPerDay = deck?.data.newPerDay ?? 20;
  const now = Date.now();
  if (mode === "wrong") {
    const inDeck = deckId && isFilterDeck(deckId) ? new Set(cardsOf(deckId).map(c => c.id)) : null;
    const ids = all("prog").filter(p => p.data.inBook && (!deckId || (inDeck ? inDeck.has(p.data.cardId) : p.data.deckId === deckId))).map(p => p.data.cardId).filter(id => get(id));
    return shuffle(ids);
  }
  const cards = cardsOf(deckId);
  if (mode === "random") return shuffle(cards.map(c => c.id)).slice(0, size);
  const due = [], fresh = [];
  for (const c of cards) { const p = progOf(c.id); if (!p) fresh.push(c.id); else if (p.due <= now) due.push([p.due, c.id]); }
  due.sort((a, b) => a[0] - b[0]);
  const st = deckStats(deckId);
  const newAllowed = Math.max(0, newPerDay - st.newToday);
  const q = due.map(x => x[1]).slice(0, size);
  for (const id of fresh) { if (q.length >= size || q.length - Math.min(due.length, size) >= newAllowed) break; q.push(id); }
  return shuffle(q);
}

// ---------- AI explanation ----------
let AnthropicCtor = null;
const DEFAULT_PROMPTS = {
  system: "你是语言考试辅导老师，学生是中文母语者。用简体中文回答，外语原文保留。回答尽量简短，只讲被问到的内容，不要开场白、不要总结、不要重复题目。",
  choice: "只解析正确选项：为什么选它（1～2 句，附中文意思）。不要分析其他选项，不要给例句。",
  flash: "只给三部分：\n- 释义（读音、词性、中文意思）\n- 语源或词根（一句话）\n- 3 个用法不同的例句（附翻译）",
};
// 追问框的快捷按钮：[按钮文字, 实际发给 AI 的话]
const QUICK_ASKS = {
  choice: [["知识点解析", "讲解这道题考查的知识点（正确选项的单词或文法）：\n- 释义（读音、词性、中文意思）\n- 语源或词根（一句话）\n- 3 个用法不同的例句（附翻译）"], ["各项解析", "逐个分析每个选项：意思，以及为什么对或不对，各一句。"], ["判断要点", "这类题怎么快速判断？给出解题的关键线索。"], ["记忆要点", "给一个好记的记忆方法或要点。"]],
  flash: [["易混词", "列出容易混淆的词，各用一句话说明区别。"], ["常见搭配", "列出这个词最常见的搭配，附中文。"], ["记忆要点", "给一个好记的记忆方法或要点。"]],
};
// 自定义提示词存在云端（kind 'conf'），留空就用默认
function prompts() { const c = get("conf_prompts")?.data || {}; const o = {}; for (const k in DEFAULT_PROMPTS) o[k] = (c[k] || "").trim() || DEFAULT_PROMPTS[k]; return o; }
function buildPrompt(card, userPick) {
  const deck = get(card.data.deckId);
  const d = card.data;
  let content;
  if (d.type === "choice") {
    const opts = d.options.map((o, i) => `${i + 1}. ${o}`).join("\n");
    content = `科目：${deck?.data.subject || deck?.data.name || ""}\n\n题目：\n${d.q}\n\n选项：\n${opts}\n\n正确答案：${d.answer + 1}. ${d.options[d.answer]}` +
      (userPick != null && userPick !== d.answer ? `\n我选了：${userPick + 1}. ${d.options[userPick]}（错了）` : "") +
      (d.note ? `\n\n题库自带的解析：${d.note}` : "") +
      `\n\n${prompts().choice}`;
  } else {
    content = `科目：${deck?.data.subject || deck?.data.name || ""}\n\n单词/卡片正面：${d.q}\n背面：${d.a || ""}` + (d.note ? `\n补充：${d.note}` : "") +
      `\n\n${prompts().flash}`;
  }
  if (deck?.data.prompt?.trim()) content += `\n\n这个 session 的额外要求：${deck.data.prompt.trim()}`;
  return content;
}
// messages: [{role:'user'|'assistant', content}]
function callAI(messages, onText) {
  const prov = PROVIDERS[settings.provider] ? settings.provider : "claude";
  if (!aiKey()) return Promise.reject(new Error(`还没有填写 ${PROVIDERS[prov].name} 的 API Key（设置 → AI 解析）`));
  const system = prompts().system;
  return prov === "claude" ? explainClaude(system, messages, onText) : explainOpenAICompat(prov, system, messages, onText);
}
async function explain(card, userPick, onText) {
  const q = buildPrompt(card, userPick);
  const res = await callAI([{ role: "user", content: q }], onText);
  return { ...res, q, chat: [] };
}
async function explainClaude(system, messages, onText) {
  const account = sbUser ? { client: sb, userId: sbUser.id } : null;
  if (!AnthropicCtor) AnthropicCtor = (await import(ANTHROPIC_ESM)).default;
  const client = new AnthropicCtor({ apiKey: aiKey(), dangerouslyAllowBrowser: true });
  const model = aiModel() || "claude-opus-5-5";
  // Opus / Sonnet: if a safety filter declines, the server retries on a fallback model automatically
  const fb = model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 8000,
    ...fb,
    output_config: { effort: settings.effort || "low" },
    system,
    messages,
  });
  stream.on("text", t => onText(t));
  const msg = await stream.finalMessage();
  const usage = msg.usage;
  const cacheRead = usage?.cache_read_input_tokens;
  const cacheWrite = usage?.cache_creation_input_tokens;
  void saveCloudUsage(account, "claude", msg.model || model,
    usage?.input_tokens == null ? null : usage.input_tokens + (cacheRead ?? 0) + (cacheWrite ?? 0),
    usage?.output_tokens, cacheRead, cacheWrite);
  if (msg.stop_reason === "refusal") throw new Error("AI 拒绝回答这道题");
  const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
  return { text, model: msg.model, at: Date.now() };
}
// DeepSeek / 通义千问 / 其他：OpenAI 兼容的 /chat/completions 接口（流式）
async function explainOpenAICompat(prov, system, messages, onText) {
  const base = (prov === "custom" ? settings.customBase : PROVIDERS[prov].base || "").replace(/\/+$/, "");
  if (!base) throw new Error("请在设置里填写接口地址（Base URL）");
  const model = aiModel(); if (!model) throw new Error("请在设置里填写模型名称");
  const account = sbUser ? { client: sb, userId: sbUser.id } : null;
  const deepSeek = prov === "deepseek" ? deepSeekModel(model) : null;
  let actualModel = deepSeek?.model ?? model;
  let res;
  try {
    res = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + aiKey() },
      body: JSON.stringify({ model, stream: true, ...(prov !== "custom" ? { stream_options: { include_usage: true } } : {}), ...deepSeek, max_tokens: 4000, messages: [{ role: "system", content: system }, ...messages] }),
    });
  } catch (e) { throw new Error("连不上接口（网络问题，或这个服务不允许网页直接调用）"); }
  if (!res.ok) {
    let msg = ""; try { const j = await res.json(); msg = j.error?.message || j.message || JSON.stringify(j); } catch {}
    const err = new Error(`${res.status} ${msg}`.trim()); err.status = res.status; throw err;
  }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "", text = "", usage;
  for (;;) {
    const { value, done } = await reader.read();
    buf += done ? dec.decode() + "\n" : dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim(); if (data === "[DONE]") continue;
      try { const chunk = JSON.parse(data); usage = chunk.usage || usage; actualModel = chunk.model || actualModel; const t = chunk.choices?.[0]?.delta?.content; if (t) { text += t; onText(t); } } catch {}
    }
    if (done) break;
  }
  void saveCloudUsage(account, prov, actualModel, usage?.prompt_tokens, usage?.completion_tokens,
    usage?.prompt_cache_hit_tokens ?? usage?.prompt_tokens_details?.cached_tokens);
  if (!text) throw new Error("接口没有返回内容");
  recordUsage(prov, base, model, usage);
  return { text, model, at: Date.now() };
}

// ---------- import ----------
function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false, delim = ",";
  const pickDelim = i => { const e = text.indexOf("\n", i); const line = text.slice(i, e < 0 ? undefined : e); delim = line.includes("\t") ? "\t" : ","; };
  pickDelim(0);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!q && row.length === 0 && cell === "" && (i === 0 || text[i - 1] === "\n")) pickDelim(i);
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"' && cell === "") q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c));
}
function answerIndex(ans, options) {
  if (ans == null) return -1;
  if (typeof ans === "number") return ans >= 1 && ans <= options.length ? ans - 1 : -1;
  const s = String(ans).trim();
  const L = "ABCDEFGH".indexOf(s.toUpperCase()); if (s.length === 1 && L >= 0 && L < options.length) return L;
  const circled = "①②③④⑤⑥".indexOf(s); if (circled >= 0) return circled;
  if (/^\d+$/.test(s)) { const n = +s; return n >= 1 && n <= options.length ? n - 1 : -1; }
  return options.findIndex(o => o === s);
}
function normalizeCard(o) {
  let q = o.q ?? o.question ?? o.front ?? o.word ?? o["题目"] ?? o["问题"] ?? o["正面"];
  const stem = o.stem ?? o.instruction ?? o["题干"];
  if (q && stem) q = `${stem}\n\n${q}`;
  const note = o.note ?? o.explanation ?? o["解析"] ?? o["备注"] ?? "";
  const options = o.options ?? o.choices ?? o["选项"];
  if (!q) return null;
  if (Array.isArray(options) && options.length >= 2) {
    const opts = options.map(String);
    const answer = answerIndex(o.answer ?? o.ans ?? o["答案"], opts);
    if (answer < 0) return { error: `「${String(q).slice(0, 20)}」的答案无法识别` };
    return { type: "choice", q: String(q), options: opts, answer, note: String(note || "") };
  }
  const a = o.a ?? o.back ?? o.meaning ?? o.answer ?? o["背面"] ?? o["意思"] ?? o["答案"] ?? "";
  return { type: "flash", q: String(q), a: String(a), note: String(note || "") };
}
function parseImport(text) {
  text = text.trim(); const cards = [], errors = [];
  if (!text) return { cards, errors };
  if (text.startsWith("[") || text.startsWith("{")) {
    let j = JSON.parse(text); if (!Array.isArray(j)) j = j.cards || [j];
    for (const o of j) { const c = normalizeCard(o); if (!c) errors.push("缺少题目"); else if (c.error) errors.push(c.error); else cards.push(c); }
    return { cards, errors };
  }
  const rows = parseCSV(text);
  const head = rows[0].map(h => h.toLowerCase());
  const known = ["q", "question", "front", "word", "题目", "问题", "正面"];
  if (head.some(h => known.includes(h))) {
    const optCols = head.map((h, i) => (/^(option|opt|选项)?\s*[a-h1-8]$/.test(h) ? i : -1)).filter(i => i >= 0);
    for (const r of rows.slice(1)) {
      const o = {}; head.forEach((h, i) => { if (!optCols.includes(i)) o[h] = r[i]; });
      if (optCols.length) o.options = optCols.map(i => r[i]).filter(x => x);
      const c = normalizeCard(o); if (!c) errors.push("缺少题目"); else if (c.error) errors.push(c.error); else cards.push(c);
    }
    return { cards, errors };
  }
  for (const r of rows) {
    if (r.length <= 3) { cards.push({ type: "flash", q: r[0], a: r[1] || "", note: r[2] || "" }); continue; }
    // 题目, 选项..., 答案, [解析]
    let ansPos = r.length - 1, note = "";
    const looksAns = s => /^[A-Ha-h1-8①-⑥]$/.test(s);
    if (!looksAns(r[ansPos]) && looksAns(r[ansPos - 1])) { note = r[ansPos]; ansPos--; }
    const options = r.slice(1, ansPos).filter(x => x);
    const answer = answerIndex(r[ansPos], options);
    if (answer < 0) errors.push(`「${r[0].slice(0, 20)}」的答案无法识别`); else cards.push({ type: "choice", q: r[0], options, answer, note });
  }
  return { cards, errors };
}
function addCards(deckId, cards) {
  const start = cardsOf(deckId).length;
  putMany(cards.map((c, i) => ({ kind: "card", id: uid(), data: { ...c, deckId, order: start + i } })));
}

// ---------- views ----------
const view = () => $("#view");
function setBar(title, backHref) {
  $("#title").textContent = title;
  const b = $("#back"); b.style.visibility = backHref ? "visible" : "hidden"; b.onclick = () => { location.hash = backHref; };
}
function setTab(t) { document.querySelectorAll("#tabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === t)); }

function homeView() {
  setBar("刷题卡片"); setTab("home");
  const decks = all("deck").sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0) || a.updated_at - b.updated_at);
  view().innerHTML = (decks.length ? decks.map(d => {
    const s = deckStats(d.id); const r = roundProgress(d.id);
    const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
    return `<div class="card deck" data-deck="${d.id}">
      <div class="deck-head"><h3>${esc(d.data.name)}</h3><a class="more" href="#/deck/${d.id}" aria-label="管理">⋯</a></div>
      <div class="deck-bar"><div style="width:${pct}%"></div></div>
      <div class="stats"><span>${r.round > 1 ? `第 ${r.round} 轮 · ` : ""}进度 <b>${r.done}</b> / ${r.total}</span><span class="bad"><b>${s.book}</b> 错题</span></div></div>`;
  }).join("") : `<div class="empty">还没有 session，点下面新建一个</div>`) +
    `<button id="new-deck" style="width:100%">＋ 新建 session</button>`;
  $("#new-deck").onclick = () => { location.hash = "#/deck-edit/new"; };
  view().querySelectorAll("[data-deck]").forEach(el => el.onclick = e => { if (e.target.closest(".more")) return; startDeck(el.dataset.deck); });
}

function deckEditView(id) {
  const deck = id === "new" ? null : get(id);
  const d = deck?.data || { name: "", subject: "", newPerDay: 20, sessionSize: 20 };
  setBar(deck ? "编辑 session" : "新建 session", deck ? `#/deck/${id}` : "#/"); setTab("home");
  view().innerHTML = `<div class="card">
    <label>名称</label><input id="f-name" value="${esc(d.name)}" placeholder="例如：N1 文法">
    <label>科目说明（给 AI 看，让解析更准确）</label><input id="f-subject" value="${esc(d.subject || "")}" placeholder="例如：日语 JLPT N1 文法">
    <label>这个 session 的 AI 提示词（可选，会加在通用提示词后面）</label><textarea id="f-prompt" style="min-height:90px;font-family:inherit;font-size:15px" placeholder="例如：重点讲接续方式和近义文法的区别；例句尽量用新闻、商务场景">${esc(d.prompt || "")}</textarea>
    </div>
    ${filterBox(d.filter, !deck || !!d.filter)}
    <button id="save" style="width:100%">保存</button>
    ${deck ? `<div style="height:10px"></div><button id="del" class="danger" style="width:100%">删除这个 session（含所有卡片）</button>` : ""}`;
  $("#save").onclick = () => {
    const name = $("#f-name").value.trim(); if (!name) return toast("请填写名称");
    const data = { ...d, name, subject: $("#f-subject").value.trim(), prompt: $("#f-prompt").value.trim() };
    const f = readFilter(); if (f) data.filter = f; else delete data.filter;
    const nid = deck ? id : uid(); if (!deck) data.order = all("deck").length;
    put("deck", nid, data); location.hash = `#/deck/${nid}`;
  };
  wireFilterBox();
  if (deck) $("#del").onclick = () => {
    if (d.filter) { if (!confirm(`确定删除「${d.name}」吗？（只删这个筛选 session，题库里的题目和做题记录都保留）`)) return; remove([id, "s_" + id].filter(x => items.has(x))); location.hash = "#/"; return; }
    if (!confirm(`确定删除「${d.name}」和里面的所有卡片吗？`)) return;
    const cs = cardsOf(id).map(c => c.id);
    remove([id, ...cs, ...cs.map(c => "p_" + c).filter(p => items.has(p))]); location.hash = "#/";
  };
}

// 新建 / 编辑 session 时的「从题库按题型筛选」
function filterBox(f, show) {
  if (!show) return "";
  const tagged = all("card").map(c => tagsOf(c.data)).filter(Boolean);
  if (!tagged.length) return "";
  const exams = uniq(tagged.map(t => t.exam)).sort();
  const exam = f?.exam || exams[0];
  const ts = tagged.filter(t => t.exam === exam);
  const count = (k, v) => ts.filter(t => t[k] === v).length;
  const mondais = uniq(ts.map(t => t.mondai).filter(Boolean)).sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
  const srcs = uniq(ts.map(t => t.src).filter(Boolean)).sort().reverse();
  const chk = (k, v, label, on) => `<label class="chk"><input type="checkbox" data-f="${k}" value="${esc(v)}" ${on ? "checked" : ""}> ${esc(label)} <span class="muted">${count(k, v)}</span></label>`;
  return `<div class="card" id="fbox">
    <label class="chk" style="font-weight:600;color:var(--text)"><input type="checkbox" id="f-on" ${f ? "checked" : ""}> 从题库按题型 / 年份挑题</label>
    <div class="muted">勾上后，这个 session 不放自己的卡片，而是自动收集题库里符合条件的题（以后导入的新题也会自动加进来）。</div>
    <div id="f-body" style="${f ? "" : "display:none"}">
      ${exams.length > 1 ? `<label>考试</label><select id="f-exam">${exams.map(e => `<option ${e === exam ? "selected" : ""}>${esc(e)}</option>`).join("")}</select>` : `<input type="hidden" id="f-exam" value="${esc(exam)}">`}
      <label>题型（不勾 = 全部）</label>${mondais.map(m => chk("mondai", m, mondaiLabel(exam, m), f?.mondai?.includes(m))).join("")}
      <label>年份（不勾 = 全部）</label>${srcs.map(v => chk("src", v, v.replace("-", " 年 ") + " 月", f?.src?.includes(v))).join("")}
    </div></div>`;
}
function wireFilterBox() {
  $("#f-on")?.addEventListener("change", e => { $("#f-body").style.display = e.target.checked ? "" : "none"; });
  $("#f-exam")?.addEventListener("change", e => { $("#fbox").outerHTML = filterBox({ exam: e.target.value, mondai: [], src: [] }, true); wireFilterBox(); });
}
function readFilter() {
  if (!$("#f-on")?.checked) return null;
  const vals = k => [...view().querySelectorAll(`[data-f="${k}"]:checked`)].map(x => x.value);
  return { exam: $("#f-exam").value, mondai: vals("mondai"), src: vals("src") };
}
function filterDesc(f) {
  const parts = [f.exam];
  parts.push(f.mondai?.length ? f.mondai.map(m => mondaiLabel(f.exam, m)).join("、") : "全部题型");
  parts.push(f.src?.length ? f.src.join("、") : "全部年份");
  return parts.join(" · ");
}

function deckView(id) {
  const deck = get(id); if (!deck) { location.hash = "#/"; return; }
  setBar(deck.data.name, "#/"); setTab("home");
  const s = deckStats(id); const cards = cardsOf(id);
  const r = roundProgress(id);
  view().innerHTML = `
    <div class="card"><div class="stats" style="font-size:15px"><span><b>${s.total}</b> 张</span><span class="due"><b>${s.due}</b> 待复习</span><span><b>${s.fresh}</b> 未学</span><span class="bad"><b>${s.book}</b> 错题</span></div>
    <div class="muted" style="margin-top:4px">今天已学新题 ${s.newToday} / ${deck.data.newPerDay ?? 20}</div></div>
    <button id="go" style="width:100%;font-size:18px" ${s.total ? "" : "disabled"}>${r.done ? `继续刷题（${r.done} / ${r.total}）` : "开始刷题"}</button>
    <div class="row" style="margin-top:8px">
      <button id="go-wrong" class="secondary" ${s.book ? "" : "disabled"}>练错题（${s.book}）</button>
      <button id="go-reset" class="secondary" ${r.done ? "" : "disabled"}>从头再来一轮</button>
    </div>
    <div class="section-title">卡片</div>
    ${deck.data.filter ? `<div class="muted" style="margin:0 4px 8px">筛选条件：${esc(filterDesc(deck.data.filter))}</div><div class="row"><a class="btn secondary" href="#/deck-edit/${id}">修改筛选 / 设置</a></div>`
      : `<div class="row"><a class="btn secondary" href="#/card/${id}/new">＋ 添加</a><a class="btn secondary" href="#/import/${id}">批量导入</a><a class="btn secondary" href="#/deck-edit/${id}">设置</a></div>`}
    <div style="height:10px"></div>
    ${cards.length > 8 ? `<input id="search" placeholder="搜索卡片…" style="margin-bottom:8px">` : ""}
    <div class="card" id="clist">${cards.length ? "" : `<div class="empty">还没有卡片。可以手动添加，或者批量导入题库。</div>`}</div>`;
  const renderList = (f = "") => {
    if (!cards.length) return;
    const shown = cards.filter(c => !f || (c.data.q + (c.data.a || "") + (c.data.options || []).join("")).includes(f));
    $("#clist").innerHTML = shown.slice(0, 300).map(c => {
      const p = progOf(c.id);
      const t = tagsOf(c.data);
      return `<a class="list-item" href="#/card/${c.data.deckId}/${c.id}" style="color:inherit;text-decoration:none"><span class="grow">${esc(qBody(c.data.q).replace(/\s+/g, " "))}</span>${p?.inBook ? '<span class="tag bad">错题</span>' : ""}<span class="tag">${t?.mondai ? esc(t.mondai) : c.data.type === "choice" ? "选择" : "卡片"}</span></a>`;
    }).join("") + (shown.length > 300 ? `<div class="muted">只显示前 300 张，请用搜索</div>` : "");
  };
  renderList();
  $("#search")?.addEventListener("input", e => renderList(e.target.value.trim()));
  $("#go").onclick = () => startDeck(id);
  $("#go-wrong").onclick = () => startStudy(id, "wrong");
  $("#go-reset").onclick = () => { if (!confirm("清空本轮进度，重新打乱从头开始？（错题本不受影响）")) return; const old = sessOf(id); put("sess", "s_" + id, freshRound(id, (old?.round || 1) + 1)); startDeck(id); };
}

function cardEditView(deckId, cardId) {
  const card = cardId === "new" ? null : get(cardId);
  const d = card?.data || { type: "choice", q: "", options: ["", "", "", ""], answer: 0, a: "", note: "" };
  setBar(card ? "编辑卡片" : "添加卡片", `#/deck/${deckId}`); setTab("home");
  let type = d.type;
  const render = () => {
    view().innerHTML = `<div class="card">
      <div class="row"><button class="small ${type === "choice" ? "" : "ghost"}" data-t="choice">选择题</button><button class="small ${type === "flash" ? "" : "ghost"}" data-t="flash">单词卡（正反面）</button></div>
      <label>${type === "choice" ? "题目（第一段写作答要求、空一行再写题目，会显示成小字；用 ＿词＿ 表示下划线）" : "正面（单词）"}</label><textarea id="f-q" style="min-height:90px;font-family:inherit;font-size:16px">${esc(d.q)}</textarea>
      ${type === "choice" ? `<label>选项（点圆圈选正确答案）</label>${(d.options || ["", "", "", ""]).map((o, i) => `
        <div class="row" style="align-items:center;margin-bottom:6px"><input type="radio" name="ans" value="${i}" ${d.answer === i ? "checked" : ""} style="flex:0 0 22px;width:22px;height:22px">
        <input class="f-opt" value="${esc(o)}" placeholder="选项 ${i + 1}" style="flex:1"></div>`).join("")}
        <button class="small ghost" id="add-opt">＋ 加一个选项</button>`
        : `<label>背面（意思）</label><textarea id="f-a" style="min-height:90px;font-family:inherit;font-size:16px">${esc(d.a || "")}</textarea>`}
      <label>解析 / 备注（可不填）</label><textarea id="f-note" style="min-height:70px;font-family:inherit;font-size:15px">${esc(d.note || "")}</textarea>
      </div>
      <button id="save" style="width:100%">保存</button>
      ${card ? `<div style="height:10px"></div><div class="row"><button id="reset" class="ghost">重置学习进度</button><button id="del" class="danger">删除卡片</button></div>` : ""}`;
    view().querySelectorAll("[data-t]").forEach(b => b.onclick = () => { collect(); type = b.dataset.t; render(); });
    $("#add-opt")?.addEventListener("click", () => { collect(); d.options.push(""); render(); });
    $("#save").onclick = save;
    if (card) {
      $("#del").onclick = () => { if (confirm("删除这张卡片？")) { remove([cardId, "p_" + cardId].filter(x => items.has(x))); location.hash = `#/deck/${deckId}`; } };
      $("#reset").onclick = () => { if (items.has("p_" + cardId)) remove(["p_" + cardId]); toast("已重置"); };
    }
  };
  const collect = () => {
    d.q = $("#f-q").value; d.note = $("#f-note").value;
    if (type === "choice") { d.options = [...view().querySelectorAll(".f-opt")].map(x => x.value); d.answer = +(view().querySelector("[name=ans]:checked")?.value ?? 0); }
    else d.a = $("#f-a").value;
  };
  const save = () => {
    collect(); if (!d.q.trim()) return toast("请填写题目");
    let data;
    if (type === "choice") {
      const pairs = d.options.map((o, i) => [o.trim(), i]).filter(p => p[0]);
      if (pairs.length < 2) return toast("至少需要两个选项");
      const answer = pairs.findIndex(p => p[1] === d.answer); if (answer < 0) return toast("请选一个正确答案");
      data = { type, q: d.q.trim(), options: pairs.map(p => p[0]), answer, note: d.note.trim() };
    } else data = { type, q: d.q.trim(), a: d.a.trim(), note: d.note.trim() };
    data.deckId = deckId;
    if (card) { data.order = card.data.order; if (card.data.q === data.q && JSON.stringify(card.data.options) === JSON.stringify(data.options) && card.data.a === data.a) data.ai = card.data.ai; put("card", cardId, data); }
    else { data.order = cardsOf(deckId).length; put("card", uid(), data); }
    toast("已保存");
    if (card) location.hash = `#/deck/${deckId}`; else { d.q = ""; d.options = ["", "", "", ""]; d.a = ""; d.note = ""; render(); $("#f-q").focus(); }
  };
  render();
}

const AI_PROMPT = `请把下面的题目整理成 JSON 数组，每道选择题格式：
{"stem": "作答要求（如：（　）に入れるのに最もよいものを選びなさい。）", "q": "题目正文（下划线部分用＿词＿标出）", "options": ["选项1","选项2","选项3","选项4"], "answer": 正确选项的序号(1-4), "note": "解析(可选)"}
每个单词卡格式：{"q": "单词", "a": "读音 + 意思"}
只输出 JSON，不要其他文字。`;

function importView(deckId) {
  const deck = get(deckId); if (!deck) { location.hash = "#/"; return; }
  setBar("批量导入", `#/deck/${deckId}`); setTab("home");
  view().innerHTML = `<div class="card">
    <div class="muted">把题目粘贴到下面（支持 JSON、CSV、或从 Excel / Numbers 复制的表格），也可以选择文件。</div>
    <textarea id="f-text" placeholder="例：\nmeticulous,一丝不苟的\nubiquitous,无处不在的"></textarea>
    <div class="row" style="margin-top:8px"><label class="btn secondary" style="margin:0">选择文件<input id="f-file" type="file" accept=".json,.csv,.tsv,.txt" hidden></label><button id="preview" class="secondary">预览</button></div>
    <div id="result" class="muted" style="margin-top:10px"></div>
    </div>
    <button id="do" style="width:100%" disabled>导入</button>
    <details class="card" style="margin-top:12px"><summary>支持的格式</summary>
    <p class="muted">① 单词卡：每行「单词,意思」</p><pre class="fmt">설레다,心动，激动\n아쉽다,可惜，遗憾</pre>
    <p class="muted">② 选择题：每行「题目,选项1,选项2,选项3,选项4,答案,解析(可选)」，答案写 1-4 或 A-D</p><pre class="fmt">彼の態度は反省している（　）開き直っている,どころか,ばかりか,にもまして,とあって,1</pre>
    <p class="muted">③ JSON（适合让 AI 帮你整理题库）</p><pre class="fmt">[{"q":"…","options":["…","…","…","…"],"answer":1,"note":"…"}]</pre>
    <p class="muted">让 AI 帮你把 PDF/照片里的题转成可导入的格式，可以复制这段话给它：</p>
    <button id="copy-prompt" class="small secondary">复制给 AI 的说明</button>
    </details>`;
  let parsed = null;
  const doPreview = () => {
    try {
      parsed = parseImport($("#f-text").value);
      const ch = parsed.cards.filter(c => c.type === "choice").length;
      $("#result").innerHTML = `识别到 <b>${parsed.cards.length}</b> 张（选择题 ${ch}，单词卡 ${parsed.cards.length - ch}）` +
        (parsed.errors.length ? `<br><span style="color:var(--bad)">${parsed.errors.length} 条有问题：${esc(parsed.errors.slice(0, 3).join("；"))}</span>` : "") +
        (parsed.cards[0] ? `<br>第一张：${esc(parsed.cards[0].q.slice(0, 40))}` : "");
      $("#do").disabled = !parsed.cards.length;
    } catch (e) { parsed = null; $("#do").disabled = true; $("#result").innerHTML = `<span style="color:var(--bad)">格式无法识别：${esc(e.message)}</span>`; }
  };
  $("#preview").onclick = doPreview;
  $("#f-text").addEventListener("input", () => { clearTimeout(doPreview._t); doPreview._t = setTimeout(doPreview, 400); });
  $("#f-file").onchange = async e => { const f = e.target.files[0]; if (!f) return; $("#f-text").value = await f.text(); doPreview(); };
  $("#do").onclick = () => { if (!parsed?.cards.length) return; addCards(deckId, parsed.cards); toast(`已导入 ${parsed.cards.length} 张`); location.hash = `#/deck/${deckId}`; };
  $("#copy-prompt").onclick = async () => { try { await navigator.clipboard.writeText(AI_PROMPT); toast("已复制"); } catch { prompt("复制下面的文字", AI_PROMPT); } };
}

// ---------- study ----------
// S = { id, deckId, mode, queue:[cardId], idx, ans:{pos:{pick,ok}}, round, back }
let S = null;
const uniq = a => [...new Set(a)];
function sessOf(deckId) { return get("s_" + deckId)?.data || null; }
function freshRound(deckId, round = 1) {
  return { deckId, mode: "round", queue: shuffle(cardsOf(deckId).map(c => c.id)), idx: 0, ans: {}, round };
}
// 本轮进度：答过的题数 / 总题数
function roundProgress(deckId) {
  const total = cardsOf(deckId).length; const s = sessOf(deckId);
  if (!s) return { done: 0, total };
  const ids = new Set(Object.keys(s.ans).map(p => s.queue[p]).filter(id => get(id)));
  return { done: Math.min(ids.size, total), total, round: s.round || 1 };
}
function saveS() { if (S?.id) { const { back, ...data } = S; put("sess", S.id, data); } }
function startDeck(deckId) {
  if (!cardsOf(deckId).length) { location.hash = `#/deck/${deckId}`; return toast("这个 session 还没有卡片，先添加或导入"); }
  let s = sessOf(deckId);
  if (!s) s = freshRound(deckId);
  s = JSON.parse(JSON.stringify(s));
  // 后来新加的卡片随机插进还没做的部分
  const have = new Set(s.queue);
  for (const c of cardsOf(deckId)) if (!have.has(c.id)) { const at = s.idx + Math.floor(Math.random() * (s.queue.length - s.idx + 1)); s.queue.splice(at, 0, c.id); shiftAns(s, at); }
  S = { ...s, id: "s_" + deckId, back: "#/" };
  saveS(); location.hash = "#/study";
}
function newRound() { S = { ...freshRound(S.deckId, (S.round || 1) + 1), id: S.id, back: S.back }; saveS(); studyView(); }
function startStudy(deckId, mode) {
  const queue = buildQueue(deckId, mode);
  if (!queue.length) return toast("没有需要刷的题");
  S = { id: null, deckId, mode, queue, idx: 0, ans: {}, round: 1, back: deckId ? `#/deck/${deckId}` : "#/wrong" };
  location.hash = "#/study";
}
function shiftAns(s, at) {
  const n = {}; for (const [k, v] of Object.entries(s.ans)) n[+k >= at ? +k + 1 : k] = v; s.ans = n;
}
function go(step) {
  playSound("navigate"); const to = S.idx + step;
  if (to < 0) return toast("已经是第一题");
  if (to > S.queue.length) return;
  S.idx = to; saveS();
  const v = view(); v.classList.remove("slide-l", "slide-r"); void v.offsetWidth; v.classList.add(step > 0 ? "slide-l" : "slide-r");
  window.scrollTo(0, 0); studyView();
}
function studyView() {
  if (!S) { location.hash = "#/"; return; }
  document.body.classList.add("studying");
  const deckName = get(S.deckId)?.data.name || "刷题";
  setBar(S.mode === "wrong" ? "错题练习" : S.mode === "random" ? "随机练习" : deckName, S.back);
  if (S.idx >= S.queue.length) return studyDone();
  const card = get(S.queue[S.idx]);
  if (!card) { S.queue.splice(S.idx, 1); const n = {}; for (const [k, v] of Object.entries(S.ans)) { if (+k < S.idx) n[k] = v; else if (+k > S.idx) n[+k - 1] = v; } S.ans = n; saveS(); return studyView(); }
  const d = card.data; const p = progOf(card.id);
  const pos = S.idx; const rec = S.ans[pos];
  const answeredIds = new Set(Object.keys(S.ans).map(k => S.queue[k]));
  const totalU = uniq(S.queue).length;
  const pct = Math.min(100, Math.round((answeredIds.size / totalU) * 100));
  const vals = Object.values(S.ans); const nR = vals.filter(x => x.ok).length, nW = vals.length - nR;
  const head = `<div class="progress"><div style="width:${pct}%"></div></div>
    <div class="q-meta"><span>${pos + 1} / ${S.queue.length}</span><span>${p?.inBook ? '<span class="tag bad">错题本</span> ' : ""}✓${nR} ✗${nW}</span></div>`;
  const order = d.type === "choice" ? (settings.shuffleOptions ? shuffle(d.options.map((_, i) => i)) : d.options.map((_, i) => i)) : [];
  const navRow = `<div class="row"><button class="ghost" id="prev" ${pos === 0 ? "disabled" : ""}>← 上一题</button><button id="next">${S.idx === S.queue.length - 1 ? "完成" : "下一题 →"}</button></div>`;

  const answer = ok => {
    playSound(ok ? "correct" : "wrong");
    grade(card, ok);
    S.ans[pos] = { pick: rec?.pick ?? null, ok, ...S.ans[pos] };
    if (!ok) { // 本轮内过几题再出一次
      // 同一轮里每题最多重复出现一次
      if (S.queue.filter(id => id === card.id).length < 2) { const at = Math.min(S.queue.length, pos + 4); S.queue.splice(at, 0, card.id); shiftAns(S, at); }
    }
    saveS();
    const v = Object.values(S.ans); const r = v.filter(x => x.ok).length;
    const m = $(".q-meta"); if (m) m.innerHTML = `<span>${pos + 1} / ${S.queue.length}</span><span>${!ok || p?.inBook ? '<span class="tag bad">错题本</span> ' : ""}✓${r} ✗${v.length - r}</span>`;
    const bar = $(".progress div"); if (bar) bar.style.width = Math.min(100, Math.round(new Set(Object.keys(S.ans).map(k => S.queue[k])).size / uniq(S.queue).length * 100)) + "%";
  };
  const showChoiceResult = (pick, fresh) => {
    const ok = pick === d.answer;
    view().querySelectorAll(".opt").forEach(x => { const i = +x.dataset.i; x.disabled = true; if (i === d.answer) x.classList.add("right"); else if (i === pick) x.classList.add("wrong"); });
    $("#after").innerHTML = `<div class="verdict ${ok ? "ok" : "bad"}">${ok ? "✓ 正确" : "✗ 错了，已加入错题本"}</div>${d.note ? `<div class="note">${esc(d.note)}</div>` : ""}<div class="ai" id="ai"></div>`;
    $("#actions").innerHTML = `<div class="row"><button id="ai-btn" class="secondary">查看解析</button></div>${navRow}`;
    $("#ai-btn").onclick = () => runAI(card, pick);
    bindNav();
    if (fresh) setTimeout(() => $("#after").scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };
  const renderChoice = () => {
    const sq = splitQ(d.q);
    view().innerHTML = `${head}<div class="card">${sq.stem ? `<div class="q-stem">${richQ(sq.stem)}</div>` : ""}<div class="q-text">${richQ(sq.body)}</div>
      <div class="opts">${order.map((oi, k) => `<button class="opt" data-i="${oi}"><span class="n">${k + 1}</span><span>${esc(d.options[oi])}</span></button>`).join("")}</div>
      <div id="after"></div></div><div class="study-actions" id="actions">${navRow.replace("下一题 →", "跳过 →")}</div>`;
    bindNav();
    if (rec) return showChoiceResult(rec.pick, false);
    view().querySelectorAll(".opt").forEach(b => b.onclick = () => {
      if (S.ans[pos]) return;
      const pick = +b.dataset.i; S.ans[pos] = { pick };
      playSound("click");
      answer(pick === d.answer); showChoiceResult(pick, true);
    });
  };
  const flipped = () => {
    $("#after").innerHTML = `<div class="flash-back">${esc(d.a || "")}</div>${d.note ? `<div class="note">${esc(d.note)}</div>` : ""}<div class="ai" id="ai"></div>`;
    const r = S.ans[pos];
    $("#actions").innerHTML = (r ? `<div class="verdict ${r.ok ? "ok" : "bad"}" style="text-align:center;margin:0 0 4px">${r.ok ? "✓ 记得" : "✗ 不记得（已加入错题本）"}</div>`
      : `<div class="row"><button id="forgot" class="danger">✗ 不记得</button><button id="knew" style="background:var(--ok)">✓ 记得</button></div>`) +
      `<div class="row"><button id="ai-btn" class="secondary">查看解析</button></div>${r ? navRow : ""}`;
    $("#ai-btn").onclick = () => runAI(card, null);
    if (r) bindNav();
    else {
      $("#forgot").onclick = () => { answer(false); go(1); };
      $("#knew").onclick = () => { answer(true); go(1); };
    }
  };
  const renderFlash = () => {
    view().innerHTML = `${head}<div class="card"><div class="flash-front">${richQ(d.q)}</div><div id="after"></div></div><div class="study-actions" id="actions"><button id="flip" style="width:100%">显示答案</button>${navRow.replace("下一题 →", "跳过 →")}</div>`;
    bindNav();
    if (rec) return flipped();
    $("#flip").onclick = () => { playSound("flip"); flipped(); };
  };
  if (d.type === "choice") renderChoice(); else renderFlash();
}
function bindNav() {
  const p = $("#prev"), n = $("#next");
  if (p) p.onclick = () => go(-1);
  if (n) n.onclick = () => go(1);
}
// 左滑下一题，右滑上一题
(function swipe() {
  let x0 = null, y0 = 0, t0 = 0;
  document.addEventListener("touchstart", e => {
    if (!document.body.classList.contains("studying") || e.touches.length !== 1 || e.target.closest("input,textarea")) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
  }, { passive: true });
  document.addEventListener("touchend", e => {
    if (x0 == null || !S) return;
    const t = e.changedTouches[0]; const dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7 || Date.now() - t0 > 800) return;
    if (dx < 0) { if (S.idx < S.queue.length) go(1); } else go(-1);
  }, { passive: true });
})();
function aiErrMsg(e) {
  let msg = e?.message || String(e);
  if (e?.status === 401) msg = "API Key 不正确，请到设置里检查";
  else if (e?.status === 429) msg = "请求太频繁或额度不足，稍后再试";
  else if (e?.status === 402 || /credit|billing|balance|余额|arrearage/i.test(msg)) msg = "AI 账户余额不足，请先充值";
  return msg;
}
async function runAI(card, pick) {
  const box = $("#ai"); const btn = $("#ai-btn");
  const cached = get(card.id)?.data.ai;
  if (cached?.text) { btn.style.display = "none"; return renderChat(card, pick); }
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> AI 正在解析…';
  const usageAccount = currentUsageAccount();
  let acc = ""; box.innerHTML = "";
  try {
    const res = await explain(card, pick, t => { acc += t; box.innerHTML = md(acc); });
    const c = get(card.id); if (c) put("card", card.id, { ...c.data, ai: res });
    btn.style.display = "none"; renderChat(card, pick);
  } catch (e) {
    console.error(e);
    box.innerHTML = `<div class="note" style="color:var(--bad)">解析失败：${esc(aiErrMsg(e))}</div>`;
    btn.disabled = false; btn.textContent = "重试解析";
  } finally {
    void showRequestUsage(box, usageAccount);
  }
}
// 解析 + 追问对话
function renderChat(card, pick) {
  const box = $("#ai"); if (!box) return;
  const ai = get(card.id)?.data.ai; if (!ai) return;
  const chat = ai.chat || [];
  box.innerHTML = md(ai.text) +
    chat.map(m => m.role === "user" ? `<div class="bubble me">${esc(m.label || m.content)}</div>` : `<div class="bubble">${md(m.content)}</div>`).join("") +
    `<div id="chat-live"></div>
     <div class="chips">${QUICK_ASKS[card.data.type === "choice" ? "choice" : "flash"].map(([l], i) => `<button class="chip" data-q="${i}">${l}</button>`).join("")}</div>
     <div class="ask-row"><input id="ask" placeholder="继续追问，比如：再给两个例句" enterkeyhint="send"><button id="ask-go" class="small">发送</button></div>
     <div class="muted" style="margin-top:6px;display:flex;gap:14px"><a href="#" id="regen">重新生成解析</a>${chat.length ? `<a href="#" id="clear-chat">清空追问</a>` : ""}</div>`;
  $("#regen").onclick = e => { e.preventDefault(); if (chat.length && !confirm("重新生成会清空追问记录，确定吗？")) return; const c = get(card.id); const nd = { ...c.data }; delete nd.ai; put("card", card.id, nd); runAI(card, pick); };
  $("#clear-chat")?.addEventListener("click", e => { e.preventDefault(); const c = get(card.id); put("card", card.id, { ...c.data, ai: { ...c.data.ai, chat: [] } }); renderChat(card, pick); });
  const send = async (quick) => {
    const input = $("#ask"); const question = quick ? quick[1] : input.value.trim(); if (!question) return;
    const label = quick ? quick[0] : null;
    const c = get(card.id); const a = c.data.ai;
    const history = [{ role: "user", content: a.q || buildPrompt(c, pick) }, { role: "assistant", content: a.text }, ...(a.chat || []).map(m => ({ role: m.role, content: m.content })), { role: "user", content: question }];
    if (!quick) input.value = ""; input.disabled = true; $("#ask-go").disabled = true; box.querySelectorAll(".chip").forEach(b => b.disabled = true);
    const live = $("#chat-live");
    live.innerHTML = `<div class="bubble me">${esc(label || question)}</div><div class="bubble" id="live-ans"><span class="spinner"></span></div>`;
    const usageAccount = currentUsageAccount();
    let acc = "";
    try {
      const res = await callAI(history, t => { acc += t; $("#live-ans").innerHTML = md(acc); });
      const c2 = get(card.id);
      put("card", card.id, { ...c2.data, ai: { ...c2.data.ai, chat: [...(c2.data.ai.chat || []), { role: "user", content: question, ...(label ? { label } : {}) }, { role: "assistant", content: res.text }] } });
      renderChat(card, pick);
      setTimeout(() => $("#ask")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    } catch (e) {
      console.error(e);
      $("#live-ans").innerHTML = `<span style="color:var(--bad)">失败：${esc(aiErrMsg(e))}</span>`;
      input.disabled = false; if (!quick) input.value = question; $("#ask-go").disabled = false; box.querySelectorAll(".chip").forEach(b => b.disabled = false);
    } finally {
      void showRequestUsage(box, usageAccount);
    }
  };
  $("#ask-go").onclick = () => send();
  box.querySelectorAll(".chip").forEach(b => b.onclick = () => send(QUICK_ASKS[card.data.type === "choice" ? "choice" : "flash"][+b.dataset.q]));
  $("#ask").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); send(); } });
}
function studyDone() { playSound("done");
  const vals = Object.values(S.ans); const right = vals.filter(x => x.ok).length, wrong = vals.length - right;
  const rate = vals.length ? Math.round((right / vals.length) * 100) : 0;
  const skipped = S.queue.length - vals.length;
  view().innerHTML = `<div class="done-big">🎉</div><h2 style="text-align:center;margin:8px 0">${S.mode === "round" ? `第 ${S.round || 1} 轮完成了` : "这一轮完成了"}</h2>
    <div class="card" style="text-align:center"><div class="stats" style="justify-content:center;font-size:16px"><span>答对 <b>${right}</b></span><span class="bad">答错 <b>${wrong}</b></span><span>正确率 <b>${rate}%</b></span>${skipped > 0 ? `<span>跳过 <b>${skipped}</b></span>` : ""}</div></div>
    ${S.mode === "round" ? `<button id="again" style="width:100%">再来一轮（重新打乱）</button><div style="height:8px"></div>` : ""}
    <div class="row"><button id="back-last" class="ghost">← 回到上一题</button><button id="done" class="secondary">返回</button></div>`;
  $("#again")?.addEventListener("click", newRound);
  $("#back-last").onclick = () => go(-1);
  $("#done").onclick = () => { location.hash = S.back; };
  syncNow();
}
function wrongView() {
  setBar("错题本"); setTab("wrong");
  const book = all("prog").filter(p => p.data.inBook && get(p.data.cardId));
  const byDeck = {};
  for (const p of book) (byDeck[p.data.deckId] ||= []).push(p);
  view().innerHTML = book.length ? `<button id="all" style="width:100%">练习全部错题（${book.length}）</button>
    <div class="muted" style="margin:8px 4px">答错的题会自动放进来，之后连续答对 2 次会自动移出。</div>` +
    Object.entries(byDeck).map(([did, ps]) => `<div class="section-title">${esc(get(did)?.data.name || "已删除")}</div><div class="card">
      <button class="small secondary" data-deck="${did}" style="width:100%;margin-bottom:6px">只练这个（${ps.length}）</button>
      ${ps.sort((a, b) => b.data.wrong - a.data.wrong).map(p => { const c = get(p.data.cardId); return `<div class="list-item"><a class="grow" href="#/card/${did}/${c.id}" style="color:inherit;text-decoration:none">${esc(qBody(c.data.q).replace(/\s+/g, " "))}</a><span class="tag bad">错${p.data.wrong}次</span><button class="small ghost" data-out="${p.id}">移出</button></div>`; }).join("")}</div>`).join("")
    : `<div class="empty">📕<br>错题本是空的<br>刷题时答错的题会自动放进来</div>`;
  $("#all")?.addEventListener("click", () => startStudy(null, "wrong"));
  view().querySelectorAll("[data-deck]").forEach(b => b.onclick = () => startStudy(b.dataset.deck, "wrong"));
  view().querySelectorAll("[data-out]").forEach(b => b.onclick = () => { const p = get(b.dataset.out); put("prog", p.id, { ...p.data, inBook: false }); wrongView(); });
}

function settingsView() {
  setBar("设置"); setTab("settings");
  const cloudReady = !!(sbUrl() && sbKey());
  view().innerHTML = `
    <div class="section-title">云同步</div>
    <div class="card" id="cloud">
      ${!cloudReady ? `<div class="muted">还没有配置云同步，现在数据只保存在这台设备上。</div>`
      : sbUser ? `<div>已登录：<b>${esc(sbUser.email)}</b></div><div class="row" style="margin-top:10px"><button id="sync">立即同步</button><button id="logout" class="ghost">退出登录</button></div>`
      : `<div class="muted">登录后，手机和电脑上的题库、进度、错题本会自动同步。</div>
        <label>邮箱</label><input id="em" type="email" autocomplete="username">
        <label>密码（至少 6 位）</label><input id="pw" type="password" autocomplete="current-password">
        <div class="row" style="margin-top:10px"><button id="login">登录</button><button id="signup" class="secondary">注册新账号</button></div>`}
      <details style="margin-top:12px"><summary>高级：Supabase 连接信息</summary>
        <label>Project URL</label><input id="sb-url" value="${esc(settings.supabaseUrl)}" placeholder="${esc(window.APP_CONFIG?.SUPABASE_URL || "https://xxxx.supabase.co")}">
        <label>anon / publishable key</label><input id="sb-key" value="${esc(settings.supabaseKey)}" placeholder="${window.APP_CONFIG?.SUPABASE_ANON_KEY ? "（已内置）" : ""}">
        <button id="sb-save" class="small secondary" style="margin-top:8px">保存连接信息</button>
      </details>
    </div>
    <div class="section-title">AI 解析</div>
    <div class="card" id="ai-card"></div>
    <div class="section-title">AI 提示词</div>
    <div class="card" id="prompt-card"></div>
    <div class="section-title">音效</div><div class="card"><label style="display:flex;justify-content:space-between">音效音量 <span id="sound-volume-value">${settings.soundVolume ?? 30}%</span></label><input id="sound-volume" type="range" min="0" max="100" step="1" value="${settings.soundVolume ?? 30}" style="width:100%"></div><div class="section-title">刷题</div>
    <div class="card"><label style="display:flex;gap:10px;align-items:center;color:var(--text);margin:0"><input id="shuf" type="checkbox" style="width:22px;height:22px" ${settings.shuffleOptions ? "checked" : ""}> 打乱选择题选项顺序</label></div>
    <div class="section-title">备份</div>
    <div class="card"><div class="row"><button id="export" class="secondary">导出备份</button><label class="btn secondary" style="margin:0">恢复备份<input id="restore" type="file" accept=".json" hidden></label></div></div>
    <div class="muted" style="text-align:center;margin-top:16px">刷题卡片 v1</div>`;
  $("#sb-save").onclick = async () => { settings.supabaseUrl = $("#sb-url").value.trim(); settings.supabaseKey = $("#sb-key").value.trim(); saveSettings(); await initSupabase(); settingsView(); toast("已保存"); };
  renderAISettings(); renderPromptSettings();
  $("#shuf").onchange = e => { settings.shuffleOptions = e.target.checked; saveSettings(); }; $("#sound-volume").oninput = e => { settings.soundVolume = +e.target.value; $("#sound-volume-value").textContent = settings.soundVolume + "%"; saveSettings(); };
  const auth = async (kind) => {
    const email = $("#em").value.trim(), password = $("#pw").value;
    if (!email || password.length < 6) return toast("请填写邮箱和至少 6 位密码");
    const fn = kind === "signup" ? sb.auth.signUp({ email, password }) : sb.auth.signInWithPassword({ email, password });
    const { data, error } = await fn;
    if (error) return toast((kind === "signup" ? "注册失败：" : "登录失败：") + error.message, 4000);
    if (!data.session) return toast("请到邮箱点确认链接，然后回来登录", 5000);
    sbUser = data.session.user; toast("登录成功，正在同步…"); await syncNow(); settingsView();
  };
  $("#login")?.addEventListener("click", () => auth("login"));
  $("#signup")?.addEventListener("click", () => auth("signup"));
  $("#sync")?.addEventListener("click", () => syncNow(true));
  $("#logout")?.addEventListener("click", async () => { await sb.auth.signOut(); sbUser = null; setDot(""); settingsView(); });
  $("#export").onclick = () => {
    const blob = new Blob([JSON.stringify([...items.values()].filter(live), null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `刷题备份-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  $("#restore").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const list = JSON.parse(await f.text()); putMany(list.filter(x => x.id && x.kind).map(x => ({ kind: x.kind, id: x.id, data: x.data }))); toast(`已恢复 ${list.length} 条`); }
    catch (err) { toast("文件无法识别"); }
  };
}

function renderPromptSettings() {
  const c = get("conf_prompts")?.data || {}; const P = prompts();
  const field = (k, label, h) => `<label>${label}</label><textarea id="pr-${k}" style="min-height:${h}px;font-family:inherit;font-size:15px">${esc(P[k])}</textarea>
    <div class="muted" style="display:flex;justify-content:space-between;margin-top:2px"><span>${(c[k] || "").trim() && c[k].trim() !== DEFAULT_PROMPTS[k] ? "已自定义" : "默认"}</span><a href="#" data-reset="${k}">恢复默认</a></div>`;
  $("#prompt-card").innerHTML = `<div class="muted">AI 讲解时会按这里的要求来。每个 session 还可以在 ⋯ → 设置 里单独加要求。</div>
    ${field("system", "AI 的角色和总体要求", 120)}
    ${field("choice", "选择题怎么讲", 90)}
    ${field("flash", "单词卡怎么讲", 90)}
    <button id="pr-save" style="width:100%;margin-top:10px">保存提示词</button>
    <div class="muted" style="margin-top:6px">改了提示词后，已经生成过的解析不会自动变，可以在解析下面点"重新生成"。</div>`;
  const save = () => {
    const data = {}; for (const k in DEFAULT_PROMPTS) { const v = $("#pr-" + k).value.trim(); data[k] = v === DEFAULT_PROMPTS[k] ? "" : v; }
    put("conf", "conf_prompts", data); toast("提示词已保存"); renderPromptSettings();
  };
  $("#pr-save").onclick = save;
  $("#prompt-card").querySelectorAll("[data-reset]").forEach(a => a.onclick = e => { e.preventDefault(); $("#pr-" + a.dataset.reset).value = DEFAULT_PROMPTS[a.dataset.reset]; save(); });
}
function usageKey(provider, base, model) {
  return JSON.stringify([provider, base.replace(/\/+$/, ""), model]);
}

async function saveCloudUsage(account, provider, model, input, output, cacheRead, cacheWrite) {
  if (!account?.client || !Number.isSafeInteger(input) || !Number.isSafeInteger(output)
      || input < 0 || output < 0 || input + output === 0) return;
  try {
    const { error } = await account.client.from("ai_token_usage").insert({
      user_id: account.userId,
      provider,
      model,
      input_tokens: input,
      output_tokens: output,
      cache_read_input_tokens: cacheRead ?? null,
      cache_write_input_tokens: cacheWrite ?? null,
    });
    if (error) console.warn("Token usage insert failed", error.code);
  } catch {
    console.warn("Token usage insert failed");
  }
}

function recordUsage(provider, base, model, usage) {
  const input = usage?.prompt_tokens;
  const output = usage?.completion_tokens;
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0 || input + output === 0) return;
  const key = usageKey(provider, base, model);
  const history = settings.usageHistory ||= {};
  history[key] = [...(history[key] || []).slice(-19), { input, output }];
  saveSettings();
}

async function fetchDeepSeekBalances(token) {
  if (!token) throw new Error("请先保存 DeepSeek API Key");
  let response;
  try {
    response = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
} catch {
  throw new Error("余额查询失败，请检查网络或前往 DeepSeek 控制台查看");
}
if (!response.ok) throw new Error("余额查询失败（HTTP " + response.status + "）");
const data = await response.json();
if (!Array.isArray(data.balance_infos)) throw new Error("服务商没有返回余额");
return data.balance_infos.map(b => ({ currency: b.currency, amount: Number(b.total_balance) }));
}

function deepSeekModel(model) {
  switch (model) {
    case "deepseek-chat": return { model: "deepseek-flash", thinking: { type: "disabled" } };
    case "deepseek-reasoner": return { model: "deepseek-flash", thinking: { type: "enabled" } };
    case "deepseek-v4-flash":
    case "deepseek-v4-flash-vision-exp": return { model: "deepseek-flash" };
    default: return { model };
  }
}

function estimateBalances(balances, provider, model, key, currency, cost) {
  // DeepSeek peak prices per million tokens. Assume no cache discount.
  const pricedModel = provider === "deepseek" ? deepSeekModel(model).model : "";
  const modelRates = Object.hasOwn(DEEPSEEK_ESTIMATE_RATES, pricedModel)
    ? DEEPSEEK_ESTIMATE_RATES[pricedModel] : null;
  const history = settings.usageHistory?.[key] || [];
  const sample = history.length ? history : [{ input: 1500, output: 1000 }];
  const valid = balances.filter(b => ["CNY", "USD"].includes(b.currency) && Number.isFinite(b.amount) && b.amount >= 0);
  if (!valid.length) throw new Error("服务商没有返回可用余额");
  return valid.map(b => {
    const manual = b.currency === currency && cost > 0;
    const rates = modelRates?.[b.currency];
    const average = manual ? cost : rates
      ? sample.reduce((sum, u) => sum + (u.input * rates[0] + u.output * rates[1]) / 1e6, 0) / sample.length
      : 0;
    const basis = manual ? "按填写的单次成本" : history.length ? "近期用量，按高峰无缓存价格" : "按典型用量和高峰无缓存价格";
    return { ...b, remaining: average > 0 ? Math.floor(b.amount / average) : null, basis };
  });
}

function formatBalance(balance) {
  return balance.currency + " " + balance.amount.toLocaleString("zh-CN", { maximumFractionDigits: 6 });
}

const DEEPSEEK_TOP_UP = "https://platform.deepseek.com/top_up";
const balanceLevels = new Map();

function currentUsageAccount() {
  const provider = PROVIDERS[settings.provider] ? settings.provider : "claude";
  const base = provider === "custom" ? settings.customBase : PROVIDERS[provider].base || "";
  return { provider, base, model: aiModel(), token: aiKey() };
}

function selectProgressBalance(balances, currency) {
  const preferred = balances.find(b => b.currency === currency);
  return (preferred?.amount > 0 ? preferred : balances.find(b => b.amount > 0)) ?? preferred ?? balances[0];
}

async function showRequestUsage(box, { provider, base, model, token }) {
  if (!box.isConnected) return;
  box.querySelector("[data-request-usage]")?.remove();
  const footer = document.createElement("div");
  footer.dataset.requestUsage = "";
  footer.className = "muted";
  footer.style.marginTop = "10px";
  const status = document.createElement("div");
  status.setAttribute("role", "status");
  footer.append(status);
  box.append(footer);

  const official = provider === "deepseek";
  const account = settings.manualBalances?.[usageKey(provider, base, "")];
  const key = usageKey(provider, base, model);
  const currency = account?.currency || "USD";
  if (!official && (account?.amount == null || account.amount === "")) {
    status.textContent = "余额与剩余次数可在「设置 → AI 解析」中手动估算";
    return;
  }

  let recharge;
  if (official) {
    recharge = document.createElement("a");
    recharge.href = DEEPSEEK_TOP_UP;
    recharge.target = "_blank";
    recharge.rel = "noopener noreferrer";
    recharge.style.display = "block";
    recharge.textContent = "前往 DeepSeek 充值 ↗";
    footer.append(recharge);
    status.textContent = "正在刷新余额…";
  }

  try {
    const balances = official
      ? await fetchDeepSeekBalances(token)
      : [{ currency, amount: Number(account.amount) }];
    if (!footer.isConnected || token !== aiKey() || provider !== currentUsageAccount().provider) return;
    const estimates = estimateBalances(balances, provider, model, key, currency, settings.manualCosts?.[key]);
    status.textContent = estimates.map(b =>
      (official ? "余额 " : "手动填写的余额 ") + formatBalance(b) +
      (b.remaining == null ? " · 未知单次成本，可在设置中填写" : " · 预计还能生成 " + b.remaining.toLocaleString("zh-CN") + " 次解说")
    ).join("；");

    if (recharge) {
      const b = selectProgressBalance(estimates, currency);
      const levelKey = JSON.stringify([token, b.currency]);
      const previous = balanceLevels.get(levelKey);
      // Start a new scale when a balance increase is observed.
      const max = !previous || b.amount > previous.amount ? b.amount : previous.max;
      balanceLevels.set(levelKey, { amount: b.amount, max });
      const progress = document.createElement("progress");
      progress.max = max || 1;
      progress.value = b.amount;
      progress.style.cssText = "display:block;width:100%;cursor:pointer";
      progress.title = b.currency + " 余额进度";
      progress.setAttribute("aria-label", progress.title);
      recharge.prepend(progress);
    }
  } catch (error) {
    status.textContent = error.message;
  }
}

function renderAPIUsage(box, provider, model) {
  const base = provider === "custom" ? settings.customBase : PROVIDERS[provider].base || "";
  const account = usageKey(provider, base, "");
  const key = usageKey(provider, base, model);
  const manualBalances = settings.manualBalances ||= {};
  const manualCosts = settings.manualCosts ||= {};
  const saved = manualBalances[account] || {};
  const official = provider === "deepseek";
  const button = box.querySelector("#usage-refresh");
  const result = box.querySelector("#usage-result");
  const costInput = box.querySelector("#usage-cost");
  const currencyInput = box.querySelector("#usage-currency");
  const balanceInput = box.querySelector("#usage-balance");
  costInput.value = manualCosts[key] ?? "";
  currencyInput.value = saved.currency || "USD";
  if (balanceInput) balanceInput.value = saved.amount ?? "";
  button.onclick = async () => {
    if (!costInput.reportValidity() || (balanceInput && !balanceInput.reportValidity())) return;
    const cost = costInput.valueAsNumber;
    const currency = currencyInput.value;
    if (Number.isFinite(cost) && cost > 0) manualCosts[key] = cost;
    else delete manualCosts[key];
    if (balanceInput) manualBalances[account] = { amount: balanceInput.value, currency };
    else manualBalances[account] = { currency };
    saveSettings();
    button.disabled = true;
    result.textContent = official ? "正在查询…" : "";
    try {
      let balances;
      if (official) {
        const token = aiKey();
        balances = await fetchDeepSeekBalances(token);
      } else {
        if (!balanceInput.value) throw new Error("此服务商尚未接入余额查询，请输入控制台余额");
        balances = [{ currency, amount: balanceInput.valueAsNumber }];
      }
      result.textContent = estimateBalances(balances, provider, model, key, currency, cost).map(b => {
        const label = official ? "账户余额" : "手动填写的余额";
        const estimate = b.remaining == null ? "，填写同币种的单次成本即可估算"
          : "，预计约 " + b.remaining.toLocaleString("zh-CN") + " 次（" + b.basis + "）";
        return label + " " + formatBalance(b) + estimate;
      }).join("；");
    } catch (error) {
      result.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}

const DEEPSEEK_ESTIMATE_RATES = {
  "deepseek-flash": { USD: [0.3, 1.2], CNY: [2, 8] },
  "deepseek-v4-pro": { USD: [1.32, 3.96], CNY: [9, 27] },
};

function renderAISettings() {
  const box = $("#ai-card"); const prov = PROVIDERS[settings.provider] ? settings.provider : "claude"; const P = PROVIDERS[prov];
  const cur = aiModel();
  const preset = P.models.some(m => m[0] === cur);
  box.innerHTML = `
    <label>用哪家的 AI</label><select id="prov">${Object.entries(PROVIDERS).map(([k, v]) => `<option value="${k}" ${k === prov ? "selected" : ""}>${v.name}</option>`).join("")}</select>
    ${prov === "custom" ? `<label>接口地址（Base URL，一般以 /v1 结尾）</label><input id="base" value="${esc(settings.customBase)}" placeholder="https://…/v1">` : ""}
    <label>API Key（只保存在这台设备上）</label><input id="key" type="password" value="${esc(aiKey())}" placeholder="${P.keyHint}">
    ${P.keyUrl ? `<div class="muted" style="margin-top:4px">在这里申请：${P.keyUrl}</div>` : ""}
    <label>模型</label>
    ${P.models.length ? `<select id="model">${P.models.map(([v, t]) => `<option value="${v}" ${cur === v ? "selected" : ""}>${t}</option>`).join("")}<option value="__other" ${!preset && cur ? "selected" : ""}>其他（手动填写）</option></select>` : ""}
    <input id="model-txt" value="${esc(preset ? "" : cur)}" placeholder="模型名称，例如 qwen-plus" style="margin-top:6px;${P.models.length && preset ? "display:none" : ""}">
    ${prov === "claude" ? `<label>思考深度</label><select id="effort">${[["low", "快速（推荐）"], ["medium", "标准"], ["high", "深入（更慢）"]].map(([v, t]) => `<option value="${v}" ${settings.effort === v ? "selected" : ""}>${t}</option>`).join("")}</select>` : ""}
    <div class="muted" style="margin-top:8px">同一道题的解析会被保存，第二次查看不再花钱。</div>
    <button id="key-save" style="width:100%;margin-top:10px">保存</button>
    <label>API 余额与预计剩余请求</label>
    <div class="muted">按已保存的模型查询。实际消耗随题目长度和回答长度变化。</div>
    <label for="usage-currency">手动估算币种</label><select id="usage-currency"><option>USD</option><option>CNY</option></select>
    ${prov === "deepseek" ? "" : `<label for="usage-balance">控制台余额</label><input id="usage-balance" type="number" min="0" step="any" inputmode="decimal">`}
    <label for="usage-cost">单次成本（可手动填写）</label><input id="usage-cost" type="number" min="0" step="any" inputmode="decimal">
    <button id="usage-refresh" style="width:100%;margin-top:10px">${prov === "deepseek" ? "查询余额并估算" : "计算剩余次数"}</button>
    <div id="usage-result" class="muted" role="status" style="margin-top:8px"></div>`;
  renderAPIUsage(box, prov, cur);
  $("#prov").onchange = e => { settings.provider = e.target.value; saveSettings(); renderAISettings(); };
  $("#model")?.addEventListener("change", e => { $("#model-txt").style.display = e.target.value === "__other" ? "" : "none"; });
  $("#key-save").onclick = () => {
    settings.keys = { ...(settings.keys || {}), [prov]: $("#key").value.trim() };
    const sel = $("#model")?.value; const m = !sel || sel === "__other" ? $("#model-txt").value.trim() : sel;
    settings.models = { ...(settings.models || {}), [prov]: m };
    if (prov === "custom") settings.customBase = $("#base").value.trim();
    if ($("#effort")) settings.effort = $("#effort").value;
    saveSettings(); renderAISettings(); toast("已保存");
  };
}

// ---------- router ----------
function route() {
  const h = location.hash.replace(/^#\/?/, "").split("/");
  if (h[0] !== "study") document.body.classList.remove("studying");
  window.scrollTo(0, 0);
  switch (h[0]) {
    case "deck": return deckView(h[1]);
    case "deck-edit": return deckEditView(h[1]);
    case "card": return cardEditView(h[1], h[2]);
    case "import": return importView(h[1]);
    case "study": return studyView();
    case "wrong": return wrongView();
    case "settings": return settingsView();
    default: return homeView();
  }
}

async function seed() {
  const list = [];
  SAMPLE_DECKS.forEach((d, di) => {
    if (items.has(d.id)) return;
    list.push({ kind: "deck", id: d.id, data: { name: d.name, subject: d.subject, newPerDay: 20, sessionSize: 20, order: di } });
    d.cards.forEach((c, i) => list.push({ kind: "card", id: `${d.id}-${i}`, data: { ...c, note: c.note || "", deckId: d.id, order: i } }));
  });
  putMany(list);
}

async function main() {
  idb = await openDB();
  for (const it of await idbAll()) items.set(it.id, it);
  await initSupabase();
  if (sb && sbUser) await syncNow();
  if (![...items.values()].some(it => it.kind === "deck")) await seed();
  window.addEventListener("hashchange", route);
  route();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") syncNow(); else scheduleSync(500); });
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    const hadSW = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(r => r.update()).catch(() => {});
    // 有新版本时自动刷新一次
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadSW && !reloaded && !document.body.classList.contains("studying")) { reloaded = true; location.reload(); } });
  }
}
main().catch(e => { console.error(e); view().innerHTML = `<div class="empty">启动失败：${esc(e.message)}</div>`; });
