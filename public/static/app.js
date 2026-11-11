const LS_KEY = 'vocab_agent_v33';
const AUTO_REVIEW_ID = 'auto_review';
const AUTO_REVIEW_NAME = '🔄 自动复习池';
let S = {
  words: [], learnList: [], learnPool: [],
  favFolders: [{ id: 'default', name: '主收藏', words: [] }],
  currentFavId: 'default',
  favPool: [], favSeen: [], 
  mode: 'learn', current: null, showZh: false, alwaysZh: false, autoClean: false,
  apiKeys: [], currentApiId: null, selectMode: false, selectedWords: [], theme: 'dark',
  favManageSelected: [], historyList: []
};
let isTextCleaned = false;
let learnManageSelected = [];
const $ = id => document.getElementById(id);

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

let toastTimer = null;
function showToast(msg) {
  let el = $('appToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'appToast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

function openSheet(id) {
  const el = $(id);
  if (!el) return;
  el.classList.add('show');
  el.setAttribute('aria-hidden', 'false');
}
function closeSheet(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('show');
  el.setAttribute('aria-hidden', 'true');
}

// ================= Web Crypto AES 加密模块 =================
const SECRET_KEY = "vocab_agent_secret_key_2026";
async function getCryptoKey() {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey("raw", enc.encode(SECRET_KEY), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encryptText(text) {
  if (!text) return "";
  try {
    const key = await getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv); combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch (e) { return text; }
}
async function decryptText(encryptedBase64) {
  if (!encryptedBase64) return "";
  try {
    const key = await getCryptoKey();
    const combined = new Uint8Array(atob(encryptedBase64).split("").map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12); const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch (e) { return encryptedBase64; }
}
// =============================================================

async function save(){ 
  try{ 
    const dataToSave = JSON.parse(JSON.stringify(S)); 
    if (dataToSave.apiKeys && dataToSave.apiKeys.length > 0) {
      for (let k of dataToSave.apiKeys) {
        if (k.key && !k.isEncrypted) { k.key = await encryptText(k.key); k.isEncrypted = true; }
      }
    }
    localStorage.setItem(LS_KEY, JSON.stringify(dataToSave)); 
  }catch(e){ console.error(e); } 
}

async function load(){
  try{
    const r = localStorage.getItem(LS_KEY);
    let legacyReview = [];
    if(r) {
      let parsed = JSON.parse(r);
      if (parsed.favs && !parsed.favFolders) {
        const newFolders = [];
        parsed.favs.forEach((arr, i) => {
          if (arr && arr.length > 0) newFolders.push({ id: 'f' + i, name: '夹子 ' + (i+1), words: arr });
        });
        if (newFolders.length === 0) newFolders.push({ id: 'default', name: '主收藏', words: [] });
        parsed.favFolders = newFolders;
        parsed.currentFavId = newFolders[0].id;
        delete parsed.favs; delete parsed.currentFavIndex;
      }

      if (parsed.apiKeys && parsed.apiKeys.length > 0) {
        for (let k of parsed.apiKeys) {
          if (k.isEncrypted) { k.key = await decryptText(k.key); k.isEncrypted = false; }
        }
      }
      legacyReview = Array.isArray(parsed.reviewPool) ? parsed.reviewPool : [];
      S = Object.assign(S, parsed);
      delete S.reviewPool;
    }

    if (!Array.isArray(S.favFolders) || S.favFolders.length === 0) {
      S.favFolders = [{ id: 'default', name: '主收藏', words: [] }];
      S.currentFavId = 'default';
    }
    if (!Array.isArray(S.historyList)) S.historyList = [];

    // 旧版隐藏复习池一次性迁入系统收藏夹，然后移除旧字段，避免双写。
    const hadAuto = S.favFolders.some(f => f.id === AUTO_REVIEW_ID);
    ensureAutoReviewFolder(legacyReview);
    if (!r || legacyReview.length > 0 || !hadAuto) await save();
  }catch(e){ console.error(e); }
}

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function generateId() { return Math.random().toString(36).substring(2, 8); }
function getCurrentFav() {
  let f = S.favFolders.find(f => f.id === S.currentFavId);
  if (!f) { f = S.favFolders[0]; S.currentFavId = f.id; }
  return f;
}

function ensureAutoReviewFolder(legacyWords = []) {
  if (!Array.isArray(S.favFolders)) S.favFolders = [];
  let folder = S.favFolders.find(f => f.id === AUTO_REVIEW_ID);
  if (!folder) {
    folder = { id: AUTO_REVIEW_ID, name: AUTO_REVIEW_NAME, words: [] };
    S.favFolders.unshift(folder);
  } else {
    folder.name = AUTO_REVIEW_NAME;
    if (!Array.isArray(folder.words)) folder.words = [];
    const idx = S.favFolders.indexOf(folder);
    if (idx > 0) {
      S.favFolders.splice(idx, 1);
      S.favFolders.unshift(folder);
    }
  }
  (legacyWords || []).forEach(w => {
    if (w && w.en && !folder.words.some(x => x.en === w.en)) folder.words.push(w);
  });
  return folder;
}

function getAutoReviewFolder() {
  return ensureAutoReviewFolder();
}

// 收藏夹锁定集合：任意收藏夹（含自动复习池）里的词都视为已锁定。
function getFavWordSet() {
  const set = new Set();
  (S.favFolders || []).forEach(folder => {
    ((folder && folder.words) || []).forEach(w => { if (w && w.en) set.add(w.en); });
  });
  return set;
}

// 待学数量 = 总词数 - 已学完 - Learn 队列 - 任意收藏夹（按并集去重）。
function getUnlearnedCount() {
  const learnSet = new Set((S.learnList || []).map(w => w && w.en).filter(Boolean));
  const favSet = getFavWordSet();
  return (S.words || []).filter(w => w && w.isLearned !== true && !learnSet.has(w.en) && !favSet.has(w.en)).length;
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', S.theme);
  if (S.theme === 'light') { $('themeLight').classList.add('active'); $('themeDark').classList.remove('active'); }
  else { $('themeDark').classList.add('active'); $('themeLight').classList.remove('active'); }
}
$('themeLight').addEventListener('click', () => { S.theme = 'light'; save(); applyTheme(); });
$('themeDark').addEventListener('click', () => { S.theme = 'dark'; save(); applyTheme(); });

// ===== parseLines start =====
// 通用背单词文本解析：不针对任何单一品牌/数据源，尽量从脏 PDF/Word 文本中还原 {en, phonetic, zh}。
// 下面两条注释标记同时供 Node 测试脚本按区间抽取真实函数，避免测试代码和线上代码分叉。
const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/;
const POS_WORDS = ['n', 'v', 'vt', 'vi', 'adj', 'adv', 'prep', 'conj', 'pron', 'num', 'art', 'int', 'aux', 'abbr', 'phr', 'pl', 'modal'];
const POS_SET = new Set(POS_WORDS);
const POS_ALT = '(?:' + POS_WORDS.join('|') + ')';
const POS_START_RE = new RegExp('^\\s*(?:' + POS_ALT + '\\.\\s*(?:[&/,，、]\\s*)?)+', 'i');
const POS_ONLY_RE = new RegExp('^(?:' + POS_ALT + '\\.\\s*(?:[&/,，、]\\s*)?)+$', 'i');
const STRONG_EVIDENCE_RE = new RegExp('^\\s*(?:[\\[\\(（\\/][^\\]\\)\\/]{0,80}[\\]\\)\\/]|' + POS_ALT + '\\.)', 'i');
const HEAD_RE = new RegExp(
  "[A-Za-z][A-Za-z'’\\-]*(?:\\s+(?!" + POS_ALT + "\\.)(?!" + POS_ALT + "\\s*[\\u4e00-\\u9fff])[A-Za-z][A-Za-z'’\\-]*){0,3}",
  'g'
);
const SENTENCE_START_WORDS = new Set([
  'he', 'she', 'it', 'they', 'we', 'you', 'i', 'the', 'a', 'an',
  'this', 'that', 'these', 'those', 'his', 'her', 'their', 'my',
  'our', 'your', 'its', 'there', 'here'
]);
const FUNCTION_WORDS = new Set([
  'he', 'she', 'it', 'they', 'we', 'you', 'i', 'the', 'a', 'an',
  'this', 'that', 'these', 'those', 'his', 'her', 'their', 'my',
  'our', 'your', 'its', 'there', 'here', 'and', 'or', 'but', 'if',
  'when', 'while', 'because', 'so', 'not', 'no', 'is', 'are', 'was',
  'were', 'be', 'been', 'am', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'can', 'could', 'should', 'may', 'might',
  'must', 'as', 'than', 'then'
]);

function hasCJK(s) {
  return CJK_RE.test(String(s || ''));
}

function normalizeRawText(text) {
  let s = String(text == null ? '' : text);
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(?:p|div|tr|li|h[1-6]|section|article|table|ul|ol|dl|blockquote)\s*>/gi, '\n');
  s = s.replace(/<\/t[dh]\s*>/gi, '\t');
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/&nbsp;|&#160;/gi, ' ');
  s = s.replace(/&amp;/gi, '&');
  s = s.replace(/&lt;/gi, '<');
  s = s.replace(/&gt;/gi, '>');
  s = s.replace(/&quot;/gi, '"');
  s = s.replace(/&#39;|&apos;/gi, "'");
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  // 全角字母/数字 + 结构化标点统一成半角；保留中文逗号、分号、问号等中文标点
  s = s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  s = s.replace(/[（）：．／［］｛｝－＋＠｜～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  s = s.replace(new RegExp("[" + String.fromCharCode(0x3000, 0x00A0, 0x2000) + "-" + String.fromCharCode(0x200B, 0x202F, 0x205F) + "]", "g"), " ");
  s = s.replace(/\t+/g, '\t');
  s = s.replace(/[ \f\v]+/g, ' ');
  return s;
}

function stripNumbering(line) {
  let s = String(line || '').trim();
  s = s.replace(/^[\s①-⑳❶-➓]+/, '');
  s = s.replace(/^[\(（\[【]\s*\d{1,4}\s*[\)）\]】]\s*/, '');
  s = s.replace(/^\d{1,4}\s*[.、)）:：\-—]\s*/, '');
  s = s.replace(/^\d{2,4}\s+/, '');
  return s.trim();
}

function preCleanLine(line) {
  let s = String(line || '').replace(/\t+/g, ' ').trim();
  s = stripNumbering(s);
  s = s.replace(/^(?:单词|词条|英文|word)\s*[:：]\s*/i, '');
  s = s.replace(/(?:释义|中文|词义|meaning)\s*[:：]\s*/gi, '');
  s = s.replace(/(?:音标|phonetic)\s*[:：]\s*/gi, '');
  s = s.replace(/^(?:unit|lesson|chapter|section|part)\s*\d+\s*[:.\-—–]*\s*/i, '');
  s = s.replace(/^(?:word\s*list|vocabulary|list)\s*\d+\s*[:.\-—–]*\s*/i, '');
  s = s.replace(/^(?:墨墨背单词|考研词汇|考研英语|四级词汇|六级词汇|雅思词汇|托福词汇|GRE词汇|专四词汇|专八词汇|高频词汇|核心词汇|单词表|词汇表)\s*[|:：\-—–]*\s*/i, '');
  return s.trim();
}

function isNoiseLine(line) {
  const s = String(line || '').trim();
  if (!s) return true;
  if (/^[\s\-—–_=*·•.。,，;；:：!！?？'"“”‘’()（）\[\]【】<>《》]+$/.test(s)) return true;
  if (/^[①-⑳❶-➓]$/.test(s)) return true;
  if (/^[-—–\s]*\d{1,4}[-—–\s]*$/.test(s)) return true;
  if (/^\d{1,4}\s*[.、)）]?\s*$/.test(s)) return true;
  if (/^第\s*\d+\s*页(?:\s*[/,，]?\s*共\s*\d+\s*页)?$/.test(s)) return true;
  if (/^page\s*\d+(?:\s*(?:of|\/)\s*\d+)?$/i.test(s)) return true;
  if (/^\d+\s*\/\s*\d+$/.test(s)) return true;
  if (/^(?:unit|lesson|chapter|section|part)\s*\d+$/i.test(s)) return true;
  if (/^(?:word\s*list|vocabulary|english\s+vocabulary)(?:\s*\d+)?$/i.test(s)) return true;
  if (/^list\s*\d+$/i.test(s)) return true;

  const compact = s.replace(/\s+/g, '');
  if (!/^[A-Za-z]/.test(compact) && compact.length <= 30 &&
      /(?:墨墨背单词|考研词汇|考研英语|四级词汇|六级词汇|雅思词汇|托福词汇|GRE词汇|专四词汇|专八词汇|高频词汇|核心词汇|单词表|词汇表|词汇书|背单词)/i.test(compact)) return true;
  if (!/^[A-Za-z]/.test(s) && s.length <= 40 &&
      /(?:微信公众号|公众号|扫码|二维码|QQ群|微信群|更多资料|仅供学习|关注我们|侵权|转载)/.test(s)) return true;
  return false;
}

function isPhoneticOnly(line) {
  const s = String(line || '').trim();
  if (!s || hasCJK(s) || s.length > 80) return false;
  const wrapped = s.match(/^[\[\(\/]([^\]\)\/]{1,78})[\]\)\/]$/);
  if (wrapped) {
    const inner = wrapped[1].trim();
    if (/[ˈˌəɛɔɪʊæɑɒʌθðʃʒŋɜɞɐɨʉɯɤɵøœɶː]/.test(inner)) return true;
    if (!/[A-Za-z]/.test(inner)) return true;
    if (/^[A-Za-z'’\-\s]+$/.test(inner) && inner.length <= 20) {
      const parts = inner.split(/[\s\-]+/).filter(Boolean);
      if (parts.every(w => w.length <= 3)) return true;
    }
    return false;
  }
  return /[ˈˌəɛɔɪʊæɑɒʌθðʃʒŋɜɞɐɨʉɯɤɵøœɶː]/.test(s) && !/[A-Za-z]{4,}/.test(s);
}

function isPosOnly(line) {
  return POS_ONLY_RE.test(String(line || '').trim());
}

function hasDefEvidence(after, atStart) {
  let s = String(after || '').replace(/^[\s:：\-—–,，;；|]+/, '');
  if (atStart) s = s.replace(/^\.\s*/, '');
  if (!s) return false;
  const ph = s.match(/^[\[\(（\/][^\]）\/]{0,80}[\]）\/]/);
  if (ph && !hasCJK(ph[0])) return true;
  if (POS_START_RE.test(s)) return true;
  if (CJK_RE.test(s.charAt(0))) return true;
  if (/^[\(（【\[]\s*[^\)）】\]]{0,12}[一-鿿]/.test(s)) return true;
  return false;
}

function isValidHead(en, after, atStart) {
  const s = String(en || '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 40) return false;
  if (!/^[A-Za-z]/.test(s)) return false;
  if (CJK_RE.test(s) || /\d/.test(s)) return false;
  if (/[^A-Za-z'’\- ]/.test(s)) return false;
  const words = s.split(' ');
  if (!words.length || words.length > 4) return false;
  if (words.some(w => !w || /^['’\-]/.test(w) || /['’\-]$/.test(w))) return false;
  if (s.length === 1 && !/^[aAiI]$/.test(s)) return false;
  if (words.length === 1 && POS_SET.has(s.toLowerCase()) && /^\s*\./.test(String(after || ''))) return false;
  if (/([A-Za-z])\1{3,}/.test(s)) return false;

  const first = words[0].toLowerCase();
  if (words.length > 1 && SENTENCE_START_WORDS.has(first)) {
    if (!atStart || !STRONG_EVIDENCE_RE.test(String(after || ''))) return false;
  }
  if (!atStart && words.length === 1 && FUNCTION_WORDS.has(first)) return false;
  if (!hasDefEvidence(after, atStart)) return false;
  return true;
}

function extractBareEnglish(line) {
  const s = preCleanLine(line);
  if (!/^[A-Za-z][A-Za-z'’\-]*(?:\s+[A-Za-z][A-Za-z'’\-]*){0,2}$/.test(s)) return '';
  if (s.length > 40) return '';
  const words = s.split(/\s+/);
  if (words.length > 1 && SENTENCE_START_WORDS.has(words[0].toLowerCase())) return '';
  if (words.length === 1 && /^(?:Unit|Lesson|Chapter|Page|Word|List|Vocabulary|Index|Contents|Appendix)$/.test(s)) return '';
  if (/([A-Za-z])\1{3,}/.test(s)) return '';
  if (words.length === 1 && POS_SET.has(s.toLowerCase()) && !/^(?:art|modal)$/i.test(s)) return '';
  return s;
}

function findHead(line, from, allowAtStart) {
  HEAD_RE.lastIndex = Math.max(0, from);
  let m;
  while ((m = HEAD_RE.exec(line))) {
    const start = m.index;
    const raw = m[0];
    const end = start + raw.length;
    if (start > 0 && /[A-Za-z'’\-]/.test(line.charAt(start - 1))) {
      HEAD_RE.lastIndex = start + 1;
      continue;
    }
    const before = line.slice(0, start).replace(/\s+$/, '');
    const isAtStart = before.length === 0;
    if (!isAtStart) {
      const prev = before.slice(-1);
      const prevOk = CJK_RE.test(prev) || /[0-9，,。；;、:：|/()（）\[\]【】\-—–]/.test(prev);
      if (!prevOk) {
        HEAD_RE.lastIndex = start + 1;
        continue;
      }
    }
    const atStart = isAtStart && !!allowAtStart;
    if (!isValidHead(raw, line.slice(end), atStart)) {
      HEAD_RE.lastIndex = start + 1;
      continue;
    }
    return { en: raw.replace(/\s+/g, ' ').trim(), start: start, end: end };
  }
  return null;
}

function extractHeadOnly(line) {
  const s = preCleanLine(line);
  const head = findHead(s, 0, true);
  if (!head) return null;
  const extra = s.slice(head.end).trim();
  if (hasCJK(extra)) return null;
  return { en: head.en, extra: extra };
}

function cutChineseDefinition(zhRaw) {
  let s = String(zhRaw || '');
  const markerRe = /(?:【[^】]{1,12}】|\[(?:例|考|记|搭|派|同|反|近|辨|真)[^\]]{0,30}\]|(?:例句|例词|派生词?|同义词|反义词|近义词|搭配|短语|记忆法?|联想|扩展|辨析|真题|考点|用法|注意)\s*[:：])/;
  const mk = s.match(markerRe);
  if (mk && mk.index > 0) s = s.slice(0, mk.index);
  const bareEx = s.search(/例句/);
  if (bareEx > 0) s = s.slice(0, bareEx);

  for (let i = 1; i < s.length; i++) {
    if (!/[A-Za-z]/.test(s.charAt(i))) continue;
    if (/[A-Za-z]/.test(s.charAt(i - 1))) continue;
    const before = s.slice(0, i).replace(/\s+$/, '');
    const prev = before.charAt(before.length - 1);
    const prevOk = before.length === 0 || CJK_RE.test(prev) || /[0-9，,。；;、:：|/()（）\[\]【】\-—–]/.test(prev);
    if (!prevOk) continue;

    const tail = s.slice(i);
    if (/^(?:e\.g|i\.e|etc|vs)\./i.test(tail)) continue;
    if (/^[A-Za-z]\.(?:[A-Za-z]\.)+/.test(tail)) continue;
    const w = tail.match(/^[A-Za-z][A-Za-z'’\-]*/);
    if (w && /^[A-Z]{1,5}$/.test(w[0]) && /^\s*[一-鿿]/.test(tail.slice(w[0].length))) continue;
    const h = findHead(s, i, false);
    if (h && h.start === i) return { zh: s.slice(0, i), next: i };
    return { zh: s.slice(0, i), next: -1 };
  }
  return { zh: s, next: Infinity };
}

function sanitizeEn(en) {
  let s = String(en || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[^A-Za-z]+/, '');
  s = s.replace(/[^A-Za-z'’\-]+$/, '');
  return s.replace(/\s+/g, ' ').trim();
}

function sanitizeZh(zh) {
  let s = String(zh || '').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^\s*[\-—–,，;；:：|]+\s*/, '');
  s = s.replace(/[\[\(（\/][^\]）\/]{0,80}[\]）\/]/g, m => (hasCJK(m) ? m : ' '));
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/[\s,，;；、:：\-—–]+$/, '').trim();
  if (!hasCJK(s)) return '';
  return s;
}

function sanitizePhonetic(phonetic) {
  let s = String(phonetic || '').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > 80) s = s.slice(0, 80).trim();
  return s;
}

function parseLineEntries(rawLine) {
  const entries = [];
  const line = preCleanLine(rawLine);
  if (!line) return entries;

  let cursor = 0;
  let guard = 0;
  while (cursor < line.length && guard++ < 30) {
    const head = findHead(line, cursor, true);
    if (!head) break;

    let after = line.slice(head.end);
    let consumed = 0;

    // 词后可能有多组音标（英音/美音）：跳过全部，同时提取 [] / // 形式存入 phonetic。
    // 圆括号形式仍只跳过不存，避免把 (v.) 这类词性说明误当音标。
    const phonetics = [];
    let phGuard = 0;
    while (phGuard++ < 4) {
      const ph = after.slice(consumed).match(/^\s*([\[\(（\/][^\]）\/]{0,80}[\]）\/])\s*/);
      if (!ph || hasCJK(ph[1])) break;
      const group = ph[1].trim();
      if (/^\[[^\]]+\]$/.test(group) || /^\/[^\/]+\/$/.test(group)) {
        phonetics.push(group);
      }
      consumed += ph[0].length;
    }

    let pos = '';
    const posM = after.slice(consumed).match(POS_START_RE);
    if (posM) {
      pos = posM[0].trim();
      consumed += posM[0].length;
    }

    const rest = after.slice(consumed);
    const cjkIdx = rest.search(CJK_RE);
    if (cjkIdx < 0) {
      cursor = head.end;
      continue;
    }

    const zhRaw = rest.slice(cjkIdx);
    const cut = cutChineseDefinition(zhRaw);
    const zh = sanitizeZh((pos ? pos + ' ' : '') + cut.zh);
    if (zh) entries.push({ en: head.en, phonetic: sanitizePhonetic(phonetics.join(' ')), zh: zh });

    if (cut.next === -1 || cut.next === Infinity) break;
    const nextAbs = head.end + consumed + cjkIdx + cut.next;
    if (nextAbs <= head.start) break;
    cursor = nextAbs;
  }
  return entries;
}

function parseLines(text) {
  if (text == null || text === '') return [];
  const lines = normalizeRawText(text).split(/\r?\n/);
  const out = [];
  const byKey = new Map();
  let pending = null;

  const push = (en, zh, phonetic) => {
    en = sanitizeEn(en);
    zh = sanitizeZh(zh);
    phonetic = sanitizePhonetic(phonetic);
    if (!en || !zh) return;
    if (!/^[A-Za-z][A-Za-z'’\- ]*$/.test(en)) return;
    if (CJK_RE.test(en) || /\d/.test(en)) return;
    if (en.length > 40 || en.split(/\s+/).length > 4) return;
    const key = en.toLowerCase().replace(/’/g, "'");
    const prev = byKey.get(key);
    if (prev) {
      // 同一单词重复出现时：先出现的没音标，就用后出现的音标补全。
      if (!prev.phonetic && phonetic) prev.phonetic = phonetic;
      return;
    }
    const item = { en: en, phonetic: phonetic || '', zh: zh };
    byKey.set(key, item);
    out.push(item);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || isNoiseLine(line)) continue;

    // 纯英文词条行先挂起，等下一行出现音标/中文再合并
    const bare = extractBareEnglish(line);
    if (bare) {
      pending = { en: bare, extra: [] };
      continue;
    }

    if (isPhoneticOnly(line)) {
      if (pending) pending.extra.push(line);
      continue;
    }

    if (!hasCJK(line)) {
      const headOnly = extractHeadOnly(line);
      if (headOnly) {
        pending = { en: headOnly.en, extra: headOnly.extra ? [headOnly.extra] : [] };
      } else if (pending && isPosOnly(line)) {
        pending.extra.push(line);
      }
      continue;
    }

    let combined = line;
    if (pending) {
      const lineHasHead = !!findHead(preCleanLine(line), 0, true);
      if (!lineHasHead) {
        combined = pending.en + ' ' + pending.extra.join(' ') + ' ' + line;
      }
      pending = null;
    }

    const entries = parseLineEntries(combined);
    for (const e of entries) push(e.en, e.zh, e.phonetic);
  }

  return out;
}
// ===== parseLines end =====
function renderPreview(){
  const list = parseLines($('ta').value);
  if (!list.length) { $('preview').innerHTML = ''; return; }
  const withPhonetic = list.filter(w => w.phonetic).length;
  const names = list.slice(0, 5).map(w => w.en + (w.phonetic ? ' ' + w.phonetic : '')).join(' / ');
  $('preview').textContent = `解析到 ${list.length} 个词（${withPhonetic} 个带音标）：${names}` + (list.length > 5 ? ' ...' : '');
}

function setPhonetic(value) {
  const el = $('phonetic');
  const text = String(value || '').trim();
  el.textContent = text;
  el.classList.toggle('hide', !text);
}

function draw(){
  if(S.mode === 'learn'){
    if(S.learnList.length === 0){ S.current = null; $('en').textContent = 'Learn 列表为空'; $('zh').classList.remove('hide'); $('zh').textContent = '去“词库”随机抽取单词'; setPhonetic(''); return; }
    if(S.learnPool.length === 0){ $('en').textContent = '🎉 本轮完成'; $('zh').classList.remove('hide'); $('zh').textContent = '点屏幕重新洗牌'; setPhonetic(''); return; }
    const i = Math.floor(Math.random()*S.learnPool.length); S.current = S.learnPool.splice(i,1)[0];
  } else if (S.mode === 'fav') {
    const curFolder = getCurrentFav();
    if(curFolder.words.length === 0){ $('en').textContent = '夹子是空的'; $('zh').textContent = '去背单词吧'; $('zh').classList.remove('hide'); S.current = null; setPhonetic(''); render(); return; }
    if(S.favPool.length === 0){ S.favPool = shuffle(curFolder.words.slice()); S.favSeen = []; }
    const i = Math.floor(Math.random()*S.favPool.length); S.current = S.favPool.splice(i,1)[0]; 
  }
  S.showZh = false; $('zh').classList.add('hide'); render(); save();
}

// 🌟 封装“下一个”的逻辑
function nextWord() {
  // 新一轮开始（抽取池为空后重洗）时清空历史栈，避免左键回退跨越轮次。
  let newRound = false;
  if(S.mode === 'learn' && S.learnPool.length===0 && S.learnList.length>0) {
    S.learnPool = shuffle(S.learnList.slice());
    // 自动复习池：每轮重洗时随机打乱；它不会被“清空 Learn”删除。
    shuffle(getAutoReviewFolder().words);
    newRound = true;
  }
  if(S.mode === 'fav' && S.favPool.length===0 && getCurrentFav().words.length>0) {
    S.favPool = shuffle(getCurrentFav().words.slice());
    newRound = true;
  }
  if (newRound) S.historyList = [];
  else if (S.current) S.historyList.push(S.current);
  draw();
}

// 点击左半边 / 方向键左：回退到历史栈中的上一个词。
function goBackCard() {
  if (S.mode !== 'learn' && S.mode !== 'fav') return;
  if (!S.historyList.length) { showToast('已经是第一个单词啦'); return; }
  S.current = S.historyList.pop();
  S.showZh = false;
  $('zh').classList.add('hide');
  render();
  save();
}

// 点击右半边 / 空格 / 方向键右：未显示中文则显示，已显示则下一个。
function advanceCard(withAnim) {
  if (S.current == null) return;
  if (withAnim) {
    const cardEl = $('card'); cardEl.style.transform = 'scale(0.98)'; setTimeout(() => { cardEl.style.transform = ''; }, 100);
  }
  if (!S.showZh && !S.alwaysZh) {
    S.showZh = true; $('zh').classList.remove('hide'); save();
  } else {
    S.showZh = false; $('zh').classList.add('hide');
    requestAnimationFrame(() => { nextWord(); });
  }
}

function updateTabs() {
  $('tabLearn').classList.toggle('active', S.mode === 'learn' || S.mode === 'learnManage');
  $('tabTable').classList.toggle('active', S.mode === 'table');
  $('tabFav').classList.toggle('active', S.mode === 'favList' || S.mode === 'favManage' || S.mode === 'fav');
}

function render(){
  updateTabs();
  $('mainCard').style.display = (S.mode === 'learn' || S.mode === 'fav') ? 'flex' : 'none';
  $('mainFooter').style.display = (S.mode === 'learn' || S.mode === 'fav') ? 'flex' : 'none';
  $('stat').style.display = (S.mode === 'learn' || S.mode === 'fav') ? 'block' : 'none';

  const removeLearnBtn = $('btnRemoveLearn');
  removeLearnBtn.style.display = S.mode === 'learn' ? 'flex' : 'none';
  removeLearnBtn.disabled = S.current == null;
  $('btnLearnManage').style.display = S.mode === 'learn' ? 'inline-block' : 'none';

  $('mainTable').classList.toggle('show', S.mode === 'table');
  $('mainFavList').classList.toggle('show', S.mode === 'favList');
  $('mainFavManage').classList.toggle('show', S.mode === 'favManage');
  $('mainLearnManage').classList.toggle('show', S.mode === 'learnManage');

  if(S.mode === 'table') { renderTable(); return; }
  if(S.mode === 'favList') { renderFavList(); return; }
  if(S.mode === 'favManage') { renderFavManage(); return; }
  if(S.mode === 'learnManage') { renderLearnManage(); return; }

  if(S.current == null) { $('en').textContent = '-'; $('zh').textContent = ''; setPhonetic(''); return; }
  $('en').textContent = S.current.en;
  setPhonetic(S.current.phonetic);
  $('zh').textContent = S.current.zh || '(无中文)';
  
  if (S.alwaysZh || S.showZh) { $('zh').classList.remove('hide'); } else { $('zh').classList.add('hide'); }

  const isFav = S.favFolders.some(f => f.words.some(w => w.en === S.current.en));
  $('btnFav').textContent = isFav ? '★' : '☆'; $('btnFav').classList.toggle('active', isFav);
  $('chkAlwaysZh').checked = S.alwaysZh; $('chkAutoClean').checked = S.autoClean;
  
  const total = S.learnList.length; const normalLeft = S.learnPool.length;
  if (S.mode === 'learn') $('stat').textContent = `Learn 列表 ${total} 词 · 剩余 ${normalLeft} · 长按卡片清空`;
  else if (S.mode === 'fav') {
    const folder = getCurrentFav();
    $('stat').textContent = `[${folder.name}] 共 ${folder.words.length} 词 · 剩余 ${S.favPool.length}`;
  }
}

function renderTable(){
  ensureAutoReviewFolder();
  const t = $('tableListContent'); t.innerHTML = '';
  const query = $('searchTable').value.trim().toLowerCase();
  
  const btnToggle = $('btnToggleSelectMode'); const btnBatchDel = $('btnBatchDelete'); const btnSelectAll = $('btnSelectAll');
  const batchFavTarget = $('batchFavTarget'); const btnBatchAddFav = $('btnBatchAddFav');

  batchFavTarget.innerHTML = S.favFolders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');

  if (S.selectMode) {
    btnToggle.textContent = '退出多选'; btnToggle.classList.add('btn-danger');
    btnSelectAll.style.display = 'inline-block'; btnBatchDel.style.display = 'inline-block';
    batchFavTarget.style.display = 'inline-block'; btnBatchAddFav.style.display = 'inline-block';
    btnBatchDel.textContent = `删除 (${S.selectedWords.length})`;
    btnSelectAll.textContent = (S.words.length > 0 && S.selectedWords.length === S.words.length) ? '取消全选' : '全选';
  } else {
    btnToggle.textContent = '多选'; btnToggle.classList.remove('btn-danger');
    btnSelectAll.style.display = 'none'; btnBatchDel.style.display = 'none'; batchFavTarget.style.display = 'none'; btnBatchAddFav.style.display = 'none';
    S.selectedWords = [];
  }

  const learnSet = new Set(S.learnList.map(w => w.en));
  const favSet = getFavWordSet();
  const remainingCount = getUnlearnedCount();
  $('tableMeta').textContent = `待学 ${remainingCount} / ${S.words.length}`;
  $('tableMeta').style.display = S.selectMode ? 'none' : 'inline';

  if(S.words.length === 0) { t.innerHTML = '<div style="text-align:center; padding:20px; color:var(--sub);">总表为空，请导入</div>'; return; }

  const filteredWords = S.words.filter(w => w.en.toLowerCase().includes(query) || (w.zh && w.zh.includes(query)));
  if (filteredWords.length === 0) { t.innerHTML = '<div style="text-align:center; padding:20px; color:var(--sub);">没有找到匹配的单词</div>'; return; }

  filteredWords.forEach(w => {
    const inLearn = learnSet.has(w.en);
    const inAnyFav = favSet.has(w.en);
    const isLearned = w.isLearned === true;
    const isChecked = S.selectedWords.includes(w.en);
    const locked = inLearn || inAnyFav || isLearned;
    const div = document.createElement('div'); div.className = 'list-item' + (locked ? ' in-learn' : '');
    
    const safeEn = escapeHtml(w.en);
    const safeZh = escapeHtml(w.zh || '');
    let leftHtml = `<div class="list-item-left">`;
    if (S.selectMode) leftHtml += `<input type="checkbox" class="chk-item" data-en="${safeEn}" ${isChecked ? 'checked' : ''}>`;
    leftHtml += `<div style="min-width: 0; flex: 1;"><div class="list-item-word" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${safeEn}</div><div class="list-item-zh" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${safeZh}</div></div></div>`;

    let rightHtml = `<div style="display: flex; gap: 6px; flex-shrink: 0;">`;
    if (!S.selectMode) {
      const starIcon = inAnyFav ? '★' : '☆';
      const starColor = inAnyFav ? 'var(--yellow)' : 'var(--text)';
      const starBorder = inAnyFav ? 'var(--yellow)' : 'var(--border)';
      let learnBtnHtml;
      if (inLearn) {
        learnBtnHtml = `<button class="btn-add added" data-en="${safeEn}">已在 Learn</button>`;
      } else if (inAnyFav) {
        learnBtnHtml = `<button class="btn-add" disabled data-en="${safeEn}" style="background: transparent; color: var(--sub); border-color: var(--border); cursor: default;">⭐ 已收藏</button>`;
      } else if (isLearned) {
        learnBtnHtml = `<button class="btn-add" disabled data-en="${safeEn}" style="background: transparent; color: var(--sub); border-color: var(--border); cursor: default;">已学完</button>`;
      } else {
        learnBtnHtml = `<button class="btn-add" data-en="${safeEn}">+ Learn</button>`;
      }
      rightHtml += `
        <button class="btn-small btn-toggle-fav" data-en="${safeEn}" style="color: ${starColor}; border-color: ${starBorder};">${starIcon}</button>
        ${learnBtnHtml}
        <button class="btn-small btn-danger btn-del" data-en="${safeEn}">🗑️</button>
      `;
    }
    rightHtml += `</div>`;
    div.innerHTML = `${leftHtml}${rightHtml}`;
    t.appendChild(div);
  });

  if (!S.selectMode) {
    document.querySelectorAll('.btn-add').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const wordStr = e.target.dataset.en; const targetWord = S.words.find(w => w.en === wordStr); const idx = S.learnList.findIndex(w => w.en === wordStr);
        if (idx >= 0) { S.learnList.splice(idx, 1); const pIdx = S.learnPool.findIndex(w => w.en === wordStr); if(pIdx >= 0) S.learnPool.splice(pIdx, 1); } 
        else { S.learnList.push(targetWord); S.learnPool.push(targetWord); }
        save(); renderTable(); render();
      });
    });
    
    document.querySelectorAll('.btn-toggle-fav').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const wordStr = e.target.dataset.en;
        const targetWord = S.words.find(w => w.en === wordStr);
        if (targetWord) openFavPicker(targetWord);
      });
    });

    document.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const wordStr = e.target.dataset.en;
        if(!confirm(`确定要从总词库中彻底删除 "${wordStr}" 吗？`)) return;
        deleteWordsFromSystem([wordStr]);
      });
    });
  }

  document.querySelectorAll('.chk-item').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const wordStr = e.target.dataset.en;
      if (e.target.checked) { if(!S.selectedWords.includes(wordStr)) S.selectedWords.push(wordStr); } else { S.selectedWords = S.selectedWords.filter(w => w !== wordStr); }
      btnBatchDel.textContent = `删除 (${S.selectedWords.length})`;
      btnSelectAll.textContent = (S.selectedWords.length === S.words.length) ? '取消全选' : '全选';
    });
  });
}

