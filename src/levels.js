// ---- Curriculum -----------------------------------------------------------
// Levels go from "never touched a keyboard" to "perfectionist". Each new pair of
// keys is learned in three steps:
//   meet     – no bikes, take your time, only the new keys
//   practice – slow bikes, only the new keys
//   mix      – bikes, new keys mixed with everything learned before
// Level fields:
//   keys    focus keys (also added to the learned set)
//   pool    'focus' | 'mix' | 'all'   which keys letters come from
//   calm    no bikes and no timer
//   words   lanes are whole words instead of single letters ({ min, max } length)
//   slow    multiplies the time per letter (bigger = easier)
//   maxSpl  caps seconds per letter (forces speed in the expert levels)
//   perfect 3 stars also need (almost) no wrong keys

const LEVELS = [];
const WORLDS = [];

function world(title, color) {
  WORLDS.push({ title, color, start: LEVELS.length });
}
function add(level) {
  LEVELS.push({ keys: '', pool: 'focus', lanes: 4, perLane: 2, slow: 1, world: WORLDS.length - 1, ...level });
}
const spaced = keys => [...keys].join(' ').toUpperCase();
const meet = (keys, o = {}) => add({ title: `Meet ${spaced(keys)}`, keys, calm: true, ...o });
const practice = (keys, o = {}) => add({ title: `Practice ${spaced(keys)}`, keys, slow: 1.5, ...o });
const mix = (keys, o = {}) => add({ title: `Mix in ${spaced(keys)}`, keys, pool: 'mix', lanes: 5, slow: 1.2, ...o });
const review = (title, o = {}) => add({ title, pool: 'all', lanes: 5, perLane: 3, ...o });
const words = (title, min, max, o = {}) => add({ title, pool: 'all', words: { min, max }, lanes: 4, ...o });

world('Home row', '#40c057');
meet('f', { title: 'Hello F', lanes: 3, perLane: 3 });
meet('j', { title: 'Hello J', lanes: 3, perLane: 3 });
meet('fj', { title: 'F and J' });
practice('fj', { title: 'Bikes are coming!', slow: 1.8 });
meet('dk'); practice('dk'); mix('dk');
meet('sl'); practice('sl'); mix('sl');
meet('a;'); practice('a;'); mix('a;');
review('Home row party', { perLane: 2, slow: 1.3 });
review('Home row hero');

world('Reach out', '#fab005');
meet('gh'); practice('gh'); mix('gh');
meet('ru'); practice('ru'); mix('ru');
meet('ei'); practice('ei'); mix('ei');
meet('ty'); practice('ty'); mix('ty');
review('Reach review', { slow: 1.2 });
words('First words', 2, 3, { calm: true });

world('Top row', '#4dabf7');
meet('wo'); practice('wo'); mix('wo');
meet('qp'); practice('qp'); mix('qp');
review('Top row party', { slow: 1.2 });
words('More words', 3, 4, { slow: 1.4 });

world('Bottom row', '#cc5de8');
meet('vm'); practice('vm'); mix('vm');
meet('bn'); practice('bn'); mix('bn');
meet('c,'); mix('c,');
meet('x.'); mix('x.');
meet('z/'); mix('z/');
review('Every key!', { slow: 1.2 });
words('Word walk', 3, 4, { slow: 1.3 });

world('Word wizard', '#ff922b');
words('Tiny words', 2, 3, { calm: true, lanes: 5 });
words('Short words', 3, 3, { slow: 1.4 });
words('Snail words', 3, 4, { slow: 1.2 });
words('Bigger words', 4, 5, { slow: 1.1 });
words('Long words', 5, 6);
words('Word parade', 3, 6, { lanes: 5 });
review('Letter storm', { perLane: 4 });

world('Perfectionist', '#f03e3e');
review('Steady hands', { perfect: true, maxSpl: 2 });
review('Quick fingers', { perfect: true, maxSpl: 1.5 });
words('Speedy words', 3, 5, { perfect: true, maxSpl: 1.4, lanes: 5 });
review('Lightning', { perfect: true, maxSpl: 1.1, perLane: 4 });
words('Long and fast', 5, 7, { perfect: true, maxSpl: 1.1, lanes: 5 });
words('Snail master', 4, 7, { perfect: true, maxSpl: 0.9, lanes: 6 });

// ---- Letters & words for a level -------------------------------------------
function learnedBefore(index) {
  let keys = '';
  for (let i = 0; i < index; i++) for (const c of LEVELS[i].keys) if (!keys.includes(c)) keys += c;
  return keys;
}

