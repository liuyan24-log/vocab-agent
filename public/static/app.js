const LS_KEY = 'vocab_agent_v33'; 
let S = { 
  words: [], learnList: [], learnPool: [], 
  favFolders: [{ id: 'default', name: '主收藏', words: [] }],
  currentFavId: 'default',
  favPool: [], favSeen: [], 
  mode: 'learn', current: null, showZh: false, alwaysZh: false, autoClean: false,
  apiKeys: [], currentApiId: null, selectMode: false, selectedWords: [], theme: 'dark',
  favManageSelected: [] 
};
let isTextCleaned = false;
const $ = id => document.getElementById(id);

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
      S = Object.assign(S, parsed);
    }
  }catch(e){ console.error(e); } 
}

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function generateId() { return Math.random().toString(36).substring(2, 8); }
function getCurrentFav() {
  let f = S.favFolders.find(f => f.id === S.currentFavId);
  if (!f) { f = S.favFolders[0]; S.currentFavId = f.id; }
  return f;
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', S.theme);
  if (S.theme === 'light') { $('themeLight').classList.add('active'); $('themeDark').classList.remove('active'); }
  else { $('themeDark').classList.add('active'); $('themeLight').classList.remove('active'); }
}
$('themeLight').addEventListener('click', () => { S.theme = 'light'; save(); applyTheme(); });
$('themeDark').addEventListener('click', () => { S.theme = 'dark'; save(); applyTheme(); });

// ===== parseLines start =====
// 通用背单词文本解析：不针对任何单一品牌/数据源，尽量从脏 PDF/Word 文本中还原 {en, zh}。
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

    // 词后可能有多组音标（英音/美音），全部跳过
    let phGuard = 0;
    while (phGuard++ < 4) {
      const ph = after.slice(consumed).match(/^\s*([\[\(（\/][^\]）\/]{0,80}[\]）\/])\s*/);
      if (!ph || hasCJK(ph[1])) break;
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
    if (zh) entries.push({ en: head.en, zh: zh });

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
  const seen = new Set();
  let pending = null;

  const push = (en, zh) => {
    en = sanitizeEn(en);
    zh = sanitizeZh(zh);
    if (!en || !zh) return;
    if (!/^[A-Za-z][A-Za-z'’\- ]*$/.test(en)) return;
    if (CJK_RE.test(en) || /\d/.test(en)) return;
    if (en.length > 40 || en.split(/\s+/).length > 4) return;
    const key = en.toLowerCase().replace(/’/g, "'");
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ en: en, zh: zh });
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
    for (const e of entries) push(e.en, e.zh);
  }

  return out;
}
// ===== parseLines end =====
function renderPreview(){
  const list = parseLines($('ta').value);
  if (!list.length) { $('preview').innerHTML = ''; return; }
  const names = list.slice(0, 5).map(w => w.en).join(' / ');
  $('preview').textContent = `解析到 ${list.length} 个词：${names}` + (list.length > 5 ? ' ...' : '');
}

function draw(){
  if(S.mode === 'learn'){
    if(S.learnList.length === 0){ $('en').textContent = 'Learn 列表为空'; $('zh').classList.remove('hide'); $('zh').textContent = '去“词库”随机抽取单词'; return; }
    if(S.learnPool.length === 0){ $('en').textContent = '🎉 本轮完成'; $('zh').classList.remove('hide'); $('zh').textContent = '点屏幕重新洗牌'; return; }
    const i = Math.floor(Math.random()*S.learnPool.length); S.current = S.learnPool.splice(i,1)[0];
  } else if (S.mode === 'fav') {
    const curFolder = getCurrentFav();
    if(curFolder.words.length === 0){ $('en').textContent = '夹子是空的'; $('zh').textContent = '去背单词吧'; $('zh').classList.remove('hide'); S.current = null; render(); return; }
    if(S.favPool.length === 0){ S.favPool = shuffle(curFolder.words.slice()); S.favSeen = []; }
    const i = Math.floor(Math.random()*S.favPool.length); S.current = S.favPool.splice(i,1)[0]; 
  }
  S.showZh = false; $('zh').classList.add('hide'); render(); save();
}

// 🌟 封装“下一个”的逻辑
function nextWord() {
  if(S.mode === 'learn' && S.learnPool.length===0 && S.learnList.length>0) S.learnPool = shuffle(S.learnList.slice()); 
  if(S.mode === 'fav' && S.favPool.length===0 && getCurrentFav().words.length>0) S.favPool = shuffle(getCurrentFav().words.slice()); 
  draw(); 
}