function openLearnManage() {
  if (S.mode !== 'learn') return;
  learnManageSelected = [];
  S.mode = 'learnManage';
  render();
}

function renderLearnManage() {
  const t = $('learnManageContent');
  t.innerHTML = '';
  const list = S.learnList;
  const existing = new Set(list.map(w => w.en));
  learnManageSelected = learnManageSelected.filter(en => existing.has(en));

  const removeBtn = $('btnLearnBatchRemove');
  removeBtn.textContent = `移出选中 (${learnManageSelected.length})`;
  removeBtn.disabled = learnManageSelected.length === 0;
  $('btnLearnSelectAll').disabled = list.length === 0;
  $('btnLearnDeselectAll').disabled = list.length === 0;

  if (list.length === 0) {
    t.innerHTML = '<div style="text-align:center; padding:20px; color:var(--sub);">Learn 列表为空</div>';
    return;
  }

  list.forEach(w => {
    const checked = learnManageSelected.includes(w.en);
    const label = document.createElement('label');
    label.className = 'list-item learn-manage-item';
    label.innerHTML = `
      <span class="list-item-left">
        <input type="checkbox" class="chk-item chk-learn-manage" data-en="${escapeHtml(w.en)}" ${checked ? 'checked' : ''}>
        <span style="min-width:0; flex:1;">
          <span class="list-item-word" style="display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(w.en)}</span>
          <span class="list-item-zh" style="display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(w.zh || '')}</span>
        </span>
      </span>
    `;
    t.appendChild(label);
  });

  document.querySelectorAll('.chk-learn-manage').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const en = e.target.dataset.en;
      if (e.target.checked) { if (!learnManageSelected.includes(en)) learnManageSelected.push(en); }
      else learnManageSelected = learnManageSelected.filter(x => x !== en);
      removeBtn.textContent = `移出选中 (${learnManageSelected.length})`;
      removeBtn.disabled = learnManageSelected.length === 0;
    });
  });
}

