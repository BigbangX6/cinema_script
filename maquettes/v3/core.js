/*
 * Cinema Script · noyau commun aux maquettes v3.
 * Données (même format que l'app, contrat avec l'extension Premiere), numérotation, clap audio,
 * glisser-déposer, clavier sur téléphone, PDF. Chaque maquette ne fait que l'affichage.
 *
 * Règles de numérotation (phase de préparation) :
 * - les plans d'une séquence sont toujours 1, 2, 3… (insérer, supprimer, changer un numéro décale les autres) ;
 * - les séquences peuvent avoir des trous (préparer la 10 sans les autres) : une séquence insérée prend
 *   « précédente + 1 » et ne décale que les numéros qui se suivent ;
 * - les numéros de prise ne sont jamais renumérotés (prise suivante = max + 1) ;
 * - on ne prévient que si des prises déjà tournées changeraient de numéro (leur clap garde l'ancien).
 */
(function () {
"use strict";
const CS = (window.CS = {});

// --- AVIS (libellés lus par l'extension : ne pas modifier) ---
const AVIS = ["❓ À vérifier", "✅ OK (Bonne)", "⭐ MASTER (Parfaite)", "😐 Moyen", "😕 Bof", "❌ KO (Ratée)"];
CS.AVIS = AVIS;
CS.AVIS_BUTTONS = [
  { label: AVIS[2], e: "⭐", s: "Master", k: "master" }, { label: AVIS[1], e: "✅", s: "OK", k: "ok" },
  { label: AVIS[3], e: "😐", s: "Moyen", k: "moyen" }, { label: AVIS[4], e: "😕", s: "Bof", k: "bof" },
  { label: AVIS[5], e: "❌", s: "KO", k: "ko" }, { label: AVIS[0], e: "❓", s: "À vérifier", k: "verif" }
];
CS.avisKey = function (a) {
  a = a || "";
  if (a.includes("MASTER")) return "master";
  if (a.includes("OK")) return "ok";
  if (a.includes("Moyen")) return "moyen";
  if (a.includes("Bof")) return "bof";
  if (a.includes("KO")) return "ko";
  return "verif";
};
CS.avisShort = (a) => (CS.AVIS_BUTTONS.find((b) => b.label === a) || CS.AVIS_BUTTONS[5]);

// --- CLAP AUDIO (copie exacte de l'original, ne pas modifier) ---
class DigitalClapper {
    constructor() {
        this.audioCtx = null;
        this.dtmfFreqs = {
            //'1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
            //'4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
            //'7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
            //'*': [941, 1209], '0': [941, 1336], '#': [941, 1477]

            '1': [10697, 12209], '2': [10697, 12336], '3': [10697, 12477],
            '4': [10770, 12209], '5': [10770, 12336], '6': [10770, 12477],
            '7': [10852, 12209], '8': [10852, 12336], '9': [10852, 12477],
            '*': [10941, 12209], '0': [10941, 12336], '#': [10941, 12477]
        };
    }
    play(scene, shot, take) {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
        const payload = `*${scene}*${shot}*${take}#*`;
        const now = this.audioCtx.currentTime;

        //this._playTransient(now);

        let timeCursor = now + 0.065;
        const toneDuration = 0.080;
        const pauseDuration = 0.120;
        for (let i = 0; i < payload.length; i++) {
            const char = payload[i];
            if (this.dtmfFreqs[char]) {
                this._playDTMF(this.dtmfFreqs[char][0], this.dtmfFreqs[char][1], timeCursor, toneDuration);
                timeCursor += toneDuration + pauseDuration;
            }
        }

    }
    _playTransient(startTime) {
        const clickOsc = this.audioCtx.createOscillator();
        const clickGain = this.audioCtx.createGain();
        clickOsc.type = 'square';
        clickOsc.frequency.value = 1000;
        clickGain.gain.setValueAtTime(0, startTime);
        clickGain.gain.linearRampToValueAtTime(1, startTime + 0.001);
        clickGain.gain.setValueAtTime(1, startTime + 0.010);
        clickGain.gain.linearRampToValueAtTime(0, startTime + 0.015);
        clickOsc.connect(clickGain);
        clickGain.connect(this.audioCtx.destination);
        clickOsc.start(startTime);
        clickOsc.stop(startTime + 0.020);
    }
    _playDTMF(f1, f2, startTime, duration) {
        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();
        osc1.frequency.value = f1;
        osc2.frequency.value = f2;
        osc1.type = 'sine';
        osc2.type = 'sine';
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.75, startTime + 0.005);
        gainNode.gain.setValueAtTime(0.75, startTime + duration - 0.005);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);
        osc1.start(startTime);
        osc2.start(startTime);
        osc1.stop(startTime + duration);
        osc2.stop(startTime + duration);
    }
}

CS.clapper = new DigitalClapper();
CS.clap = function () { const a = CS.active; if (a) CS.clapper.play(a.seqId, a.planId, CS.nextTake(a.seqId, a.planId)); };