function levelKeys(index) {
  const level = LEVELS[index];
  const before = learnedBefore(index);
  let all = before;
  for (const c of level.keys) if (!all.includes(c)) all += c;
  const keys = { all, fresh: level.keys, old: '', oldChance: 0 };
  if (level.pool === 'all') keys.fresh = all;
  if (level.pool === 'mix') {
    keys.old = [...before].filter(c => !level.keys.includes(c)).join('');
    keys.oldChance = 0.5;
  }
  if (level.words) keys.words = wordsFor(all, level.words.min, level.words.max);
  return keys;
}

function pickLetter(keys, prev) {
  const pool = keys.old && Math.random() < keys.oldChance ? keys.old : keys.fresh;
  let c;
  for (let i = 0; i < 8; i++) {
    c = pool[Math.floor(Math.random() * pool.length)];
    if (c !== prev) break;
  }
  return c;
}

function pickWord(keys, recent) {
  let w;
  for (let i = 0; i < 12; i++) {
    w = keys.words[Math.floor(Math.random() * keys.words.length)];
    if (!recent.includes(w)) break;
  }
  return w;
}

// Simple words young kids know. Each level only uses the ones it has all the keys for.
const WORD_LIST = `
  a as ad add ads all ask asks dad dads fad fall falls flag flags flask gas glad glass
  had half hall has jag lad lads lag sad salad salads shall
  at it is if he she the hat hit sit fit kit lit set get jet let yes yet the
  red rug use sea see tea tree three fish dish this that there here her his
  eat ate are art kid kids lake like light right sight gift gate great girl
  fly sky day say yay try tired ride hide side slide fruit hug huge jug
  sheep sleep feet seed treat dress skirt shirt tiger turtle story
  owl two top toy toys pop pet pig pot put wet why who how what water flower
  play happy puppy house horse goat frog dog door food good word world
  yellow purple quiet queen quilt pool tooth spoon spoon soup photo
  cat bat ball box fox zoo zebra moon sun snail snails bike bikes cake milk mom
  nest bunny bear bee bus cup van vet cow mix six wax lazy pizza buzz maze mice
  nice bed bag bug can cub fan hen man map net nut pan pen run ten van web zip
  bread clock cloud dance drink jump lemon mouse music panda plant robot
  smile snack snake socks swim train truck under window winter zebra
`.trim().split(/\s+/);

function wordsFor(keys, min, max) {
  return [...new Set(WORD_LIST)].filter(w => w.length >= min && w.length <= max && [...w].every(c => keys.includes(c)));
}

// ---- Fingers & keys ----------------------------------------------------------
// Finger ids: 0-4 left hand (pinky..thumb), 5-9 right hand (thumb..pinky).
const FINGER_KEYS = ['qaz', 'wsx', 'edc', 'rfvtgb', '', '', 'yhnujm', 'ik,', 'ol.', 'p;/'];
const FINGER_COLORS = ['#ff8fab', '#ffa94d', '#ffd43b', '#69db7c', '#e9c9a8',
                       '#e9c9a8', '#4dabf7', '#b197fc', '#ffa94d', '#ff8fab'];
const FINGER_NAMES = ['left pinky', 'left ring finger', 'left middle finger', 'left pointer finger', 'left thumb',
                      'right thumb', 'right pointer finger', 'right middle finger', 'right ring finger', 'right pinky'];
const fingerOf = key => FINGER_KEYS.findIndex(s => s.includes(key));

const KB_ROWS = ['qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'];
const TYPABLE = new Set(KB_ROWS.join(''));
// Shift or Caps Lock versions of the punctuation keys count as the plain key.
const SHIFTED = { ':': ';', '<': ',', '>': '.', '?': '/' };

// How the voice says each key (plain letters get read as words otherwise).
const KEY_SAY = {
  a: 'ay', b: 'bee', c: 'see', d: 'dee', e: 'ee', f: 'eff', g: 'jee', h: 'aitch', i: 'eye',
  j: 'jay', k: 'kay', l: 'el', m: 'em', n: 'en', o: 'oh', p: 'pee', q: 'cue', r: 'ar',
  s: 'ess', t: 'tee', u: 'you', v: 'vee', w: 'double you', x: 'ex', y: 'why', z: 'zee',
  ';': 'semicolon', ',': 'comma', '.': 'dot', '/': 'slash',
};