function renderFavList() {
  ensureAutoReviewFolder();
  const t = $('favListContent');
  t.innerHTML = '';
  S.favFolders.forEach(folder => {
    const div = document.createElement('div');
    div.className = 'folder-item';
    div.tabIndex = 0;
    div.title = folder.id === AUTO_REVIEW_ID ? '系统复习池：可管理单词，不可删除' : '长按或右键管理';
    div.setAttribute('role', 'button');

    const left = document.createElement('div');
    left.className = 'folder-name';
    left.textContent = folder.name;

    const arrow = document.createElement('span');
    arrow.className = 'folder-arrow';
    arrow.textContent = '›';

    const enterFolder = () => {
      S.currentFavId = folder.id;
      S.favPool = shuffle(folder.words.slice());
      S.current = null;
      S.historyList = [];
      S.mode = 'fav';
      render();
      draw();
    };

    let pressTimer = null;
    let longPressed = false;
    const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null; };
    const startPress = (e) => {
      longPressed = false;
      if (e.pointerType === 'mouse') return;
      cancelPress();
      pressTimer = setTimeout(() => {
        longPressed = true;
        openFolderMenu(folder);
      }, 500);
    };

    div.addEventListener('pointerdown', startPress);
    div.addEventListener('pointerup', cancelPress);
    div.addEventListener('pointerleave', cancelPress);
    div.addEventListener('pointercancel', cancelPress);
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openFolderMenu(folder);
    });
    div.addEventListener('click', () => {
      if (longPressed) { longPressed = false; return; }
      enterFolder();
    });
    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterFolder(); }
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        openFolderMenu(folder);
      }
    });

    div.appendChild(left);
    div.appendChild(arrow);
    t.appendChild(div);
  });
}