// --- Projet d'exemple (utilisé seulement hors de One App) ---
function demoData() {
  const S = (id, info) => ({ id, info });
  const P = (seqId, id, info, temps, video) => ({ seqId, id, impro: 0, info, temps, video: video ? { id: "demo", name: video } : null });
  const sequences = [
    S(1, "INT. CUISINE – JOUR\nMarie, Paul"), S(2, "INT. SALON – JOUR\nMarie, Paul"),
    S(5, "EXT. RUE DEVANT L'IMMEUBLE – NUIT\nPaul"), S(6, "INT. CAGE D'ESCALIER – NUIT\nMarie, la voisine"),
    S(7, "INT. APPARTEMENT DE LA VOISINE – NUIT\nMarie, la voisine"), S(9, "EXT. TOIT DE L'IMMEUBLE – AUBE\nMarie, Paul")
  ];
  const plans = [
    P(1, 1, "PL fixe. Marie entre, pose les courses. Paul lit sans lever les yeux.", "20 min"),
    P(1, 2, "PM travelling. Les mains de Marie rangent, jusqu'au frigo vide.", "30 min", "repetition_cuisine_1-2.mp4"),
    P(1, 3, "GP. Paul lève enfin les yeux de son journal.", "15 min"),
    P(1, 4, "Champ-contrechamp : « Tu as encore oublié le pain. »", "40 min"),
    P(2, 1, "PE. Le salon en désordre, Marie traverse.", "20 min"),
    P(2, 2, "PR. Paul au téléphone, dos à la fenêtre.", "25 min"),
    P(2, 3, "Insert. La photo de mariage retournée.", "10 min"),
    P(5, 1, "PE grue. Paul sort de l'immeuble, la rue est vide.", "45 min", "demo_grue_5-1.mp4"),
    P(5, 2, "PA épaule. Paul allume une cigarette, hésite.", "25 min"),
    P(5, 3, "Insert. Le briquet qui ne s'allume pas.", "10 min"),
    P(5, 4, "PL. Paul s'éloigne sous les réverbères.", "20 min"),
    P(6, 1, "PM panoramique. La voisine entrouvre sa porte.", "30 min"),
    P(6, 2, "GP. Marie, essoufflée, s'arrête sur le palier.", "20 min"),
    P(6, 3, "Plongée. La cage d'escalier vue du dernier étage.", "25 min"),
    P(7, 1, "PE. L'appartement encombré de plantes.", "20 min"),
    P(7, 2, "Champ-contrechamp. La voisine sert le thé.", "45 min"),
    P(9, 1, "PL. Le jour se lève sur les toits.", "30 min", "reperage_toit_9-1.mp4"),
    P(9, 2, "PM. Marie et Paul assis côte à côte.", "30 min"),
    P(9, 3, "GP. La main de Paul cherche celle de Marie.", "15 min")
  ];
  const sep = (text) => ({ type: "sep", text });
  const pl = (k) => { const [s, p] = k.split(".").map(Number); return { type: "plan", seqId: s, planId: p }; };
  const tournageList = [
    sep("Lundi 14 · matin · Appartement"), ...["1.1", "1.2", "1.3", "2.1", "2.2", "1.4", "2.3"].map(pl),
    sep("Lundi 14 · après-midi · Cage d'escalier"), ...["6.1", "6.2", "7.1", "6.3", "7.2"].map(pl),
    sep("Mardi 15 · nuit · Rue"), ...["5.1", "5.2", "5.3", "5.4"].map(pl),
    sep("Mercredi 16 · aube · Toit"), ...["9.1", "9.2", "9.3"].map(pl)
  ];
  const takes = [];
  let t = Date.parse("2026-10-14T06:40:00Z");
  const T = (k, avis, com) => {
    const [s, p] = k.split(".").map(Number);
    t += 7 * 60000;
    takes.push({ uid: "demo" + takes.length, seqId: s, planId: p, prise: takes.filter((x) => x.seqId === s && x.planId === p).length + 1, avis, com: com || "", timestamp: new Date(t).toISOString() });
  };
  T("1.1", AVIS[5], "Perche dans le champ"); T("1.1", AVIS[1]); T("1.1", AVIS[2], "La bonne");
  T("1.2", AVIS[4], "Bruit de frigo"); T("1.2", AVIS[1]);
  T("1.3", AVIS[3], "Regard trop tôt"); T("1.3", AVIS[2]);
  T("2.1", AVIS[1]);
  T("2.2", AVIS[5], "Texte oublié"); T("2.2", AVIS[3], "Point flou en fin de plan");
  return { v: 1, sequences, plans, takes, tournageList };
}

CS.demoData = demoData;

window.OneAppAPI = window.OneAppAPI || {
  loadData: async () => ({ app_data: demoData(), readOnly: false }),
  saveData: () => {},
  onDataChange: () => {},
  onModeChange: () => {},
  getFileName: () => "Le Dernier Métro (exemple)",
  onNameChange: () => {}
};