function render(){
  $('mainCard').style.display = (S.mode === 'learn' || S.mode === 'fav') ? 'flex' : 'none';
  $('mainFooter').style.display = (S.mode === 'learn' || S.mode === 'fav') ? 'flex' : 'none';
  $('stat').style.display = (S.mode === 'learn' || S.mode === 'fav') ? 'block' : 'none';
  
  $('mainTable').classList.toggle('show', S.mode === 'table');
  $('mainFavList').classList.toggle('show', S.mode === 'favList');
  $('mainFavManage').classList.toggle('show', S.mode === 'favManage');

  if(S.mode === 'table') { renderTable(); return; }
  if(S.mode === 'favList') { renderFavList(); return; }
  if(S.mode === 'favManage') { renderFavManage(); return; }

  if(S.current == null) { $('en').textContent = '-'; $('zh').textContent = ''; return; }
  $('en').textContent = S.current.en; $('zh').textContent = S.current.zh || '(无中文)';
  
  if (S.alwaysZh || S.showZh) { $('zh').classList.remove('hide'); } else { $('zh').classList.add('hide'); }

  const isFav = S.favFolders.some(f => f.words.some(w => w.en === S.current.en));
  $('btnFav').textContent = isFav ? '★' : '☆'; $('btnFav').classList.toggle('active', isFav);
  $('chkAlwaysZh').checked = S.alwaysZh; $('chkAutoClean').checked = S.autoClean;
  
  const total = S.learnList.length; const normalLeft = S.learnPool.length;
  if (S.mode === 'learn') $('stat').textContent = `Learn 列表 ${total} 词 · 剩余 ${normalLeft}`;
  else if (S.mode === 'fav') {
    const folder = getCurrentFav();
    $('stat').textContent = `[${folder.name}] 共 ${folder.words.length} 词 · 剩余 ${S.favPool.length}`;
  }
}