/* ===================== 收藏夹选择 / 管理菜单 ===================== */
let favPickWord = null;
let folderMenuFolderId = null;
let folderEditMode = 'create';
let folderEditFolderId = null;

function openFavPicker(word) {
  if (!word) return;
  favPickWord = word;
  $('favPickerTitle').textContent = `收藏「${word.en}」`;
  $('favPickNewWrap').hidden = true;
  $('btnFavPickNew').hidden = false;
  $('favPickNewName').value = '';
  renderFavPicker();
  openSheet('modalFavPicker');
}

function renderFavPicker() {
  if (!favPickWord) return;
  ensureAutoReviewFolder();
  const list = $('favPickList');
  list.innerHTML = '';
  S.favFolders.forEach(folder => {
    const selected = folder.words.some(w => w.en === favPickWord.en);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'fav-pick-row' + (selected ? ' selected' : '');
    row.innerHTML = `
      <span class="fav-pick-name">${escapeHtml(folder.name)}</span>
      <span class="fav-pick-count">${folder.words.length}</span>
      <span class="fav-pick-check">${selected ? '✓' : ''}</span>
    `;
    row.addEventListener('click', () => {
      const inFolder = folder.words.some(w => w.en === favPickWord.en);
      if (inFolder) {
        folder.words = folder.words.filter(w => w.en !== favPickWord.en);
        if (S.mode === 'fav' && folder.id === S.currentFavId) {
          S.favPool = S.favPool.filter(w => w.en !== favPickWord.en);
        }
      } else {
        folder.words.push(favPickWord);
        if (S.mode === 'fav' && folder.id === S.currentFavId) {
          if (!S.favPool.some(w => w.en === favPickWord.en)) S.favPool.push(favPickWord);
        }
      }
      save();
      renderFavPicker();
      render();
    });
    list.appendChild(row);
  });
}