// --- DONNÉES ---
const DEFAULT_STATE = { v: 1, sequences: [{ id: 1, info: "" }], plans: [{ seqId: 1, id: 1, impro: 0, info: "", temps: "", video: null }], takes: [], tournageList: [{ type: "plan", seqId: 1, planId: 1 }] };
function newUid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
CS.normalize = function (data) {
  if (!data || Array.isArray(data) || typeof data !== "object") return structuredClone(DEFAULT_STATE);
  const s = { ...structuredClone(DEFAULT_STATE), ...data };
  ["sequences", "plans", "takes", "tournageList"].forEach((k) => { if (!Array.isArray(s[k])) s[k] = []; });
  s.takes.forEach((t) => { if (!t.uid) t.uid = newUid(); });
  s.plans.forEach((p) => { if (p.video === undefined) p.video = null; });
  s.plans.forEach((p) => {
    if (!s.tournageList.some((i) => i.type === "plan" && i.seqId === p.seqId && i.planId === p.id)) s.tournageList.push({ type: "plan", seqId: p.seqId, planId: p.id });
  });
  s.v = 1;
  return s;
};
CS.state = CS.normalize(null);
CS.readOnly = false;
CS.active = null;            // plan en cours de tournage { seqId, planId }

// --- ENREGISTREMENT ---
let renderFn = () => {};
let saveTimer = null;
CS.render = () => renderFn();
CS.commit = function () { if (CS.readOnly) return; clearTimeout(saveTimer); saveTimer = null; renderFn(); OneAppAPI.saveData(CS.state); };
CS.saveSoon = function () { if (CS.readOnly) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveTimer = null; OneAppAPI.saveData(CS.state); }, 800); };
CS.saveNow = function () { if (!saveTimer) return; clearTimeout(saveTimer); saveTimer = null; if (!CS.readOnly) OneAppAPI.saveData(CS.state); };
CS.projectName = () => (OneAppAPI.getFileName && OneAppAPI.getFileName()) || "Projet";

// --- LECTURE ---
const S = () => CS.state;
CS.key = (p) => p.seqId + "." + p.id;
CS.seqs = () => [...S().sequences].sort((a, b) => a.id - b.id);
CS.seq = (id) => S().sequences.find((s) => s.id === id);
CS.plansOf = (seqId) => S().plans.filter((p) => p.seqId === seqId).sort((a, b) => a.id - b.id);
CS.plan = (seqId, id) => S().plans.find((p) => p.seqId === seqId && p.id === id);
CS.takesOf = (seqId, planId) => S().takes.filter((t) => t.seqId === seqId && t.planId === planId).sort((a, b) => a.prise - b.prise);
CS.nextTake = (seqId, planId) => CS.takesOf(seqId, planId).reduce((m, t) => Math.max(m, t.prise), 0) + 1;
CS.isActive = (p) => !!CS.active && CS.active.seqId === p.seqId && CS.active.planId === p.id;
CS.activePlan = () => (CS.active ? CS.plan(CS.active.seqId, CS.active.planId) : null);
CS.seqTitle = (id) => { const s = CS.seq(id); return s && s.info ? s.info.split("\n")[0] : ""; };
CS.seqColor = function (seqId) {
  const i = CS.seqs().findIndex((s) => s.id === seqId);
  return "hsl(" + ((Math.max(0, i) * 67 + 205) % 360) + " 62% 58%)";
};
CS.minutes = function (s) {
  s = String(s || "").toLowerCase().replace(/\s/g, "");
  let m = s.match(/(\d+)h(\d+)?/);
  if (m) return +m[1] * 60 + (+m[2] || 0);
  m = s.match(/(\d+)/);
  return m ? +m[1] : 0;
};
CS.fmtMin = (m) => (m < 60 ? m + " min" : Math.floor(m / 60) + " h" + (m % 60 ? " " + String(m % 60).padStart(2, "0") : ""));
CS.lastTake = () => S().takes.reduce((b, t) => (!b || (t.timestamp || "") > (b.timestamp || "") ? t : b), null);
// Premier plan sans prise après celui de la dernière prise (dans l'ordre de tournage)
CS.nextToShoot = function () {
  const last = CS.lastTake(), list = S().tournageList;
  const start = last ? list.findIndex((i) => i.type === "plan" && i.seqId === last.seqId && i.planId === last.planId) + 1 : 0;
  for (let k = Math.max(0, start); k < list.length; k++) {
    const i = list[k];
    if (i.type === "plan" && CS.plan(i.seqId, i.planId) && !CS.takesOf(i.seqId, i.planId).length) return CS.plan(i.seqId, i.planId);
  }
  return null;
};
// Journées : les séparateurs du plan de travail et les plans qui les suivent
CS.days = function () {
  const groups = [];
  let g = null;
  S().tournageList.forEach((item, index) => {
    if (item.type === "sep") { g = { sep: item, index, items: [] }; groups.push(g); return; }
    if (!g) { g = { sep: null, index: -1, items: [] }; groups.push(g); }
    const p = CS.plan(item.seqId, item.planId);
    if (p) g.items.push({ index, p });
  });
  return groups;
};
CS.dayEnd = function (sepIndex) {
  const n = S().tournageList.findIndex((i, k) => k > sepIndex && i.type === "sep");
  return n === -1 ? S().tournageList.length : n;
};
CS.dayOf = (p) => CS.days().find((g) => g.items.some((x) => x.p === p)) || null;
CS.orderIndex = (p) => S().tournageList.findIndex((i) => i.type === "plan" && i.seqId === p.seqId && i.planId === p.id);
CS.dayMinutes = (g) => g.items.reduce((a, { p }) => a + CS.minutes(p.temps), 0);