function renderTable(){
  const t = $('tableListContent'); t.innerHTML = '';
  const query = $('searchTable').value.trim().toLowerCase();
  
  const btnToggle = $('btnToggleSelectMode'); const btnBatchDel = $('btnBatchDelete'); const btnSelectAll = $('btnSelectAll');
  const batchFavTarget = $('batchFavTarget'); const btnBatchAddFav = $('btnBatchAddFav');

  batchFavTarget.innerHTML = S.favFolders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');

  if (S.selectMode) {
    btnToggle.textContent = '退出多选'; btnToggle.classList.add('btn-danger');
    btnSelectAll.style.display = 'inline-block'; btnBatchDel.style.display = 'inline-block';
    batchFavTarget.style.display = 'inline-block'; btnBatchAddFav.style.display = 'inline-block';
    btnBatchDel.textContent = `删除 (${S.selectedWords.length})`;
    btnSelectAll.textContent = (S.words.length > 0 && S.selectedWords.length === S.words.length) ? '取消全选' : '全选';
  } else {
    btnToggle.textContent = '开启多选'; btnToggle.classList.remove('btn-danger');
    btnSelectAll.style.display = 'none'; btnBatchDel.style.display = 'none'; batchFavTarget.style.display = 'none'; btnBatchAddFav.style.display = 'none';
    S.selectedWords = []; 
  }

  if(S.words.length === 0) { t.innerHTML = '<div style="text-align:center; padding:20px; color:var(--sub);">总表为空，请导入</div>'; return; }

  const filteredWords = S.words.filter(w => w.en.toLowerCase().includes(query) || (w.zh && w.zh.includes(query)));
  if (filteredWords.length === 0) { t.innerHTML = '<div style="text-align:center; padding:20px; color:var(--sub);">没有找到匹配的单词</div>'; return; }

  filteredWords.forEach(w => {
    const inLearn = S.learnList.some(lw => lw.en === w.en); 
    const inAnyFav = S.favFolders.some(f => f.words.some(fw => fw.en === w.en)); 
    const isChecked = S.selectedWords.includes(w.en);
    const div = document.createElement('div'); div.className = 'list-item';
    
    let leftHtml = `<div class="list-item-left">`;
    if (S.selectMode) leftHtml += `<input type="checkbox" class="chk-item" data-en="${w.en}" ${isChecked ? 'checked' : ''}>`;
    leftHtml += `<div style="min-width: 0; flex: 1;"><div class="list-item-word" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${w.en}</div><div class="list-item-zh" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${w.zh}</div></div></div>`;
    
    let rightHtml = `<div style="display: flex; gap: 6px; flex-shrink: 0;">`;
    if (!S.selectMode) {
      const starIcon = inAnyFav ? '★' : '☆';
      const starColor = inAnyFav ? 'var(--yellow)' : 'var(--text)';
      const starBorder = inAnyFav ? 'var(--yellow)' : 'var(--border)';
      rightHtml += `
        <button class="btn-small btn-toggle-fav" data-en="${w.en}" style="color: ${starColor}; border-color: ${starBorder};">${starIcon}</button>
        <button class="btn-add ${inLearn ? 'added' : ''}" data-en="${w.en}">${inLearn ? '已在 Learn' : '+ Learn'}</button>
        <button class="btn-small btn-danger btn-del" data-en="${w.en}">🗑️</button>
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
        const wordStr = e.target.dataset.en; const targetWord = S.words.find(w => w.en === wordStr);
        const inAnyFav = S.favFolders.some(f => f.words.some(fw => fw.en === wordStr));
        if (inAnyFav) {
          S.favFolders.forEach(folder => {
            const idx = folder.words.findIndex(fw => fw.en === wordStr);
            if (idx >= 0) folder.words.splice(idx, 1);
          });
        } else {
          const targetId = $('batchFavTarget').value;
          const folder = S.favFolders.find(f => f.id === targetId);
          if(folder) folder.words.push(targetWord);
        }
        save(); renderTable();
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

function renderFavList() {
  const t = $('favListContent'); t.innerHTML = '';
  S.favFolders.forEach(folder => {
    const div = document.createElement('div'); div.className = 'folder-item';
    div.onclick = () => {
      S.currentFavId = folder.id;
      S.favPool = shuffle(folder.words.slice());
      S.current = null; S.mode = 'fav';
      render(); draw();
    };
    
    const left = document.createElement('div'); left.className = 'folder-name';
    left.innerHTML = `📁 ${folder.name} <span class="folder-count">(${folder.words.length})</span>`;
    
    const right = document.createElement('div'); right.className = 'folder-actions';
    
    const btnRename = document.createElement('button');
    btnRename.className = 'btn-small';
    btnRename.textContent = '✏️';
    btnRename.onclick = (e) => {
      e.stopPropagation();
      const newName = prompt('请输入新的收藏夹名称：', folder.name);
      if (newName && newName.trim() && newName.trim() !== folder.name) {
        folder.name = newName.trim();
        save(); renderFavList();
      }
    };

    const btnManage = document.createElement('button');
    btnManage.className = 'btn-small';
    btnManage.textContent = '⚙️';
    btnManage.onclick = (e) => {
      e.stopPropagation();
      S.currentFavId = folder.id; S.mode = 'favManage'; S.favManageSelected = [];
      render();
    };

    const btnDel = document.createElement('button');
    btnDel.className = 'btn-small btn-danger';
    btnDel.textContent = '🗑️';
    btnDel.onclick = (e) => {
      e.stopPropagation();
      if (S.favFolders.length <= 1) return alert('必须至少保留一个收藏夹！');
      if (!confirm(`确定要删除收藏夹 "${folder.name}" 吗？里面的单词不会从总词库消失。`)) return;
      S.favFolders = S.favFolders.filter(f => f.id !== folder.id);
      if (S.currentFavId === folder.id) S.currentFavId = S.favFolders[0].id;
      save(); renderFavList();
    };

    right.appendChild(btnRename);
    right.appendChild(btnManage);
    right.appendChild(btnDel);
    
    div.appendChild(left);
    div.appendChild(right);
    t.appendChild(div);
  });
}

function renderFavManage() {
  const t = $('favManageContent'); t.innerHTML = '';
  const folder = getCurrentFav();
  const query = $('searchFav').value.trim().toLowerCase();
  
  $('favManageTitle').textContent = `管理: ${folder.name}`;
  $('favMoveTarget').innerHTML = S.favFolders.filter(f => f.id !== folder.id).map(f => `<option value="${f.id}">${f.name}</option>`).join('');
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
  if(S.current && delSet.has(S.current.en)) { S.current = null; draw(); }
  S.selectedWords = []; save(); renderTable(); render();
}

$('searchTable').addEventListener('input', renderTable);
$('searchFav').addEventListener('input', renderFavManage);

$('btnCreateFolder').addEventListener('click', () => {
  const name = prompt('请输入新收藏夹的名称：');
  if (name && name.trim()) {
    const newId = generateId();
    S.favFolders.push({ id: newId, name: name.trim(), words: [] });
    save(); renderFavList();
  }
});

$('btnBackToFavList').addEventListener('click', () => { S.mode = 'favList'; render(); });
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
  const availableWords = S.words.filter(w => !S.learnList.some(lw => lw.en === w.en));
  if (availableWords.length === 0) return alert('总表里的词都已经在 Learn 里啦！');
  if (availableWords.length < count) { if(!confirm(`总表剩余未加入的词只有 ${availableWords.length} 个，是否全部加入？`)) return; }
  const shuffled = shuffle(availableWords.slice()); const pickedWords = shuffled.slice(0, Math.min(count, availableWords.length));
  pickedWords.forEach(w => { S.learnList.push(w); S.learnPool.push(w); });
  save(); renderTable(); render(); alert(`✅ 成功随机抽取 ${pickedWords.length} 个单词加入 Learn！`);
});

$('btnClearLearn').addEventListener('click', () => { if(!confirm('确定要清空 Learn 队列吗？（总词库依然保留）')) return; S.learnList = []; S.learnPool = []; save(); renderTable(); render(); });

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

$('btnCreateApi').addEventListener('click', () => {
  const newKey = prompt("请输入你的 DeepSeek API Key (sk-...):");
  if (newKey && newKey.trim()) {
    const keyStr = newKey.trim();
    const keyRegex = /^sk-[a-zA-Z0-9]{20,100}$/;
    if (!keyRegex.test(keyStr)) {
      alert('❌ 格式错误！\n\n有效的 API Key 应该以 "sk-" 开头，且后面包含至少 20 位的字母或数字。\n请检查是否复制了多余的空格或错误的字符。');
      return;
    }
    const newId = generateId(); 
    if (!S.apiKeys) S.apiKeys = [];
    S.apiKeys.push({ id: newId, key: keyStr }); 
    if (!S.currentApiId) S.currentApiId = newId; 
    save(); renderApiList();
  }
});

// 🌟 调用刚封装的 nextWord()，而不是点击不可见的 btnNext
$('card').addEventListener('click', ()=>{ 
  if(S.current == null) return; 
  if (!S.showZh && !S.alwaysZh) {
    S.showZh = true; $('zh').classList.remove('hide'); save();
  } else {
    S.showZh = false; $('zh').classList.add('hide');
    requestAnimationFrame(() => { nextWord(); });
  }
});

$('btnSpeak').addEventListener('click', ()=>{ if(S.current == null) return; if(window.speechSynthesis){ const u = new SpeechSynthesisUtterance(S.current.en); u.lang = 'en-US'; speechSynthesis.cancel(); speechSynthesis.speak(u); } });

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && (S.mode === 'learn' || S.mode === 'fav') && !$('modalImport').classList.contains('show') && !$('modalSettings').classList.contains('show')) {
    e.preventDefault(); 
    if (S.current == null) return;
    const cardEl = $('card'); cardEl.style.transform = 'scale(0.98)'; setTimeout(() => { cardEl.style.transform = ''; }, 100);
    if (!S.showZh && !S.alwaysZh) {
      S.showZh = true; $('zh').classList.remove('hide'); save();
    } else {
      S.showZh = false; $('zh').classList.add('hide');
      requestAnimationFrame(() => { nextWord(); });
    }
  }
});

$('btnFav').addEventListener('click', ()=>{
  if(S.current == null) return; 
  const folder = getCurrentFav();
  const i = folder.words.findIndex(w => w.en === S.current.en);
  if(i >= 0){ folder.words.splice(i,1); const p = S.favPool.findIndex(w => w.en === S.current.en); if(p>=0) S.favPool.splice(p,1); } 
  else { folder.words.push(S.current); S.favPool.push(S.current); }
  render(); save();
});

function switchTab(mode) {
  S.mode = mode; 
  $('tabLearn').classList.toggle('active', mode === 'learn'); $('tabTable').classList.toggle('active', mode === 'table'); $('tabFav').classList.toggle('active', mode === 'favList');
  if(mode === 'learn') { S.current = null; S.learnPool = shuffle(S.learnList.slice()); }
  render(); if(mode === 'learn' || mode === 'fav') draw(); else save();
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
  $('modalSettings').classList.remove('show'); draw(); save();
});

$('btnParse').addEventListener('click', ()=>{
  const rawVal = $('ta').value; const newList = parseLines(rawVal);
  if(!newList.length) return alert('没解析到单词');
  if (!isTextCleaned) {
    const looksDirty = rawVal.includes('<table>') || rawVal.includes('<br>') || (rawVal.match(/\[/g) || []).length > 5;
    if (looksDirty && !confirm('⚠️ 警告：检测到文本未清洗，包含大量乱码/音标/HTML标签！\n\n直接导入会导致词库非常混乱。\n\n确定要强制直接导入吗？')) return;
  }
  newList.forEach(nw => { if(!S.words.some(w => w.en === nw.en)) S.words.push(nw); });
  $('ta').value = ''; $('preview').innerHTML = '';
  $('cleanStatus').textContent = `✅ 已成功导入！当前总表 ${S.words.length} 词。请继续粘贴下一批...`;
  isTextCleaned = false;
  if (S.mode === 'table') renderTable();
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