function openFolderMenu(folder) {
  if (!folder) return;
  ensureAutoReviewFolder();
  const isAuto = folder.id === AUTO_REVIEW_ID;
  folderMenuFolderId = folder.id;
  $('folderMenuTitle').textContent = isAuto ? `${folder.name} · 系统文件夹` : folder.name;
  $('btnFolderRename').hidden = isAuto;
  $('btnFolderDelete').hidden = isAuto;
  openSheet('modalFolderMenu');
}

function openFolderEdit(mode, folderId) {
  const folder = S.favFolders.find(f => f.id === folderId);
  if (mode === 'rename' && !folder) return;
  if (mode === 'rename' && folder.id === AUTO_REVIEW_ID) return;
  folderEditMode = mode;
  folderEditFolderId = folder ? folder.id : null;
  $('folderEditTitle').textContent = mode === 'rename' ? '重命名收藏夹' : '新建收藏夹';
  $('folderEditInput').value = mode === 'rename' ? folder.name : '';
  closeSheet('modalFolderMenu');
  openSheet('modalFolderEdit');
  setTimeout(() => $('folderEditInput').focus(), 50);
}

function confirmFolderEdit() {
  const name = $('folderEditInput').value.trim();
  if (!name) { $('folderEditInput').focus(); return; }
  if (folderEditMode === 'create') {
    S.favFolders.push({ id: generateId(), name, words: [] });
  } else {
    const folder = S.favFolders.find(f => f.id === folderEditFolderId);
    if (!folder) { closeSheet('modalFolderEdit'); return; }
    if (folder.id === AUTO_REVIEW_ID) { closeSheet('modalFolderEdit'); return; }
    folder.name = name;
  }
  save();
  closeSheet('modalFolderEdit');
  render();
}