// --- RECHERCHE ---
CS.fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
CS.parseQuery = function (q) {
  q = CS.fold(q).trim();
  if (!q) return null;
  let m = q.match(/^(\d+)$/);
  if (m) return { seq: +m[1] };
  m = q.match(/^(\d+)\s*[.\-\/ ]\s*(\d+)$/);
  if (m) return { seq: +m[1], plan: +m[2] };
  return { text: q };
};
CS.matches = function (p, q) {
  if (!q) return true;
  if (q.seq !== undefined) return p.seqId === q.seq && (q.plan === undefined || p.id === q.plan);
  return CS.fold([p.info, p.temps, (CS.seq(p.seqId) || {}).info, p.video && p.video.name].join(" ")).includes(q.text);
};

// --- MODIFICATIONS ---
CS.confirmRenumber = (affected) => (affected
  ? CS.ask("Prises déjà tournées", "Des prises existent sur les plans renumérotés : leur clap garde l'ancien numéro, la synchronisation au montage ne les retrouvera plus.", "Renuméroter quand même", true)
  : Promise.resolve(true));

// Renumérote les plans d'une séquence 1, 2, 3… dans l'ordre donné (prises et plan de travail suivent)
CS.renumberPlans = async function (seqId, order) {
  const byOld = new Map();
  order.forEach((p, i) => { if (p.id !== i + 1) byOld.set(p.id, i + 1); });
  if (!byOld.size) return true;
  if (!(await CS.confirmRenumber(S().takes.some((t) => t.seqId === seqId && byOld.has(t.planId))))) return false;
  S().takes.forEach((t) => { if (t.seqId === seqId && byOld.has(t.planId)) t.planId = byOld.get(t.planId); });
  S().tournageList.forEach((i) => { if (i.type === "plan" && i.seqId === seqId && byOld.has(i.planId)) i.planId = byOld.get(i.planId); });
  if (CS.active && CS.active.seqId === seqId && byOld.has(CS.active.planId)) CS.active.planId = byOld.get(CS.active.planId);
  order.forEach((p, i) => { p.id = i + 1; });
  return true;
};

function contiguousFrom(ids, start) { const run = []; for (let n = start; ids.includes(n); n++) run.push(n); return run; }
function shiftSeq(n, d) {
  S().sequences.find((s) => s.id === n).id = n + d;
  S().plans.forEach((p) => { if (p.seqId === n) p.seqId = n + d; });
  S().takes.forEach((t) => { if (t.seqId === n) t.seqId = n + d; });
  S().tournageList.forEach((i) => { if (i.type === "plan" && i.seqId === n) i.seqId = n + d; });
  if (CS.active && CS.active.seqId === n) CS.active.seqId = n + d;
}

