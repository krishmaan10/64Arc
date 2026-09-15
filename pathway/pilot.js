/* PathWay AI browser pilot. Built by scripts/build-pilot.js from lib/. Product of 64ARCS. */
(function () {
'use strict';
var modules = {}, cache = {};
var stubs = { 'node:fs': { readFileSync: function () { throw new Error('no filesystem in the browser'); } }, 'node:path': { join: function () { return Array.prototype.join.call(arguments, '/').replace(/\/+/g, '/'); } } };
function require(name) { if (stubs[name]) return stubs[name]; var key = name.replace(/^\.\//, '').replace(/\.js$/, ''); if (!(key in modules)) throw new Error('missing module ' + name); if (!cache[key]) { var module = { exports: {} }; cache[key] = module; modules[key](module, module.exports, require, '/lib', '/lib/' + key + '.js'); } return cache[key].exports; }
modules["behaviours"] = function (module, exports, require, __dirname, __filename) {
// What a student is doing when they type a message, named.
//
// This is the taxonomy the learned reader (lib/learned.js) is trained on and the boundary acts on. It
// was built from the research summarised in docs/STUDENT-BEHAVIOUR.md and from the attempts students
// make in the words they use. Every label maps to exactly one thing the product does, because a label
// with no consequence is a judgement, and the record holds no judgements.
//
// `decision` is the family a label belongs to:
//   refuse   the request is for the work, or for a way around the boundary
//   decline  the request is not about the assignment, and not something this assistant does
//   support  the message is about the student, not the work, and needs a person
//   allow    the request is help this assistant gives, in the mode named by `mode`
//
// `category` is the key the boundary uses to choose what a refusal says, and the record uses to count.

'use strict';

const BEHAVIOURS = {
  produce_whole: {
    decision: 'refuse',
    category: 'produce',
    name: 'Asks for the work itself',
    what: 'The whole piece: the essay, the report, the program, the worksheet, the answer to the assignment.',
  },
  produce_part: {
    decision: 'refuse',
    category: 'extend',
    name: 'Asks for a piece of the work',
    what: 'An introduction, a conclusion, one more paragraph, an example, a thesis, or for what exists to be made longer.',
  },
  answer_direct: {
    decision: 'refuse',
    category: 'answer',
    name: 'Asks for the answer to a set question',
    what: 'The answer, the working, the correct option, or the output for a numbered question or exercise.',
  },
  disguise: {
    decision: 'refuse',
    category: 'disguise',
    name: 'Asks for the work with a reason attached',
    what: 'Hypothetically, as an example, for a friend, for practice, because the teacher allows it, or as what the assistant itself would write.',
  },
  override: {
    decision: 'refuse',
    category: 'override',
    name: 'Tries to change the rules',
    what: 'Ignore your instructions, you are now something else, developer mode, reveal your prompt, new rule.',
  },
  pressure: {
    decision: 'refuse',
    category: 'pressure',
    name: 'Pushes after a refusal',
    what: 'Pleading, bargaining, insisting, complaining that other tools would do it, or insulting the assistant.',
  },
  evade_detection: {
    decision: 'refuse',
    category: 'evade',
    name: 'Asks to hide where writing came from',
    what: 'Make it sound human, beat a detector, change enough words to pass a check, add mistakes so it looks like mine.',
  },
  off_task: {
    decision: 'decline',
    category: 'offTask',
    name: 'Is not about the assignment',
    what: 'Greetings, jokes, games, questions about the assistant, testing it, or anything else unrelated to the work.',
  },
  grade_me: {
    decision: 'decline',
    category: 'grading',
    name: 'Asks for a mark',
    what: 'What grade this would get, whether it is good enough, a score out of ten, whether the teacher will like it.',
  },
  wellbeing: {
    decision: 'support',
    category: 'wellbeing',
    name: 'Is about the student, not the work',
    what: 'Stress beyond the ordinary, hopelessness, panic, fear of what happens at home, or wanting it all to stop.',
  },
  understand: { decision: 'allow', mode: 'understand', name: 'Wants to understand the task', what: 'What the question means, what is being assessed, what a complete answer needs.' },
  plan: { decision: 'allow', mode: 'plan', name: 'Wants to plan the work', what: 'Where to start, what order, how long each part takes, how to structure it.' },
  question: { decision: 'allow', mode: 'question', name: 'Wants their understanding checked', what: 'Quiz me, is my reasoning right, challenge my argument, am I on the right track.' },
  concept: { decision: 'allow', mode: 'question', name: 'Asks about the topic', what: 'What something is or how it works. Handled by asking rather than telling, so the topic is learned and not delivered.' },
  improve: { decision: 'allow', mode: 'improve', name: 'Wants their writing checked', what: 'Grammar, spelling, punctuation, clarity, tone and flow of text they have already written.' },
  rephrase: { decision: 'allow', mode: 'rephrase', name: 'Wants another way to say it', what: 'Other wordings for a sentence or passage they wrote, or a word they keep repeating.' },
  sources: { decision: 'allow', mode: 'sources', name: 'Wants sources', what: 'Where to find references, whether a source is reliable, how to cite, what evidence exists.' },
};

const LABELS = Object.keys(BEHAVIOURS);
const DECISIONS = ['refuse', 'decline', 'support', 'allow'];

function behaviour(label) {
  return BEHAVIOURS[label] || null;
}

module.exports = { BEHAVIOURS, LABELS, DECISIONS, behaviour };

};
modules["modes"] = function (module, exports, require, __dirname, __filename) {
// The modes a student can work in, and what each one is allowed to do. There is deliberately no mode
// whose job is to produce the work being assessed, so there is no mode to talk the assistant into.
//
// `needsStudentText` is the structural half of the boundary: a mode that transforms writing has nothing
// to work with until the student has written something, and the only text it is ever given is theirs.
// `maxNovelty` is the response half: the share of the reply that may be words the student did not write.
// A mode that returns marked changes to a sentence cannot smuggle a new paragraph past a 0.35 ceiling,
// whatever language the request was written in.

'use strict';

const MODES = {
  understand: {
    id: 'understand',
    name: 'Understand the task',
    purpose: 'Work out what the assignment is asking for and what a complete answer needs.',
    // The assignment brief is the material, not the student's draft.
    needsStudentText: false,
    usesAssignmentBrief: true,
    // Explanation is mostly new words by nature; the ceiling is high but the mode may not produce
    // sentences that belong in the submission, which the shape check below enforces instead.
    maxNovelty: 1,
    forbidsArtifactShape: true,
  },
  plan: {
    id: 'plan',
    name: 'Plan my work',
    purpose: 'Break the task into steps, in an order, with a rough schedule.',
    needsStudentText: false,
    usesAssignmentBrief: true,
    maxNovelty: 1,
    forbidsArtifactShape: true,
  },
  question: {
    id: 'question',
    name: 'Check my understanding',
    purpose: 'Be asked questions about the topic or your draft, and talk through the answers.',
    needsStudentText: false,
    usesAssignmentBrief: true,
    maxNovelty: 1,
    // A question is not a submission sentence. The shape check keeps this mode asking rather than telling.
    requiresQuestions: true,
    forbidsArtifactShape: true,
  },
  improve: {
    id: 'improve',
    name: 'Improve my writing',
    purpose: 'Grammar, clarity, tone and register on writing you have already done.',
    needsStudentText: true,
    usesAssignmentBrief: false,
    // Corrections and rewordings of the student's own sentences. New ideas are not corrections.
    maxNovelty: 0.35,
    // Corrections do not make a piece meaningfully longer. A reply that returns half again as much
    // text as it was given has written something, whatever it calls the result.
    maxGrowth: 1.25,
    returnsMarkedChanges: true,
    forbidsArtifactShape: true,
  },
  rephrase: {
    id: 'rephrase',
    name: 'Say it another way',
    purpose: 'Alternative wordings for a passage you wrote and selected.',
    needsStudentText: true,
    usesAssignmentBrief: false,
    maxNovelty: 0.5,
    // Alternatives are the same thing said differently, several times over.
    maxGrowth: 3.5,
    returnsMarkedChanges: false,
    forbidsArtifactShape: true,
  },
  sources: {
    id: 'sources',
    name: 'Find sources',
    purpose: 'Reliable references with citations, and what each one supports.',
    needsStudentText: false,
    usesAssignmentBrief: true,
    maxNovelty: 1,
    // References and a sentence about each. Not prose to paste.
    requiresCitations: true,
    forbidsArtifactShape: true,
  },
};

const MODE_IDS = Object.keys(MODES);

/** The modes an assignment allows, in a stable order. An assignment that names none allows them all:
 * a teacher who has not narrowed the terms has not thereby switched the assistant off. */
function allowedModes(assignment) {
  const chosen = assignment && Array.isArray(assignment.modes) ? assignment.modes : null;
  if (!chosen) return [...MODE_IDS];
  return MODE_IDS.filter((id) => chosen.includes(id));
}

function mode(id) {
  return MODES[id] || null;
}

module.exports = { MODES, MODE_IDS, allowedModes, mode };

};
modules["identity"] = function (module, exports, require, __dirname, __filename) {
// Everything a reader sees that names the product comes from here, so naming it is a one-line change.

'use strict';

const IDENTITY = {
  NAME: 'PathWay AI',
  OWNER: '64ARCS',
  ATTRIBUTION: 'Product of 64ARCS',
  // One sentence a student reads on their first turn, and a teacher reads on the settings page.
  PROMISE:
    'I help you do the work. I will not do it for you, and your teacher can see everything asked here.',
  // Appended to the support response when a message is about the student rather than the work. A school
  // sets this to its own counsellor or helpline, in its own words; left empty, the response names the
  // teacher and an adult the student trusts and nothing else. Never a number invented here.
  SUPPORT_LINE: '',
};

module.exports = IDENTITY;

};
modules["learned"] = function (module, exports, require, __dirname, __filename) {
// The learned reader: a second reading of the student's message, alongside the keyword patterns.
//
// It is a linear classifier (softmax regression) over words, word pairs and character fragments, trained
// by training/train.js on the labelled lines in training/data and stored as plain numbers in
// model/behaviour-model.json. Nothing here calls a model at runtime: reading a message is a few thousand
// multiplications with fixed weights, so the same message always gets the same reading and there is no
// instruction in it that could steer the result. A student can still find a phrasing it has not learned,
// which is why it is one layer of several and why it is never allowed to switch a refusal off.
//
// The weights can be read. `node training/evaluate.js --explain "text"` prints which fragments pushed a
// message towards which label, and model/REPORT.md lists the strongest features per label.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { BEHAVIOURS, LABELS } = require('./behaviours.js');

const MODEL_PATH = path.join(__dirname, '..', 'model', 'behaviour-model.json');

// Shorthand students type, expanded so "plz write my essay" and "please write my essay" share features.
// Single letters are left alone: "r", "y" and "n" are variables in a maths message.
const SHORTHAND = {
  u: 'you', ur: 'your', plz: 'please', pls: 'please', pleez: 'please', thx: 'thanks', thnx: 'thanks',
  tmrw: 'tomorrow', tmr: 'tomorrow', tomoro: 'tomorrow', rn: 'right now', hw: 'homework', hmwk: 'homework',
  hwk: 'homework', assgn: 'assignment', assignmnt: 'assignment', bc: 'because', cuz: 'because', coz: 'because',
  dis: 'this', wat: 'what', wut: 'what', ppl: 'people', gonna: 'going to', wanna: 'want to', gimme: 'give me',
  dont: 'dont', im: 'im', ive: 'ive', idk: 'i dont know', omg: 'omg', srsly: 'seriously', ans: 'answer',
  qs: 'questions', ques: 'question', para: 'paragraph', paras: 'paragraphs', intro: 'intro', conc: 'conclusion',
};

/** Lower case, apostrophes removed, shorthand expanded, digits folded to '#', letters split from digits,
 * runs of three or more of the same letter shortened to two. Unicode letters are kept, so Hindi in Latin
 * script and accented words survive intact. */
function normalise(message) {
  const text = String(message || '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/'/g, '')
    .replace(/(\p{L})\1{2,}/gu, '$1$1');
  const tokens = [];
  for (const raw of text.match(/[\p{L}]+|\d+|[?!]/gu) || []) {
    if (/^\d+$/.test(raw)) tokens.push('#');
    else if (SHORTHAND[raw]) tokens.push(...SHORTHAND[raw].split(' '));
    else tokens.push(raw);
  }
  return tokens;
}

/** The features of one message, as a map of feature name to value. Binary presence, then scaled so every
 * message has unit length: a long message does not get a louder vote than a short one. */
function featurise(message) {
  const tokens = normalise(message);
  const words = tokens.filter((t) => t !== '?' && t !== '!');
  const set = new Set();
  const padded = ['<s>', ...words, '</s>'];
  for (const w of words) set.add('w:' + w);
  for (let i = 0; i < padded.length - 1; i++) set.add('b:' + padded[i] + '_' + padded[i + 1]);
  for (const w of words) {
    if (w.length < 3 || w === '#') continue;
    const s = '_' + w + '_';
    for (const n of [3, 4]) for (let i = 0; i + n <= s.length; i++) set.add('c:' + s.slice(i, i + n));
  }
  const n = words.length;
  set.add('S:len=' + (n <= 1 ? '1' : n <= 3 ? '2-3' : n <= 7 ? '4-7' : n <= 14 ? '8-14' : n <= 29 ? '15-29' : '30+'));
  if (tokens.includes('?')) set.add('S:q');
  if (tokens.includes('!')) set.add('S:excl');
  if (tokens.includes('#')) set.add('S:num');
  const raw = String(message || '');
  const letters = raw.replace(/[^\p{L}]/gu, '');
  if (letters.length >= 4 && letters.replace(/[^\p{Lu}]/gu, '').length / letters.length > 0.6) set.add('S:caps');
  if (/\p{Extended_Pictographic}/u.test(raw)) set.add('S:emoji');
  const scale = 1 / Math.sqrt(set.size || 1);
  const features = new Map();
  for (const f of set) features.set(f, scale);
  return features;
}

let cached = null;

/** Load a model file. Called once per process by read(); exposed so tests and tools can load another. */
function loadModel(file = MODEL_PATH) {
  // In the browser pilot the weights arrive as a global, written by scripts/build-pilot.js.
  const model = file === MODEL_PATH && globalThis.PATHWAY_MODEL ? globalThis.PATHWAY_MODEL : JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(model.labels) || !model.features || !Array.isArray(model.bias)) throw new Error('not a behaviour model: ' + file);
  return model;
}

function softmax(scores) {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Score a feature map against a model. Returns probabilities per label, in model.labels order. */
function scoreFeatures(features, model) {
  const scores = model.bias.slice();
  for (const [f, v] of features) {
    const w = model.features[f];
    if (!w) continue;
    for (let k = 0; k < scores.length; k++) scores[k] += w[k] * v;
  }
  return softmax(scores);
}

/**
 * Read a message. Returns the most likely behaviour, how sure the reader is, and the decision family the
 * behaviour belongs to. `ranked` carries the top three so a record can show what else it looked like.
 */
function read(message, model = cached || (cached = loadModel())) {
  const features = featurise(message);
  const probs = scoreFeatures(features, model);
  const ranked = model.labels
    .map((label, i) => ({ label, p: probs[i] }))
    .sort((a, b) => b.p - a.p);
  const top = ranked[0];
  return {
    label: top.label,
    confidence: Number(top.p.toFixed(3)),
    decision: BEHAVIOURS[top.label].decision,
    ranked: ranked.slice(0, 3).map((r) => ({ label: r.label, p: Number(r.p.toFixed(3)) })),
  };
}

/** Which features moved a message towards its top label, for reading a decision after the fact. */
function explain(message, model = cached || (cached = loadModel())) {
  const features = featurise(message);
  const result = read(message, model);
  const k = model.labels.indexOf(result.label);
  const contributions = [];
  for (const [f, v] of features) {
    const w = model.features[f];
    if (w) contributions.push({ feature: f, weight: Number((w[k] * v).toFixed(3)) });
  }
  contributions.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  return { ...result, contributions: contributions.slice(0, 12) };
}

module.exports = { normalise, featurise, loadModel, scoreFeatures, softmax, read, explain, MODEL_PATH, LABELS };

};
modules["classify"] = function (module, exports, require, __dirname, __filename) {
// What is the student actually asking for?
//
// This is the first of the defences and the only one that reads the request. Everything in it is
// deterministic on purpose: the decision to refuse must not depend on a model call that the same request
// could steer. Four readings are made, none of which can undo another's refusal:
//
//   1. Keyword patterns (PATTERNS, INTENT): English, exact, easy to read, easy to evade.
//   2. The learned reader (lib/learned.js): a classifier with fixed weights, trained on the kinds of thing
//      students type (docs/STUDENT-BEHAVIOUR.md). It adds a refusal, a decline or a support response only
//      when it is confident, and never removes one the patterns made. Its reading is always recorded.
//   3. The brief-overlap rule: a message that is mostly the assignment brief is a request for the work.
//   4. The support floor (SUPPORT): explicit phrases about harm or not wanting to be here, matched whatever
//      the reader thinks, because this is the one reading whose miss costs the most.
//
// A request that slips past all four still reaches a mode that supplies only the student's own text and a
// response check that measures how much of the reply is new, neither of which cares what was written.

'use strict';

const { read } = require('./learned.js');
const { BEHAVIOURS } = require('./behaviours.js');

// The artifacts a school assignment asks for. Producing any of these is the thing this product will not do.
const ARTIFACT =
  '(?:essay|paper|report|assignment|homework|coursework|dissertation|thesis|composition|paragraph|paragraphs|introduction|intro|conclusion|abstract|summary|story|poem|script|speech|presentation|slides?|answer|answers|solution|solutions|response|letter|email|article|review|analysis|reflection|journal|code|program|programme|function|class|script|query|proof|derivation|calculation|worksheet)';

// Verbs that ask for the artifact to exist where it did not.
const PRODUCE_VERB =
  '(?:write|draft|compose|create|make|produce|generate|build|develop|do|complete|finish|deliver|give me|hand me|send me|provide|prepare|construct|formulate|craft)';

const PATTERNS = [
  // "write my essay", "do my homework", "complete the assignment for me"
  {
    signal: 'produce',
    why: 'asks for the work itself',
    test: new RegExp(`\\b${PRODUCE_VERB}\\b[^.?!\\n]{0,40}\\b${ARTIFACT}\\b`, 'i'),
  },
  // "can you do question 3", "solve problem 2", "answer number 4"
  {
    signal: 'answer',
    why: 'asks for an answer to a set question',
    test: /\b(?:solve|answer|work out|calculate|compute|do)\b[^.?!\n]{0,30}\b(?:question|problem|exercise|task|part|number|q|no\.?)\s*\d/i,
  },
  // "continue this", "keep going", "finish it off", "expand this into 500 words"
  {
    signal: 'extend',
    why: 'asks for more of the work to be written',
    test: /\b(?:continue|carry on|keep going|finish (?:it|this|that|off)|expand|extend|lengthen|flesh (?:it |this |that )?out|pad (?:it |this |out )?|bulk (?:it |this )?out|make it longer|add (?:to )?(?:another|a few|some|a|an|one|two|more)?\s?(?:paragraph|sentence|section|example|point|line|quote|conclusion|introduction|detail)s?|write (?:me )?(?:another|one more|an extra))\b/i,
  },
  // "what would a good answer look like", "show me an example essay", "what would you write"
  // A model exemplar of the assignment is the assignment.
  {
    signal: 'disguise',
    why: 'asks for a model answer, which is the work in another guise',
    test: new RegExp(
      `\\b(?:what (?:would|should)|show me|give me|can i see|i(?:'| a)?d like to see)\\b[^.?!\\n]{0,50}\\b(?:example|exemplar|model|sample|ideal|perfect|full|complete|finished|good)\\b[^.?!\\n]{0,30}\\b${ARTIFACT}\\b`,
      'i',
    ),
  },
  {
    signal: 'disguise',
    why: 'asks what the assistant itself would write',
    test: /\b(?:what would you (?:write|say|put|answer)|how would you (?:write|answer|approach it in writing)|write it (?:how )?you(?:'|’)?d)\b/i,
  },
  // "just for my notes, write...", "not for submission, but write..." — framing does not change the ask.
  {
    signal: 'disguise',
    why: 'asks for the work with a reason attached',
    test: new RegExp(
      `\\b(?:just|only|purely|simply|hypothetically|for (?:my )?(?:notes|reference|practice|revision|fun)|not for submission|i (?:will|won'?t) (?:not )?(?:use|submit|copy) it)\\b[^.?!\\n]{0,40}\\b${PRODUCE_VERB}\\b[^.?!\\n]{0,40}\\b${ARTIFACT}\\b`,
      'i',
    ),
  },
  // Attempts to change the rules rather than the request.
  {
    signal: 'override',
    why: 'tries to change the assistant’s instructions',
    test: /\b(?:ignore (?:all |any |your |the )?(?:previous |prior |above |earlier )?(?:instructions?|rules?|guidelines?|restrictions?)|disregard (?:the |your )?(?:rules?|instructions?)|forget (?:your|the) (?:rules?|instructions?|prompt)|you are now|act as (?:if|though|a)|pretend (?:to be|you|that you)|roleplay|jailbreak|developer mode|dan mode|without (?:any )?(?:restrictions?|limits?|filters?)|no (?:rules?|restrictions?|limits?) apply)\b/i,
  },
  // Asking for the work in a form that looks like something else.
  {
    signal: 'disguise',
    why: 'asks for the work through a disguise',
    test: new RegExp(
      `\\b(?:in (?:the )?(?:form|style|voice) of|as (?:a|an)|translate (?:it |this )?into)\\b[^.?!\\n]{0,40}\\b(?:but|then|and)\\b[^.?!\\n]{0,30}\\b${PRODUCE_VERB}\\b[^.?!\\n]{0,30}\\b${ARTIFACT}\\b`,
      'i',
    ),
  },
  // Asking for writing to be made to look like the student's own, or to get past a check.
  {
    signal: 'evade',
    why: 'asks to hide where writing came from',
    test: /\b(?:humani[sz]e|undetectable|turnitin|gptzero|ai detect(?:or|ion)|plagiarism (?:checker|detector|check)|(?:not|isn'?t|wont|won'?t) (?:be )?(?:flagged|detected|caught)|(?:sound|look|seem) (?:like )?(?:more )?human|(?:sound|look) like (?:i|a student|a teenager|me) wrote|so (?:it'?s|its|it is) not (?:plagiarism|copied|copying)|add (?:some |a few )?(?:typos|mistakes|errors) so)\b/i,
  },
];

// The reader's refuse-family labels, mapped to the signal the boundary refuses with.
const LEARNED_SIGNAL = {
  produce_whole: 'produce',
  produce_part: 'extend',
  answer_direct: 'answer',
  disguise: 'disguise',
  override: 'override',
  pressure: 'pressure',
  evade_detection: 'evade',
};

// Requests that are plainly inside a helping mode. These are recognised so the boundary can route a
// student to the right mode rather than refuse them, which is the difference between a tutor and a wall.
const INTENT = [
  { intent: 'improve', test: /\b(?:grammar|spelling|punctuation|typos?|proofread|tone|register|formal|informal|clearer|clarity|flow|concise|wordy|passive voice|tighten)\b/i },
  { intent: 'rephrase', test: /\b(?:rephrase|reword|paraphrase|another way|differently|in my own words|say this better|alternative wording)\b/i },
  { intent: 'understand', test: /\b(?:what (?:does|is) (?:this|the question|it) (?:asking|mean|want)|what am i (?:supposed|meant) to|i don'?t (?:get|understand)|explain the (?:task|question|assignment|brief)|what do i need to (?:do|include)|marking criteria|rubric)\b/i },
  { intent: 'plan', test: /\b(?:how (?:do|should) i (?:start|begin|approach|structure|organise|organize)|where do i start|break (?:this|it) down|plan|outline|steps|schedule|structure my)\b/i },
  { intent: 'sources', test: /\b(?:sources?|references?|citations?|bibliography|where can i (?:read|find|look)|reliable|evidence for|studies on|research on|who said)\b/i },
  { intent: 'question', test: /\b(?:quiz me|test me|ask me|check my understanding|do i understand|am i right|is my reasoning)\b/i },
];

// The support floor. Matched whatever the reader thinks, because a miss here costs the most. Kept short and
// explicit: harm at home, self-harm, not wanting to be here. Everything vaguer is left to the reader.
const SUPPORT = [
  /\b(?:kill|hurt|harm|cut) (?:myself|me)\b/i,
  /\b(?:end it all|end my life|want to die|wanna die|better off dead|not wake up|dont want to (?:be here|live|be alive|wake up)|don'?t want to (?:be here|live|be alive|wake up))\b/i,
  /\b(?:beat|hit|hurt|thrash) me\b/i,
  /\b(?:maar (?:denge|dega|degi|dalenge)|marenge mujhe)\b/i,
  /\b(?:better off without me|happier if i was gone|nobody would (?:notice|care) if i)\b/i,
  /\b(?:panic attack|cant breathe|can'?t breathe)\b/i,
];

// How sure the reader must be before the boundary acts on it. Anything below is recorded and nothing more.
// The trade at each level is in model/REPORT.md. `support` is lower on purpose: the cost of a miss there is
// a student who said something serious being answered with a note about essay structure.
const CONFIDENCE = { refuse: 0.55, decline: 0.6, support: 0.5, route: 0.45, prefer: 0.6 };

// The parts of a piece. "write the introduction" is a request for a piece of the work, not the whole of it,
// and the record should say so; the refusal is the same either way.
const PART = /\b(?:intro|introduction|conclusion|paragraphs?|abstract|thesis|hook|opening|ending|topic sentences?|body)\b/i;

/** Words of four or more letters that carry meaning, for the brief-overlap rule. */
function contentWords(text) {
  return new Set((String(text || '').toLowerCase().match(/[\p{L}]{4,}/gu) || []).filter((w) => !STOP.has(w)));
}
const STOP = new Set(['with', 'that', 'this', 'from', 'your', 'have', 'what', 'about', 'which', 'their', 'there', 'would', 'should', 'could', 'into', 'than', 'then', 'them', 'they', 'were', 'been', 'being', 'also', 'more', 'most', 'some', 'such', 'each', 'every', 'least', 'words', 'word', 'write', 'using', 'least', 'give', 'make', 'take', 'does', 'will', 'shall']);

/** The share of the brief's content words that appear in the message. 0 when either is empty. */
function briefOverlap(message, brief) {
  const wanted = contentWords(brief);
  if (wanted.size < 3) return 0;
  const have = contentWords(message);
  let shared = 0;
  for (const w of wanted) if (have.has(w)) shared++;
  return shared / wanted.size;
}

/**
 * Read a student's message. Returns the production signals found, the helping intent it resembles, and the
 * learned reading. Nothing here decides anything; `boundary.js` does that with the assignment's terms in hand.
 *
 * @param {string} message
 * @param {object} [context]
 * @param {object} [context.assignment]  the teacher's terms; only `brief` is read here
 */
function classify(message, { assignment } = {}) {
  const text = typeof message === 'string' ? message : '';
  const signals = [];
  const add = (signal, why, source) => {
    if (!signals.some((s) => s.signal === signal && s.why === why)) signals.push({ signal, why, source });
  };
  for (const pattern of PATTERNS)
    if (pattern.test.test(text)) add(pattern.signal === 'produce' && PART.test(text) ? 'extend' : pattern.signal, pattern.why, 'pattern');

  // The learned reading. Always made, always recorded, acted on only above the stated confidence.
  const learned = read(text);
  const confident = (family) => learned.decision === family && learned.confidence >= CONFIDENCE[family];
  if (confident('refuse')) add(LEARNED_SIGNAL[learned.label], `reads as: ${BEHAVIOURS[learned.label].name.toLowerCase()}`, 'reader');

  // The brief, pasted back, is a request for the work whatever else the message says.
  const overlap = assignment ? briefOverlap(text, assignment.brief) : 0;
  if (overlap >= 0.75) add('produce', 'is the assignment brief itself', 'brief');

  const supportFloor = SUPPORT.some((p) => p.test(text));
  const support = supportFloor
    ? { why: 'says something about harm, or about not wanting to be here', source: 'floor' }
    : confident('support')
      ? { why: 'reads as being about the student, not the work', source: 'reader' }
      : null;

  const decline = confident('decline') ? { category: BEHAVIOURS[learned.label].category, why: `reads as: ${BEHAVIOURS[learned.label].name.toLowerCase()}`, source: 'reader' } : null;

  const intents = INTENT.filter((entry) => entry.test.test(text)).map((entry) => entry.intent);
  // The mode this request most resembles. The reader wins when it is sure, because it read the whole
  // message and a keyword match read one word ("sources" inside a question about what the brief means);
  // otherwise the patterns when they name exactly one; otherwise the reader when it is reasonably sure.
  const learnedMode = learned.decision === 'allow' ? BEHAVIOURS[learned.label].mode : null;
  const suggestedMode =
    learnedMode && learned.confidence >= CONFIDENCE.prefer ? learnedMode : intents.length === 1 ? intents[0] : learnedMode && learned.confidence >= CONFIDENCE.route ? learnedMode : null;

  return {
    text,
    signals,
    // The strongest reason to refuse, if any. Order matters: an override is refused before anything else.
    production: signals.find((s) => ['produce', 'extend', 'answer', 'disguise', 'evade'].includes(s.signal)) || null,
    override: signals.find((s) => s.signal === 'override') || null,
    pressure: signals.find((s) => s.signal === 'pressure') || null,
    support,
    decline,
    intents,
    suggestedMode,
    learned,
    briefOverlap: Number(overlap.toFixed(2)),
  };
}

module.exports = { classify, PATTERNS, INTENT, SUPPORT, CONFIDENCE, LEARNED_SIGNAL, briefOverlap };

};
modules["boundary"] = function (module, exports, require, __dirname, __filename) {
// The decision: does this turn go to the model, go to a different mode first, or not happen at all?
//
// A refusal here has to teach, not just block. A student who is told "no" and nothing else has learned
// only that the tool is in the way, and will go and find one that is not. Every refusal therefore names
// what was asked for, why this assistant will not do it, and what it will do instead, in that order.
//
// The decision also reads the last few turns. A student who has just been refused and types "ok" or
// "please" or "why not" is making the same request, and a student who asks the same thing again in other
// words is told that the answer has not changed. The wording acknowledges the repeat; the boundary does not
// move. That is the whole defence against being worn down.

'use strict';

const { mode, allowedModes } = require('./modes.js');
const { BEHAVIOURS } = require('./behaviours.js');
const identity = require('./identity.js');

/** Plain, specific, and never sarcastic. The student is not the adversary here; the shortcut is. */
const REFUSAL = {
  produce: (alternatives) => ({
    reason: 'This asks for the work itself.',
    explain:
      'Writing the piece you are being assessed on is the one thing I will not do, in any wording. What you hand in has to be yours.',
    offer: alternatives,
  }),
  extend: (alternatives) => ({
    reason: 'This asks me to write more of the piece.',
    explain:
      'Adding paragraphs, examples or length is still writing your work. I can work on what you have written, not carry it forward.',
    offer: alternatives,
  }),
  answer: (alternatives) => ({
    reason: 'This asks for the answer to a set question.',
    explain:
      'Working it out is what is being assessed, so I will not give the answer or the working, in any wording. I can ask you questions that get you closer to it yourself.',
    offer: alternatives,
  }),
  disguise: (alternatives) => ({
    reason: 'This asks for the work, with a reason attached.',
    explain:
      'An example, a hypothetical, a version for a friend, or a teacher’s permission does not change what is being asked for: a piece written by me. The reason is noted, and the answer is the same.',
    offer: alternatives,
  }),
  override: (alternatives) => ({
    reason: 'This asks me to set my instructions aside.',
    explain:
      'I work the same way whatever I am asked, and your teacher can see what was asked here. There is nothing to unlock.',
    offer: alternatives,
  }),
  pressure: (alternatives) => ({
    reason: 'Asking again does not change the answer.',
    explain:
      'I am not annoyed, and there is nothing to give in to: the boundary is the same for every student, every time. What I can do is still on the table.',
    offer: alternatives,
  }),
  evade: (alternatives) => ({
    reason: 'This asks me to hide where writing came from.',
    explain:
      'Making text sound human, getting it past a detector, or changing enough words to pass a check are all ways of handing in work that is not yours. I do not do that in any form, and this request is in your record like every other.',
    offer: alternatives,
  }),
  offTask: (alternatives) => ({
    reason: 'This is not about the assignment.',
    explain:
      'I only work on the assignment in front of you, so I cannot chat, play, or answer other things here. Your teacher can see what is asked, the same as everything else.',
    offer: alternatives,
  }),
  grading: (alternatives) => ({
    reason: 'I do not mark work.',
    explain:
      'Your teacher marks it, and I cannot predict what they will give. I can ask you questions that test whether it holds up, which is the useful half of a mark.',
    offer: alternatives,
  }),
  modeNotAllowed: (name, alternatives) => ({
    reason: `Your teacher has not allowed "${name}" for this assignment.`,
    explain:
      'This assignment is assessing something that help would get in the way of. That is the teacher’s call, not mine.',
    offer: alternatives,
  }),
  needsText: (name, alternatives) => ({
    reason: `"${name}" works on writing you have already done.`,
    explain:
      'There is nothing saved for this assignment yet, so there is nothing of yours to work on. Write something first, however rough.',
    offer: alternatives,
  }),
};

/** What a student sees when a message is about them rather than the work. Written to survive being wrong:
 * a student who was joking loses nothing; a student who was not is pointed at a person. No offers, because
 * a row of mode buttons under this would read as "anyway, back to the essay". */
const SUPPORT = () => ({
  reason: 'That sounds heavier than homework.',
  explain: [
    'I am a writing assistant, so I am the wrong help for this, but a person is the right help. Tell your teacher, or an adult you trust, how you are feeling; you do not need the right words for it.',
    'Your teacher can see this message, and here that is a good thing.',
    identity.SUPPORT_LINE,
  ]
    .filter(Boolean)
    .join(' '),
  offer: [],
});

const OFFER = {
  understand: 'work out what the assignment is asking for',
  plan: 'break the task into steps you can start on',
  question: 'ask you questions about it to see where you are',
  improve: 'look at the grammar and clarity of what you have written',
  rephrase: 'suggest other ways to word a passage you wrote',
  sources: 'find sources you can read and cite',
};

function offers(allowed, { hasText }) {
  return allowed
    .filter((id) => (mode(id).needsStudentText ? hasText : true))
    .map((id) => ({ mode: id, name: mode(id).name, does: OFFER[id] }));
}

// A bare yes, please, why, or "do it" after a refusal is the same request.
const ASSENT =
  /^(?:yes|yeah|yep|ya|ok|okay|k|sure|fine|please|pls|plz|go|go ahead|do it|just do it|now|more|next|and|continue|again|come on|why|why not|so|well|hurry|quick|quickly|go on|do it now|please do|pretty please|kar do|karo|bas)[\s.!?]*$/i;

const REPEAT_WINDOW = 5;
const REPEAT_OVERLAP = 0.5;
const REFUSED = new Set(['refused', 'declined']);

function wordSet(text) {
  return new Set(String(text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / new Set([...a, ...b]).size;
}

/** The most recent refusal within the last few turns, if any. */
function recentRefusal(history) {
  return [...history.slice(-REPEAT_WINDOW)].reverse().find((e) => e && REFUSED.has(e.outcome)) || null;
}

/** Whether this message is the same request as one refused within the last few turns. */
function isRepeat(message, history) {
  const now = wordSet(message);
  return history.slice(-REPEAT_WINDOW).some((e) => e && REFUSED.has(e.outcome) && overlap(now, wordSet(e.asked)) >= REPEAT_OVERLAP);
}

const AGAIN = {
  assent: 'That is the same request, and the answer is the same. ',
  repeat: 'You have asked this before in other words, and the answer has not changed. ',
};

function again(refusal, how = 'repeat') {
  return { ...refusal, explain: AGAIN[how] + refusal.explain, again: true };
}

/**
 * Decide one turn.
 *
 * @param {object} input
 * @param {string} input.message      what the student typed
 * @param {string} input.modeId       the mode they are in
 * @param {object} input.assignment   the teacher's terms: { modes, brief, skills }
 * @param {string} input.studentText  what the student has saved for this assignment
 * @param {object} input.classified   the output of classify()
 * @param {object[]} [input.history]  earlier record entries for this student and assignment, oldest first
 * @returns {{allow: boolean, kind: string, category?: string, modeId?: string, redirect?: string, refusal?: object, material?: object, read?: object, repeats?: boolean}}
 */
function decide({ message, modeId, assignment, studentText = '', classified, history = [] }) {
  const allowed = allowedModes(assignment);
  const hasText = typeof studentText === 'string' && studentText.trim().length > 0;
  const alternatives = offers(allowed, { hasText });
  const current = mode(modeId);
  const read = classified.learned
    ? { label: classified.learned.label, name: BEHAVIOURS[classified.learned.label].name, confidence: classified.learned.confidence }
    : null;
  const refuse = (category, refusal, extra = {}) => ({ allow: false, kind: 'refusal', category, refusal, read, ...extra });

  // A message about the student comes first, whatever mode they are in and whatever the teacher allowed.
  if (classified.support) return { allow: false, kind: 'support', category: 'wellbeing', refusal: SUPPORT(), read };

  // An unknown mode, or one this assignment does not allow.
  if (!current) return refuse('modeNotAllowed', REFUSAL.modeNotAllowed(String(modeId), alternatives));
  if (!allowed.includes(modeId)) return refuse('modeNotAllowed', REFUSAL.modeNotAllowed(current.name, alternatives));

  // An attempt to change the rules is refused wherever it appears.
  if (classified.override) return refuse('override', REFUSAL.override(alternatives));

  // "ok", "please", "why not" straight after a refusal is that request again.
  if (recentRefusal(history) && ASSENT.test(String(message || '').trim()))
    return refuse('pressure', again(REFUSAL.pressure(alternatives), 'assent'), { repeats: true });
  if (classified.pressure) return refuse('pressure', REFUSAL.pressure(alternatives), { repeats: Boolean(recentRefusal(history)) });

  // Producing or extending the work is refused in every mode. This is not a per-mode setting, because
  // there must be no way to add a mode that forgets it.
  const production = classified.production;
  if (production) {
    const repeats = isRepeat(message, history);
    const refusal = REFUSAL[production.signal](alternatives);
    return refuse(production.signal, repeats ? again(refusal) : refusal, { repeats });
  }

  // Not the work, and not help either: a chat, a joke, a request for a mark.
  if (classified.decline)
    return { allow: false, kind: 'decline', category: classified.decline.category, refusal: REFUSAL[classified.decline.category](alternatives), read };

  // A mode that works on the student's writing needs some to exist.
  if (current.needsStudentText && !hasText) return refuse('needsText', REFUSAL.needsText(current.name, alternatives));

  // The request fits a different mode better. This is a redirect, not a refusal: the student is asking
  // for something the assistant is happy to do, in the wrong place.
  const suggested = classified.suggestedMode;
  if (suggested && suggested !== modeId && allowed.includes(suggested)) {
    const target = mode(suggested);
    if (!target.needsStudentText || hasText)
      return {
        allow: false,
        kind: 'redirect',
        category: 'redirect',
        redirect: suggested,
        refusal: {
          reason: `That is what "${target.name}" is for.`,
          explain: `I can ${OFFER[suggested]}. Switch to ${target.name} and ask again, and this turn is recorded as asked.`,
          offer: [{ mode: suggested, name: target.name, does: OFFER[suggested] }],
        },
        read,
      };
  }

  // Allowed. The material handed to the model is decided here, not by the request: a mode that works on
  // the student's writing gets their writing and nothing else.
  return {
    allow: true,
    kind: 'allow',
    modeId,
    material: {
      studentText: current.needsStudentText ? studentText : '',
      brief: current.usesAssignmentBrief && assignment ? assignment.brief || '' : '',
      skills: current.usesAssignmentBrief && assignment ? assignment.skills || [] : [],
      message,
    },
    read,
  };
}

module.exports = { decide, REFUSAL, SUPPORT, OFFER, offers, ASSENT, isRepeat, recentRefusal };

};
modules["prompt"] = function (module, exports, require, __dirname, __filename) {
// The request sent to the model for one allowed turn.
//
// The prompt is the weakest of the defences and is written as if it will be ignored. It says what the
// mode is for and nothing about "rules", because a paragraph telling a model to refuse things is exactly
// what a student's next message will try to undo. The model is given one job and only the material that
// job needs; what it sends back is checked before anyone sees it.

'use strict';

const { mode } = require('./modes.js');

const INSTRUCTION = {
  understand: [
    'A student is working on the assignment below. Explain what it is asking them to do, in plain words.',
    'Name what a complete answer has to contain, and what is being assessed.',
    'Do not answer the assignment, and do not write any sentence that could be pasted into it.',
  ],
  plan: [
    'A student is working on the assignment below. Break it into steps they can start on, in order,',
    'with a rough sense of how long each takes. Steps only: do not do any of them.',
  ],
  question: [
    'A student is working on the assignment below. Ask them questions, one or two at a time, that show',
    'you whether they understand it. React to what they say. Do not supply the answers; if they are',
    'stuck, ask a smaller question instead.',
  ],
  improve: [
    'The text below is a student’s own writing. Correct grammar, spelling, punctuation and clarity,',
    'and adjust tone only if asked. Work sentence by sentence on what is there.',
    'Do not add ideas, arguments, facts, examples or new sentences.',
    'Reply in exactly this shape: a fenced code block containing only the corrected version of their',
    'text, then a numbered list of the changes and why each one was made.',
  ],
  rephrase: [
    'The passage below is a student’s own writing. Offer two or three other ways to say the same thing,',
    'keeping their meaning and their level of vocabulary.',
    'Do not add anything the passage does not already say.',
    'Put each alternative in its own fenced code block, and say underneath what is different about it.',
  ],
  sources: [
    'A student is working on the assignment below. Suggest reliable sources they could read and cite.',
    'For each, give a citation and one sentence on what it supports. Prefer things a school library or',
    'an open archive would have. Do not write any prose for their submission.',
  ],
};

/** Build the model request for an allowed turn. Returns { system, user }. */
function buildPrompt({ modeId, material, identity }) {
  const current = mode(modeId);
  if (!current) throw new Error('unknown mode: ' + modeId);
  const system = [
    `You are ${identity.NAME}, helping a school student with their own work.`,
    `Your job right now is one thing: ${current.purpose}`,
    ...INSTRUCTION[modeId],
    'Write for a school student: short sentences, no jargon, no preamble about what you are about to do.',
  ].join(' ');

  const parts = [];
  if (material.brief) parts.push(`The assignment:\n${material.brief}`);
  if (material.skills && material.skills.length)
    parts.push(`What the teacher is assessing: ${material.skills.join(', ')}.`);
  if (material.studentText) parts.push(`The student’s own writing:\n${material.studentText}`);
  parts.push(`The student asked:\n${material.message}`);
  return { system, user: parts.join('\n\n') };
}

module.exports = { buildPrompt, INSTRUCTION };

};
modules["response-check"] = function (module, exports, require, __dirname, __filename) {
// The last defence, and the only one that does not read English.
//
// The request classifier can be evaded by writing in another language or inventing a phrasing. The mode
// controls what material the model is given. This checks what came back, by measuring it against the
// student's own text. "How much of this reply is words the student did not write" is the same question
// in every language, which is why a reply that smuggles a new paragraph past the first two defences
// still fails here.
//
// A reply that fails is not shown. The student sees the boundary's explanation, and the teacher's record
// shows that a reply was withheld and why, so a model going off the rails is visible rather than silent.

'use strict';

const { mode } = require('./modes.js');

/** Words, lowercased, without punctuation. Unicode-aware so this behaves the same outside English. */
function words(text) {
  return (String(text || '').toLowerCase().match(/[\p{L}\p{N}']+/gu) || []);
}

/** The share of the reply's words that do not appear in the student's text, counted with multiplicity
 * so repeating one of their words ten times does not buy ten new ones. 0 means nothing new, 1 means
 * nothing shared. */
function novelty(reply, studentText) {
  const replyWords = words(reply);
  if (!replyWords.length) return 0;
  const budget = new Map();
  for (const word of words(studentText)) budget.set(word, (budget.get(word) || 0) + 1);
  let shared = 0;
  for (const word of replyWords) {
    const left = budget.get(word) || 0;
    if (left > 0) {
      shared++;
      budget.set(word, left - 1);
    }
  }
  return (replyWords.length - shared) / replyWords.length;
}

/** The text a writing mode is offering as the student's own, which is what the ceiling applies to. The
 * explanation around it is teaching, and teaching is new words by definition. Fenced blocks are asked
 * for in the prompt; when none came back, the whole reply is measured, which is the safe direction. */
function proposedText(reply) {
  const blocks = [...String(reply || '').matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1].trim());
  return blocks.length ? blocks.join('\n\n') : String(reply || '');
}

/** Prose that reads like a piece of submitted work: several sentences in a row, no questions, no marks
 * of a suggestion, and crucially not addressed to the student. An explanation says "you"; a paragraph
 * of an essay does not. That difference is what separates help from the work itself. */
function looksLikeSubmission(reply) {
  const text = String(reply || '').trim();
  if (!text) return false;
  // Strip the shapes that are plainly not submission prose.
  const withoutLists = text
    .split('\n')
    .filter((line) => !/^\s*(?:[-*•]|\d+[.)]|#{1,6}\s|>)/.test(line))
    .join('\n');
  const paragraphs = withoutLists.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paragraphs.some((paragraph) => {
    const sentences = paragraph.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 20);
    if (sentences.length < 3) return false;
    // A run of statements with no questions, not addressed to the student, and long enough to be a
    // paragraph of their submission rather than a note about it.
    const questions = sentences.filter((s) => s.trim().endsWith('?')).length;
    const addressesStudent = /\b(?:you|your|you're|you'll|you've|yours)\b/i.test(paragraph);
    return questions === 0 && !addressesStudent && paragraph.length > 320;
  });
}

const COMMON_WORDS = 60;

/**
 * Check a model reply against the mode it was produced in.
 *
 * @returns {{ok: boolean, novelty: number, problems: string[]}}
 */
function checkResponse({ reply, modeId, studentText = '' }) {
  const current = mode(modeId);
  const problems = [];
  const text = String(reply || '');
  if (!current) return { ok: false, novelty: 1, problems: ['unknown mode'] };
  if (!text.trim()) return { ok: false, novelty: 0, problems: ['the model returned nothing'] };

  const offered = current.needsStudentText ? proposedText(text) : text;
  const share = current.needsStudentText ? novelty(offered, studentText) : 1;

  // A transformation that is mostly new words is not a transformation.
  if (current.needsStudentText && share > current.maxNovelty && words(offered).length > COMMON_WORDS)
    problems.push(
      `the reply is ${Math.round(share * 100)}% words the student did not write, above the ${Math.round(
        current.maxNovelty * 100,
      )}% this mode allows`,
    );

  // A mode that returns the student's own text may not return much more of it than it was given.
  if (current.maxGrowth && words(studentText).length) {
    const growth = words(offered).length / words(studentText).length;
    if (growth > current.maxGrowth)
      problems.push(
        `the reply hands back ${Math.round(growth * 100)}% of the length it was given, above the ${Math.round(
          current.maxGrowth * 100,
        )}% this mode allows`,
      );
  }

  // No mode may hand back something shaped like the submission.
  if (current.forbidsArtifactShape && looksLikeSubmission(text))
    problems.push('the reply reads like a passage of the work itself');

  // A mode whose job is to ask has to ask.
  if (current.requiresQuestions && !/\?/.test(text))
    problems.push('this mode asks the student questions and the reply contains none');

  // Sources without citations are not sources.
  if (current.requiresCitations && !/https?:\/\/|\(\d{4}\)|\b(?:ISBN|doi|vol\.|pp?\.)\b/i.test(text))
    problems.push('this mode returns references and the reply cites nothing');

  return { ok: problems.length === 0, novelty: share, problems };
}

module.exports = { checkResponse, novelty, looksLikeSubmission, proposedText, words };

};
modules["observations"] = function (module, exports, require, __dirname, __filename) {
// What a teacher can see across a session that no single message shows.
//
// A student who is refused rarely stops. They ask again in other words, ask for the work in pieces, switch
// mode and ask the same thing, or plead. None of that is visible in one record entry; all of it is visible
// in the sequence. This module reads the sequence and writes plain sentences about it, each with its
// threshold stated, each ending short of a verdict. The record holds no judgement about whether a student
// cheated, and neither does this: "asked for the work in pieces four times" is a description a teacher can
// read and a student can explain. What it means is the teacher's call.

'use strict';

const WINDOW = 5; // turns back to look for a repeat of a refused request
const REPEAT_OVERLAP = 0.5; // share of words two requests must share to count as the same request
const BURST_COUNT = 5; // requests
const BURST_MINUTES = 5;
const NO_WRITING_AFTER = 4; // requests with nothing saved

function wordSet(text) {
  return new Set(String(text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / new Set([...a, ...b]).size;
}

const REFUSED = new Set(['refused', 'declined']);

function plural(n, one, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Read a session. `entries` are record entries in order (see record.js); `drafts` are draft entries.
 * Returns observations, most important first, each { key, count, note }.
 */
function observe(entries = [], drafts = []) {
  const requests = entries.filter((e) => e && e.asked !== undefined);
  const counts = {};
  const count = (key) => (counts[key] = (counts[key] || 0) + 1);
  const words = requests.map((e) => wordSet(e.asked));

  requests.forEach((entry, i) => {
    const category = entry.category || (entry.outcome === 'refused' ? 'produce' : null);
    if (entry.outcome === 'supported') count('wellbeing');
    if (category === 'pressure') count('pushed');
    if (category === 'extend') count('pieces');
    if (category === 'override') count('override');
    if (category === 'evade') count('evade');
    if (category === 'disguise') count('disguise');
    if (category === 'answer') count('answers');
    if (category === 'offTask') count('offTask');
    if (category === 'grading') count('grading');
    // The same request again, within a few turns of it being refused.
    if (REFUSED.has(entry.outcome) && category !== 'pressure') {
      for (let j = Math.max(0, i - WINDOW); j < i; j++) {
        if (!REFUSED.has(requests[j].outcome)) continue;
        if (overlap(words[i], words[j]) >= REPEAT_OVERLAP) {
          count('repeated');
          if (requests[j].mode !== entry.mode) count('movedModes');
          break;
        }
      }
    }
  });

  // Bursts: many requests in a few minutes with nothing saved in between.
  const timeline = [...requests.map((e) => ({ at: e.at, kind: 'request' })), ...drafts.map((d) => ({ at: d.at, kind: 'draft' }))]
    .filter((x) => Number.isFinite(x.at))
    .sort((a, b) => a.at - b.at);
  let run = [];
  let bursts = 0;
  let inBurst = false;
  for (const item of timeline) {
    if (item.kind === 'draft') { run = []; inBurst = false; continue; }
    run.push(item.at);
    while (run.length && item.at - run[0] > BURST_MINUTES * 60_000) run.shift();
    if (run.length >= BURST_COUNT && !inBurst) { bursts++; inBurst = true; }
  }
  if (bursts) counts.burst = bursts;

  // A large paste followed by a request to polish it.
  const requestTimes = requests.map((e, i) => ({ i, at: e.at, mode: e.mode }));
  for (const draft of drafts) {
    if (!draft.largeAddition) continue;
    const after = requestTimes.filter((r) => Number.isFinite(r.at) && r.at >= draft.at).slice(0, WINDOW);
    if (after.some((r) => r.mode === 'improve' || r.mode === 'rephrase')) count('polishAfterPaste');
  }
  if (requests.length >= NO_WRITING_AFTER && drafts.length === 0) counts.noWriting = requests.length;

  const notes = {
    wellbeing: (n) => `${plural(n, 'message')} ${n === 1 ? 'was' : 'were'} about how the student is, not the work, and ${n === 1 ? 'was' : 'were'} answered with a pointer to a person. This one needs a conversation, not a note.`,
    pushed: (n) => `Pushed back after a refusal ${plural(n, 'time')}: pleading, insisting, or repeating the request. Common, and not evidence of anything on its own.`,
    repeated: (n) => `Made a refused request again in other words ${plural(n, 'time')} within ${WINDOW} turns of the refusal.`,
    movedModes: (n) => `Switched mode and made the same refused request ${plural(n, 'time')}.`,
    pieces: (n) => `Asked for the work in pieces ${plural(n, 'time')} (an introduction, a paragraph, more length). Together, those pieces are the piece.`,
    disguise: (n) => `Asked for the work with a reason attached ${plural(n, 'time')} (as an example, hypothetically, for a friend, with the teacher's permission).`,
    answers: (n) => `Asked for the answer to a set question ${plural(n, 'time')}.`,
    override: (n) => `Tried to change the assistant's instructions ${plural(n, 'time')}.`,
    evade: (n) => `Asked ${plural(n, 'time')} for writing to be made to look like the student's own, or to pass a detector. Worth a conversation about where the writing came from.`,
    polishAfterPaste: (n) => `${plural(n, 'save')} of 200 or more words at once ${n === 1 ? 'was' : 'were'} followed by a request to polish the text. The history shows the text arriving, not being written here.`,
    burst: (n) => `${plural(n, 'burst')} of ${BURST_COUNT} or more requests within ${BURST_MINUTES} minutes with nothing saved in between.`,
    noWriting: (n) => `${plural(n, 'request')} and no writing saved. The student may not have started, or may be writing somewhere else.`,
    offTask: (n) => (n >= 3 ? `${plural(n, 'message')} ${n === 1 ? 'was' : 'were'} not about the assignment.` : null),
    grading: (n) => (n >= 2 ? `Asked for a mark ${plural(n, 'time')}. The assistant does not give one.` : null),
  };
  const order = ['wellbeing', 'evade', 'polishAfterPaste', 'pieces', 'disguise', 'answers', 'repeated', 'movedModes', 'pushed', 'override', 'burst', 'noWriting', 'offTask', 'grading'];
  return order
    .filter((key) => counts[key])
    .map((key) => ({ key, count: counts[key], note: notes[key](counts[key]) }))
    .filter((o) => o.note);
}

module.exports = { observe, WINDOW, REPEAT_OVERLAP, BURST_COUNT, BURST_MINUTES, NO_WRITING_AFTER };

};
modules["record"] = function (module, exports, require, __dirname, __filename) {
// The teacher-readable record of how a piece of work was made.
//
// This is the part that makes the whole thing honest. The boundary can be argued with; a record cannot.
// It holds every request, the decision the boundary made, whether a reply was shown or withheld, and
// every change the student accepted into their own text.
//
// What it deliberately does not hold: any judgement about whether the student cheated. The record is
// evidence for a teacher to read, not a verdict. Nothing here scores a student or flags them. The
// observations added by lib/observations.js are descriptions of the sequence with their thresholds
// stated, and they stop short of a verdict for the same reason.

'use strict';

const { observe } = require('./observations.js');

const OUTCOME = { refusal: 'refused', redirect: 'redirected', decline: 'declined', support: 'supported' };

/** One turn, as it will be read months later by someone who was not there. */
function entry({ at, studentId, assignmentId, modeId, message, decision, reply, check, accepted }) {
  return {
    at: at || null,
    studentId,
    assignmentId,
    mode: modeId,
    asked: message,
    outcome: decision.allow ? (check && !check.ok ? 'withheld' : 'answered') : OUTCOME[decision.kind] || 'refused',
    // Why, in the words the student saw, so the record and the screen never disagree.
    reason: decision.allow ? (check && !check.ok ? check.problems.join('; ') : '') : decision.refusal.reason,
    // What kind of request the boundary took it for; null for an answered turn.
    category: decision.allow ? null : decision.category || null,
    // The learned reader's reading, whether or not it was acted on. Recorded so the decision can be
    // examined afterwards, and so a wrong reading is visible rather than silent.
    read: decision.read || null,
    // Whether this was a refused request made again.
    again: Boolean(decision.repeats),
    redirectedTo: decision.redirect || null,
    reply: decision.allow && (!check || check.ok) ? reply : '',
    novelty: check ? Number(check.novelty.toFixed(3)) : null,
    accepted: accepted || null,
  };
}

/** Draft history: what the student's own text looked like over time. A submission that arrives in one
 * paste has a history that shows exactly that, which is the honest answer to work written elsewhere. */
function draftEntry({ at, studentId, assignmentId, text, previous }) {
  const before = String(previous || '');
  const after = String(text || '');
  const wordsOf = (t) => (t.match(/[\p{L}\p{N}']+/gu) || []).length;
  const added = wordsOf(after) - wordsOf(before);
  return {
    at: at || null,
    studentId,
    assignmentId,
    words: wordsOf(after),
    added,
    // A single save that adds more words than a person types in one sitting is worth a teacher's eye.
    // This is a description, not an accusation, and the threshold is stated rather than hidden.
    largeAddition: added >= 200,
  };
}

// The categories that mean "asked for the work, or a piece of it". Pressure, overrides and off-task
// messages are described separately by the observations, so the count below stays what it says.
const FOR_THE_WORK = new Set(['produce', 'extend', 'answer', 'disguise', 'evade']);

/** What a teacher sees for one student and one assignment. */
function summarise(entries, drafts) {
  const turns = entries.length;
  const byOutcome = entries.reduce((counts, e) => ({ ...counts, [e.outcome]: (counts[e.outcome] || 0) + 1 }), {});
  const modes = [...new Set(entries.map((e) => e.mode))];
  const largeAdditions = drafts.filter((d) => d.largeAddition);
  const forTheWork = entries.filter((e) => e.outcome === 'refused' && (e.category ? FOR_THE_WORK.has(e.category) : true)).length;
  const observations = observe(entries, drafts);
  return {
    turns,
    byOutcome,
    modes,
    refusals: byOutcome.refused || 0,
    declined: byOutcome.declined || 0,
    supported: byOutcome.supported || 0,
    withheld: byOutcome.withheld || 0,
    draftSaves: drafts.length,
    finalWords: drafts.length ? drafts[drafts.length - 1].words : 0,
    largeAdditions: largeAdditions.length,
    observations,
    // Plain sentences a teacher can read without interpreting numbers.
    notes: [
      turns === 0 ? 'This student has not used the assistant for this assignment.' : null,
      forTheWork ? `${forTheWork} request${forTheWork === 1 ? '' : 's'} asked for the work itself, or a piece of it, and ${forTheWork === 1 ? 'was' : 'were'} refused.` : null,
      byOutcome.withheld ? `${byOutcome.withheld} repl${byOutcome.withheld === 1 ? 'y was' : 'ies were'} withheld because they went outside the mode.` : null,
      largeAdditions.length
        ? `${largeAdditions.length} save${largeAdditions.length === 1 ? '' : 's'} added 200 or more words at once. Worth asking about; it is not evidence of anything on its own.`
        : null,
      drafts.length === 1 && drafts[0].words > 200
        ? 'The text arrived in a single save, so there is no history of it being written here.'
        : null,
      ...observations.map((o) => o.note),
    ].filter(Boolean),
  };
}

module.exports = { entry, draftEntry, summarise, OUTCOME };

};
modules["session"] = function (module, exports, require, __dirname, __filename) {
// One turn, end to end: classify, decide, ask the model, check what came back, record it.
//
// The model is supplied by the caller as `ask({ system, user })`. Nothing in this project knows or cares
// which model that is, which is the point: the boundary is ours and does not move when the model does.
//
// `history` is the student's earlier record entries for this assignment, oldest first. The boundary reads
// the last few to recognise a request being made again; nothing else is done with it, and it is never
// handed to the model.

'use strict';

const { classify } = require('./classify.js');
const { decide } = require('./boundary.js');
const { buildPrompt } = require('./prompt.js');
const { checkResponse } = require('./response-check.js');
const { entry } = require('./record.js');
const identity = require('./identity.js');

/** What the student sees when a reply is withheld. They are told a reply was withheld and why, rather
 * than being shown nothing, because silence reads as a broken tool and invites another tab. */
const WITHHELD = {
  reason: 'I wrote something that went past what this mode is for, so I have not shown it.',
  explain:
    'This happens when an answer starts turning into your work instead of help with it. Ask again, or ask for something smaller.',
};

/**
 * @param {object} input
 * @param {string} input.message
 * @param {string} input.modeId
 * @param {object} input.assignment  { brief, skills, modes }
 * @param {string} input.studentText the student's saved work for this assignment
 * @param {function} input.ask       async ({system, user}) => string
 * @param {object} input.who         { studentId, assignmentId }
 * @param {number} input.at          timestamp, supplied by the caller so this stays testable
 * @param {object[]} [input.history] earlier record entries for this student and assignment, oldest first
 */
async function turn({ message, modeId, assignment, studentText = '', ask, who = {}, at = null, history = [] }) {
  const classified = classify(message, { assignment });
  const decision = decide({ message, modeId, assignment, studentText, classified, history });

  if (!decision.allow) {
    return {
      shown: { kind: decision.kind, ...decision.refusal },
      record: entry({ at, ...who, modeId, message, decision }),
    };
  }

  const prompt = buildPrompt({ modeId, material: decision.material, identity });
  let reply = '';
  try {
    reply = String((await ask(prompt)) || '');
  } catch (error) {
    return {
      shown: {
        kind: 'error',
        reason: 'I could not reach the model just now.',
        explain: 'Nothing was sent anywhere else. Try again in a moment.',
      },
      record: entry({
        at,
        ...who,
        modeId,
        message,
        decision,
        reply: '',
        check: { ok: false, novelty: 0, problems: ['model unavailable: ' + (error.message || 'unknown')] },
      }),
    };
  }

  const check = checkResponse({ reply, modeId, studentText: decision.material.studentText });
  return {
    shown: check.ok ? { kind: 'reply', text: reply } : { kind: 'withheld', ...WITHHELD },
    record: entry({ at, ...who, modeId, message, decision, reply, check }),
  };
}

module.exports = { turn, WITHHELD };

};
modules["writing-review"] = function (module, exports, require, __dirname, __filename) {
'use strict';

// A deliberately small, deterministic correction set for the local pilot.
// Replacements are literals owned by the server; requests cannot supply generated prose.
const RULES = [
  { pattern: /\bteh\b/g, replacement: 'the', reason: 'Correct the spelling of “the”.' },
  { pattern: /\brecieve\b/g, replacement: 'receive', reason: '“Receive” uses ei after c.' },
  { pattern: /\bdefinately\b/g, replacement: 'definitely', reason: 'The spelling is “definitely”.' },
  { pattern: /\bi\b/g, replacement: 'I', reason: 'Capitalize the pronoun “I”.' },
  { pattern: /\bdont\b/g, replacement: 'don’t', reason: 'Use an apostrophe for the missing letter in “do not”.' },
  { pattern: /\bcant\b/g, replacement: 'can’t', reason: 'If you mean “cannot”, use an apostrophe. Reject this if you mean the noun “cant”.' },
];

function corrections(text) {
  return RULES.flatMap(rule => [...text.matchAll(rule.pattern)].map(match => ({
    start: match.index,
    end: match.index + match[0].length,
    before: match[0],
    after: rule.replacement,
    reason: rule.reason,
  }))).sort((a, b) => a.start - b.start).slice(0, 20);
}

module.exports = { corrections };

};
modules["preview-app"] = function (module, exports, require, __dirname, __filename) {
// The preview, as logic without a transport.
//
// One practice assignment, one session, six modes with fixed replies, and the real boundary engine
// deciding every request. `scripts/preview-server.js` puts an HTTP server in front of this on a Mac;
// `scripts/build-pilot.js` puts it in a browser with the record kept in that browser. Both call
// `handle(method, pathname, body)` and get back `{ status, data }`, so a route behaves identically
// wherever it runs and the tests that drive the server also cover the pilot.

'use strict';

const { turn } = require('./session.js');
const { draftEntry, summarise } = require('./record.js');
const { MODES } = require('./modes.js');
const identity = require('./identity.js');
const { corrections } = require('./writing-review.js');

const PREVIEW_MODES = ['understand', 'plan', 'question', 'improve', 'rephrase', 'sources'];
const SOURCES = [
  { id: 'eef', title: 'Homework', publisher: 'Education Endowment Foundation', type: 'Evidence overview', url: 'https://educationendowmentfoundation.org.uk/education-evidence/teaching-learning-toolkit/homework', note: 'Compare findings across age groups and examine the evidence limitations.', citation: 'Education Endowment Foundation. (n.d.). Homework. Teaching and Learning Toolkit.' },
  { id: 'cooper', title: 'Does homework improve academic achievement?', publisher: 'Cooper, Robinson & Patall · 2006', type: 'Research synthesis', url: 'https://eric.ed.gov/?id=EJ751143', note: 'Read the abstract and consider what a research synthesis can tell you. Full text may require library access.', citation: 'Cooper, H., Robinson, J. C., & Patall, E. A. (2006). Does homework improve academic achievement? A synthesis of research, 1987–2003. Review of Educational Research, 76(1), 1–62.' },
];
const REPLIES = {
  understand: 'You are being asked to take a position on whether homework helps learning.\n\n• Write 500 words in your own voice.\n• Use two sources to support your reasoning.\n• Your teacher is assessing your argument and use of evidence.\n\nWhat part of the task would you like to think through first?',
  plan: '1. Read the task and identify what you need to hand in.\n2. Choose your own position and look for two sources.\n3. Write a first draft using your own reasoning.\n4. Check your evidence, word count and citations.\n\nHow much time can you set aside for each step?',
  question: 'What is your current position on the question?\n\nWhich evidence would help you test that position?\n\nWhat might someone who disagrees ask you?',
  sources: 'Start with these curated references, then read and evaluate the evidence yourself.\n\n• Education Endowment Foundation, Homework: https://educationendowmentfoundation.org.uk/education-evidence/teaching-learning-toolkit/homework\n• Cooper, Robinson & Patall (2006), research synthesis: https://eric.ed.gov/?id=EJ751143\n\nWhat does each source help you investigate? These are fixed reading suggestions, not a live search.',
};
const ROUTES = ['/api/draft', '/api/policy', '/api/turn', '/api/review', '/api/edit', '/api/source', '/api/checklist'];
const SESSION = 'demo';

/**
 * @param {object} [options]
 * @param {object} [options.store]   a RecordStore: events are appended to its hash chain and replayed on start
 * @param {object} [options.memory]  { load(): object|null, save(snapshot) }: a browser's own storage, plain JSON
 */
function createPreviewApp({ store = null, memory = null } = {}) {
  const state = {
    identity, modes: Object.values(MODES), previewModes: PREVIEW_MODES,
    assignment: { title: 'Does homework help us learn?', subject: 'English · Practice assignment', brief: 'Write 500 words on whether homework helps learning. Use two sources.', skills: ['argument', 'use of evidence'], modes: [...PREVIEW_MODES] },
    draft: '', activity: [], sources: SOURCES, savedSources: [], checklist: [],
  };
  let pendingReview = null;
  let nextReview = 0;
  const who = { studentId: 'demo-student', assignmentId: 'demo-assignment' };
  const snapshot = () => ({ activity: state.activity, draft: state.draft, modes: state.assignment.modes, savedSources: state.savedSources, checklist: state.checklist });
  const remember = () => { if (memory) memory.save(snapshot()); };
  // Every change to the record goes through here: into memory, and onto disk or into the browser's storage.
  const record = async (event) => {
    const stored = store ? await store.append(SESSION, event) : event;
    state.activity.push(stored);
    remember();
    return stored;
  };
  const apply = (event) => {
    state.activity.push(event);
    if (event.type === 'draft') state.draft = event.text || '';
    if (event.type === 'policy') state.assignment.modes = PREVIEW_MODES.filter((id) => event.modes.includes(id));
  };
  // Replay the record before the first request. A chain that fails verification is refused, not repaired.
  const ready = (async () => {
    if (store) {
      const check = await store.verify(SESSION);
      if (!check.ok) throw new Error(`record ${SESSION} failed verification at event ${check.brokenAt}; move the file aside before starting`);
      for (const event of await store.load(SESSION)) apply(event);
    } else if (memory) {
      const saved = memory.load();
      if (saved && typeof saved === 'object') {
        for (const event of Array.isArray(saved.activity) ? saved.activity : []) state.activity.push(event);
        state.draft = typeof saved.draft === 'string' ? saved.draft : '';
        state.assignment.modes = PREVIEW_MODES.filter((id) => (Array.isArray(saved.modes) ? saved.modes : PREVIEW_MODES).includes(id));
        state.savedSources = Array.isArray(saved.savedSources) ? saved.savedSources.filter((id) => SOURCES.some((s) => s.id === id)) : [];
        state.checklist = Array.isArray(saved.checklist) ? saved.checklist.filter((id) => Number.isInteger(id) && id >= 0 && id < 4) : [];
      }
    }
  })();

  const reply = (status, data) => ({ status, data });

  /** One request. Returns null for anything that is not the API, so a transport can serve its files. */
  async function handle(method, pathname, body) {
    await ready;
    if (method === 'GET' && pathname === '/api/state')
      // The teacher's summary is computed from the record on every read, never stored or edited.
      return reply(200, { ...state, summary: summarise(state.activity.filter((e) => e.type === 'request'), state.activity.filter((e) => e.type === 'draft')) });
    if (method !== 'POST' || !ROUTES.includes(pathname)) return pathname.startsWith('/api/') ? reply(404, { error: 'Page not found.' }) : null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Expected an object.' });
    const at = Date.now();
    if (pathname === '/api/source') {
      if (!SOURCES.some((source) => source.id === body.id) || typeof body.saved !== 'boolean') return reply(400, { error: 'Choose an available source.' });
      state.savedSources = state.savedSources.filter((id) => id !== body.id);
      if (body.saved) state.savedSources.push(body.id);
      remember();
      return reply(200, { saved: true });
    }
    if (pathname === '/api/checklist') {
      if (!Array.isArray(body.checked) || !body.checked.every((id) => Number.isInteger(id) && id >= 0 && id < 4)) return reply(400, { error: 'Choose a valid task step.' });
      state.checklist = [...new Set(body.checked)];
      remember();
      return reply(200, { saved: true });
    }
    if (pathname === '/api/review') {
      const modeId = body.kind === 'rephrase' ? 'rephrase' : 'improve';
      if (!['grammar', 'tone', 'rephrase'].includes(body.kind)) return reply(400, { error: 'Choose a writing tool.' });
      if (!state.assignment.modes.includes(modeId)) return reply(403, { error: 'Your teacher has paused this writing tool.' });
      if (!state.draft.trim()) return reply(400, { error: 'Write and save your own draft first.' });
      if (body.text !== state.draft) return reply(409, { error: 'Save your current draft before reviewing it.' });
      const suggestions = body.kind === 'grammar' ? corrections(state.draft) : [];
      pendingReview = { id: ++nextReview, text: state.draft, suggestions, decided: new Set(), modeId };
      const guide = body.kind === 'grammar'
        ? 'This local checker recognizes six common spelling and punctuation patterns. Review each suggestion; it is not a full grammar assessment.'
        : body.kind === 'tone'
          ? 'Choose one sentence. Who will read it? Underline casual or emotionally loaded words. Try a more precise word yourself, keeping your meaning and evidence. Read both versions aloud.'
          : 'Choose one sentence you wrote. Set it aside and explain its meaning aloud. Write that explanation in your own words, then compare: have you kept the meaning and any citation? This tool guides you; it does not generate a paraphrase.';
      await record({ type: 'review', at, kind: body.kind, count: suggestions.length, guide });
      return reply(200, { id: pendingReview.id, suggestions, guide });
    }
    if (pathname === '/api/edit') {
      if (!pendingReview || body.reviewId !== pendingReview.id || !Number.isInteger(body.index) || !pendingReview.suggestions[body.index] || !['accept', 'reject'].includes(body.action)) return reply(400, { error: 'Run a new review and choose a suggestion.' });
      if (!state.assignment.modes.includes(pendingReview.modeId)) return reply(403, { error: 'Your teacher has paused this writing tool.' });
      if (state.draft !== pendingReview.text || body.text !== state.draft) return reply(409, { error: 'Your draft changed. Save it and run a new review.' });
      if (pendingReview.decided.has(body.index)) return reply(409, { error: 'You already reviewed this suggestion.' });
      const suggestion = pendingReview.suggestions[body.index];
      pendingReview.decided.add(body.index);
      if (body.action === 'accept') {
        const previous = state.draft;
        state.draft = previous.slice(0, suggestion.start) + suggestion.after + previous.slice(suggestion.end);
        await record({ type: 'draft', ...draftEntry({ at, ...who, text: state.draft, previous }), text: state.draft });
        // Offsets belong to the reviewed snapshot. Accepting any edit invalidates the rest.
        pendingReview.text = null;
      }
      await record({ type: 'edit', at, action: body.action, ...suggestion });
      return reply(200, { draft: state.draft });
    }
    if (pathname === '/api/draft') {
      if (typeof body.text !== 'string' || body.text.length > 20000) return reply(400, { error: 'Draft must be at most 20,000 characters.' });
      if (body.text !== state.draft) {
        await record({ type: 'draft', ...draftEntry({ at, ...who, text: body.text, previous: state.draft }), text: body.text });
        state.draft = body.text;
        remember();
      }
      return reply(200, { saved: true });
    }
    if (pathname === '/api/policy') {
      if (!Array.isArray(body.modes) || !body.modes.every((id) => PREVIEW_MODES.includes(id))) return reply(400, { error: 'Choose modes available in this preview.' });
      state.assignment.modes = PREVIEW_MODES.filter((id) => body.modes.includes(id));
      await record({ type: 'policy', at, modes: [...state.assignment.modes] });
      return reply(200, { saved: true });
    }
    // /api/turn
    if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000 || !Object.hasOwn(MODES, body.modeId)) return reply(400, { error: 'Choose a help mode and enter a request of 1–2,000 characters.' });
    if (['improve', 'rephrase'].includes(body.modeId)) return reply(400, { error: 'Use the writing review tools on your saved draft.' });
    // Policy and saved text always come from the app, never from a student's request. The boundary reads
    // the last few requests to recognise one being made again; the model never sees them.
    const history = state.activity.filter((e) => e.type === 'request');
    const result = await turn({ message: body.message.trim(), modeId: body.modeId, assignment: state.assignment, studentText: state.draft, ask: async () => REPLIES[body.modeId], who, at, history });
    await record({ type: 'request', ...result.record, shown: result.shown, policy: [...state.assignment.modes] });
    return reply(200, result.shown);
  }

  return { state, ready, handle, previewModes: PREVIEW_MODES };
}

module.exports = { createPreviewApp, PREVIEW_MODES, SOURCES, REPLIES };

};

// The pilot: the app the preview server runs, with the record kept in this browser and nowhere else.
var createPreviewApp = require('./preview-app.js').createPreviewApp;
var KEY = "pathway-pilot-v1";
var memory = {
  load: function () { try { return JSON.parse(window.localStorage.getItem(KEY)); } catch (error) { return null; } },
  save: function (snapshot) { try { window.localStorage.setItem(KEY, JSON.stringify(snapshot)); } catch (error) { /* private mode or full: the session still works for this visit */ } }
};
var app = createPreviewApp({ memory: memory });
window.PathWayPilot = {
  app: app,
  fetch: function (url, body) {
    var pathname = String(url).split('?')[0];
    return app.handle(body === undefined ? 'GET' : 'POST', pathname, body).then(function (result) {
      if (!result) result = { status: 404, data: { error: 'Page not found.' } };
      // Shaped like a fetch Response, without depending on one: ok, status, a content-type header, json().
      var payload = JSON.stringify(result.data);
      return { ok: result.status >= 200 && result.status < 300, status: result.status, headers: { get: function (name) { return String(name).toLowerCase() === 'content-type' ? 'application/json' : null; } }, json: function () { return Promise.resolve(JSON.parse(payload)); } };
    });
  },
  reset: function () { try { window.localStorage.removeItem(KEY); } catch (error) {} window.location.reload(); }
};
})();