$('btnFavPickNew').addEventListener('click', () => {
  $('btnFavPickNew').hidden = true;
  $('favPickNewWrap').hidden = false;
  $('favPickNewName').value = '';
  $('favPickNewName').focus();
});

$('btnFavPickNewCancel').addEventListener('click', () => {
  $('favPickNewWrap').hidden = true;
  $('btnFavPickNew').hidden = false;
});

$('btnFavPickNewConfirm').addEventListener('click', () => {
  const name = $('favPickNewName').value.trim();
  if (!name || !favPickWord) { $('favPickNewName').focus(); return; }
  S.favFolders.push({ id: generateId(), name, words: [favPickWord] });
  save();
  $('favPickNewWrap').hidden = true;
  $('btnFavPickNew').hidden = false;
  $('favPickNewName').value = '';
  renderFavPicker();
  render();
});

$('favPickNewName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('btnFavPickNewConfirm').click(); }
});

$('btnFolderRename').addEventListener('click', () => {
  const folder = S.favFolders.find(f => f.id === folderMenuFolderId);
  if (folder) openFolderEdit('rename', folder.id);
});

$('btnFolderManage').addEventListener('click', () => {
  const folder = S.favFolders.find(f => f.id === folderMenuFolderId);
  if (!folder) return;
  S.currentFavId = folder.id;
  S.mode = 'favManage';
  S.favManageSelected = [];
  closeSheet('modalFolderMenu');
  render();
});

$('btnFolderDelete').addEventListener('click', () => {
  const folder = S.favFolders.find(f => f.id === folderMenuFolderId);
  if (!folder) return;
  if (folder.id === AUTO_REVIEW_ID) return alert('🔄 自动复习池是系统文件夹，不能删除');
  if (S.favFolders.length <= 1) return alert('必须至少保留一个收藏夹！');
  if (!confirm(`确定要删除收藏夹 "${folder.name}" 吗？里面的单词不会从总词库消失。`)) return;
  S.favFolders = S.favFolders.filter(f => f.id !== folder.id);
  if (S.currentFavId === folder.id) S.currentFavId = S.favFolders[0].id;
  folderMenuFolderId = null;
  save();
  closeSheet('modalFolderMenu');
  render();
});

$('btnFolderEditConfirm').addEventListener('click', confirmFolderEdit);
$('btnFolderEditCancel').addEventListener('click', () => closeSheet('modalFolderEdit'));
$('folderEditInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); confirmFolderEdit(); }
});

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeSheet(btn.dataset.close));
});
document.querySelectorAll('.sheet-modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeSheet(modal.id);
  });
});

function renderFavManage() {
  const t = $('favManageContent'); t.innerHTML = '';
  const folder = getCurrentFav();
  const query = $('searchFav').value.trim().toLowerCase();
  
  $('favManageTitle').textContent = `管理: ${folder.name}`;
  $('favMoveTarget').innerHTML = S.favFolders.filter(f => f.id !== folder.id).map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
  if (S.favFolders.length <= 1) {
    $('btnBatchMoveFav').style.display = 'none'; $('favMoveTarget').style.display = 'none';
  } else {
    $('btnBatchMoveFav').style.display = 'block'; $('favMoveTarget').style.display = 'block';
  }

  if (folder.words.length === 0) { t.innerHTML = '<div style="text-align:center; padding:20px; color:var(--sub);">当前夹子是空的</div>'; return; }
  const filtered = folder.words.filter(w => w.en.toLowerCase().includes(query) || (w.zh && w.zh.includes(query)));
  if (filtered.length === 0) { t.innerHTML = '<div style="text-align:center; padding:20px; color:var(--sub);">没有找到匹配的单词</div>'; return; }

  $('btnFavSelectAll').textContent = (S.favManageSelected.length === folder.words.length) ? '取消全选' : '全选';

  filtered.forEach(w => {
    const isChecked = S.favManageSelected.includes(w.en);
    const div = document.createElement('div'); div.className = 'list-item';
    div.innerHTML = `
      <div class="list-item-left">
        <input type="checkbox" class="chk-item-fav" data-en="${w.en}" ${isChecked ? 'checked' : ''}>
        <div style="min-width: 0; flex: 1;">
          <div class="list-item-word" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${w.en}</div>
          <div class="list-item-zh" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${w.zh}</div>
        </div>
      </div>
    `;
    t.appendChild(div);
  });

  document.querySelectorAll('.chk-item-fav').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const wordStr = e.target.dataset.en;
      if (e.target.checked) { if(!S.favManageSelected.includes(wordStr)) S.favManageSelected.push(wordStr); } 
      else { S.favManageSelected = S.favManageSelected.filter(w => w !== wordStr); }
    });
  });
}

function deleteWordsFromSystem(wordsToDelete) {
  const delSet = new Set(wordsToDelete);
  S.words = S.words.filter(w => !delSet.has(w.en)); 
  S.learnList = S.learnList.filter(w => !delSet.has(w.en));
  S.learnPool = S.learnPool.filter(w => !delSet.has(w.en));
  S.favFolders.forEach(folder => { folder.words = folder.words.filter(w => !delSet.has(w.en)); });
  S.historyList = S.historyList.filter(w => !delSet.has(w.en));
  if(S.current && delSet.has(S.current.en)) { S.current = null; draw(); }
  S.selectedWords = []; save(); renderTable(); render();
}

$('searchTable').addEventListener('input', renderTable);
$('searchFav').addEventListener('input', renderFavManage);

$('btnCreateFolder').addEventListener('click', () => openFolderEdit('create'));

$('btnBackToFavList').addEventListener('click', () => { S.mode = 'favList'; render(); });
$('btnLearnManage').addEventListener('click', openLearnManage);
$('btnBackFromLearnManage').addEventListener('click', () => switchTab('learn'));
$('btnLearnSelectAll').addEventListener('click', () => {
  learnManageSelected = S.learnList.map(w => w.en);
  renderLearnManage();
});
$('btnLearnDeselectAll').addEventListener('click', () => {
  learnManageSelected = [];
  renderLearnManage();
});
$('btnLearnBatchRemove').addEventListener('click', () => {
  if (S.mode !== 'learnManage' || learnManageSelected.length === 0) return;
  const set = new Set(learnManageSelected);
  S.learnList = S.learnList.filter(w => !set.has(w.en));
  S.learnPool = S.learnPool.filter(w => !set.has(w.en));
  S.current = null;
  S.showZh = false;
  learnManageSelected = [];
  S.mode = 'learn';
  save();
  render();
  nextWord();
});
$('btnToggleSelectMode').addEventListener('click', () => { S.selectMode = !S.selectMode; renderTable(); });
$('btnSelectAll').addEventListener('click', () => { S.selectedWords = (S.selectedWords.length === S.words.length) ? [] : S.words.map(w => w.en); renderTable(); });

$('btnBatchDelete').addEventListener('click', () => {
  if (S.selectedWords.length === 0) return alert('请先勾选要删除的单词！');
  if (!confirm(`确定要彻底删除选中的 ${S.selectedWords.length} 个单词吗？`)) return;
  deleteWordsFromSystem(S.selectedWords);
});

$('btnBatchAddFav').addEventListener('click', () => {
  if (S.selectedWords.length === 0) return alert('请先勾选要收藏的单词！');
  const targetId = $('batchFavTarget').value;
  const folder = S.favFolders.find(f => f.id === targetId);
  if (!folder) return;
  
  let addedCount = 0;
  let movedCount = 0;

  S.selectedWords.forEach(str => {
    if (folder.words.some(w => w.en === str)) return;
    
    let inOther = false;
    S.favFolders.forEach((f, idx) => {
      if (f.id !== targetId) {
        const pos = f.words.findIndex(w => w.en === str);
        if (pos >= 0) { f.words.splice(pos, 1); inOther = true; }
      }
    });

    const wordObj = S.words.find(w => w.en === str);
    if (wordObj) { 
      folder.words.push(wordObj); 
      if (inOther) movedCount++; else addedCount++;
    }
  });

  save(); renderTable(); 
  alert(`✅ 操作成功！\n新增：${addedCount} 个\n从其他夹子转移：${movedCount} 个`);
});

$('btnFavSelectAll').addEventListener('click', () => {
  const folder = getCurrentFav();
  S.favManageSelected = (S.favManageSelected.length === folder.words.length) ? [] : folder.words.map(w => w.en);
  renderFavManage();
});