// Nouvelle séquence après la séquence afterId (0 = en tête) ; renvoie son numéro
CS.insertSeq = async function (afterId) {
  const id = (afterId || 0) + 1;
  const run = contiguousFrom(S().sequences.map((s) => s.id), id);
  if (run.length && !(await CS.confirmRenumber(S().takes.some((t) => run.includes(t.seqId))))) return null;
  [...run].reverse().forEach((n) => shiftSeq(n, 1));
  S().sequences.push({ id, info: "" });
  CS.lastShift = { seqs: run.map((n) => n + 1) };
  CS.commit();
  return id;
};
// Nouveau plan au rang pos (0 = premier) de la séquence ; renvoie le plan
CS.insertPlan = async function (seqId, pos) {
  const plans = CS.plansOf(seqId);
  pos = Math.max(0, Math.min(pos, plans.length));
  const prev = pos > 0 ? plans[pos - 1] : null;
  const np = { seqId, id: 0, impro: 0, info: "", temps: "", video: null };
  const order = [...plans];
  order.splice(pos, 0, np);
  if (!(await CS.renumberPlans(seqId, order))) return null;
  S().plans.push(np);
  const prevIdx = prev ? CS.orderIndex(prev) : -1;
  S().tournageList.splice(prevIdx === -1 ? S().tournageList.length : prevIdx + 1, 0, { type: "plan", seqId, planId: np.id });
  CS.commit();
  return np;
};
// Changer le numéro d'une séquence : "" = fait, texte = erreur, null = annulé
CS.setSeqNum = async function (oldId, str) {
  const newId = parseInt(str, 10);
  if (newId === oldId) return "";
  if (isNaN(newId) || newId <= 0) return "Numéro invalide.";
  if (CS.seq(newId)) return "La séquence " + newId + " existe déjà.";
  if (!(await CS.confirmRenumber(S().takes.some((t) => t.seqId === oldId)))) return null;
  shiftSeq(oldId, newId - oldId);
  CS.commit();
  return "";
};
// Changer le numéro d'un plan = le placer à ce rang dans sa séquence (les autres suivent)
CS.setPlanNum = async function (seqId, oldId, str) {
  const plans = CS.plansOf(seqId);
  let n = parseInt(str, 10);
  if (isNaN(n) || n <= 0) return "Numéro invalide.";
  n = Math.min(n, plans.length);
  if (n === oldId) return "";
  const p = CS.plan(seqId, oldId);
  const order = plans.filter((x) => x !== p);
  order.splice(n - 1, 0, p);
  if (!(await CS.renumberPlans(seqId, order))) return null;
  CS.commit();
  return "";
};
CS.deleteSeq = function (seqId) {
  S().sequences = S().sequences.filter((s) => s.id !== seqId);
  S().plans = S().plans.filter((p) => p.seqId !== seqId);
  S().takes = S().takes.filter((t) => t.seqId !== seqId);
  S().tournageList = S().tournageList.filter((i) => !(i.type === "plan" && i.seqId === seqId));
  if (CS.active && CS.active.seqId === seqId) CS.active = null;
  CS.commit();
};
CS.deletePlan = async function (seqId, planId) {
  S().plans = S().plans.filter((p) => !(p.seqId === seqId && p.id === planId));
  S().takes = S().takes.filter((t) => !(t.seqId === seqId && t.planId === planId));
  S().tournageList = S().tournageList.filter((i) => !(i.type === "plan" && i.seqId === seqId && i.planId === planId));
  if (CS.active && CS.active.seqId === seqId && CS.active.planId === planId) CS.active = null;
  await CS.renumberPlans(seqId, CS.plansOf(seqId));
  CS.commit();
};
CS.insertDay = function (at, text) { S().tournageList.splice(at, 0, { type: "sep", text: text || "" }); CS.commit(); return at; };
CS.deleteDay = function (index) { S().tournageList.splice(index, 1); CS.commit(); };
CS.moveItem = function (from, at) {
  const item = S().tournageList.splice(from, 1)[0];
  const to = at > from ? at - 1 : at;
  S().tournageList.splice(to, 0, item);
  CS.commit();
  return to;
};
CS.moveDay = function (from, at) {
  const end = CS.dayEnd(from);
  if (at >= from && at <= end) return from;
  const block = S().tournageList.splice(from, end - from);
  const to = at > from ? at - block.length : at;
  S().tournageList.splice(to, 0, ...block);
  CS.commit();
  return to;
};
// Plan improvisé : numéroté en fin de séquence, placé dans l'ordre de tournage en « at » (ou après le plan actif)
CS.addImpro = function (seqId, at, info) {
  const id = CS.plansOf(seqId).reduce((m, p) => Math.max(m, p.id), 0) + 1;
  const p = { seqId, id, impro: 1, info: info || "", temps: "", video: null };
  S().plans.push(p);
  if (at === null || at === undefined) {
    const a = CS.activePlan();
    at = a ? CS.orderIndex(a) + 1 : S().tournageList.length;
  }
  S().tournageList.splice(at, 0, { type: "plan", seqId, planId: id });
  CS.active = { seqId, planId: id };
  CS.commit();
  return p;
};
// Enregistre une prise sur le plan actif (confirmation visuelle + Annuler)
CS.saveTake = function (avis, com) {
  const p = CS.activePlan();
  if (CS.readOnly || !p) return null;
  CS.saveNow();
  const t = { uid: newUid(), seqId: p.seqId, planId: p.id, prise: CS.nextTake(p.seqId, p.id), avis, com: (com || "").trim(), timestamp: new Date().toISOString() };
  S().takes.push(t);
  CS.commit();
  CS.toast("Prise " + t.prise + " enregistrée · " + avis, () => { S().takes = S().takes.filter((x) => x.uid !== t.uid); CS.commit(); });
  return t;
};
CS.deleteTake = function (uid) { S().takes = S().takes.filter((t) => t.uid !== uid); CS.commit(); };
// Vidéo de référence : dans l'app, Google Picker (vidéos de Drive) → { id, name }. Ici, une vidéo fictive.
CS.pickVideo = function (p) { p.video = { id: "demo", name: "demo_plan_" + p.seqId + "-" + p.id + ".mp4" }; CS.commit(); };
CS.removeVideo = function (p) { p.video = null; CS.commit(); };

