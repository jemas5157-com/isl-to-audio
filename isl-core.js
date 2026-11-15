/* ISL Voice AI - shared core
   Feature extraction, k-NN classifier, rule-based fallback, model storage, speech. */
(function (global) {
  'use strict';

  var STORE_KEY = 'isl_model_v1';
  var FEATURE_LEN = 129; // 63 (hand 1) + 63 (hand 2) + 3 (offset between wrists)

  var DEFAULT_LABELS = ['Hello', 'Namaste', 'I Love You', 'Help Me', 'Yes, Good', 'Thank You', 'One', 'Two'];

  var DEFAULT_DICT = {
    en: { 'Hello': 'Hello', 'Namaste': 'Namaste', 'I Love You': 'I Love You', 'Help Me': 'Help Me', 'Yes, Good': 'Yes, Good', 'Thank You': 'Thank You', 'One': 'One', 'Two': 'Two' },
    hi: { 'Hello': 'हैलो', 'Namaste': 'नमस्ते', 'I Love You': 'मैं तुमसे प्यार करता हूँ', 'Help Me': 'मेरी मदद करो', 'Yes, Good': 'हाँ, अच्छा', 'Thank You': 'धन्यवाद', 'One': 'एक', 'Two': 'दो' },
    pa: { 'Hello': 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ', 'Namaste': 'ਨਮਸਤੇ', 'I Love You': 'ਮੈਂ ਤੈਨੂੰ ਪਿਆਰ ਕਰਦਾ ਹਾਂ', 'Help Me': 'ਮੇਰੀ ਮਦਦ ਕਰੋ', 'Yes, Good': 'ਹਾਂ, ਠੀਕ ਹੈ', 'Thank You': 'ਧੰਨਵਾਦ', 'One': 'ਇੱਕ', 'Two': 'ਦੋ' }
  };

  var WELCOME = {
    en: 'Welcome to our page, ISL to audio translator. This page is designed for speech impaired people.',
    hi: 'हमारे पेज पर आपका स्वागत है। यह पेज वाक्-बाधित लोगों की सहायता के लिए बनाया गया है।',
    pa: 'ਸਾਡੇ ਪੇਜ ਤੇ ਜੀ ਆਇਆਂ ਨੂੰ। ਇਹ ਪੇਜ ਬੋਲਣ ਤੋਂ ਅਸਮਰੱਥ ਲੋਕਾਂ ਦੀ ਸਹਾਇਤਾ ਲਈ ਤਿਆਰ ਕੀਤਾ ਗਿਆ ਹੈ।'
  };

  var SPEECH_CODE = { en: 'en-IN', hi: 'hi-IN', pa: 'pa-IN' };

  /* ---------- settings (localStorage, safe in private mode) ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function getSettings() {
    var lang = lsGet('isl_lang');
    if (!SPEECH_CODE[lang]) lang = 'en';
    var hold = parseInt(lsGet('isl_hold'), 10);
    if (!(hold >= 400 && hold <= 2000)) hold = 890;
    return { lang: lang, voice: lsGet('isl_voice') !== 'off', hold: hold };
  }
  function setSetting(key, value) { return lsSet('isl_' + key, String(value)); }

  /* ---------- text lookup ---------- */
  function textFor(label, lang, model) {
    var md = model && model.dict && model.dict[label];
    return (md && md[lang]) ||
      (DEFAULT_DICT[lang] && DEFAULT_DICT[lang][label]) ||
      (md && md.en) || DEFAULT_DICT.en[label] || label;
  }

  /* ---------- features ---------- */
  function normHand(lm) {
    var w = lm[0], maxD = 1e-6, pts = [], i, p;
    for (i = 0; i < lm.length; i++) {
      p = [lm[i].x - w.x, lm[i].y - w.y, lm[i].z - w.z];
      pts.push(p);
      maxD = Math.max(maxD, Math.hypot(p[0], p[1], p[2]));
    }
    var vec = [];
    for (i = 0; i < pts.length; i++) vec.push(pts[i][0] / maxD, pts[i][1] / maxD, pts[i][2] / maxD);
    return { vec: vec, scale: maxD, wrist: w };
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function extractFeatures(multi) {
    if (!multi || !multi.length) return null;
    var hands = multi.slice(0, 2).map(normHand).sort(function (a, b) { return a.wrist.x - b.wrist.x; });
    var f = new Array(FEATURE_LEN).fill(0), i;
    for (i = 0; i < 63; i++) f[i] = hands[0].vec[i];
    if (hands.length === 2) {
      for (i = 0; i < 63; i++) f[63 + i] = hands[1].vec[i];
      var s = hands[0].scale;
      f[126] = clamp((hands[1].wrist.x - hands[0].wrist.x) / s, -4, 4) * 0.25;
      f[127] = clamp((hands[1].wrist.y - hands[0].wrist.y) / s, -4, 4) * 0.25;
      f[128] = clamp((hands[1].wrist.z - hands[0].wrist.z) / s, -4, 4) * 0.25;
    }
    return f;
  }

  /* ---------- k-NN ---------- */
  function dist(a, b) {
    var s = 0, d, n = Math.min(a.length, b.length);
    for (var i = 0; i < n; i++) { d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s);
  }

  function vote(cands, k) {
    cands.sort(function (a, b) { return a.d - b.d; });
    var top = cands.slice(0, k), votes = {}, total = 0, i, w;
    for (i = 0; i < top.length; i++) {
      w = 1 / (top[i].d + 0.001);
      votes[top[i].l] = (votes[top[i].l] || 0) + w;
      total += w;
    }
    var best = '', bw = 0;
    for (var l in votes) if (votes[l] > bw) { bw = votes[l]; best = l; }
    return { label: best, confidence: total ? bw / total : 0, distance: top.length ? top[0].d : Infinity };
  }

  function predict(model, f, k) {
    var S = model && model.samples;
    if (!S || !S.length || !f) return { label: '', confidence: 0, distance: Infinity };
    var cands = new Array(S.length);
    for (var i = 0; i < S.length; i++) cands[i] = { l: S[i].l, d: dist(f, S[i].f) };
    var r = vote(cands, k || 5);
    var thr = model.threshold || 1.2;
    if (r.distance > thr || r.confidence < 0.55) return { label: '', confidence: r.confidence, distance: r.distance };
    return r;
  }

  /* Leave-one-recording-out evaluation + automatic "unknown" threshold */
  function evaluate(model) {
    var S = model.samples || [], sessions = {}, i, j;
    for (i = 0; i < S.length; i++) {
      sessions[S[i].l] = sessions[S[i].l] || {};
      sessions[S[i].l][S[i].s] = 1;
    }
    var per = {}, nearest = [], ok = 0, tot = 0;
    Object.keys(sessions).forEach(function (l) { per[l] = { sessions: Object.keys(sessions[l]).length, tot: 0, ok: 0 }; });
    var step = Math.max(1, Math.floor(S.length / 250));
    for (i = 0; i < S.length; i += step) {
      var q = S[i];
      if (per[q.l].sessions < 2) continue;
      var cands = [], bestSame = Infinity, d;
      for (j = 0; j < S.length; j++) {
        if (S[j].s === q.s) continue;
        d = dist(q.f, S[j].f);
        cands.push({ l: S[j].l, d: d });
        if (S[j].l === q.l && d < bestSame) bestSame = d;
      }
      if (bestSame < Infinity) nearest.push(bestSame);
      var r = vote(cands, 5);
      per[q.l].tot++; tot++;
      if (r.label === q.l) { per[q.l].ok++; ok++; }
    }
    var thr = 1.2;
    if (nearest.length >= 5) {
      nearest.sort(function (a, b) { return a - b; });
      thr = clamp(nearest[Math.floor(nearest.length * 0.9)] * 1.5, 0.6, 3);
    }
    return { threshold: Math.round(thr * 1000) / 1000, overall: tot ? ok / tot : null, perLabel: per };
  }

  /* ---------- model storage ---------- */
  function emptyModel() {
    var dict = {};
    DEFAULT_LABELS.forEach(function (n) { dict[n] = { en: DEFAULT_DICT.en[n], hi: DEFAULT_DICT.hi[n], pa: DEFAULT_DICT.pa[n] }; });
    return { version: 1, labels: DEFAULT_LABELS.slice(), dict: dict, samples: [], threshold: 1.2 };
  }
  function validModel(m) {
    return m && m.version === 1 && Array.isArray(m.labels) && Array.isArray(m.samples) && m.dict && typeof m.dict === 'object';
  }
  function loadModel() {
    var raw = lsGet(STORE_KEY);
    if (!raw) return null;
    try { var m = JSON.parse(raw); return validModel(m) ? m : null; } catch (e) { return null; }
  }
  function saveModel(m) { return lsSet(STORE_KEY, JSON.stringify(m)); }
  function clearModel() { lsDel(STORE_KEY); }
  function fetchModel(url) {
    return fetch(url, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { return validModel(m) ? m : null; })
      .catch(function () { return null; });
  }

  /* ---------- built-in rule classifier (used until you train your own model) ---------- */
  function d3(p1, p2) { return Math.hypot(p1.x - p2.x, p1.y - p2.y, (p1.z - p2.z) * 1.5); }

  function analyzeHand(lm) {
    var wrist = lm[0], pinkyMcp = lm[17];
    var open = function (tip, mcp) { return d3(lm[tip], wrist) > d3(lm[mcp], wrist) * 1.15; };
    return {
      isSeedha: wrist.y > lm[9].y + 0.03,
      thumbOpen: d3(lm[4], pinkyMcp) > d3(lm[3], pinkyMcp) * 1.1,
      indexOpen: open(8, 6), middleOpen: open(12, 10), ringOpen: open(16, 14), pinkyOpen: open(20, 18),
      wrist: wrist, indexTip: lm[8], thumbTip: lm[4]
    };
  }

  function ruleClassify(multi) {
    if (!multi || !multi.length) return '';
    var hs = multi.map(analyzeHand);
    if (hs.length === 2) {
      var wd = d3(hs[0].wrist, hs[1].wrist), id = d3(hs[0].indexTip, hs[1].indexTip);
      if (wd < 0.55 && id < 0.35) return 'Namaste';
      if (id < 0.18 && wd > 0.12) return 'I Love You';
    }
    var h = hs[0];
    if (h.isSeedha && h.thumbOpen && h.indexOpen && h.middleOpen && h.ringOpen && h.pinkyOpen) return 'Hello';
    if (!h.thumbOpen && !h.indexOpen && !h.middleOpen && !h.ringOpen && !h.pinkyOpen) return 'Help Me';
    if (h.thumbOpen && !h.indexOpen && !h.middleOpen && !h.ringOpen && !h.pinkyOpen && h.thumbTip.y < h.wrist.y - 0.05) return 'Yes, Good';
    if (h.isSeedha && h.indexOpen && h.middleOpen && !h.ringOpen && !h.pinkyOpen) return 'Thank You';
    if (h.indexOpen && !h.middleOpen && !h.ringOpen) return 'One';
    if (h.indexOpen && h.middleOpen && !h.ringOpen) return 'Two';
    return '';
  }

  /* ---------- speech ---------- */
  function pickVoice(code) {
    if (!('speechSynthesis' in global)) return null;
    var voices = global.speechSynthesis.getVoices() || [], base = code.split('-')[0].toLowerCase();
    var norm = function (v) { return (v.lang || '').replace('_', '-').toLowerCase(); };
    for (var i = 0; i < voices.length; i++) if (norm(voices[i]) === code.toLowerCase()) return voices[i];
    for (i = 0; i < voices.length; i++) if (norm(voices[i]).indexOf(base) === 0) return voices[i];
    return null;
  }
  function hasVoiceFor(lang) { return !!pickVoice(SPEECH_CODE[lang] || 'en-IN'); }
  function speak(text, lang) {
    if (!('speechSynthesis' in global)) return false;
    var code = SPEECH_CODE[lang] || 'en-IN';
    global.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = code; u.rate = 1;
    var v = pickVoice(code);
    if (v) u.voice = v;
    global.speechSynthesis.speak(u);
    return !!v;
  }
  if ('speechSynthesis' in global) global.speechSynthesis.getVoices();

  /* ---------- service worker ---------- */
  function registerSW() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () {});
      });
    }
  }

  global.ISL = {
    FEATURE_LEN: FEATURE_LEN, DEFAULT_LABELS: DEFAULT_LABELS, DEFAULT_DICT: DEFAULT_DICT, WELCOME: WELCOME, SPEECH_CODE: SPEECH_CODE,
    getSettings: getSettings, setSetting: setSetting, textFor: textFor,
    extractFeatures: extractFeatures, predict: predict, evaluate: evaluate,
    emptyModel: emptyModel, validModel: validModel, loadModel: loadModel, saveModel: saveModel, clearModel: clearModel, fetchModel: fetchModel,
    ruleClassify: ruleClassify, speak: speak, hasVoiceFor: hasVoiceFor, registerSW: registerSW
  };
})(window);