$('btnShuffleFav').addEventListener('click', () => {
  const folder = getCurrentFav();
  if (!folder) return;
  shuffle(folder.words);
  if (S.currentFavId === folder.id) {
    S.favPool = shuffle(folder.words.slice());
    S.favSeen = [];
  }
  S.favManageSelected = [];
  save();
  renderFavManage();
  const btn = $('btnShuffleFav');
  btn.textContent = '✅ 已打乱';
  setTimeout(() => { btn.textContent = '🔀 打乱'; }, 800);
  console.log(`🔀 已打乱收藏夹「${folder.name}」，共 ${folder.words.length} 词`);
});

$('btnBatchMoveFav').addEventListener('click', () => {
  if (S.favManageSelected.length === 0) return alert('请先勾选单词');
  const targetId = $('favMoveTarget').value;
  const targetFolder = S.favFolders.find(f => f.id === targetId);
  const currentFolder = getCurrentFav();
  if (!targetFolder) return;
  S.favManageSelected.forEach(str => {
    if (!targetFolder.words.some(w => w.en === str)) {
      targetFolder.words.push(currentFolder.words.find(w => w.en === str));
    }
  });
  currentFolder.words = currentFolder.words.filter(w => !S.favManageSelected.includes(w.en));
  S.favManageSelected = [];
  save(); renderFavManage();
  alert(`✅ 成功转移到 "${targetFolder.name}"`);
});

$('btnBatchRemoveFav').addEventListener('click', () => {
  if (S.favManageSelected.length === 0) return alert('请先勾选单词');
  if (!confirm(`确定将选中的单词移出当前收藏夹吗？`)) return;
  const folder = getCurrentFav();
  folder.words = folder.words.filter(w => !S.favManageSelected.includes(w.en));
  S.favManageSelected = [];
  save(); renderFavManage();
});

$('btnRandomDraw').addEventListener('click', () => {
  const count = parseInt($('inputRandomCount').value);
  if (!count || count <= 0) return alert('请输入要抽取的数量！');
  const learnSet = new Set(S.learnList.map(w => w.en));
  const favSet = getFavWordSet();
  const availableWords = S.words.filter(w => w.isLearned !== true && !learnSet.has(w.en) && !favSet.has(w.en));
  if (availableWords.length === 0) return alert('总表里的词都已经在 Learn 或收藏夹里啦！');
  if (availableWords.length < count) { if(!confirm(`总表剩余未学习且未收藏的词只有 ${availableWords.length} 个，是否全部加入？`)) return; }
  const shuffled = shuffle(availableWords.slice()); const pickedWords = shuffled.slice(0, Math.min(count, availableWords.length));
  const autoFolder = getAutoReviewFolder();
  pickedWords.forEach(w => {
    S.learnList.push(w);
    S.learnPool.push(w);
    // 自动复习池：抽取时静默收集，按 en 去重。
    if (!autoFolder.words.some(x => x.en === w.en)) autoFolder.words.push(w);
  });
  shuffle(autoFolder.words);
  save(); renderTable(); render(); alert(`✅ 成功随机抽取 ${pickedWords.length} 个单词加入 Learn！`);
});

function clearLearnQueue() {
  if(!confirm('确定要清空 Learn 队列吗？（总词库和自动复习池依然保留）')) return;
  S.learnList = []; S.learnPool = []; S.current = null; S.showZh = false; S.historyList = [];
  save();
  if (S.mode === 'learn') { render(); draw(); }
  else { renderTable(); render(); }
}

$('btnClearLearn').addEventListener('click', clearLearnQueue);
$('btnRemoveLearn').addEventListener('click', () => {
  if (S.mode !== 'learn' || !S.current) return;
  const en = S.current.en;
  S.learnList = S.learnList.filter(w => w.en !== en);
  S.learnPool = S.learnPool.filter(w => w.en !== en);
  S.current = null;
  S.showZh = false;
  save();
  render();
  nextWord();
});

function renderApiList() {
  const tbody = $('apiListBody'); tbody.innerHTML = '';
  if (!S.apiKeys || S.apiKeys.length === 0) { 
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--sub); padding: 20px;">暂无 API Key，请点击右上角创建</td></tr>'; return; 
  }
  
  S.apiKeys.forEach(k => {
    const tr = document.createElement('tr'); tr.className = 'api-row'; 
    const isActive = k.id === S.currentApiId;
    const maskedKey = k.key.length > 12 ? k.key.substring(0, 6) + '...' + k.key.slice(-4) : '******';
    
    const td1 = document.createElement('td');
    td1.innerHTML = `<span class="api-key-text">${maskedKey}</span>${isActive ? '<span class="api-status">● 使用中</span>' : ''}`;
    const td2 = document.createElement('td'); td2.style.color = 'var(--sub)'; td2.textContent = isActive ? '已启用' : '未启用';
    const td3 = document.createElement('td'); td3.style.textAlign = 'right';
    
    if (!isActive) {
      const btnEnable = document.createElement('button'); btnEnable.className = 'btn-small'; btnEnable.textContent = '启用';
      btnEnable.onclick = () => { S.currentApiId = k.id; save(); renderApiList(); };
      td3.appendChild(btnEnable);
    }
    const btnDel = document.createElement('button'); btnDel.className = 'btn-small btn-danger'; btnDel.style.marginLeft = '6px'; btnDel.textContent = '删除';
    btnDel.onclick = () => {
      if (confirm('确定要删除这个 Key 吗？')) {
        S.apiKeys = S.apiKeys.filter(item => item.id !== k.id);
        if (S.currentApiId === k.id) S.currentApiId = S.apiKeys.length > 0 ? S.apiKeys[0].id : null;
        save(); renderApiList();
      }
    };
    td3.appendChild(btnDel);
    tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
    tbody.appendChild(tr);
  });
}

function saveApiKeyFromInput() {
  const keyStr = $('apiKeyInput').value.trim();
  if (!keyStr) { $('apiKeyInput').focus(); return; }
  const keyRegex = /^sk-[a-zA-Z0-9]{20,100}$/;
  if (!keyRegex.test(keyStr)) {
    alert('❌ 格式错误！\n\n有效的 API Key 应该以 "sk-" 开头，且后面包含至少 20 位的字母或数字。\n请检查是否复制了多余的空格或错误的字符。');
    return;
  }
  const newId = generateId();
  if (!S.apiKeys) S.apiKeys = [];
  S.apiKeys.push({ id: newId, key: keyStr });
  if (!S.currentApiId) S.currentApiId = newId;
  save();
  renderApiList();
  $('apiKeyInput').value = '';
  closeSheet('modalApiKey');
}

$('btnCreateApi').addEventListener('click', () => {
  $('apiKeyInput').value = '';
  openSheet('modalApiKey');
  setTimeout(() => $('apiKeyInput').focus(), 50);
});
$('btnApiKeyConfirm').addEventListener('click', saveApiKeyFromInput);
$('btnApiKeyCancel').addEventListener('click', () => closeSheet('modalApiKey'));
$('apiKeyInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); saveApiKeyFromInput(); }
});

// 长按卡片 600ms 清空 Learn；短按仍是“显示中文 / 下一个”。
let cardPressTimer = null;
let cardLongPressed = false;
const cancelCardPress = () => { clearTimeout(cardPressTimer); cardPressTimer = null; };
$('card').addEventListener('pointerdown', () => {
  if (S.mode !== 'learn' || S.current == null) return;
  cardLongPressed = false;
  cancelCardPress();
  cardPressTimer = setTimeout(() => {
    cardLongPressed = true;
    clearLearnQueue();
  }, 600);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('card').addEventListener(ev, cancelCardPress));
$('card').addEventListener('contextmenu', (e) => e.preventDefault());

// 🌟 分屏点击：左半边回退，右半边沿用“显示中文 / 下一个”
$('card').addEventListener('click', (e)=>{
  if (cardLongPressed) { cardLongPressed = false; return; }
  if(S.current == null) return;
  const touch = e.changedTouches && e.changedTouches[0];
  const clientX = touch ? touch.clientX : e.clientX;
  if (clientX < window.innerWidth / 2) goBackCard();
  else advanceCard(false);
});

$('btnSpeak').addEventListener('click', ()=>{ if(S.current == null) return; if(window.speechSynthesis){ const u = new SpeechSynthesisUtterance(S.current.en); u.lang = 'en-US'; speechSynthesis.cancel(); speechSynthesis.speak(u); } });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.show').forEach(m => closeSheet(m.id));
    return;
  }
  const cardMode = (S.mode === 'learn' || S.mode === 'fav') && !document.querySelector('.modal.show');
  if (!cardMode) return;
  if (e.code === 'Space' || e.key === 'ArrowRight') {
    e.preventDefault();
    advanceCard(true);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    goBackCard();
  }
});

$('btnFav').addEventListener('click', ()=>{
  if(S.current == null) return;
  openFavPicker(S.current);
});