// --- ÉLÉMENTS D'INTERFACE ---
CS.el = function (tag, attrs, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "text") e.textContent = v;
    else if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "value") e.value = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  children.flat(Infinity).forEach((c) => { if (c !== null && c !== undefined && c !== false) e.append(c); });
  return e;
};
const el = CS.el;
CS.autoResize = (t) => { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; };
// Texte modifiable sur place, enregistré après une pause
CS.textField = function (obj, key, placeholder, cls, single) {
  const f = el(single ? "input" : "textarea", {
    class: "cs-edit " + (cls || ""), placeholder: CS.readOnly ? "" : placeholder, value: obj[key] || "", readonly: CS.readOnly, rows: single ? null : 1,
    "aria-label": placeholder, type: single ? "text" : null,
    oninput: (e) => { obj[key] = e.target.value; if (!single) CS.autoResize(e.target); CS.saveSoon(); },
    onchange: CS.saveNow
  });
  if (!single) requestAnimationFrame(() => CS.autoResize(f));
  return f;
};
let toastTimer = null;
CS.toast = function (msg, undo) {
  clearTimeout(toastTimer);
  document.querySelectorAll(".cs-toast").forEach((t) => t.remove());
  const t = el("div", { class: "cs-toast", role: "status" }, el("span", { text: msg }),
    undo ? el("button", { type: "button", text: "Annuler", onclick: () => { undo(); t.remove(); } }) : null);
  document.body.append(t);
  toastTimer = setTimeout(() => t.remove(), undo ? 6000 : 3500);
};
CS.modal = function (title, build) {
  const close = () => back.remove();
  const back = el("div", { class: "cs-modal-back", onclick: (e) => { if (e.target === back) close(); } },
    el("div", { class: "cs-modal", role: "dialog", "aria-label": title }, title ? el("h3", { text: title }) : null, build(close)));
  document.body.append(back);
  const first = back.querySelector("input");
  if (first) setTimeout(() => { first.focus(); if (first.select) first.select(); }, 30);
  return close;
};
CS.ask = (title, message, okLabel, danger) => new Promise((resolve) => {
  CS.modal(title, (close) => [
    el("p", { text: message }),
    el("div", { class: "cs-actions" },
      el("button", { class: "cs-btn", type: "button", text: "Annuler", onclick: () => { close(); resolve(false); } }),
      el("button", { class: "cs-btn " + (danger ? "danger" : "primary"), type: "button", text: okLabel || "Continuer", onclick: () => { close(); resolve(true); } }))
  ]);
});
// Saisie d'un numéro dans une petite fenêtre (séquence ou plan)
CS.askNumber = function (title, value, hint, apply) {
  CS.modal(title, (close) => {
    const err = el("p", { class: "cs-error", hidden: true });
    const input = el("input", { class: "cs-input", type: "number", inputmode: "numeric", min: "1", value: String(value), "aria-label": title });
    const go = async () => {
      const r = await apply(input.value);
      if (r === "" || r === null) close();
      else { err.textContent = r; err.hidden = false; input.focus(); }
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } });
    return [hint ? el("p", { text: hint }) : null, input, err,
      el("div", { class: "cs-actions" },
        el("button", { class: "cs-btn", type: "button", text: "Annuler", onclick: close }),
        el("button", { class: "cs-btn primary", type: "button", text: "Valider", onclick: go }))];
  });
};
CS.previewVideo = function (p) {
  CS.modal("Plan " + CS.key(p) + " · vidéo de référence", (close) => [
    // Dans l'app : <iframe src="https://drive.google.com/file/d/ID/preview">
    el("div", { class: "cs-video", "aria-label": "Lecteur vidéo" }, "▶"),
    el("p", { text: p.video.name + " · Google Drive" }),
    el("div", { class: "cs-actions" },
      CS.readOnly ? null : el("button", { class: "cs-btn danger", type: "button", text: "Retirer", onclick: () => { close(); CS.removeVideo(p); } }),
      CS.readOnly ? null : el("button", { class: "cs-btn", type: "button", text: "Changer", onclick: () => { close(); CS.pickVideo(p); } }),
      el("button", { class: "cs-btn primary", type: "button", text: "Fermer", onclick: close }))
  ]);
};
// Choix de la séquence d'un plan improvisé
CS.improDialog = function (defaultSeq, at, after) {
  const seqs = CS.seqs();
  if (!seqs.length) return;
  let seqId = defaultSeq !== null && defaultSeq !== undefined && CS.seq(defaultSeq) ? defaultSeq : seqs[0].id;
  CS.modal("⚡ Plan improvisé", (close) => {
    const chips = el("div", { class: "cs-chips" });
    const info = el("p");
    const desc = el("input", { class: "cs-input", type: "text", placeholder: "Ce qu'on tourne (facultatif)", "aria-label": "Description du plan improvisé" });
    const go = el("button", { class: "cs-btn impro", type: "button" });
    const refresh = () => {
      chips.replaceChildren(...seqs.map((s) => el("button", { class: "cs-chip" + (s.id === seqId ? " on" : ""), type: "button", text: "SÉQ " + s.id, onclick: () => { seqId = s.id; refresh(); } })));
      const n = seqId + "." + (CS.plansOf(seqId).length + 1);
      info.textContent = "Numéroté " + n + ", à la fin de la séquence " + seqId + " : les autres plans gardent leur numéro.";
      go.textContent = "Créer " + n;
    };
    go.addEventListener("click", () => { close(); const p = CS.addImpro(seqId, at, desc.value.trim()); if (after) after(p); });
    refresh();
    return [chips, info, desc, el("div", { class: "cs-actions" }, el("button", { class: "cs-btn", type: "button", text: "Annuler", onclick: close }), go)];
  });
};

// --- GLISSER (bouton flottant ou poignée) ---
// opt.resolve(x, y, under) renvoie { rect, before, text, run, into, hoverKey, hoverOpen } ou null.
let drag = null;
CS.dragging = () => !!drag;
CS.beginDrag = function (e, opt) {
  if (CS.readOnly || (e.button !== undefined && e.button !== 0)) return;
  e.preventDefault();
  CS.saveNow();
  drag = { opt, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, target: null, ghost: null, line: null, raf: null, hoverKey: null, hoverTimer: null, armed: !!opt.armed };
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onEnd);
  window.addEventListener("pointercancel", onEnd);
};
function onMove(e) {
  if (!drag) return;
  drag.x = e.clientX; drag.y = e.clientY;
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
    drag.moved = true;
    document.body.classList.add("cs-dragging");
    drag.ghost = el("div", { class: "cs-ghost", text: drag.opt.label });
    drag.line = el("div", { class: "cs-line" }, el("span"));
    document.body.append(drag.ghost, drag.line);
    if (drag.opt.onStart) drag.opt.onStart();
    scrollLoop();
  }
  e.preventDefault();
  drag.ghost.style.left = e.clientX + "px";
  drag.ghost.style.top = (e.clientY - 22) + "px";
  resolve();
}
function scroller() { return drag.opt.scroller ? drag.opt.scroller() : document.scrollingElement; }
function scrollLoop() {
  if (!drag) return;
  const sc = scroller();
  const r = sc === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : sc.getBoundingClientRect();
  const top = r.top + (drag.opt.topInset ? drag.opt.topInset() : 0) + 60;
  const bottom = r.bottom - (drag.opt.bottomInset ? drag.opt.bottomInset() : 0) - 80;
  if (drag.y < bottom - 80) drag.armed = true;   // les boutons sont en bas : défilement vers le bas seulement après être remonté
  let d = 0;
  if (drag.y < top) d = -Math.min(22, (top - drag.y) / 3 + 4);
  else if (drag.armed && drag.y > bottom) d = Math.min(22, (drag.y - bottom) / 3 + 4);
  if (d) { sc.scrollTop += d; resolve(); }
  drag.raf = requestAnimationFrame(scrollLoop);
}
function resolve() {
  document.querySelectorAll(".cs-into").forEach((n) => n.classList.remove("cs-into"));
  const under = document.elementFromPoint(drag.x, drag.y);
  const t = under ? drag.opt.resolve(drag.x, drag.y, under) : null;
  drag.target = t;
  if (t && t.hoverKey !== undefined && t.hoverKey !== drag.hoverKey) {
    clearTimeout(drag.hoverTimer);
    drag.hoverKey = t.hoverKey;
    if (t.hoverOpen) drag.hoverTimer = setTimeout(() => { if (drag && drag.hoverKey === t.hoverKey) { t.hoverOpen(); CS.render(); resolve(); } }, 650);
  }
  if (!t) { drag.line.style.display = "none"; return; }
  if (t.into) t.into.classList.add("cs-into");
  const y = t.before ? t.rect.top - 5 : t.rect.bottom + 1;
  Object.assign(drag.line.style, { display: "block", top: y + "px", left: t.rect.left + "px", width: t.rect.width + "px" });
  drag.line.firstChild.textContent = t.text;
}
function onEnd(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onEnd);
  window.removeEventListener("pointercancel", onEnd);
  cancelAnimationFrame(d.raf);
  clearTimeout(d.hoverTimer);
  document.body.classList.remove("cs-dragging");
  document.querySelectorAll(".cs-into").forEach((n) => n.classList.remove("cs-into"));
  if (d.ghost) d.ghost.remove();
  if (d.line) d.line.remove();
  if (d.opt.onEnd) d.opt.onEnd();
  if (e.type === "pointercancel") return;
  if (!d.moved) { if (d.opt.onTap) d.opt.onTap(); return; }
  if (d.target && d.target.run) d.target.run();
}
// Aide : position avant/après selon la moitié de l'élément
CS.half = (node, y, cap) => { const r = node.getBoundingClientRect(); return { rect: r, before: y < r.top + Math.min(r.height / 2, cap || 1e9) }; };

// --- APRÈS RENDU : surligner, faire défiler, donner le focus ---
let after = {};
CS.afterRender = function (o) { Object.assign(after, o); };
function runAfter() {
  const a = after;
  after = {};
  requestAnimationFrame(() => {
    const scrollTo = a.scroll && document.querySelector(a.scroll);
    if (scrollTo) scrollTo.scrollIntoView({ block: "center" });
    const fl = a.flash && document.querySelector(a.flash);
    if (fl) { fl.classList.remove("cs-flash"); void fl.offsetWidth; fl.classList.add("cs-flash"); if (!scrollTo) fl.scrollIntoView({ block: "nearest" }); }
    const f = a.focus && document.querySelector(a.focus);
    if (f) f.focus({ preventScroll: !!scrollTo });
  });
}