function switchTab(mode) {
  const wasLearn = S.mode === 'learn';
  S.mode = mode;
  if (mode === 'learn') {
    // 切回 Learn 时保留当前单词和剩余进度，不再强制刷新。
    if (!wasLearn) {
      const keepCurrent = S.current && S.learnList.some(w => w.en === S.current.en);
      if (!keepCurrent) {
        S.current = null;
        S.learnPool = shuffle(S.learnList.slice());
        S.historyList = [];
      }
    }
    render();
    if (S.current == null) draw(); else save();
    return;
  }
  render();
  if (mode === 'fav') {
    const folder = getCurrentFav();
    S.favPool = shuffle(folder.words.slice());
    S.favSeen = [];
    S.historyList = [];
    draw();
  } else save();
}
$('tabLearn').addEventListener('click', ()=>switchTab('learn'));
$('tabTable').addEventListener('click', ()=>switchTab('table'));
$('tabFav').addEventListener('click', ()=>switchTab('favList'));

$('btnSettings').addEventListener('click', ()=> { renderApiList(); $('modalSettings').classList.add('show'); });
$('btnCloseSettings').addEventListener('click', ()=> { $('modalSettings').classList.remove('show'); });
$('btnOpenImport').addEventListener('click', ()=>{ $('modalSettings').classList.remove('show'); $('modalImport').classList.add('show'); });
$('btnCancelImport').addEventListener('click', ()=> { $('ta').value = ''; $('preview').innerHTML = ''; $('cleanStatus').textContent = '就绪'; isTextCleaned = false; $('modalImport').classList.remove('show'); $('modalSettings').classList.add('show'); });
$('chkAlwaysZh').addEventListener('change', (e)=>{ S.alwaysZh = e.target.checked; render(); save(); });
$('chkAutoClean').addEventListener('change', (e)=>{ S.autoClean = e.target.checked; save(); });

$('btnReset').addEventListener('click', ()=>{ 
  if(!confirm('重置当前进度？')) return; 
  if(S.mode==='learn'){ S.learnPool = shuffle(S.learnList.slice()); } else if (S.mode === 'fav') { S.favPool = shuffle(getCurrentFav().words.slice()); }
  S.historyList = [];
  $('modalSettings').classList.remove('show'); draw(); save();
});

// 导入时把新音标合并进已有词条：不覆盖原释义/学习状态，只补空缺的 phonetic。
// 同一词在 S.words、Learn、收藏夹、历史里可能是不同对象（localStorage 反序列化后不共享引用），
// 因此按 en 同步到所有副本。
function mergeImportedWords(newList) {
  const wordMap = new Map((S.words || []).filter(w => w && w.en).map(w => [w.en, w]));
  const phoneticByEn = new Map();
  let added = 0;
  let enriched = 0;

  for (const nw of newList) {
    if (!nw || !nw.en) continue;
    if (nw.phonetic) phoneticByEn.set(nw.en, nw.phonetic);
    const existing = wordMap.get(nw.en);
    if (!existing) {
      S.words.push(nw);
      wordMap.set(nw.en, nw);
      added++;
    } else if (!existing.phonetic && nw.phonetic) {
      existing.phonetic = nw.phonetic;
      enriched++;
    }
  }

  const copies = [S.learnList, S.learnPool, S.historyList, ...(S.favFolders || []).map(f => (f && f.words) || [])];
  for (const list of copies) {
    if (!Array.isArray(list)) continue;
    for (const w of list) {
      if (w && !w.phonetic && phoneticByEn.has(w.en)) w.phonetic = phoneticByEn.get(w.en);
    }
  }
  if (S.current && !S.current.phonetic && phoneticByEn.has(S.current.en)) {
    S.current.phonetic = phoneticByEn.get(S.current.en);
  }

  return { added, enriched };
}

$('btnParse').addEventListener('click', ()=>{
  const rawVal = $('ta').value; const newList = parseLines(rawVal);
  if(!newList.length) return alert('没解析到单词');
  if (!isTextCleaned) {
    const looksDirty = rawVal.includes('<table>') || rawVal.includes('<br>') || (rawVal.match(/\[/g) || []).length > 5;
    if (looksDirty && !confirm('⚠️ 警告：检测到文本未清洗，包含大量乱码/音标/HTML标签！\n\n直接导入会导致词库非常混乱。\n\n确定要强制直接导入吗？')) return;
  }
  const stats = mergeImportedWords(newList);
  $('ta').value = ''; $('preview').innerHTML = '';
  if (stats.added || stats.enriched) {
    $('cleanStatus').textContent = `✅ 已导入：新增 ${stats.added} 词，补全 ${stats.enriched} 个旧词音标。当前总表 ${S.words.length} 词。`;
  } else {
    $('cleanStatus').textContent = `ℹ️ 这批词都已在词库中，且没有新的音标可补全。当前总表 ${S.words.length} 词。`;
  }
  isTextCleaned = false;
  save();
  if (S.mode === 'table') renderTable();
  else if (S.current && (S.mode === 'learn' || S.mode === 'fav')) render();
});

async function executeClean() {
  const rawText = $('ta').value.trim(); if(!rawText) return;
  const activeKeyObj = S.apiKeys.find(k => k.id === S.currentApiId);
  if (!activeKeyObj) { if(S.autoClean) { $('cleanStatus').textContent = '❌ 请先在设置中配置 API Key'; } else { alert('请点击右上角 ⚙️ 创建并启用 API Key！'); } return; }
  const currentApiKey = activeKeyObj.key; const statusEl = $('cleanStatus'); const btnClean = $('btnCleanDS');
  btnClean.disabled = true;
  const lines = rawText.split('\n').filter(line => line.trim() !== ''); const CHUNK_SIZE = 50; let cleanedResults = [];
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    const chunkText = lines.slice(i, i + CHUNK_SIZE).join('\n');
    statusEl.textContent = `清洗中... ${Math.min(i + CHUNK_SIZE, lines.length)} / ${lines.length}`;
    try {
      const response = await fetch('/api/clean', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: chunkText, provider: 'deepseek', apiKey: currentApiKey }) });
      const data = await response.json(); if (data.error) throw new Error(data.error);
      if (data.result) cleanedResults.push(data.result.trim());
    } catch (e) { statusEl.textContent = '❌ 失败：' + e.message; btnClean.disabled = false; return; }
  }
  const cleanText = cleanedResults.join('\n'); $('ta').value = cleanText; btnClean.disabled = false; isTextCleaned = true;
  if (S.autoClean) { $('btnParse').click(); } else { $('preview').innerHTML = '清洗完成！点击直接导入。'; statusEl.textContent = `✅ 清洗完成！`; }
}

$('btnCleanDS').addEventListener('click', executeClean);

let autoCleanTimer = null;
$('ta').addEventListener('input', () => {
  isTextCleaned = false;
  if (!S.autoClean) return;
  clearTimeout(autoCleanTimer);
  autoCleanTimer = setTimeout(() => { if ($('ta').value.trim() && !$('btnCleanDS').disabled) { executeClean(); } }, 1200);
});

$('btnUploadFile').addEventListener('click', () => $('fileInput').click());

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function readFileAs(file, method) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader[method](file);
  });
}

async function extractPdfText(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    let text = '';
    content.items.forEach((item) => {
      if (typeof item.str !== 'string') return;
      text += item.str + (item.hasEOL ? '\n' : '');
    });
    pages.push(text);
  }
  return pages.join('\n\n');
}

async function extractDocxText(arrayBuffer) {
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

$('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const statusEl = $('cleanStatus');
  try {
    let text = '';
    if (ext === 'txt' || ext === 'csv') {
      text = await readFileAs(file, 'readAsText');
    } else if (ext === 'pdf') {
      statusEl.textContent = '正在解析 PDF...';
      text = await extractPdfText(await readFileAs(file, 'readAsArrayBuffer'));
    } else if (ext === 'docx') {
      statusEl.textContent = '正在解析 Word 文档...';
      text = await extractDocxText(await readFileAs(file, 'readAsArrayBuffer'));
    } else if (ext === 'doc') {
      statusEl.textContent = '暂不支持老版 .doc 格式，请另存为 .docx 或 .txt';
      return;
    } else {
      statusEl.textContent = '❌ 不支持的文件格式，请选择 .txt / .csv / .pdf / .docx';
      return;
    }
    if (!text || !text.trim()) throw new Error('空文本');
    statusEl.textContent = '✅ 已解析：' + file.name;
    $('ta').value = text;
    isTextCleaned = false;
    renderPreview();
    if (S.autoClean) executeClean();
  } catch (err) {
    statusEl.textContent = '解析失败，如果是扫描件或图片，请直接复制文字';
  } finally {
    $('fileInput').value = '';
  }
});

(async () => {
  await load(); 
  applyTheme(); 
  if(S.mode === 'fav') switchTab('fav'); else if(S.mode === 'table') switchTab('table'); else switchTab('learn');
})();