// --- CLAVIER SUR TÉLÉPHONE : le champ touché se place juste au-dessus du clavier ---
// En haut on laisse libres la barre de One App (hauteur à confirmer) et les éléments collés de la maquette.
CS.ONEAPP_BAR = 56;
CS.keyboard = function (topReserved) {
  const place = (f) => {
    if (window.matchMedia("(min-width: 900px)").matches || !f.isConnected) return;
    const vv = window.visualViewport, r = f.getBoundingClientRect();
    const top = (vv ? vv.offsetTop : 0) + CS.ONEAPP_BAR + (topReserved ? topReserved() : 0) + 8;
    const bottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 12;
    let d = 0;
    if (r.height > bottom - top) d = r.top - top;
    else if (r.bottom > bottom) d = r.bottom - bottom;
    else if (r.top < top) d = r.top - top;
    if (Math.abs(d) > 2) window.scrollBy({ top: d, behavior: "smooth" });
  };
  document.addEventListener("focusin", (e) => {
    const f = e.target;
    if (!f.matches || !f.matches("textarea, input:not([type=number]):not([type=button])")) return;
    if (window.visualViewport) window.visualViewport.addEventListener("resize", () => place(f), { once: true });
    setTimeout(() => place(f), 350);
  });
  document.addEventListener("input", (e) => { if (e.target.matches && e.target.matches("textarea")) place(e.target); });
};

// --- PDF (impression du navigateur) ---
CS.exportPDF = function (kind) {
  CS.saveNow();
  let area = document.getElementById("cs-print");
  if (!area) { area = el("div", { id: "cs-print" }); document.body.append(area); }
  const date = new Date().toLocaleDateString("fr-FR");
  const head = (title) => [el("div", { class: "p-title", text: title }), el("div", { class: "p-sub" }, "PROJET : ", el("strong", { text: CS.projectName() }), " | ÉDITÉ LE : " + date)];
  const body = el("tbody");
  if (kind === "travail") {
    S().tournageList.forEach((i) => {
      if (i.type === "sep") body.append(el("tr", {}, el("td", { colspan: 3, class: "p-sep", text: "--- " + (i.text || "JOURNÉE") + " ---" })));
      else { const p = CS.plan(i.seqId, i.planId); if (p) body.append(el("tr", {}, el("td", {}, el("strong", { text: "S" + p.seqId + " - P" + p.id }), p.impro ? " (Impro)" : ""), el("td", { text: p.info || "" }), el("td", { text: p.temps || "" }))); }
    });
    area.replaceChildren(...head("Plan de tournage / Feuille de service"), el("table", {}, el("thead", {}, el("tr", {}, el("th", { text: "SÉQ - PLAN" }), el("th", { text: "DESCRIPTION" }), el("th", { text: "TEMPS" }))), body));
  } else {
    CS.seqs().forEach((s) => {
      body.append(el("tr", { class: "p-seq" }, el("td", { text: String(s.id) }), el("td"), el("td", { text: s.info || "" })));
      CS.plansOf(s.id).forEach((p) => body.append(el("tr", {}, el("td"), el("td", { text: String(p.id) + (p.impro ? " (Impro)" : "") }), el("td", { text: p.info || "" }))));
    });
    area.replaceChildren(...head("Découpage technique"), el("table", {}, el("thead", {}, el("tr", {}, el("th", { text: "SÉQ" }), el("th", { text: "PLAN" }), el("th", { text: "DESCRIPTION" }))), body));
  }
  window.print();
};
document.head.append(el("style", {}, `
  #cs-print { display: none; }
  @media print {
    body > *:not(#cs-print) { display: none !important; }
    body { background: #fff !important; color: #000 !important; }
    #cs-print { display: block !important; font-family: system-ui, sans-serif; padding: 20px; }
    #cs-print .p-title { color: #d0021b; text-align: center; font-size: 26px; text-transform: uppercase; }
    #cs-print .p-sub { text-align: center; color: #555; margin: 4px 0 24px; font-size: 13px; }
    #cs-print table { width: 100%; border-collapse: collapse; font-size: 12px; }
    #cs-print th { background: #222 !important; color: #fff !important; padding: 8px; text-align: left; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    #cs-print td { border: 1px solid #ccc; padding: 8px; vertical-align: top; white-space: pre-wrap; }
    #cs-print tr { page-break-inside: avoid; }
    #cs-print .p-seq td { background: #e3f2fd !important; font-weight: bold; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    #cs-print .p-sep { background: #fff3e0 !important; text-align: center; font-weight: bold; color: #e65100; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }`));

// --- DÉMARRAGE ---
let pendingRemote = null;
const isTyping = () => { const a = document.activeElement; return !!(a && a.classList && a.classList.contains("cs-edit")); };
CS.boot = function (render, onLoad) {
  renderFn = () => { render(); runAfter(); };
  document.addEventListener("focusout", () => setTimeout(() => {
    if (pendingRemote && !isTyping()) { CS.state = pendingRemote; pendingRemote = null; CS.render(); }
  }, 0));
  OneAppAPI.onDataChange((data) => {
    clearTimeout(saveTimer); saveTimer = null;
    const next = CS.normalize(data);
    if (isTyping() || drag) { pendingRemote = next; return; }
    CS.state = next;
    CS.render();
  });
  OneAppAPI.onModeChange((v) => { CS.saveNow(); CS.readOnly = v; CS.render(); });
  if (OneAppAPI.onNameChange) OneAppAPI.onNameChange(() => CS.render());
  OneAppAPI.loadData().then(({ app_data, readOnly }) => {
    CS.state = CS.normalize(app_data);
    CS.readOnly = readOnly;
    if (onLoad) onLoad();
    CS.render();
  });
};
})();
