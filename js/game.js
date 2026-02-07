/* ========================================
   Warrior Cats: Into the Wild - Main Game
   ======================================== */
// Global error handler to catch silent crashes
window.onerror = function(msg, url, line, col, err) {
  var d = document.createElement('div');
  d.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:white;padding:15px;z-index:99999;font-size:14px;';
  d.innerHTML = '<b>Error:</b> ' + msg + ' (line ' + line + ')';
  document.body.appendChild(d);
};

(function () {
  'use strict';

  /* ---------- DOM ---------- */
  const $ = id => document.getElementById(id);
  const loadingScreen   = $('loading-screen');
  const loadingBarFill  = $('loading-bar-fill');
  const titleScreen     = $('title-screen');
  const saveScreen      = $('save-screen');
  const cutsceneOverlay = $('cutscene-overlay');
  const cutsceneText    = $('cutscene-text');
  const forestChoiceScreen  = $('forest-choice-screen');
  const forestConfirmScreen = $('forest-confirm-screen');
  const nameScreen      = $('name-screen');
  const nameInput       = $('name-input');
  const namePreview     = $('name-preview-text');
  const nameSubmitBtn   = $('name-submit-btn');
  const nameError       = $('name-error');
  const gameHud         = $('game-hud');
  const mobileControls  = $('mobile-controls');
  const healthBar       = $('health-bar');
  const energyBar       = $('energy-bar');
  const locationText    = $('location-text');
  const playerNameEl    = $('player-name');
  const messageBox      = $('message-box');
  const messageSpeaker  = $('message-speaker');
  const messageTextEl   = $('message-text');
  const interactHint    = $('interact-hint');
  const interactHintText = $('interact-hint-text');
  const battleScreen    = $('battle-screen');
  const battleHeader    = $('battle-header');
  const battleLog       = $('battle-log');
  const battleButtons   = $('battle-buttons');
  const battleAttackBtn = $('battle-attack-btn');
  const battleDodgeBtn  = $('battle-dodge-btn');
  const battleFierceBtn = $('battle-fierce-btn');
  const battleSurrenderBtn = $('battle-surrender-btn');
  const battlePlayerName = $('battle-player-name');
  const battleEnemyName  = $('battle-enemy-name');
  const battlePlayerHP   = $('battle-player-hp');
  const battleEnemyHP    = $('battle-enemy-hp');
  const battlePlayerHPText = $('battle-player-hp-text');
  const battleEnemyHPText  = $('battle-enemy-hp-text');
  const battlePlayerCanvas = $('battle-player-canvas');
  const battleEnemyCanvas  = $('battle-enemy-canvas');

  /* ---------- state ---------- */
  // loading | title | saves | cutscene | naming | ceremony | playing | battle
  let gameState = 'loading';
  let player = null;
  let activeSaveSlot = null;    // 1,2,3
  let gameTime = 30;
  let clock;
  let cutsceneQueue = [];
  let messageQueue = [];
  let messageCallback = null;

  /* ---------- Three.js globals ---------- */
  let scene, camera, renderer;
  let catGroup;
  let highrock;
  let npcCats = [];             // { group, name, data, label, known }
  let scentMarkerZones = [];    // { x, z, radius, clan } — yellow scent markers at borders
  let gardenWalls = [];         // invisible collision boxes around the garden fence
  let houseWalls = [];          // invisible collision boxes for house walls (always block)
  let trees = [], rocks = [];
  let treeObjects = [], rockObjects = [];
  let branchPlatforms = [];   // { x, z, y, radius } — jumpable branch platforms on trees

  /* ---------- known cats ---------- */
  const knownCats = new Set(); // names of cats the player has been introduced to

  /* ---------- input ---------- */
  const keys = {};
  let cameraAngleY = 0, cameraAngleX = 0; // 0 = level, negative = look up, positive = look down
  let joystickInput = { x: 0, z: 0 };
  let isMobile = false;

  /* ---------- jumping ---------- */
  let playerY = 0;        // current vertical position
  let playerVY = 0;       // vertical velocity
  let isJumping = false;
  let isOnGround = true;
  const GRAVITY = -18;
  const JUMP_FORCE = 7;

  /* ---------- emotes ---------- */
  let currentEmote = null;    // 'happy' | 'sad' | 'angry' | 'nervous' | 'sit' | 'sleep' | null
  let emoteTimer = 0;
  let emoteBubbleTimer = 0;
  const EMOTE_ICONS = { happy: '😊', sad: '😢', angry: '😠', nervous: '😨', sit: '🐱', sleep: '💤' };

  /* ---------- swimming ---------- */
  let isSwimming = false;
  let swimBobTime = 0;
  let swimSplashTimer = 0;
  const SWIM_SPEED_MULT = 0.5;  // swimming is slower
  const SWIM_BOB_AMP = 0.08;    // how much the camera bobs up/down
  const SWIM_BOB_FREQ = 3.5;    // bobbing speed
  const SWIM_Y = -0.25;         // how deep the cat sinks in water

  /* ---------- helpers ---------- */
  // CapsuleGeometry doesn't exist in Three.js r128, so we build one manually
  function makeCapsuleMesh (radius, halfLength, radSeg, heightSeg, material) {
    const g = new THREE.Group();
    // cylinder for the middle
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, halfLength, radSeg),
      material
    );
    cyl.castShadow = true;
    g.add(cyl);
    // hemisphere caps
    const topCap = new THREE.Mesh(
      new THREE.SphereGeometry(radius, radSeg, Math.ceil(heightSeg / 2), 0, Math.PI * 2, 0, Math.PI / 2),
      material
    );
    topCap.position.y = halfLength / 2;
    topCap.castShadow = true;
    g.add(topCap);
    const botCap = new THREE.Mesh(
      new THREE.SphereGeometry(radius, radSeg, Math.ceil(heightSeg / 2), 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      material
    );
    botCap.position.y = -halfLength / 2;
    botCap.castShadow = true;
    g.add(botCap);
    return g;
  }

  /* ---------- audio ---------- */
  let audioCtx;
  let ambientInterval = null;
  let audioBus, masterComp, masterGain, reverbConv, reverbSendNode;
  let whiteNoiseBuf = null, pinkNoiseBuf = null;

  function initAudio () {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const hwDest = audioCtx['destination']; // hardware output

      // === Master dynamics compressor — glues sounds, prevents clipping ===
      masterComp = audioCtx.createDynamicsCompressor();
      masterComp.threshold.value = -18;
      masterComp.knee.value = 8;
      masterComp.ratio.value = 4;
      masterComp.attack.value = 0.003;
      masterComp.release.value = 0.12;

      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.88;
      masterComp.connect(masterGain);
      masterGain.connect(hwDest);

      // === Pre-effects bus — all game sounds connect here ===
      audioBus = audioCtx.createGain();
      audioBus.gain.value = 1.0;
      audioBus.connect(masterComp); // dry path

      // === Convolver reverb — natural space and depth ===
      try {
        const sr = audioCtx.sampleRate;
        const irDur = 1.6;
        const irLen = Math.floor(sr * irDur);
        const irBuf = audioCtx.createBuffer(2, irLen, sr);
        for (let ch = 0; ch < 2; ch++) {
          const d = irBuf.getChannelData(ch);
          for (let i = 0; i < irLen; i++) {
            const env = Math.pow(1 - i / irLen, 2.8);
            d[i] = (Math.random() * 2 - 1) * env;
          }
          // Early reflections for realistic room feel
          [0.007, 0.016, 0.025, 0.038, 0.053, 0.071].forEach((rt, idx) => {
            const si = Math.floor(sr * rt);
            if (si < irLen) d[si] += (Math.random() - 0.5) * (0.55 - idx * 0.07);
          });
        }
        reverbConv = audioCtx.createConvolver();
        reverbConv.buffer = irBuf;
        // Reverb send bus
        reverbSendNode = audioCtx.createGain();
        reverbSendNode.gain.value = 0.20;
        audioBus.connect(reverbSendNode);
        // Low-pass before reverb to avoid harsh high-frequency reflections
        const reverbLP = audioCtx.createBiquadFilter();
        reverbLP.type = 'lowpass';
        reverbLP.frequency.value = 4500;
        reverbSendNode.connect(reverbLP);
        reverbLP.connect(reverbConv);
        reverbConv.connect(masterComp);
      } catch (rvErr) { /* reverb optional */ }

      // === Pre-cache stereo noise buffers (2 seconds) ===
      const sr = audioCtx.sampleRate;
      const nLen = sr * 2;
      // White noise
      whiteNoiseBuf = audioCtx.createBuffer(2, nLen, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = whiteNoiseBuf.getChannelData(ch);
        for (let i = 0; i < nLen; i++) d[i] = Math.random() * 2 - 1;
      }
      // Pink noise — warmer, more natural (Paul Kellet's refined method)
      pinkNoiseBuf = audioCtx.createBuffer(2, nLen, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = pinkNoiseBuf.getChannelData(ch);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < nLen; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.96900 * b2 + w * 0.1538520;
          b3 = 0.86650 * b3 + w * 0.3104856;
          b4 = 0.55000 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.0168980;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        }
      }
    } catch (e) { /* silent */ }
  }

  // Audio routing helper — all sounds connect here for compression + reverb
  function _out () { return audioBus || (audioCtx ? audioCtx['destination'] : null); }
  // Create looping noise source from pre-cached stereo buffer
  function _noise (pink) {
    const s = audioCtx.createBufferSource();
    s.buffer = pink ? (pinkNoiseBuf || whiteNoiseBuf) : whiteNoiseBuf;
    if (!s.buffer) {
      const sz = audioCtx.sampleRate;
      s.buffer = audioCtx.createBuffer(1, sz, sz);
      const d = s.buffer.getChannelData(0);
      for (let i = 0; i < sz; i++) d[i] = Math.random() * 2 - 1;
    }
    s.loop = true;
    s.loopStart = Math.random() * 1.5;
    return s;
  }
  // Stereo panner with random slight offset for width
  function _pan (v) {
    try {
      const p = audioCtx.createStereoPanner();
      p.pan.value = v !== undefined ? v : (Math.random() - 0.5) * 0.5;
      return p;
    } catch (e) { return audioCtx.createGain(); }
  }

  /* --- Cat voice profiles (pitch, speed, vibrato per character) --- */
  const catVoices = {
    'Bluestar':    { base: 320, end: 240, dur: 0.45, type: 'sine',     vol: 0.12, vibrato: 3 },   // calm, deep, authoritative she-cat
    'Lionheart':   { base: 200, end: 150, dur: 0.50, type: 'triangle', vol: 0.11, vibrato: 2 },   // deep, warm, strong tom
    'Graypaw':     { base: 520, end: 400, dur: 0.30, type: 'sine',     vol: 0.13, vibrato: 6 },   // young, energetic, higher pitch
    'Whitestorm':  { base: 230, end: 180, dur: 0.45, type: 'triangle', vol: 0.10, vibrato: 2 },   // big calm tom
    'Tigerclaw':   { base: 160, end: 120, dur: 0.55, type: 'sawtooth', vol: 0.10, vibrato: 1.5 }, // deep, menacing growl
    'Spottedleaf': { base: 420, end: 350, dur: 0.40, type: 'sine',     vol: 0.10, vibrato: 4 },   // gentle, soft she-cat
    'Sandpaw':     { base: 480, end: 380, dur: 0.28, type: 'sine',     vol: 0.11, vibrato: 5 },   // young, sharp she-cat
    'Dustpaw':     { base: 400, end: 320, dur: 0.30, type: 'triangle', vol: 0.11, vibrato: 4 },   // young tom, slightly hostile
    'Ravenpaw':    { base: 460, end: 380, dur: 0.25, type: 'sine',     vol: 0.09, vibrato: 8 },   // nervous, shaky
    'Darkstripe':  { base: 220, end: 170, dur: 0.45, type: 'sawtooth', vol: 0.09, vibrato: 2 },   // sly, low
    'Mousefur':    { base: 380, end: 300, dur: 0.35, type: 'sine',     vol: 0.10, vibrato: 3 },   // small but fierce she-cat
    'Yellowfang':  { base: 260, end: 200, dur: 0.50, type: 'triangle', vol: 0.11, vibrato: 3 },   // raspy, old she-cat
    'ThunderClan': { base: 300, end: 250, dur: 0.60, type: 'sine',     vol: 0.14, vibrato: 2 },   // crowd cheer
    'Narrator':    { base: 0, end: 0, dur: 0, type: 'sine', vol: 0, vibrato: 0 },                 // silent narrator
    'Smudge':      { base: 440, end: 360, dur: 0.35, type: 'sine',     vol: 0.12, vibrato: 5 },   // chubby friendly tom, medium pitch
    'Princess':    { base: 500, end: 420, dur: 0.32, type: 'sine',     vol: 0.11, vibrato: 4 },   // gentle, sweet she-cat
    'Longtail':    { base: 280, end: 200, dur: 0.40, type: 'sawtooth', vol: 0.11, vibrato: 3 },   // young warrior, sneering, mid-low
    'ShadowClan Warrior': { base: 180, end: 130, dur: 0.50, type: 'sawtooth', vol: 0.11, vibrato: 2 }, // deep, menacing
    'ShadowClan Patrol':  { base: 190, end: 140, dur: 0.48, type: 'sawtooth', vol: 0.11, vibrato: 2 }, // deep, menacing
    'RiverClan Warrior':  { base: 250, end: 190, dur: 0.40, type: 'triangle', vol: 0.10, vibrato: 3 }, // smooth, strong
    'RiverClan Patrol':   { base: 240, end: 180, dur: 0.42, type: 'triangle', vol: 0.10, vibrato: 3 }, // smooth, strong
    'WindClan Warrior':   { base: 350, end: 280, dur: 0.30, type: 'sine',     vol: 0.11, vibrato: 5 }, // quick, sharp
    'WindClan Patrol':    { base: 340, end: 270, dur: 0.32, type: 'sine',     vol: 0.11, vibrato: 5 }, // quick, sharp
    'WindClan Runner':    { base: 360, end: 290, dur: 0.28, type: 'sine',     vol: 0.10, vibrato: 6 }, // very quick
    '???':         { base: 350, end: 280, dur: 0.30, type: 'triangle', vol: 0.10, vibrato: 3 },   // unknown cat
    // Queens
    'Frostfur':    { base: 400, end: 320, dur: 0.38, type: 'sine',     vol: 0.10, vibrato: 3 },   // gentle, protective she-cat
    'Brindleface': { base: 360, end: 290, dur: 0.40, type: 'sine',     vol: 0.10, vibrato: 3 },   // warm, quiet she-cat
    'Goldenflower':{ base: 380, end: 310, dur: 0.36, type: 'sine',     vol: 0.10, vibrato: 3 },   // gentle, calm she-cat
    // Kits — high-pitched, fast, squeaky
    'Cinderkit':   { base: 680, end: 550, dur: 0.20, type: 'sine',     vol: 0.11, vibrato: 8 },   // energetic she-kit
    'Brackenkit':  { base: 650, end: 520, dur: 0.22, type: 'sine',     vol: 0.11, vibrato: 7 },   // playful tom-kit
    'Brightkit':   { base: 700, end: 580, dur: 0.18, type: 'sine',     vol: 0.11, vibrato: 8 },   // bouncy she-kit
    'Thornkit':    { base: 640, end: 500, dur: 0.20, type: 'sine',     vol: 0.11, vibrato: 7 },   // rough little tom-kit
    'Ashkit':      { base: 670, end: 540, dur: 0.19, type: 'sine',     vol: 0.11, vibrato: 8 },   // pale shy tom-kit
    'Fernkit':     { base: 720, end: 600, dur: 0.17, type: 'sine',     vol: 0.10, vibrato: 9 },   // tiniest she-kit
  };

  /** Play a cat "speaking" sound — unique voice per character */
  function playCatVoice (speakerName) {
    if (!audioCtx) return;
    const voice = catVoices[speakerName];
    if (!voice || voice.base === 0) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan();
      pan.connect(dest);

      if (speakerName === 'ThunderClan') {
        // Crowd cheer: many overlapping varied cat calls with depth
        for (let i = 0; i < 8; i++) {
          const delay = i * 0.06 + Math.random() * 0.04;
          const p = _pan((Math.random() - 0.5) * 0.8);
          p.connect(dest);
          // Main voice
          const o = audioCtx.createOscillator();
          const formant = audioCtx.createBiquadFilter();
          formant.type = 'bandpass';
          formant.frequency.value = 400 + Math.random() * 600;
          formant.Q.value = 2.5;
          const g = audioCtx.createGain();
          o.connect(formant); formant.connect(g); g.connect(p);
          o.type = Math.random() > 0.5 ? 'sine' : 'triangle';
          const pitch = 250 + Math.random() * 350;
          o.frequency.setValueAtTime(pitch, t + delay);
          o.frequency.linearRampToValueAtTime(pitch * 0.6, t + delay + 0.4);
          g.gain.setValueAtTime(0, t + delay);
          g.gain.linearRampToValueAtTime(0.07, t + delay + 0.015);
          g.gain.setValueAtTime(0.06, t + delay + 0.15);
          g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.5);
          o.start(t + delay); o.stop(t + delay + 0.55);
          // Harmonic layer
          const o2 = audioCtx.createOscillator();
          const g2 = audioCtx.createGain();
          o2.connect(g2); g2.connect(p);
          o2.type = 'sine';
          o2.frequency.setValueAtTime(pitch * 1.5, t + delay);
          o2.frequency.linearRampToValueAtTime(pitch * 0.9, t + delay + 0.35);
          g2.gain.setValueAtTime(0, t + delay);
          g2.gain.linearRampToValueAtTime(0.025, t + delay + 0.02);
          g2.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.4);
          o2.start(t + delay); o2.stop(t + delay + 0.45);
        }
        return;
      }

      // === Formant filter — shapes raw oscillator into a more natural voice ===
      const formant1 = audioCtx.createBiquadFilter();
      formant1.type = 'bandpass';
      formant1.frequency.value = voice.base * 1.2;
      formant1.Q.value = 1.8;

      const formant2 = audioCtx.createBiquadFilter();
      formant2.type = 'bandpass';
      formant2.frequency.value = voice.base * 2.8;
      formant2.Q.value = 2.5;

      // === Main voice tone ===
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(formant1);
      formant1.connect(gain);
      gain.connect(pan);
      osc.type = voice.type;
      // More expressive pitch contour
      osc.frequency.setValueAtTime(voice.base * 1.02, t);
      osc.frequency.linearRampToValueAtTime(voice.base, t + 0.02);
      osc.frequency.linearRampToValueAtTime(voice.end, t + voice.dur * 0.55);
      osc.frequency.linearRampToValueAtTime(voice.base * 0.82, t + voice.dur * 0.8);
      osc.frequency.linearRampToValueAtTime(voice.end * 0.9, t + voice.dur);
      // Soft attack envelope
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(voice.vol * 1.1, t + 0.012);
      gain.gain.setValueAtTime(voice.vol, t + voice.dur * 0.3);
      gain.gain.linearRampToValueAtTime(voice.vol * 0.75, t + voice.dur * 0.65);
      gain.gain.exponentialRampToValueAtTime(0.001, t + voice.dur);
      osc.start(t); osc.stop(t + voice.dur + 0.05);

      // === Vibrato LFO ===
      if (voice.vibrato > 0) {
        const lfo = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        lfo.frequency.value = voice.vibrato;
        lfoGain.gain.value = voice.base * 0.05;
        lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
        lfo.start(t); lfo.stop(t + voice.dur + 0.05);
      }

      // === 2nd harmonic (fifth) — through second formant ===
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.connect(formant2);
      formant2.connect(gain2);
      gain2.connect(pan);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(voice.base * 1.5, t);
      osc2.frequency.linearRampToValueAtTime(voice.end * 1.5, t + voice.dur);
      gain2.gain.setValueAtTime(0, t);
      gain2.gain.linearRampToValueAtTime(voice.vol * 0.22, t + 0.01);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + voice.dur);
      osc2.start(t); osc2.stop(t + voice.dur + 0.05);

      // === 3rd harmonic (octave) — adds brightness ===
      const osc3 = audioCtx.createOscillator();
      const gain3 = audioCtx.createGain();
      osc3.connect(gain3); gain3.connect(pan);
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(voice.base * 2, t);
      osc3.frequency.linearRampToValueAtTime(voice.end * 2, t + voice.dur);
      gain3.gain.setValueAtTime(0, t);
      gain3.gain.linearRampToValueAtTime(voice.vol * 0.08, t + 0.02);
      gain3.gain.exponentialRampToValueAtTime(0.001, t + voice.dur * 0.65);
      osc3.start(t); osc3.stop(t + voice.dur + 0.05);

      // === Breath/noise layer — adds realism and texture ===
      const noise = _noise(false);
      const nGain = audioCtx.createGain();
      const nFilter = audioCtx.createBiquadFilter();
      nFilter.type = 'bandpass';
      nFilter.frequency.value = voice.base * 3;
      nFilter.Q.value = 3;
      noise.connect(nFilter); nFilter.connect(nGain); nGain.connect(pan);
      nGain.gain.setValueAtTime(0, t);
      nGain.gain.linearRampToValueAtTime(voice.vol * 0.10, t + 0.01);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + voice.dur * 0.75);
      noise.start(t); noise.stop(t + voice.dur + 0.05);
    } catch (e) { /* silent */ }
  }

  /** Bird tweet — cheerful chirps with harmonics and vibrato */
  function playBirdTweet () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan();
      pan.connect(dest);
      const chirps = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < chirps; i++) {
        const delay = i * (0.1 + Math.random() * 0.08);
        const pitch = 2200 + Math.random() * 1400;
        // Main chirp tone
        const o = audioCtx.createOscillator();
        const bp = audioCtx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = pitch; bp.Q.value = 4;
        const g = audioCtx.createGain();
        o.connect(bp); bp.connect(g); g.connect(pan);
        o.type = 'sine';
        o.frequency.setValueAtTime(pitch, t + delay);
        o.frequency.linearRampToValueAtTime(pitch * (0.75 + Math.random() * 0.5), t + delay + 0.05);
        o.frequency.linearRampToValueAtTime(pitch * (1.05 + Math.random() * 0.15), t + delay + 0.09);
        o.frequency.linearRampToValueAtTime(pitch * 0.85, t + delay + 0.13);
        g.gain.setValueAtTime(0, t + delay);
        g.gain.linearRampToValueAtTime(0.10 + Math.random() * 0.05, t + delay + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.16);
        o.start(t + delay); o.stop(t + delay + 0.18);
        // Harmonic overtone for richness
        const o2 = audioCtx.createOscillator();
        const g2 = audioCtx.createGain();
        o2.connect(g2); g2.connect(pan);
        o2.type = 'sine';
        o2.frequency.setValueAtTime(pitch * 2, t + delay);
        o2.frequency.linearRampToValueAtTime(pitch * 1.7, t + delay + 0.08);
        g2.gain.setValueAtTime(0, t + delay);
        g2.gain.linearRampToValueAtTime(0.03, t + delay + 0.005);
        g2.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.12);
        o2.start(t + delay); o2.stop(t + delay + 0.14);
        // Vibrato on each chirp
        const lfo = audioCtx.createOscillator();
        const lg = audioCtx.createGain();
        lfo.frequency.value = 20 + Math.random() * 20;
        lg.gain.value = pitch * 0.06;
        lfo.connect(lg); lg.connect(o.frequency);
        lfo.start(t + delay); lfo.stop(t + delay + 0.18);
      }
    } catch (e) {}
  }

  /** Songbird — longer melodic call with harmonics */
  function playSongbird () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan();
      pan.connect(dest);
      const notes = [2200, 2600, 2400, 2800, 2500, 2900, 2300, 2700];
      const count = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        const delay = i * 0.14;
        const p = notes[i % notes.length] + Math.random() * 300;
        // Main note
        const o = audioCtx.createOscillator();
        const bp = audioCtx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = p * 1.1; bp.Q.value = 3;
        const g = audioCtx.createGain();
        o.connect(bp); bp.connect(g); g.connect(pan);
        o.type = 'sine';
        o.frequency.setValueAtTime(p, t + delay);
        o.frequency.linearRampToValueAtTime(p * 0.82, t + delay + 0.11);
        o.frequency.linearRampToValueAtTime(p * 0.95, t + delay + 0.15);
        g.gain.setValueAtTime(0, t + delay);
        g.gain.linearRampToValueAtTime(0.09, t + delay + 0.005);
        g.gain.linearRampToValueAtTime(0.07, t + delay + 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.17);
        o.start(t + delay); o.stop(t + delay + 0.19);
        // Harmonic
        const o2 = audioCtx.createOscillator();
        const g2 = audioCtx.createGain();
        o2.connect(g2); g2.connect(pan);
        o2.type = 'sine';
        o2.frequency.setValueAtTime(p * 1.5, t + delay);
        o2.frequency.linearRampToValueAtTime(p * 1.3, t + delay + 0.10);
        g2.gain.setValueAtTime(0, t + delay);
        g2.gain.linearRampToValueAtTime(0.025, t + delay + 0.005);
        g2.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.13);
        o2.start(t + delay); o2.stop(t + delay + 0.15);
        // Vibrato
        const lfo = audioCtx.createOscillator();
        const lg = audioCtx.createGain();
        lfo.frequency.value = 15 + Math.random() * 15;
        lg.gain.value = p * 0.04;
        lfo.connect(lg); lg.connect(o.frequency);
        lfo.start(t + delay); lfo.stop(t + delay + 0.19);
      }
    } catch (e) {}
  }

  /** Owl hoot — deep, eerie, resonant with extra reverb */
  function playOwlHoot () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan(0); // center
      pan.connect(dest);
      // Extra reverb for owl
      const extraRev = audioCtx.createGain();
      extraRev.gain.value = 0.3;
      if (reverbSendNode) extraRev.connect(reverbSendNode);
      else extraRev.connect(dest);
      for (let i = 0; i < 2; i++) {
        const delay = i * 0.65;
        // Main hoot — deep sine
        const o = audioCtx.createOscillator();
        const bp = audioCtx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 360; bp.Q.value = 5;
        const g = audioCtx.createGain();
        o.connect(bp); bp.connect(g); g.connect(pan); g.connect(extraRev);
        o.type = 'sine';
        o.frequency.setValueAtTime(390, t + delay);
        o.frequency.linearRampToValueAtTime(355, t + delay + 0.15);
        o.frequency.linearRampToValueAtTime(320, t + delay + 0.45);
        // Soft attack, hold, decay
        g.gain.setValueAtTime(0, t + delay);
        g.gain.linearRampToValueAtTime(0.13, t + delay + 0.03);
        g.gain.setValueAtTime(0.11, t + delay + 0.2);
        g.gain.linearRampToValueAtTime(0.06, t + delay + 0.35);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.55);
        o.start(t + delay); o.stop(t + delay + 0.6);
        // Sub-harmonic for warmth
        const sub = audioCtx.createOscillator();
        const sg = audioCtx.createGain();
        sub.connect(sg); sg.connect(pan);
        sub.type = 'triangle';
        sub.frequency.setValueAtTime(195, t + delay);
        sub.frequency.linearRampToValueAtTime(160, t + delay + 0.45);
        sg.gain.setValueAtTime(0, t + delay);
        sg.gain.linearRampToValueAtTime(0.06, t + delay + 0.04);
        sg.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.5);
        sub.start(t + delay); sub.stop(t + delay + 0.55);
        // Breath noise layer
        const n = _noise(true);
        const nf = audioCtx.createBiquadFilter();
        nf.type = 'bandpass'; nf.frequency.value = 400; nf.Q.value = 6;
        const ng = audioCtx.createGain();
        n.connect(nf); nf.connect(ng); ng.connect(pan);
        ng.gain.setValueAtTime(0, t + delay);
        ng.gain.linearRampToValueAtTime(0.03, t + delay + 0.02);
        ng.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.4);
        n.start(t + delay); n.stop(t + delay + 0.45);
      }
    } catch (e) {}
  }

  /** Wind rustling through trees — pink noise with modulated filter */
  function playWindRustle () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan();
      pan.connect(dest);
      // Use warm pink noise
      const noise = _noise(true);
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(350 + Math.random() * 200, t);
      // LFO to modulate filter — creates realistic wind gusting
      const lfo = audioCtx.createOscillator();
      const lfog = audioCtx.createGain();
      lfo.frequency.value = 0.4 + Math.random() * 0.6;
      lfog.gain.value = 150;
      lfo.connect(lfog); lfog.connect(lp.frequency);
      // Second filter stage for smoother rolloff
      const lp2 = audioCtx.createBiquadFilter();
      lp2.type = 'lowpass';
      lp2.frequency.value = 600;
      const g = audioCtx.createGain();
      noise.connect(lp); lp.connect(lp2); lp2.connect(g); g.connect(pan);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.6);
      g.gain.setValueAtTime(0.06, t + 1.5);
      g.gain.linearRampToValueAtTime(0.07, t + 2.0);
      g.gain.exponentialRampToValueAtTime(0.001, t + 3.0);
      noise.start(t); noise.stop(t + 3.0);
      lfo.start(t); lfo.stop(t + 3.0);
    } catch (e) {}
  }

  /** Leaves rustling / crunching underfoot — multi-layer crunch */
  function playLeafCrunch () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan();
      pan.connect(dest);
      // Layer 1: sharp crackle
      const n1 = _noise(false);
      const hp1 = audioCtx.createBiquadFilter();
      hp1.type = 'highpass'; hp1.frequency.value = 2500 + Math.random() * 1500;
      const g1 = audioCtx.createGain();
      n1.connect(hp1); hp1.connect(g1); g1.connect(pan);
      g1.gain.setValueAtTime(0, t);
      g1.gain.linearRampToValueAtTime(0.10 + Math.random() * 0.04, t + 0.003);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      n1.start(t); n1.stop(t + 0.10);
      // Layer 2: body of the crunch (lower)
      const n2 = _noise(true);
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1200 + Math.random() * 600; bp.Q.value = 1;
      const g2 = audioCtx.createGain();
      n2.connect(bp); bp.connect(g2); g2.connect(pan);
      g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(0.06, t + 0.005);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      n2.start(t); n2.stop(t + 0.14);
    } catch (e) {}
  }

  /** Cricket chirps — nighttime ambient, filtered and layered */
  function playCricket () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan();
      pan.connect(dest);
      const baseFreq = 4000 + Math.random() * 1000;
      const count = 5 + Math.floor(Math.random() * 5);
      for (let i = 0; i < count; i++) {
        const delay = i * 0.065;
        const o = audioCtx.createOscillator();
        const bp = audioCtx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = baseFreq; bp.Q.value = 8;
        const g = audioCtx.createGain();
        o.connect(bp); bp.connect(g); g.connect(pan);
        o.type = 'square';
        o.frequency.value = baseFreq + Math.random() * 200;
        g.gain.setValueAtTime(0, t + delay);
        g.gain.linearRampToValueAtTime(0.035, t + delay + 0.003);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.04);
        o.start(t + delay); o.stop(t + delay + 0.05);
      }
      // Second cricket at slightly different pitch for stereo depth
      if (Math.random() < 0.5) {
        const p2 = _pan();
        p2.connect(dest);
        const freq2 = baseFreq + 300 + Math.random() * 400;
        for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
          const delay = 0.3 + i * 0.06;
          const o = audioCtx.createOscillator();
          const bp = audioCtx.createBiquadFilter();
          bp.type = 'bandpass'; bp.frequency.value = freq2; bp.Q.value = 10;
          const g = audioCtx.createGain();
          o.connect(bp); bp.connect(g); g.connect(p2);
          o.type = 'square';
          o.frequency.value = freq2;
          g.gain.setValueAtTime(0, t + delay);
          g.gain.linearRampToValueAtTime(0.025, t + delay + 0.003);
          g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.035);
          o.start(t + delay); o.stop(t + delay + 0.045);
        }
      }
    } catch (e) {}
  }

  /** Frog croak — deep rhythmic with formant */
  function playFrogCroak () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan();
      pan.connect(dest);
      const croaks = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < croaks; i++) {
        const delay = i * 0.28;
        const freq = 110 + Math.random() * 50;
        // Main croak tone through formant
        const o = audioCtx.createOscillator();
        const formant = audioCtx.createBiquadFilter();
        formant.type = 'bandpass'; formant.frequency.value = 250; formant.Q.value = 3;
        const g = audioCtx.createGain();
        o.connect(formant); formant.connect(g); g.connect(pan);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(freq, t + delay);
        o.frequency.linearRampToValueAtTime(freq * 0.65, t + delay + 0.12);
        g.gain.setValueAtTime(0, t + delay);
        g.gain.linearRampToValueAtTime(0.09, t + delay + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.18);
        o.start(t + delay); o.stop(t + delay + 0.20);
        // Sub tone for depth
        const sub = audioCtx.createOscillator();
        const sg = audioCtx.createGain();
        sub.connect(sg); sg.connect(pan);
        sub.type = 'sine';
        sub.frequency.setValueAtTime(freq * 0.5, t + delay);
        sub.frequency.linearRampToValueAtTime(freq * 0.35, t + delay + 0.1);
        sg.gain.setValueAtTime(0, t + delay);
        sg.gain.linearRampToValueAtTime(0.05, t + delay + 0.005);
        sg.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.15);
        sub.start(t + delay); sub.stop(t + delay + 0.17);
        // Noise burst for throat texture
        const n = _noise(true);
        const nf = audioCtx.createBiquadFilter();
        nf.type = 'bandpass'; nf.frequency.value = 200; nf.Q.value = 4;
        const ng = audioCtx.createGain();
        n.connect(nf); nf.connect(ng); ng.connect(pan);
        ng.gain.setValueAtTime(0, t + delay);
        ng.gain.linearRampToValueAtTime(0.04, t + delay + 0.005);
        ng.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.12);
        n.start(t + delay); n.stop(t + delay + 0.14);
      }
    } catch (e) {}
  }

  /** Water / river flowing — pink noise with modulated filter for babbling */
  function playRiverSound () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan();
      pan.connect(dest);
      // Pink noise for natural water texture
      const noise = _noise(true);
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
      // LFO modulation for babbling quality
      const lfo = audioCtx.createOscillator();
      const lfog = audioCtx.createGain();
      lfo.frequency.value = 1.5 + Math.random();
      lfog.gain.value = 200;
      lfo.connect(lfog); lfog.connect(bp.frequency);
      // Second filter for smoother sound
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1800;
      const g = audioCtx.createGain();
      noise.connect(bp); bp.connect(lp); lp.connect(g); g.connect(pan);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.2);
      g.gain.setValueAtTime(0.05, t + 1.0);
      g.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
      noise.start(t); noise.stop(t + 2.0);
      lfo.start(t); lfo.stop(t + 2.0);
      // Subtle high-frequency sparkle
      const n2 = _noise(false);
      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 3000;
      const g2 = audioCtx.createGain();
      n2.connect(hp); hp.connect(g2); g2.connect(pan);
      g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(0.015, t + 0.3);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
      n2.start(t); n2.stop(t + 1.8);
    } catch (e) {}
  }

  /** Water splash — layered noise burst with tonal drop */
  function playWaterSplash () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan();
      pan.connect(dest);
      // Main splash body
      const n = _noise(false);
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.4;
      const g = audioCtx.createGain();
      n.connect(bp); bp.connect(g); g.connect(pan);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      n.start(t); n.stop(t + 0.35);
      // High-frequency spray
      const n2 = _noise(false);
      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 3500;
      const g2 = audioCtx.createGain();
      n2.connect(hp); hp.connect(g2); g2.connect(pan);
      g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(0.08, t + 0.003);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      n2.start(t); n2.stop(t + 0.18);
      // Tonal drop
      const o = audioCtx.createOscillator();
      const og = audioCtx.createGain();
      o.connect(og); og.connect(pan);
      o.type = 'sine';
      o.frequency.setValueAtTime(800, t);
      o.frequency.exponentialRampToValueAtTime(200, t + 0.12);
      og.gain.setValueAtTime(0.06, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.start(t); o.stop(t + 0.14);
    } catch (e) {}
  }

  /** Swimming stroke splash — lighter rhythmic paddle with drip */
  function playSwimSplash () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan();
      pan.connect(dest);
      // Paddle noise
      const n = _noise(false);
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 500; bp.Q.value = 0.5;
      const g = audioCtx.createGain();
      n.connect(bp); bp.connect(g); g.connect(pan);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      n.start(t); n.stop(t + 0.2);
      // High spray layer
      const n2 = _noise(false);
      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 3000;
      const g2 = audioCtx.createGain();
      n2.connect(hp); hp.connect(g2); g2.connect(pan);
      g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(0.04, t + 0.003);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
      n2.start(t); n2.stop(t + 0.12);
      // Drip tones
      for (let i = 0; i < 2; i++) {
        const d = 0.05 + i * 0.06;
        const o = audioCtx.createOscillator();
        const og = audioCtx.createGain();
        o.connect(og); og.connect(pan);
        o.type = 'sine';
        const freq = 500 + Math.random() * 500;
        o.frequency.setValueAtTime(freq, t + d);
        o.frequency.exponentialRampToValueAtTime(freq * 0.4, t + d + 0.08);
        og.gain.setValueAtTime(0.035, t + d);
        og.gain.exponentialRampToValueAtTime(0.001, t + d + 0.08);
        o.start(t + d); o.stop(t + d + 0.10);
      }
    } catch (e) {}
  }

  /** Cat purr — warm multi-layer rumble with amplitude modulation */
  function playPurr () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan(0);
      pan.connect(dest);
      const baseFreq = 26 + Math.random() * 8;
      // Main purr oscillator
      const o = audioCtx.createOscillator();
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 120;
      const g = audioCtx.createGain();
      o.connect(lp); lp.connect(g); g.connect(pan);
      o.type = 'sawtooth';
      o.frequency.value = baseFreq;
      // AM for rhythmic purr-purr-purr pattern
      const am = audioCtx.createOscillator();
      const amg = audioCtx.createGain();
      am.frequency.value = 4.5; // purr rhythm
      amg.gain.value = 0.04;
      am.connect(amg); amg.connect(g.gain);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.08);
      g.gain.setValueAtTime(0.08, t + 0.3);
      g.gain.setValueAtTime(0.06, t + 0.7);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      o.start(t); o.stop(t + 1.2);
      am.start(t); am.stop(t + 1.2);
      // Second harmonic for body
      const o2 = audioCtx.createOscillator();
      const g2 = audioCtx.createGain();
      o2.connect(g2); g2.connect(pan);
      o2.type = 'sine';
      o2.frequency.value = baseFreq * 2;
      g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(0.03, t + 0.1);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      o2.start(t); o2.stop(t + 1.15);
      // Noise layer for breath texture
      const n = _noise(true);
      const nf = audioCtx.createBiquadFilter();
      nf.type = 'lowpass'; nf.frequency.value = 200;
      const ng = audioCtx.createGain();
      n.connect(nf); nf.connect(ng); ng.connect(pan);
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(0.02, t + 0.1);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      n.start(t); n.stop(t + 1.05);
    } catch (e) {}
  }

  /** Cat hiss — aggressive filtered noise with body */
  function playHiss () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan(0);
      pan.connect(dest);
      // Main hiss — high-passed noise with envelope
      const n1 = _noise(false);
      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2500;
      const peak = audioCtx.createBiquadFilter();
      peak.type = 'peaking'; peak.frequency.value = 5000; peak.gain.value = 6; peak.Q.value = 2;
      const g = audioCtx.createGain();
      n1.connect(hp); hp.connect(peak); peak.connect(g); g.connect(pan);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.015);
      g.gain.linearRampToValueAtTime(0.18, t + 0.06);
      g.gain.setValueAtTime(0.16, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      n1.start(t); n1.stop(t + 0.5);
      // Low growl underneath
      const o = audioCtx.createOscillator();
      const og = audioCtx.createGain();
      const olp = audioCtx.createBiquadFilter();
      olp.type = 'lowpass'; olp.frequency.value = 300;
      o.connect(olp); olp.connect(og); og.connect(pan);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(100, t);
      o.frequency.linearRampToValueAtTime(80, t + 0.3);
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.06, t + 0.03);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.start(t); o.stop(t + 0.4);
    } catch (e) {}
  }

  /** Cat yowl — distressed multi-oscillator with vibrato */
  function playYowl () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan(0);
      pan.connect(dest);
      // Main yowl
      const o = audioCtx.createOscillator();
      const formant = audioCtx.createBiquadFilter();
      formant.type = 'bandpass'; formant.frequency.value = 600; formant.Q.value = 2;
      const g = audioCtx.createGain();
      o.connect(formant); formant.connect(g); g.connect(pan);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(480, t);
      o.frequency.linearRampToValueAtTime(820, t + 0.18);
      o.frequency.linearRampToValueAtTime(380, t + 0.45);
      o.frequency.linearRampToValueAtTime(650, t + 0.65);
      o.frequency.linearRampToValueAtTime(350, t + 0.85);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.13, t + 0.02);
      g.gain.linearRampToValueAtTime(0.16, t + 0.18);
      g.gain.linearRampToValueAtTime(0.10, t + 0.55);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      o.start(t); o.stop(t + 0.95);
      // Vibrato
      const lfo = audioCtx.createOscillator();
      const lfog = audioCtx.createGain();
      lfo.frequency.value = 6;
      lfog.gain.value = 40;
      lfo.connect(lfog); lfog.connect(o.frequency);
      lfo.start(t); lfo.stop(t + 0.95);
      // Second voice for thickness
      const o2 = audioCtx.createOscillator();
      const g2 = audioCtx.createGain();
      o2.connect(g2); g2.connect(pan);
      o2.type = 'triangle';
      o2.frequency.setValueAtTime(500, t);
      o2.frequency.linearRampToValueAtTime(850, t + 0.2);
      o2.frequency.linearRampToValueAtTime(400, t + 0.5);
      g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(0.06, t + 0.03);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o2.start(t); o2.stop(t + 0.75);
      // Noise texture
      const n = _noise(false);
      const nf = audioCtx.createBiquadFilter();
      nf.type = 'bandpass'; nf.frequency.value = 800; nf.Q.value = 2;
      const ng = audioCtx.createGain();
      n.connect(nf); nf.connect(ng); ng.connect(pan);
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(0.04, t + 0.02);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      n.start(t); n.stop(t + 0.65);
    } catch (e) {}
  }

  /** Bell jingle — for collar, metallic harmonics with decay */
  function playBellJingle () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan(0.1);
      pan.connect(dest);
      const baseFreq = 2600;
      for (let i = 0; i < 3; i++) {
        const delay = i * 0.07;
        // Fundamental
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(pan);
        o.type = 'sine';
        o.frequency.setValueAtTime(baseFreq + i * 180, t + delay);
        g.gain.setValueAtTime(0, t + delay);
        g.gain.linearRampToValueAtTime(0.08, t + delay + 0.002);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.3);
        o.start(t + delay); o.stop(t + delay + 0.35);
        // Upper partial (inharmonic for metallic quality)
        const o2 = audioCtx.createOscillator();
        const g2 = audioCtx.createGain();
        o2.connect(g2); g2.connect(pan);
        o2.type = 'sine';
        o2.frequency.setValueAtTime((baseFreq + i * 180) * 2.76, t + delay);
        g2.gain.setValueAtTime(0, t + delay);
        g2.gain.linearRampToValueAtTime(0.03, t + delay + 0.001);
        g2.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.2);
        o2.start(t + delay); o2.stop(t + delay + 0.25);
      }
    } catch (e) {}
  }

  /** Drink/lap water — rhythmic tongue laps with splash */
  function playDrinkSound () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan(0);
      pan.connect(dest);
      for (let i = 0; i < 3; i++) {
        const delay = i * 0.2;
        // Tongue lap tone
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(pan);
        o.type = 'sine';
        o.frequency.setValueAtTime(600 + Math.random() * 80, t + delay);
        o.frequency.exponentialRampToValueAtTime(250, t + delay + 0.07);
        g.gain.setValueAtTime(0, t + delay);
        g.gain.linearRampToValueAtTime(0.10, t + delay + 0.003);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.10);
        o.start(t + delay); o.stop(t + delay + 0.12);
        // Tiny splash noise
        const n = _noise(false);
        const bp = audioCtx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 1;
        const ng = audioCtx.createGain();
        n.connect(bp); bp.connect(ng); ng.connect(pan);
        ng.gain.setValueAtTime(0, t + delay + 0.01);
        ng.gain.linearRampToValueAtTime(0.03, t + delay + 0.015);
        ng.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.06);
        n.start(t + delay + 0.01); n.stop(t + delay + 0.08);
      }
    } catch (e) {}
  }

  /** Prey caught — excited squeak + crunch, richer layers */
  function playPreyCatch () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan();
      pan.connect(dest);
      // Squeak with vibrato
      const o1 = audioCtx.createOscillator();
      const g1 = audioCtx.createGain();
      o1.connect(g1); g1.connect(pan);
      o1.type = 'sine';
      o1.frequency.setValueAtTime(2800, t);
      o1.frequency.linearRampToValueAtTime(4200, t + 0.04);
      o1.frequency.linearRampToValueAtTime(2400, t + 0.12);
      g1.gain.setValueAtTime(0, t);
      g1.gain.linearRampToValueAtTime(0.10, t + 0.005);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o1.start(t); o1.stop(t + 0.18);
      // Vibrato on squeak
      const lfo = audioCtx.createOscillator();
      const lfog = audioCtx.createGain();
      lfo.frequency.value = 30;
      lfog.gain.value = 200;
      lfo.connect(lfog); lfog.connect(o1.frequency);
      lfo.start(t); lfo.stop(t + 0.18);
      // Crunch — layered noise
      const n = _noise(false);
      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 1500;
      const g2 = audioCtx.createGain();
      n.connect(hp); hp.connect(g2); g2.connect(pan);
      g2.gain.setValueAtTime(0, t + 0.14);
      g2.gain.linearRampToValueAtTime(0.09, t + 0.145);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      n.start(t + 0.14); n.stop(t + 0.28);
    } catch (e) {}
  }

  /** Heartbeat — deep tense thuds with sub-bass and noise impact */
  function playHeartbeat () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      for (let i = 0; i < 3; i++) {
        const delay = i * 0.7;
        // Lub — deep thud with sub-bass
        const o1 = audioCtx.createOscillator();
        const lp1 = audioCtx.createBiquadFilter();
        lp1.type = 'lowpass'; lp1.frequency.value = 80;
        const g1 = audioCtx.createGain();
        o1.connect(lp1); lp1.connect(g1); g1.connect(dest);
        o1.type = 'sine';
        o1.frequency.setValueAtTime(55, t + delay);
        o1.frequency.exponentialRampToValueAtTime(35, t + delay + 0.08);
        g1.gain.setValueAtTime(0, t + delay);
        g1.gain.linearRampToValueAtTime(0.18, t + delay + 0.005);
        g1.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.12);
        o1.start(t + delay); o1.stop(t + delay + 0.14);
        // Noise transient for impact
        const n1 = _noise(true);
        const nlp = audioCtx.createBiquadFilter();
        nlp.type = 'lowpass'; nlp.frequency.value = 150;
        const ng = audioCtx.createGain();
        n1.connect(nlp); nlp.connect(ng); ng.connect(dest);
        ng.gain.setValueAtTime(0, t + delay);
        ng.gain.linearRampToValueAtTime(0.06, t + delay + 0.003);
        ng.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.06);
        n1.start(t + delay); n1.stop(t + delay + 0.08);
        // Dub — slightly softer follow-up
        const o2 = audioCtx.createOscillator();
        const lp2 = audioCtx.createBiquadFilter();
        lp2.type = 'lowpass'; lp2.frequency.value = 70;
        const g2 = audioCtx.createGain();
        o2.connect(lp2); lp2.connect(g2); g2.connect(dest);
        o2.type = 'sine';
        o2.frequency.setValueAtTime(42, t + delay + 0.15);
        o2.frequency.exponentialRampToValueAtTime(28, t + delay + 0.25);
        g2.gain.setValueAtTime(0, t + delay + 0.15);
        g2.gain.linearRampToValueAtTime(0.14, t + delay + 0.155);
        g2.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.28);
        o2.start(t + delay + 0.15); o2.stop(t + delay + 0.30);
      }
    } catch (e) {}
  }

  /** Twig snap — sharp transient crack with resonance */
  function playTwigSnap () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const pan = _pan();
      pan.connect(dest);
      // Sharp crack
      const n = _noise(false);
      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 1500;
      const peak = audioCtx.createBiquadFilter();
      peak.type = 'peaking'; peak.frequency.value = 3000; peak.gain.value = 6; peak.Q.value = 3;
      const g = audioCtx.createGain();
      n.connect(hp); hp.connect(peak); peak.connect(g); g.connect(pan);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.20, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      n.start(t); n.stop(t + 0.06);
      // Resonant body
      const o = audioCtx.createOscillator();
      const og = audioCtx.createGain();
      o.connect(og); og.connect(pan);
      o.type = 'triangle';
      o.frequency.setValueAtTime(800, t);
      o.frequency.exponentialRampToValueAtTime(200, t + 0.03);
      og.gain.setValueAtTime(0.06, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      o.start(t); o.stop(t + 0.05);
    } catch (e) {}
  }

  /** Thunder rumble — deep rolling with sub-bass and crackling */
  function playThunderRumble () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      // Main rumble — pink noise lowpassed
      const n = _noise(true);
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 120;
      // Modulate the filter for rolling effect
      const lfo = audioCtx.createOscillator();
      const lfog = audioCtx.createGain();
      lfo.frequency.value = 0.8;
      lfog.gain.value = 50;
      lfo.connect(lfog); lfog.connect(lp.frequency);
      const g = audioCtx.createGain();
      n.connect(lp); lp.connect(g); g.connect(dest);
      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.25);
      g.gain.setValueAtTime(0.12, t + 0.8);
      g.gain.linearRampToValueAtTime(0.08, t + 1.5);
      g.gain.exponentialRampToValueAtTime(0.001, t + 3.0);
      n.start(t); n.stop(t + 3.2);
      lfo.start(t); lfo.stop(t + 3.2);
      // Sub-bass thud at the start
      const sub = audioCtx.createOscillator();
      const sg = audioCtx.createGain();
      sub.connect(sg); sg.connect(dest);
      sub.type = 'sine';
      sub.frequency.setValueAtTime(40, t + 0.1);
      sub.frequency.exponentialRampToValueAtTime(20, t + 0.5);
      sg.gain.setValueAtTime(0, t);
      sg.gain.linearRampToValueAtTime(0.10, t + 0.12);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      sub.start(t + 0.1); sub.stop(t + 0.65);
      // High-frequency crackle
      const n2 = _noise(false);
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 4000; bp.Q.value = 0.5;
      const g2 = audioCtx.createGain();
      n2.connect(bp); bp.connect(g2); g2.connect(dest);
      g2.gain.setValueAtTime(0, t + 0.15);
      g2.gain.linearRampToValueAtTime(0.04, t + 0.18);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      n2.start(t + 0.15); n2.stop(t + 0.65);
      // Extra reverb
      if (reverbSendNode) {
        const rv = audioCtx.createGain();
        rv.gain.value = 0.25;
        g.connect(rv);
        rv.connect(reverbSendNode);
      }
    } catch (e) {}
  }

  function playSound (type) {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      switch (type) {
        case 'step': {
          // Layered footstep: tonal thud + noise crackle
          const pan = _pan();
          pan.connect(dest);
          // Low thud
          const o = audioCtx.createOscillator();
          const lp = audioCtx.createBiquadFilter();
          lp.type = 'lowpass'; lp.frequency.value = 150;
          const g = audioCtx.createGain();
          o.connect(lp); lp.connect(g); g.connect(pan);
          o.type = 'triangle';
          o.frequency.setValueAtTime(70 + Math.random() * 30, t);
          o.frequency.exponentialRampToValueAtTime(40, t + 0.06);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.10, t + 0.003);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          o.start(t); o.stop(t + 0.10);
          // Ground noise texture
          const n = _noise(true);
          const hp = audioCtx.createBiquadFilter();
          hp.type = 'bandpass'; hp.frequency.value = 800 + Math.random() * 400; hp.Q.value = 0.5;
          const ng = audioCtx.createGain();
          n.connect(hp); hp.connect(ng); ng.connect(pan);
          ng.gain.setValueAtTime(0, t);
          ng.gain.linearRampToValueAtTime(0.04, t + 0.002);
          ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
          n.start(t); n.stop(t + 0.07);
          // Also play a leaf crunch on some steps
          if (Math.random() < 0.3) playLeafCrunch();
          // Bell jingle when kittypet
          if (storyPhase === 'house' && Math.random() < 0.15) playBellJingle();
          break;
        }
        case 'meow': {
          // Rich meow with formants and harmonics
          const pan = _pan(0);
          pan.connect(dest);
          const o = audioCtx.createOscillator();
          const f1 = audioCtx.createBiquadFilter();
          f1.type = 'bandpass'; f1.frequency.value = 550; f1.Q.value = 2;
          const g = audioCtx.createGain();
          o.connect(f1); f1.connect(g); g.connect(pan);
          o.type = 'sine';
          o.frequency.setValueAtTime(680, t);
          o.frequency.linearRampToValueAtTime(520, t + 0.12);
          o.frequency.linearRampToValueAtTime(440, t + 0.3);
          o.frequency.linearRampToValueAtTime(380, t + 0.42);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.20, t + 0.01);
          g.gain.setValueAtTime(0.18, t + 0.15);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
          o.start(t); o.stop(t + 0.48);
          // Harmonic
          const o2 = audioCtx.createOscillator();
          const g2 = audioCtx.createGain();
          o2.connect(g2); g2.connect(pan);
          o2.type = 'sine';
          o2.frequency.setValueAtTime(680 * 1.5, t);
          o2.frequency.linearRampToValueAtTime(380 * 1.5, t + 0.4);
          g2.gain.setValueAtTime(0, t);
          g2.gain.linearRampToValueAtTime(0.06, t + 0.01);
          g2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
          o2.start(t); o2.stop(t + 0.38);
          // Vibrato
          const lfo = audioCtx.createOscillator();
          const lfog = audioCtx.createGain();
          lfo.frequency.value = 5;
          lfog.gain.value = 25;
          lfo.connect(lfog); lfog.connect(o.frequency);
          lfo.start(t); lfo.stop(t + 0.48);
          break;
        }
        case 'ceremony': {
          // Dramatic rising chord with harmonics
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.connect(g); g.connect(dest);
          o.type = 'sine';
          o.frequency.setValueAtTime(330, t);
          o.frequency.linearRampToValueAtTime(550, t + 0.4);
          o.frequency.linearRampToValueAtTime(660, t + 0.8);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.20, t + 0.02);
          g.gain.setValueAtTime(0.25, t + 0.4);
          g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
          o.start(t); o.stop(t + 1.05);
          // Fifth harmony
          const o2 = audioCtx.createOscillator();
          const g2 = audioCtx.createGain();
          o2.connect(g2); g2.connect(dest);
          o2.type = 'sine';
          o2.frequency.setValueAtTime(330 * 1.5, t);
          o2.frequency.linearRampToValueAtTime(660 * 1.5, t + 0.8);
          g2.gain.setValueAtTime(0, t);
          g2.gain.linearRampToValueAtTime(0.08, t + 0.1);
          g2.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
          o2.start(t); o2.stop(t + 0.95);
          // Shimmer noise
          const n = _noise(false);
          const bp = audioCtx.createBiquadFilter();
          bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 2;
          const ng = audioCtx.createGain();
          n.connect(bp); bp.connect(ng); ng.connect(dest);
          ng.gain.setValueAtTime(0, t + 0.3);
          ng.gain.linearRampToValueAtTime(0.03, t + 0.5);
          ng.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
          n.start(t + 0.3); n.stop(t + 0.95);
          break;
        }
        case 'hit': {
          // Impact: noise transient + tonal punch
          const pan = _pan();
          pan.connect(dest);
          const o = audioCtx.createOscillator();
          const lp = audioCtx.createBiquadFilter();
          lp.type = 'lowpass'; lp.frequency.value = 300;
          const g = audioCtx.createGain();
          o.connect(lp); lp.connect(g); g.connect(pan);
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(220, t);
          o.frequency.exponentialRampToValueAtTime(60, t + 0.10);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.22, t + 0.002);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
          o.start(t); o.stop(t + 0.16);
          // Noise impact
          const n = _noise(false);
          const bp = audioCtx.createBiquadFilter();
          bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.5;
          const ng = audioCtx.createGain();
          n.connect(bp); bp.connect(ng); ng.connect(pan);
          ng.gain.setValueAtTime(0, t);
          ng.gain.linearRampToValueAtTime(0.10, t + 0.001);
          ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          n.start(t); n.stop(t + 0.10);
          break;
        }
        case 'hurt': {
          // Impact + pain
          const o = audioCtx.createOscillator();
          const lp = audioCtx.createBiquadFilter();
          lp.type = 'lowpass'; lp.frequency.value = 250;
          const g = audioCtx.createGain();
          o.connect(lp); lp.connect(g); g.connect(dest);
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(320, t);
          o.frequency.exponentialRampToValueAtTime(80, t + 0.18);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.20, t + 0.002);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          o.start(t); o.stop(t + 0.25);
          // Noise crack
          const n = _noise(false);
          const bp = audioCtx.createBiquadFilter();
          bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 0.5;
          const ng = audioCtx.createGain();
          n.connect(bp); bp.connect(ng); ng.connect(dest);
          ng.gain.setValueAtTime(0, t);
          ng.gain.linearRampToValueAtTime(0.08, t + 0.001);
          ng.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
          n.start(t); n.stop(t + 0.12);
          playYowl();
          break;
        }
        case 'swoosh': {
          // Filtered swoosh with noise
          const pan = _pan();
          pan.connect(dest);
          const o = audioCtx.createOscillator();
          const bp = audioCtx.createBiquadFilter();
          bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 1;
          const g = audioCtx.createGain();
          o.connect(bp); bp.connect(g); g.connect(pan);
          o.type = 'sine';
          o.frequency.setValueAtTime(900, t);
          o.frequency.exponentialRampToValueAtTime(180, t + 0.15);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.14, t + 0.005);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          o.start(t); o.stop(t + 0.20);
          // Wind noise layer
          const n = _noise(false);
          const nhp = audioCtx.createBiquadFilter();
          nhp.type = 'highpass'; nhp.frequency.value = 1000;
          const ng = audioCtx.createGain();
          n.connect(nhp); nhp.connect(ng); ng.connect(pan);
          ng.gain.setValueAtTime(0, t);
          ng.gain.linearRampToValueAtTime(0.06, t + 0.005);
          ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          n.start(t); n.stop(t + 0.14);
          break;
        }
        case 'battle': {
          // Dramatic battle start — multi-layer
          const o = audioCtx.createOscillator();
          const lp = audioCtx.createBiquadFilter();
          lp.type = 'lowpass'; lp.frequency.value = 500;
          const g = audioCtx.createGain();
          o.connect(lp); lp.connect(g); g.connect(dest);
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(140, t);
          o.frequency.linearRampToValueAtTime(420, t + 0.2);
          o.frequency.linearRampToValueAtTime(180, t + 0.5);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.22, t + 0.01);
          g.gain.setValueAtTime(0.25, t + 0.2);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
          o.start(t); o.stop(t + 0.7);
          // Sub impact
          const sub = audioCtx.createOscillator();
          const sg = audioCtx.createGain();
          sub.connect(sg); sg.connect(dest);
          sub.type = 'sine';
          sub.frequency.setValueAtTime(60, t);
          sub.frequency.exponentialRampToValueAtTime(30, t + 0.3);
          sg.gain.setValueAtTime(0, t);
          sg.gain.linearRampToValueAtTime(0.12, t + 0.01);
          sg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
          sub.start(t); sub.stop(t + 0.4);
          // Noise impact
          const n = _noise(false);
          const nbp = audioCtx.createBiquadFilter();
          nbp.type = 'bandpass'; nbp.frequency.value = 1000; nbp.Q.value = 0.5;
          const ng = audioCtx.createGain();
          n.connect(nbp); nbp.connect(ng); ng.connect(dest);
          ng.gain.setValueAtTime(0, t);
          ng.gain.linearRampToValueAtTime(0.08, t + 0.01);
          ng.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          n.start(t); n.stop(t + 0.35);
          playHiss();
          playHeartbeat();
          break;
        }
        case 'danger': {
          // Warning — filtered square wave pulse with noise
          const o = audioCtx.createOscillator();
          const bp = audioCtx.createBiquadFilter();
          bp.type = 'bandpass'; bp.frequency.value = 440; bp.Q.value = 3;
          const g = audioCtx.createGain();
          o.connect(bp); bp.connect(g); g.connect(dest);
          o.type = 'square';
          o.frequency.setValueAtTime(440, t);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.12, t + 0.01);
          g.gain.linearRampToValueAtTime(0, t + 0.14);
          g.gain.linearRampToValueAtTime(0.14, t + 0.30);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
          o.start(t); o.stop(t + 0.55);
          // Sub pulse
          const sub = audioCtx.createOscillator();
          const sg = audioCtx.createGain();
          sub.connect(sg); sg.connect(dest);
          sub.type = 'sine';
          sub.frequency.value = 55;
          sg.gain.setValueAtTime(0, t);
          sg.gain.linearRampToValueAtTime(0.10, t + 0.01);
          sg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
          sub.start(t); sub.stop(t + 0.25);
          playHeartbeat();
          break;
        }
        case 'eat': {
          // Happy munching — crunchy with tone
          const pan = _pan(0);
          pan.connect(dest);
          for (let i = 0; i < 3; i++) {
            const d = i * 0.1;
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.connect(g); g.connect(pan);
            o.type = 'triangle';
            o.frequency.setValueAtTime(280 + i * 60, t + d);
            o.frequency.linearRampToValueAtTime(420 + i * 50, t + d + 0.06);
            g.gain.setValueAtTime(0, t + d);
            g.gain.linearRampToValueAtTime(0.10, t + d + 0.005);
            g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.09);
            o.start(t + d); o.stop(t + d + 0.11);
            // Crunch noise
            const n = _noise(false);
            const hp = audioCtx.createBiquadFilter();
            hp.type = 'highpass'; hp.frequency.value = 2000;
            const ng = audioCtx.createGain();
            n.connect(hp); hp.connect(ng); ng.connect(pan);
            ng.gain.setValueAtTime(0, t + d);
            ng.gain.linearRampToValueAtTime(0.04, t + d + 0.003);
            ng.gain.exponentialRampToValueAtTime(0.001, t + d + 0.05);
            n.start(t + d); n.stop(t + d + 0.06);
          }
          playPurr();
          break;
        }
        case 'drink':
          playDrinkSound();
          break;
        case 'purr':
          playPurr();
          break;
        case 'hiss':
          playHiss();
          break;
        case 'splash':
          playWaterSplash();
          break;
        case 'catch':
          playPreyCatch();
          break;
        case 'thunder':
          playThunderRumble();
          break;
        case 'ambient': {
          // Randomly pick a forest ambient sound
          const r = Math.random();
          if (r < 0.22)      playBirdTweet();
          else if (r < 0.35) playSongbird();
          else if (r < 0.48) playWindRustle();
          else if (r < 0.58) playCricket();
          else if (r < 0.65) playFrogCroak();
          else if (r < 0.72) playRiverSound();
          else if (r < 0.78) playLeafCrunch();
          else if (r < 0.82) playTwigSnap();
          else if (r < 0.86) playOwlHoot();
          else if (r < 0.89) playThunderRumble();
          break;
        }
        default: {
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.connect(g); g.connect(dest);
          o.frequency.value = 200; o.type = 'sine';
          g.gain.setValueAtTime(0.08, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
          o.start(t); o.stop(t + 0.22);
        }
      }
    } catch (e) {}
  }

  /** Play ambient forest sounds more frequently for immersion */
  function startForestAmbience () {
    if (ambientInterval) return;
    ambientInterval = setInterval(() => {
      if (gameState !== 'playing' || !audioCtx) return;
      if (Math.random() < 0.4) playBirdTweet();
      if (Math.random() < 0.15) playWindRustle();
      if (Math.random() < 0.10) playCricket();
    }, 3000);
  }

  /* ====================================================
     INIT
     ==================================================== */
  function init () {
    try {
      isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      if (isMobile) document.body.classList.add('touch-device');
      initThreeJS();
      createForest();
      createHighrock();
      createCat();
      createNPCCats();
      createLighting();
      addFireflies();
      setupControls();

      // hide loading, show title
      loadingBarFill.style.width = '100%';
      document.querySelector('.loading-text').textContent = 'Press anywhere to start!';
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
        titleScreen.classList.remove('hidden');
        gameState = 'title';
        addTitleFireflies();
      }, 600);

      clock = new THREE.Clock();
      animate();
    } catch (err) {
      console.error('INIT ERROR:', err);
      // Show error on screen so we can see it
      document.body.innerHTML = '<div style="color:red;padding:40px;font-size:18px;background:#111;min-height:100vh">' +
        '<h1>Game Error</h1><p>' + err.message + '</p><pre>' + err.stack + '</pre></div>';
    }
  }

  /* ====================================================
     THREE.JS SETUP
     ==================================================== */
  function initThreeJS () {
    scene = new THREE.Scene();
    // Rich, layered sky — vibrant but not washed out
    scene.background = new THREE.Color(0.48, 0.72, 0.92);
    // Atmospheric fog that gives depth — gentle fade into distance
    scene.fog = new THREE.Fog(0x7ab5d8, 50, 180);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 250);
    camera.position.set(0, 8, 14);
    camera.lookAt(0, 1, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Tone mapping for natural, rich colors without being too bright
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.physicallyCorrectLights = true;
    document.body.insertBefore(renderer.domElement, document.body.firstChild);
    renderer.domElement.id = 'game-canvas';

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  /* ====================================================
     FOREST
     ==================================================== */
  function createForest () {
    const bounds = GameLogic.getForestBounds();

    /* ground — extra large so you never see the void */
    const groundGeo = new THREE.PlaneGeometry(600, 600, 1, 1);
    const groundMat = new THREE.MeshPhongMaterial({ color: 0x4a9438, shininess: 2 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);

    /* Scattered dirt patches on the ground for natural look */
    const dirtMat = new THREE.MeshPhongMaterial({ color: 0x7a6a50, shininess: 1 });
    for (let i = 0; i < 40; i++) {
      const dx = (Math.random() - 0.5) * 160, dz = (Math.random() - 0.5) * 160;
      const ds = 2 + Math.random() * 5;
      const dirt = new THREE.Mesh(new THREE.CircleGeometry(ds, 8), dirtMat);
      dirt.rotation.x = -Math.PI / 2; dirt.position.set(dx, 0.005, dz);
      scene.add(dirt);
    }

    /* camp clearing — larger, with dirt ring around it */
    const campRingMat = new THREE.MeshPhongMaterial({ color: 0x6a5a40, shininess: 1 });
    const campRing = new THREE.Mesh(new THREE.CircleGeometry(16, 32), campRingMat);
    campRing.rotation.x = -Math.PI / 2; campRing.position.y = 0.005;
    scene.add(campRing);
    const campGeo = new THREE.CircleGeometry(13, 32);
    const campMat = new THREE.MeshPhongMaterial({ color: 0x8a7a60, shininess: 1 });
    const camp = new THREE.Mesh(campGeo, campMat);
    camp.rotation.x = -Math.PI / 2; camp.position.y = 0.01;
    scene.add(camp);

    /* path — wider, with worn dirt edges */
    const pathEdgeMat = new THREE.MeshPhongMaterial({ color: 0x7a6a4a, shininess: 1 });
    const pathEdge = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 32), pathEdgeMat);
    pathEdge.rotation.x = -Math.PI / 2; pathEdge.position.set(0, 0.012, 22);
    scene.add(pathEdge);
    const pathMat = new THREE.MeshPhongMaterial({ color: 0x9a8a6a, shininess: 1 });
    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 30), pathMat);
    path.rotation.x = -Math.PI / 2; path.position.set(0, 0.02, 22);
    scene.add(path);

    /* trees */
    trees = GameLogic.generateTreePositions(200, 42, bounds);
    trees.forEach(t => {
      const obj = t.type === 'oak' ? makeOak(t) : makePine(t);
      obj.position.set(t.x, 0, t.z);
      scene.add(obj);
      treeObjects.push({ mesh: obj, data: t });
      // Register branch platforms (convert local coords to world)
      if (obj._branches) {
        obj._branches.forEach(br => {
          branchPlatforms.push({
            x: t.x + br.lx,
            z: t.z + br.lz,
            y: br.y,
            radius: br.radius,
          });
        });
      }
    });

    /* rocks */
    rocks = GameLogic.generateRockPositions(60, 42, bounds);
    rocks.forEach(r => {
      const obj = makeRock(r);
      obj.position.set(r.x, 0, r.z);
      scene.add(obj);
      rockObjects.push({ mesh: obj, data: r });
    });

    /* grass — dense clumps with varied greens */
    const grassGreens = [0x5cb849, 0x4da83a, 0x6bc45a, 0x3d9830, 0x58b04a];
    for (let i = 0; i < 800; i++) {
      const gx = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const gz = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      const gc = grassGreens[Math.floor(Math.random() * grassGreens.length)];
      const grassM = new THREE.MeshPhongMaterial({ color: gc, side: THREE.DoubleSide, shininess: 1 });
      const height = 0.3 + Math.random() * 0.6;
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.08 + Math.random()*0.1, height), grassM);
      blade.position.set(gx, height*0.5, gz);
      blade.rotation.y = Math.random() * Math.PI;
      blade.rotation.z = (Math.random() - 0.5) * 0.3;
      scene.add(blade);
    }
    // Grass clumps (small groups of blades)
    for (let i = 0; i < 150; i++) {
      const cx = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const cz = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      const clump = new THREE.Group();
      const cc = grassGreens[Math.floor(Math.random() * grassGreens.length)];
      const cm = new THREE.MeshPhongMaterial({ color: cc, side: THREE.DoubleSide, shininess: 1 });
      for (let j = 0; j < 5; j++) {
        const h = 0.4 + Math.random()*0.5;
        const b = new THREE.Mesh(new THREE.PlaneGeometry(0.06, h), cm);
        b.position.set((Math.random()-0.5)*0.3, h*0.5, (Math.random()-0.5)*0.3);
        b.rotation.y = Math.random() * Math.PI;
        b.rotation.z = (Math.random()-0.5)*0.4;
        clump.add(b);
      }
      clump.position.set(cx, 0, cz);
      scene.add(clump);
    }

    /* flowers — detailed with petals and stems */
    const fColors = [0xff6b9d, 0xffd93d, 0xff8c42, 0xc084fc, 0x6dd5ed, 0xff5577, 0xffaa33];
    for (let i = 0; i < 120; i++) {
      const fx = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const fz = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      const fc = fColors[Math.floor(Math.random() * fColors.length)];
      const flower = new THREE.Group();
      // Stem
      const stemH = 0.2 + Math.random()*0.3;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, stemH, 4),
        new THREE.MeshPhongMaterial({ color: 0x3d7a2a, shininess: 1 }));
      stem.position.y = stemH * 0.5; flower.add(stem);
      // Flower head — multiple petals around a center
      const petalCount = 4 + Math.floor(Math.random()*4);
      const petalMat = new THREE.MeshPhongMaterial({ color: fc, emissive: fc, emissiveIntensity: 0.02, shininess: 3 });
      for (let p = 0; p < petalCount; p++) {
        const pa = (p / petalCount) * Math.PI * 2;
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), petalMat);
        petal.position.set(Math.cos(pa)*0.07, stemH + 0.02, Math.sin(pa)*0.07);
        petal.scale.set(1, 0.5, 1);
        flower.add(petal);
      }
      // Center
      const centerMat = new THREE.MeshPhongMaterial({ color: 0xffee55, shininess: 2 });
      const center = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 4), centerMat);
      center.position.y = stemH + 0.02; flower.add(center);
      flower.position.set(fx, 0, fz);
      scene.add(flower);
    }

    /* Bushes — scattered throughout the forest */
    const bushGreens = [0x3a7a2a, 0x4a8a3a, 0x2d6d22, 0x408a30];
    for (let i = 0; i < 80; i++) {
      const bx = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const bz = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      // Skip if too close to camp center
      if (Math.sqrt(bx*bx + bz*bz) < 16) continue;
      const bush = new THREE.Group();
      const bc = bushGreens[Math.floor(Math.random() * bushGreens.length)];
      const bm = new THREE.MeshPhongMaterial({ color: bc, shininess: 2 });
      const bSize = 0.5 + Math.random()*0.8;
      // Main bush body (2-3 spheres clumped together)
      for (let j = 0; j < 3; j++) {
        const part = new THREE.Mesh(new THREE.IcosahedronGeometry(bSize*(0.5+Math.random()*0.5), 1), bm);
        part.position.set((Math.random()-0.5)*bSize*0.6, bSize*0.4 + j*bSize*0.2, (Math.random()-0.5)*bSize*0.6);
        part.castShadow = true; bush.add(part);
      }
      bush.position.set(bx, 0, bz);
      scene.add(bush);
    }

    /* Fallen logs */
    for (let i = 0; i < 15; i++) {
      const lx = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const lz = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      if (Math.sqrt(lx*lx + lz*lz) < 16) continue;
      const logLen = 2 + Math.random() * 4;
      const logRad = 0.15 + Math.random() * 0.2;
      const logMat = new THREE.MeshPhongMaterial({ color: new THREE.Color(0.3+Math.random()*0.1, 0.22, 0.12), shininess: 2 });
      const log = new THREE.Mesh(new THREE.CylinderGeometry(logRad, logRad*1.1, logLen, 8), logMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = Math.random() * Math.PI;
      log.position.set(lx, logRad, lz);
      log.castShadow = true;
      scene.add(log);
    }

    /* Mushrooms */
    for (let i = 0; i < 40; i++) {
      const mx = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const mz = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      const mushroom = new THREE.Group();
      const stemMat = new THREE.MeshPhongMaterial({ color: 0xeeddcc, shininess: 2 });
      const mStem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 5), stemMat);
      mStem.position.y = 0.06; mushroom.add(mStem);
      const capColors = [0xcc3322, 0xdd8844, 0xbb7755, 0xeebb66];
      const capMat = new THREE.MeshPhongMaterial({ color: capColors[Math.floor(Math.random()*capColors.length)], shininess: 4 });
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4, 0, Math.PI*2, 0, Math.PI*0.6), capMat);
      cap.position.y = 0.12; mushroom.add(cap);
      mushroom.position.set(mx, 0, mz);
      scene.add(mushroom);
    }

    /* Ferns — small frond-like plants */
    const fernMat = new THREE.MeshPhongMaterial({ color: 0x3a8830, side: THREE.DoubleSide, shininess: 1 });
    for (let i = 0; i < 60; i++) {
      const fx2 = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const fz2 = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      if (Math.sqrt(fx2*fx2 + fz2*fz2) < 15) continue;
      const fern = new THREE.Group();
      for (let f = 0; f < 4; f++) {
        const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.6), fernMat);
        frond.position.y = 0.3;
        frond.rotation.y = (f / 4) * Math.PI * 2;
        frond.rotation.x = -0.3;
        fern.add(frond);
      }
      fern.position.set(fx2, 0, fz2);
      scene.add(fern);
    }

    /* river — layered for depth and better visuals */
    // River bed (dark bottom visible through water)
    const riverBedGeo = new THREE.PlaneGeometry(9, 200, 1, 1);
    const riverBedMat = new THREE.MeshPhongMaterial({ color: 0x2a5a4a, shininess: 1 });
    const riverBed = new THREE.Mesh(riverBedGeo, riverBedMat);
    riverBed.rotation.x = -Math.PI / 2; riverBed.position.set(75, -0.05, 0);
    scene.add(riverBed);
    // Riverbank edges (dirt/mud)
    const bankMat = new THREE.MeshPhongMaterial({ color: 0x5a4a30, shininess: 1 });
    [-1, 1].forEach(side => {
      const bank = new THREE.Mesh(new THREE.PlaneGeometry(2, 200, 1, 1), bankMat);
      bank.rotation.x = -Math.PI / 2;
      bank.position.set(75 + side * 5, 0.01, 0);
      scene.add(bank);
    });
    // River pebbles/stones at banks
    const pebbleMat = new THREE.MeshPhongMaterial({ color: 0x888877, shininess: 3 });
    for (let i = 0; i < 60; i++) {
      const pSize = 0.08 + Math.random() * 0.15;
      const pebble = new THREE.Mesh(new THREE.SphereGeometry(pSize, 5, 4), pebbleMat);
      const side = Math.random() > 0.5 ? 1 : -1;
      pebble.position.set(75 + side * (3.5 + Math.random()*1.5), 0.02, (Math.random()-0.5)*180);
      pebble.scale.y = 0.4;
      scene.add(pebble);
    }
    // Water surface (translucent blue)
    const riverGeo = new THREE.PlaneGeometry(8, 200, 8, 40);
    const riverMat = new THREE.MeshPhongMaterial({
      color: 0x3399cc, transparent: true, opacity: 0.6,
      shininess: 30, specular: 0x66aacc
    });
    const river = new THREE.Mesh(riverGeo, riverMat);
    river.rotation.x = -Math.PI / 2; river.position.set(75, 0.05, 0);
    river.name = 'river';
    scene.add(river);
    // Water lilies / floating plants
    for (let i = 0; i < 20; i++) {
      const lily = new THREE.Group();
      const padMat = new THREE.MeshPhongMaterial({ color: 0x2d8a40, shininess: 4 });
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.25 + Math.random()*0.2, 8), padMat);
      pad.rotation.x = -Math.PI / 2; pad.position.y = 0.07;
      lily.add(pad);
      if (Math.random() > 0.5) {
        const flowerMat = new THREE.MeshPhongMaterial({ color: 0xffaacc, shininess: 4 });
        const lilyFlower = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), flowerMat);
        lilyFlower.position.y = 0.1; lily.add(lilyFlower);
      }
      lily.position.set(72 + Math.random()*6, 0, (Math.random()-0.5)*150);
      scene.add(lily);
    }

    /* Stream near camp — small water feature with rocks */
    const streamGeo = new THREE.CircleGeometry(5, 16);
    const streamMat = new THREE.MeshPhongMaterial({
      color: 0x3399bb, transparent: true, opacity: 0.55, shininess: 25
    });
    const stream = new THREE.Mesh(streamGeo, streamMat);
    stream.rotation.x = -Math.PI / 2;
    stream.position.set(WATER_SPOT.x, 0.04, WATER_SPOT.z);
    scene.add(stream);
    // Stream rocks
    for (let i = 0; i < 8; i++) {
      const sr = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.2 + Math.random()*0.3, 0),
        new THREE.MeshPhongMaterial({ color: 0x777766, shininess: 3 })
      );
      const angle = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * 2;
      sr.position.set(WATER_SPOT.x + Math.cos(angle)*dist, 0.1, WATER_SPOT.z + Math.sin(angle)*dist);
      sr.scale.y = 0.5;
      scene.add(sr);
    }

    /* ---- DENS (ThunderClan Camp) ---- */
    createDens();

    /* ---- TWOLEG HOUSE ---- */
    createTwolegHouse();

    /* ---- GARDEN FENCE ---- */
    createGardenFence();

    /* ---- TERRITORY LANDMARKS ---- */
    createTerritoryLandmarks();
  }

  /* ====================================================
     CAMP DENS
     ==================================================== */
  function createDens () {
    const denMat  = new THREE.MeshPhongMaterial({ color: 0x7c6a4e, shininess: 2 });
    const leafMat = new THREE.MeshPhongMaterial({ color: 0x3a7a28, shininess: 2 });
    const mossMat = new THREE.MeshPhongMaterial({ color: 0x5a9a4a, shininess: 2 });
    const brambleMat = new THREE.MeshPhongMaterial({ color: 0x7a6a48, shininess: 2 });
    const darkLeafMat = new THREE.MeshPhongMaterial({ color: 0x2d6a1e, shininess: 2 });

    // Helper: build a den (dome of branches + leaf cover + name label)
    function makeDen (name, x, z, radius, height) {
      const g = new THREE.Group();
      // dome frame (half sphere of sticks) — higher detail
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        brambleMat
      );
      dome.position.y = 0; dome.castShadow = true;
      g.add(dome);
      // leaf/moss cover — outer layer
      const cover = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.05, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.48),
        leafMat
      );
      cover.position.y = 0.05; cover.castShadow = true;
      g.add(cover);
      // Extra leaf patches for organic look
      for (let lp = 0; lp < 5; lp++) {
        const lpAngle = Math.random() * Math.PI * 2;
        const lpPhi = Math.random() * 0.4;
        const lpMat = Math.random() > 0.5 ? darkLeafMat : leafMat;
        const patch = new THREE.Mesh(new THREE.SphereGeometry(radius*0.35, 6, 5), lpMat);
        patch.position.set(
          Math.cos(lpAngle) * radius * 0.8,
          radius * 0.5 + lpPhi * radius,
          Math.sin(lpAngle) * radius * 0.8
        );
        patch.scale.y = 0.5; g.add(patch);
      }
      // Bramble/twig details around entrance
      for (let tw = 0; tw < 4; tw++) {
        const twig = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.02, radius*0.6, 4),
          new THREE.MeshPhongMaterial({ color: 0x6a5a3a })
        );
        const ta = (tw / 4) * Math.PI - Math.PI*0.25;
        twig.position.set(Math.cos(ta)*radius*0.35, radius*0.25, radius*0.85);
        twig.rotation.z = ta * 0.5;
        g.add(twig);
      }
      // entrance hole (dark opening)
      const entrance = new THREE.Mesh(
        new THREE.CircleGeometry(radius * 0.4, 10),
        new THREE.MeshBasicMaterial({ color: 0x0a0a0a })
      );
      entrance.position.set(0, radius * 0.35, radius * 0.93);
      g.add(entrance);
      // Ground moss around den base
      const baseMoss = new THREE.Mesh(
        new THREE.CircleGeometry(radius * 1.3, 12),
        new THREE.MeshPhongMaterial({ color: 0x4a7a3a, shininess: 1 })
      );
      baseMoss.rotation.x = -Math.PI / 2; baseMoss.position.y = 0.01;
      g.add(baseMoss);
      // name label floating above
      const label = makeNameLabel(name, height + 0.5);
      g.add(label);
      g.position.set(x, 0, z);
      scene.add(g);
      return g;
    }

    // Warriors' Den - large, on the east side of camp
    makeDen("Warriors' Den", 8, -2, 2.8, 3.0);

    // Apprentices' Den - smaller, near warriors
    makeDen("Apprentices' Den", 6, 5, 2.0, 2.2);

    // Leader's Den - below Highrock (Bluestar's den)
    const leaderDen = new THREE.Group();
    // cave-like overhang under highrock
    const overhang = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhongMaterial({ color: 0x666666 })
    );
    overhang.position.y = 0;
    leaderDen.add(overhang);
    // lichen curtain (thin green strips)
    for (let i = 0; i < 6; i++) {
      const lichen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, 1.2),
        new THREE.MeshPhongMaterial({ color: 0x4a8a3a, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
      );
      lichen.position.set(-0.5 + i * 0.2, 0.8, 1.6);
      leaderDen.add(lichen);
    }
    const lLabel = makeNameLabel("Leader's Den", 2.5);
    leaderDen.add(lLabel);
    leaderDen.position.set(-3, 0, -1.5);
    scene.add(leaderDen);

    // Medicine Cat Den - tucked into a rock on south side
    const medDen = new THREE.Group();
    const medRock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.0, 1), new THREE.MeshPhongMaterial({ color: 0x777766 }));
    medRock.scale.set(1.2, 0.8, 1); medRock.position.y = 0.8; medRock.castShadow = true;
    medDen.add(medRock);
    // cave opening
    const medOpening = new THREE.Mesh(new THREE.CircleGeometry(0.8, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    medOpening.position.set(0, 0.5, 1.8);
    medDen.add(medOpening);
    // herbs (small colored dots)
    [0x66aa44, 0xaaaa22, 0x8844aa, 0x44aa88].forEach((c, i) => {
      const herb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 4, 4), new THREE.MeshPhongMaterial({ color: c }));
      herb.position.set(-0.6 + i * 0.4, 0.05, 2.3);
      medDen.add(herb);
    });
    const mLabel = makeNameLabel("Medicine Den", 2.5);
    medDen.add(mLabel);
    medDen.position.set(-10, 0, 3);
    scene.add(medDen);

    // Nursery - warm and sheltered, west side
    const nursery = makeDen("Nursery", -8, 5, 2.5, 2.8);
    // Extra moss bedding visible inside
    const moss = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 8),
      mossMat
    );
    moss.rotation.x = -Math.PI / 2; moss.position.set(-8, 0.02, 5);
    scene.add(moss);

    // Elders' Den - on the far side of camp
    makeDen("Elders' Den", -6, -7, 2.2, 2.5);

    // Prisoner Den - a small, enclosed den on the edge of camp for captives
    const prisDen = new THREE.Group();
    // Tighter, darker dome — more like a cage of brambles
    const prisDome = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhongMaterial({ color: 0x5a4a30, shininess: 1 })
    );
    prisDome.castShadow = true;
    prisDen.add(prisDome);
    // Thick bramble thorns woven around it
    for (let bt = 0; bt < 10; bt++) {
      const thorn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.02, 1.2 + Math.random() * 0.4, 4),
        new THREE.MeshPhongMaterial({ color: 0x4a3a20 })
      );
      const ta2 = (bt / 10) * Math.PI * 2;
      thorn.position.set(Math.cos(ta2) * 1.3, 0.5 + Math.random() * 0.4, Math.sin(ta2) * 1.3);
      thorn.rotation.z = (Math.random() - 0.5) * 0.6;
      thorn.rotation.x = (Math.random() - 0.5) * 0.4;
      prisDen.add(thorn);
    }
    // Small dark entrance
    const prisEntrance = new THREE.Mesh(
      new THREE.CircleGeometry(0.35, 8),
      new THREE.MeshBasicMaterial({ color: 0x080808 })
    );
    prisEntrance.position.set(0, 0.3, 1.35);
    prisDen.add(prisEntrance);
    // Dirt ground patch
    const prisDirt = new THREE.Mesh(
      new THREE.CircleGeometry(1.8, 10),
      new THREE.MeshPhongMaterial({ color: 0x5a4a3a, shininess: 1 })
    );
    prisDirt.rotation.x = -Math.PI / 2; prisDirt.position.y = 0.01;
    prisDen.add(prisDirt);
    const prisLabel = makeNameLabel("Prisoner Den", 2.0);
    prisDen.add(prisLabel);
    prisDen.position.set(10, 0, 6);
    scene.add(prisDen);

    // Fresh-kill pile (center of camp)
    const killPile = new THREE.Group();
    const pileMat = new THREE.MeshPhongMaterial({ color: 0x8a6a4a });
    for (let i = 0; i < 5; i++) {
      const prey = new THREE.Mesh(new THREE.SphereGeometry(0.15, 5, 4), pileMat);
      prey.position.set((Math.random() - 0.5) * 0.8, 0.08 + i * 0.06, (Math.random() - 0.5) * 0.8);
      prey.scale.set(1, 0.6, 1.5);
      killPile.add(prey);
    }
    const pkLabel = makeNameLabel("Fresh-kill Pile", 1.0);
    killPile.add(pkLabel);
    killPile.position.set(2, 0, 0);
    scene.add(killPile);
  }

  /* ====================================================
     TWOLEG HOUSE (Rusty's home)
     ==================================================== */
  function createTwolegHouse () {
    const house = new THREE.Group();

    /* --- MATERIALS --- */
    const wallMat = new THREE.MeshPhongMaterial({ color: 0xe8dbc8, shininess: 2 });
    const trimMat = new THREE.MeshPhongMaterial({ color: 0xfaf5ee, shininess: 3 });
    const roofMat = new THREE.MeshPhongMaterial({ color: 0x7a3a1a, shininess: 3 });
    const doorMat = new THREE.MeshPhongMaterial({ color: 0x5a3318, shininess: 5 });
    const winGlassMat = new THREE.MeshPhongMaterial({ color: 0x99ccee, emissive: 0x223344, emissiveIntensity: 0.15, shininess: 20, transparent: true, opacity: 0.85 });
    const winFrameMat = new THREE.MeshPhongMaterial({ color: 0xf5f0e8, shininess: 3 });
    const brickMat = new THREE.MeshPhongMaterial({ color: 0xcc8866, shininess: 2 });
    const concreteMat = new THREE.MeshPhongMaterial({ color: 0xbbbbaa, shininess: 2 });

    /* --- FOUNDATION --- */
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, 7.5), concreteMat);
    foundation.position.set(0, 0.25, 0); foundation.castShadow = true;
    house.add(foundation);

    /* --- WALLS (thicker with slight texture via multiple layers) --- */
    // Front wall
    const wallFront = new THREE.Mesh(new THREE.BoxGeometry(10.5, 5.5, 0.4), wallMat);
    wallFront.position.set(0, 3.25, -3.3); wallFront.castShadow = true; house.add(wallFront);
    // Back wall
    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(10.5, 5.5, 0.4), wallMat);
    wallBack.position.set(0, 3.25, 3.3); wallBack.castShadow = true; house.add(wallBack);
    // Left wall
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.5, 6.6), wallMat);
    wallLeft.position.set(-5.25, 3.25, 0); wallLeft.castShadow = true; house.add(wallLeft);
    // Right wall
    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.5, 6.6), wallMat);
    wallRight.position.set(5.25, 3.25, 0); wallRight.castShadow = true; house.add(wallRight);

    /* --- ROOF (proper triangular prism shape) --- */
    // Roof slopes
    const roofOverhang = 0.8;
    const roofL = new THREE.Mesh(new THREE.PlaneGeometry(7, 12), roofMat);
    roofL.position.set(-2.8, 7, 0); roofL.rotation.z = 0.55; roofL.castShadow = true;
    house.add(roofL);
    const roofR = new THREE.Mesh(new THREE.PlaneGeometry(7, 12), roofMat);
    roofR.position.set(2.8, 7, 0); roofR.rotation.z = -0.55; roofR.castShadow = true;
    house.add(roofR);
    // Roof ridge (top beam)
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 12), roofMat);
    ridge.position.set(0, 8.5, 0); house.add(ridge);
    // Gable triangles (front & back)
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-5.5, 0); gableShape.lineTo(0, 3); gableShape.lineTo(5.5, 0); gableShape.lineTo(-5.5, 0);
    const gableGeo = new THREE.ShapeGeometry(gableShape);
    const gableFront = new THREE.Mesh(gableGeo, wallMat);
    gableFront.position.set(0, 6, -3.5); house.add(gableFront);
    const gableBack = new THREE.Mesh(gableGeo, wallMat);
    gableBack.position.set(0, 6, 3.5); gableBack.rotation.y = Math.PI; house.add(gableBack);

    /* --- CHIMNEY --- */
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.5, 1.0), brickMat);
    chimney.position.set(3.5, 8, 1.5); chimney.castShadow = true; house.add(chimney);
    // Chimney top rim
    const chimTop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.3), brickMat);
    chimTop.position.set(3.5, 9.8, 1.5); house.add(chimTop);
    // Chimney cap
    const chimCap = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 1.4), concreteMat);
    chimCap.position.set(3.5, 10, 1.5); house.add(chimCap);

    /* --- DOOR (detailed with frame, handle, panels) --- */
    // Door frame
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 3.5, 0.1), trimMat);
    doorFrame.position.set(0, 2.3, -3.52); house.add(doorFrame);
    // Door panel
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.2, 0.12), doorMat);
    door.position.set(0, 2.15, -3.55); house.add(door);
    // Door panels (decorative insets)
    const panelMat = new THREE.MeshPhongMaterial({ color: 0x4a2a12, shininess: 3 });
    [[-0, 3.2], [0, 1.5]].forEach(([x, y]) => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.02), panelMat);
      panel.position.set(x, y, -3.62); house.add(panel);
    });
    // Door handle (brass knob)
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshPhongMaterial({ color: 0xddaa44, shininess: 15 }));
    knob.position.set(0.55, 2.2, -3.65); house.add(knob);
    // Door step
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.15, 0.8), concreteMat);
    step.position.set(0, 0.55, -3.7); house.add(step);
    // Cat flap (bigger and more visible so player can find it)
    const flapFrame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.08), trimMat);
    flapFrame.position.set(0, 0.7, -3.63); house.add(flapFrame);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.75, 0.03),
      new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 5 }));
    flap.position.set(0, 0.65, -3.66); house.add(flap);
    // Glowing indicator around cat flap so player can see it
    const flapGlow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.02),
      new THREE.MeshPhongMaterial({ color: 0xffcc44, emissive: 0xffaa00, emissiveIntensity: 0.15, transparent: true, opacity: 0.35 }));
    flapGlow.position.set(0, 0.7, -3.68); house.add(flapGlow);
    // Label so player can see where the entrance is
    const flapLabel = makeNameLabel('Cat Flap (Enter Here)', 1.5);
    flapLabel.position.set(0, 2, -3.7);
    house.add(flapLabel);

    /* --- WINDOWS (with frames, sills, crossbars, shutters) --- */
    function makeWindow (x, y, z) {
      // Outer frame
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 0.08), winFrameMat);
      frame.position.set(x, y, z - 0.01); house.add(frame);
      // Glass
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.3), winGlassMat);
      glass.position.set(x, y, z - 0.05); house.add(glass);
      // Crossbars (window panes - 2x2 grid)
      const barMat = winFrameMat;
      const hBar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.04), barMat);
      hBar.position.set(x, y, z - 0.06); house.add(hBar);
      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.04), barMat);
      vBar.position.set(x, y, z - 0.06); house.add(vBar);
      // Window sill
      const sill = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.4), trimMat);
      sill.position.set(x, y - 0.82, z - 0.15); house.add(sill);
      // Shutters (one on each side)
      const shutterMat = new THREE.MeshPhongMaterial({ color: 0x446633, shininess: 8 });
      const shutL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.06), shutterMat);
      shutL.position.set(x - 1.15, y, z - 0.02); house.add(shutL);
      const shutR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.06), shutterMat);
      shutR.position.set(x + 1.15, y, z - 0.02); house.add(shutR);
      // Shutter slats (horizontal lines)
      for (let s = -0.5; s <= 0.5; s += 0.25) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.02),
          new THREE.MeshPhongMaterial({ color: 0x335522 }));
        slat.position.set(x - 1.15, y + s, z - 0.06); house.add(slat);
        const slat2 = slat.clone();
        slat2.position.set(x + 1.15, y + s, z - 0.06); house.add(slat2);
      }
    }
    // Front windows (two on ground floor, one on upper/gable)
    makeWindow(-3.2, 3.5, -3.5);
    makeWindow(3.2, 3.5, -3.5);
    // Upper gable window (smaller, round)
    const ovalWin = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), winGlassMat);
    ovalWin.position.set(0, 6.8, -3.52); house.add(ovalWin);
    const ovalFrame = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 8, 12), winFrameMat);
    ovalFrame.position.set(0, 6.8, -3.51); house.add(ovalFrame);
    // Side windows
    makeWindow(0, 3.5, -0.01); // left wall reuse
    // Actually place on side walls using rotated approach:
    const sideWinGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.2), winGlassMat);
    sideWinGlass.position.set(-5.47, 3.5, -1); sideWinGlass.rotation.y = Math.PI / 2; house.add(sideWinGlass);
    const sideWinFrame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 1.8), winFrameMat);
    sideWinFrame.position.set(-5.45, 3.5, -1); house.add(sideWinFrame);

    /* --- PORCH / AWNING over door --- */
    const awningMat = new THREE.MeshPhongMaterial({ color: 0x6a3015, shininess: 3 });
    const awning = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 1.5), awningMat);
    awning.position.set(0, 4.2, -4); awning.rotation.x = 0.15; house.add(awning);
    // Porch supports
    const supportMat = new THREE.MeshPhongMaterial({ color: 0xf0e8d8, shininess: 3 });
    [[-1.3, -4.4], [1.3, -4.4]].forEach(([x, z]) => {
      const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.7, 8), supportMat);
      sup.position.set(x, 2.35, z); house.add(sup);
    });
    // Porch step
    const porchStep = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 1.2), concreteMat);
    porchStep.position.set(0, 0.56, -4.2); house.add(porchStep);

    /* --- GARDEN --- */
    // Lawn
    const lawn = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 10),
      new THREE.MeshPhongMaterial({ color: 0x66cc55, shininess: 3 })
    );
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(0, 0.01, -6);
    house.add(lawn);
    // Garden path (stepping stones to door)
    const stoneMat = new THREE.MeshPhongMaterial({ color: 0xaaa899, shininess: 5 });
    for (let i = 0; i < 5; i++) {
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.06, 8), stoneMat);
      stone.position.set(Math.sin(i * 0.3) * 0.3, 0.04, -4.5 - i * 1.4);
      house.add(stone);
    }

    /* --- FLOWER BEDS along front wall --- */
    const flowerColors = [0xff4466, 0xffdd44, 0xff88cc, 0xaa44ff, 0xff6633, 0xffaacc];
    const stemMat = new THREE.MeshPhongMaterial({ color: 0x338822 });
    [[-4.5, -3.8], [-3.5, -3.8], [-2.5, -3.8], [2.5, -3.8], [3.5, -3.8], [4.5, -3.8]].forEach(([fx, fz], i) => {
      // Stem
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.6, 4), stemMat);
      stem.position.set(fx + (Math.random() - 0.5) * 0.3, 0.8, fz); house.add(stem);
      // Flower head
      const flowerMat = new THREE.MeshPhongMaterial({ color: flowerColors[i % flowerColors.length], shininess: 3 });
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), flowerMat);
      flower.position.set(fx + (Math.random() - 0.5) * 0.3, 1.15, fz); house.add(flower);
      // Leaves
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), stemMat);
      leaf.position.set(fx + 0.1, 0.75, fz); leaf.scale.set(1, 0.5, 1.5); house.add(leaf);
    });
    // Flower box under windows
    const boxMat = new THREE.MeshPhongMaterial({ color: 0x664422, shininess: 8 });
    [-3.2, 3.2].forEach(wx => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 0.4), boxMat);
      box.position.set(wx, 2.55, -3.6); house.add(box);
      // Flowers in the box
      for (let f = -0.7; f <= 0.7; f += 0.35) {
        const fc = flowerColors[Math.floor(Math.random() * flowerColors.length)];
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4),
          new THREE.MeshPhongMaterial({ color: fc }));
        fl.position.set(wx + f, 2.85, -3.65); house.add(fl);
        const lf = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 3), stemMat);
        lf.position.set(wx + f, 2.72, -3.6); lf.scale.set(1, 0.6, 1.3); house.add(lf);
      }
    });

    /* --- CAT BED (plush, detailed) --- */
    const bedRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.22, 10, 16),
      new THREE.MeshPhongMaterial({ color: 0xcc3333, shininess: 10 })
    );
    bedRim.rotation.x = -Math.PI / 2; bedRim.position.set(3, 0.2, -2);
    house.add(bedRim);
    const bedCushion = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 12),
      new THREE.MeshPhongMaterial({ color: 0xeebb88, shininess: 8 })
    );
    bedCushion.rotation.x = -Math.PI / 2; bedCushion.position.set(3, 0.22, -2);
    house.add(bedCushion);

    /* --- FOOD & WATER BOWLS --- */
    // Food bowl
    const bowlMat = new THREE.MeshPhongMaterial({ color: 0x4488cc, shininess: 8 });
    const foodBowl = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.1, 10, 14), bowlMat);
    foodBowl.rotation.x = -Math.PI / 2; foodBowl.position.set(-3, 0.1, -2);
    house.add(foodBowl);
    // Food inside
    const food = new THREE.Mesh(new THREE.CircleGeometry(0.2, 8),
      new THREE.MeshPhongMaterial({ color: 0x886644 }));
    food.rotation.x = -Math.PI / 2; food.position.set(-3, 0.13, -2);
    house.add(food);
    // Water bowl
    const waterBowl = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.08, 10, 14), bowlMat);
    waterBowl.rotation.x = -Math.PI / 2; waterBowl.position.set(-3.8, 0.08, -2);
    house.add(waterBowl);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.18, 8),
      new THREE.MeshPhongMaterial({ color: 0x77bbdd, transparent: true, opacity: 0.7 }));
    water.rotation.x = -Math.PI / 2; water.position.set(-3.8, 0.11, -2);
    house.add(water);

    /* --- MAILBOX --- */
    const mailPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6),
      new THREE.MeshPhongMaterial({ color: 0x666666 }));
    mailPost.position.set(5.5, 0.6, -8); house.add(mailPost);
    const mailBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.6),
      new THREE.MeshPhongMaterial({ color: 0xcc2222, shininess: 5 }));
    mailBox.position.set(5.5, 1.35, -8); house.add(mailBox);
    // Mail flag
    const mailFlag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.15),
      new THREE.MeshPhongMaterial({ color: 0xcc2222 }));
    mailFlag.position.set(5.72, 1.45, -7.8); house.add(mailFlag);

    /* --- OUTDOOR LIGHT by door --- */
    const lightFixture = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 0.15),
      new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 5 }));
    lightFixture.position.set(1.2, 3.8, -3.55); house.add(lightFixture);
    const lightBulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshPhongMaterial({ color: 0xffffaa, emissive: 0xffdd66, emissiveIntensity: 0.2 }));
    lightBulb.position.set(1.2, 3.6, -3.6); house.add(lightBulb);
    // Warm glow from porch light
    const porchLight = new THREE.PointLight(0xffdd88, 0.4, 8);
    porchLight.position.set(1.2, 3.5, -4); house.add(porchLight);

    /* --- GARDEN BUSH/HEDGE along sides --- */
    const bushMat = new THREE.MeshPhongMaterial({ color: 0x2d6b1e });
    [[-6, -3], [-6, 0], [-6, 2], [6, -3], [6, 0], [6, 2]].forEach(([bx, bz]) => {
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.8 + Math.random() * 0.3, 8, 6), bushMat);
      bush.position.set(bx, 0.6, bz); bush.scale.set(1, 0.7, 1);
      bush.castShadow = true; house.add(bush);
    });

    /* --- HOUSE INTERIOR (visible through the cat flap!) --- */
    const floorMat = new THREE.MeshPhongMaterial({ color: 0xc4a87a, shininess: 3 });
    const interiorWallMat = new THREE.MeshPhongMaterial({ color: 0xf5efe0, shininess: 2 });
    const carpetMat = new THREE.MeshPhongMaterial({ color: 0x884444, shininess: 1 });

    // Floor (wooden)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 6.5), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.51, 0); house.add(floor);

    // Carpet rug
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.5), carpetMat);
    carpet.rotation.x = -Math.PI / 2; carpet.position.set(1, 0.52, 0.5); house.add(carpet);

    // Interior walls (back side of exterior walls, lighter color)
    const intWallF = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), interiorWallMat);
    intWallF.position.set(0, 3, -3.1); house.add(intWallF);
    const intWallB = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), interiorWallMat);
    intWallB.position.set(0, 3, 3.1); intWallB.rotation.y = Math.PI; house.add(intWallB);
    const intWallL = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 5), interiorWallMat);
    intWallL.position.set(-5.05, 3, 0); intWallL.rotation.y = Math.PI / 2; house.add(intWallL);
    const intWallR = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 5), interiorWallMat);
    intWallR.position.set(5.05, 3, 0); intWallR.rotation.y = -Math.PI / 2; house.add(intWallR);

    // Ceiling
    const ceilingMat = new THREE.MeshPhongMaterial({ color: 0xfaf5ee, shininess: 3 });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(10, 6.5), ceilingMat);
    ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, 5.5, 0); house.add(ceiling);

    // --- KITCHEN AREA (left side) ---
    // Kitchen counter
    const counterMat = new THREE.MeshPhongMaterial({ color: 0x8B7355, shininess: 5 });
    const counterTopMat = new THREE.MeshPhongMaterial({ color: 0xd4d0c8, shininess: 8 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 0.8), counterMat);
    counter.position.set(-3.5, 1.25, 2.5); counter.castShadow = true; house.add(counter);
    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.08, 0.9), counterTopMat);
    counterTop.position.set(-3.5, 2.04, 2.5); house.add(counterTop);

    // Kitchen sink
    const sinkMat = new THREE.MeshPhongMaterial({ color: 0xcccccc, shininess: 10 });
    const sink = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.5), sinkMat);
    sink.position.set(-3.5, 2.08, 2.5); house.add(sink);
    // Faucet
    const faucetMat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, shininess: 12 });
    const faucetBase = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.4, 6), faucetMat);
    faucetBase.position.set(-3.5, 2.28, 2.2); house.add(faucetBase);
    const faucetSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 4), faucetMat);
    faucetSpout.position.set(-3.5, 2.48, 2.35); faucetSpout.rotation.z = Math.PI / 2; house.add(faucetSpout);

    // Fridge (tall white box)
    const fridgeMat = new THREE.MeshPhongMaterial({ color: 0xf0f0f0, shininess: 5 });
    const fridge = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3, 0.8), fridgeMat);
    fridge.position.set(-4.5, 2, 2.5); fridge.castShadow = true; house.add(fridge);
    const fridgeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.06), sinkMat);
    fridgeHandle.position.set(-4.1, 2.5, 2.1); house.add(fridgeHandle);

    // Kitchen cabinets on wall
    const cabinetMat = new THREE.MeshPhongMaterial({ color: 0x9B8465, shininess: 3 });
    const cabinet1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.4), cabinetMat);
    cabinet1.position.set(-3, 4, 2.9); house.add(cabinet1);
    const cabinet2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.4), cabinetMat);
    cabinet2.position.set(-4.2, 4, 2.9); house.add(cabinet2);

    // --- LIVING ROOM (right side) ---
    // Sofa / couch
    const sofaMat = new THREE.MeshPhongMaterial({ color: 0x5566aa, shininess: 8 });
    const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.6, 1.0), sofaMat);
    sofaBase.position.set(3.5, 0.8, 2); sofaBase.castShadow = true; house.add(sofaBase);
    const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.8, 0.25), sofaMat);
    sofaBack.position.set(3.5, 1.5, 2.5); house.add(sofaBack);
    // Sofa cushions
    const cushionMat = new THREE.MeshPhongMaterial({ color: 0x6677bb, shininess: 5 });
    const cushion1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.15, 0.8), cushionMat);
    cushion1.position.set(3, 1.18, 2); house.add(cushion1);
    const cushion2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.15, 0.8), cushionMat);
    cushion2.position.set(4, 1.18, 2); house.add(cushion2);
    // Sofa arm rests
    const sofaArmL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 1.0), sofaMat);
    sofaArmL.position.set(2.3, 1.05, 2); house.add(sofaArmL);
    const sofaArmR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 1.0), sofaMat);
    sofaArmR.position.set(4.7, 1.05, 2); house.add(sofaArmR);

    // Coffee table
    const tableMat = new THREE.MeshPhongMaterial({ color: 0x6b4226, shininess: 3 });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.8), tableMat);
    tableTop.position.set(3.5, 0.75, 0.8); house.add(tableTop);
    // Table legs
    for (const [tx, tz] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 4), tableMat);
      leg.position.set(3.5 + tx, 0.4, 0.8 + tz); house.add(leg);
    }

    // TV / screen on front wall
    const tvMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 8 });
    const tv = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 0.08), tvMat);
    tv.position.set(3, 3.2, -3.0); house.add(tv);
    // TV screen glow
    const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.85),
      new THREE.MeshPhongMaterial({ color: 0x223355, emissive: 0x112233, emissiveIntensity: 0.15 }));
    tvScreen.position.set(3, 3.2, -2.95); house.add(tvScreen);

    // Bookshelf on left interior wall
    const shelfMat = new THREE.MeshPhongMaterial({ color: 0x7a5a38, shininess: 3 });
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.5, 1.5), shelfMat);
    shelf.position.set(-4.8, 1.75, -1); house.add(shelf);
    // Books
    const bookColors = [0xcc3333, 0x3333cc, 0x33aa33, 0xcccc33, 0x9933cc, 0xcc6633];
    for (let b = 0; b < 6; b++) {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3 + Math.random() * 0.15, 0.2),
        new THREE.MeshPhongMaterial({ color: bookColors[b] }));
      book.position.set(-4.7, 1 + b * 0.4, -1 + (Math.random() - 0.5) * 0.8); house.add(book);
    }

    // Dining table with chairs (center-back area)
    const diningTop = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 1.2), tableMat);
    diningTop.position.set(-1.5, 1.3, -1.5); house.add(diningTop);
    for (const [tx, tz] of [[-0.8, -0.5], [0.8, -0.5], [-0.8, 0.5], [0.8, 0.5]]) {
      const dLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4), tableMat);
      dLeg.position.set(-1.5 + tx, 0.7, -1.5 + tz); house.add(dLeg);
    }
    // Chairs
    const chairMat = new THREE.MeshPhongMaterial({ color: 0x7a5a38, shininess: 8 });
    [-2.3, -0.7].forEach(cx => {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), chairMat);
      seat.position.set(cx, 0.85, -1.5); house.add(seat);
      const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.06), chairMat);
      chairBack.position.set(cx, 1.2, -1.75); house.add(chairBack);
      for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
        const cLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 4), chairMat);
        cLeg.position.set(cx + lx, 0.45, -1.5 + lz); house.add(cLeg);
      }
    });

    // Interior warm light
    const interiorLight = new THREE.PointLight(0xffeecc, 0.6, 12);
    interiorLight.position.set(0, 4.5, 0); house.add(interiorLight);

    // Cat food bowl area inside (near front wall, by cat flap)
    const indoorFoodBowl = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.08, 8, 12),
      new THREE.MeshPhongMaterial({ color: 0xee5533, shininess: 5 }));
    indoorFoodBowl.rotation.x = -Math.PI / 2; indoorFoodBowl.position.set(-1, 0.58, -2.5); house.add(indoorFoodBowl);
    const indoorFood = new THREE.Mesh(new THREE.CircleGeometry(0.18, 8),
      new THREE.MeshPhongMaterial({ color: 0x886644 }));
    indoorFood.rotation.x = -Math.PI / 2; indoorFood.position.set(-1, 0.6, -2.5); house.add(indoorFood);

    // Label
    const hLabel = makeNameLabel('Twoleg House', 6.5);
    house.add(hLabel);

    house.position.set(0, 0, 85);
    scene.add(house);

    /* --- TWOLEGS (humans that walk around inside the house) --- */
    createTwolegs();
  }

  /* ====================================================
     THUNDERPATH MONSTERS (cars on the road)
     ==================================================== */
  let monsters = []; // active cars on the Thunderpath
  let monsterSpawnTimer = 0;
  let monsterHitCooldown = 0; // prevent rapid re-hits
  const ROAD_X = -58.5;    // road center x
  const ROAD_HALF_W = 3.5; // half road width

  function createMonsterModel (color, dir) {
    // Simple boxy car / "monster" shape
    const g = new THREE.Group();

    // Body
    const bodyMat = new THREE.MeshPhongMaterial({ color: color, shininess: 8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 4.0), bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    g.add(body);

    // Cabin / roof
    const cabinMat = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 10, opacity: 0.7, transparent: true });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 2.0), cabinMat);
    cabin.position.y = 1.45;
    cabin.position.z = -0.3 * dir;
    g.add(cabin);

    // Wheels (4)
    const wheelMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 10 });
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12);
    const offsets = [
      { x: -1.05, z: -1.2 }, { x: 1.05, z: -1.2 },
      { x: -1.05, z: 1.2 }, { x: 1.05, z: 1.2 }
    ];
    offsets.forEach(o => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(o.x, 0.35, o.z);
      g.add(w);
    });

    // Headlights (front)
    const lightMat = new THREE.MeshPhongMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.2 });
    const hlGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const hl1 = new THREE.Mesh(hlGeo, lightMat);
    hl1.position.set(-0.7, 0.7, 2.0 * dir);
    g.add(hl1);
    const hl2 = new THREE.Mesh(hlGeo, lightMat);
    hl2.position.set(0.7, 0.7, 2.0 * dir);
    g.add(hl2);

    // Taillights
    const tailMat = new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.1 });
    const tl1 = new THREE.Mesh(hlGeo, tailMat);
    tl1.position.set(-0.7, 0.7, -2.0 * dir);
    g.add(tl1);
    const tl2 = new THREE.Mesh(hlGeo, tailMat);
    tl2.position.set(0.7, 0.7, -2.0 * dir);
    g.add(tl2);

    return g;
  }

  function spawnMonster () {
    // Pick direction: +z or -z
    const dir = Math.random() < 0.5 ? 1 : -1;  // 1 = north-to-south, -1 = south-to-north
    const lane = dir === 1 ? ROAD_X - 1.5 : ROAD_X + 1.5; // different lanes
    const startZ = dir === 1 ? -120 : 120;

    // Pick a random color for the car
    const colors = [0xcc2222, 0x2255cc, 0x22aa22, 0xdddd22, 0xffffff, 0x666666, 0xff6600, 0x8833aa];
    const color = colors[Math.floor(Math.random() * colors.length)];

    // Pick a speed — some fast, some VERY fast
    const speed = 18 + Math.random() * 25; // 18 to 43 units/sec — these are FAST

    const model = createMonsterModel(color, dir);
    model.position.set(lane, 0, startZ);
    model.rotation.y = dir === 1 ? 0 : Math.PI; // face the direction of travel
    scene.add(model);

    monsters.push({
      model: model,
      dir: dir,
      speed: speed,
      lane: lane,
      z: startZ
    });
  }

  function updateMonsters (dt) {
    if (monsterHitCooldown > 0) monsterHitCooldown -= dt;

    // Only spawn monsters when player is within 60 units of the road (performance)
    const distToRoad = Math.abs(player.position.x - ROAD_X);

    // Spawn new monsters periodically
    monsterSpawnTimer -= dt;
    if (monsterSpawnTimer <= 0 && distToRoad < 60) {
      spawnMonster();
      // Randomize next spawn time: 1.5 to 5 seconds
      monsterSpawnTimer = 1.5 + Math.random() * 3.5;
      // Sometimes spawn two at once (from opposite directions)
      if (Math.random() < 0.3) {
        setTimeout(() => spawnMonster(), 200 + Math.random() * 500);
      }
    }

    // Update each monster position and check collision
    const px = player.position.x;
    const pz = player.position.z;
    const hitDist = 1.8; // how close to get hit

    for (let i = monsters.length - 1; i >= 0; i--) {
      const m = monsters[i];
      m.z += m.dir * m.speed * dt;
      m.model.position.z = m.z;

      // Remove if off screen
      if ((m.dir === 1 && m.z > 130) || (m.dir === -1 && m.z < -130)) {
        scene.remove(m.model);
        monsters.splice(i, 1);
        continue;
      }

      // Check player collision
      if (monsterHitCooldown <= 0 && gameState === 'playing') {
        const dx = px - m.lane;
        const dz = pz - m.z;
        if (Math.abs(dx) < hitDist && Math.abs(dz) < 2.5) {
          // Player got hit by a monster!
          monsterHitCooldown = 3; // 3 second cooldown before can be hit again
          playerHitByMonster(m);
        }
      }
    }

    // Play a whoosh sound when a monster is close
    for (let i = 0; i < monsters.length; i++) {
      const m = monsters[i];
      const dist = Math.sqrt((px - m.lane) ** 2 + (pz - m.z) ** 2);
      if (dist < 12 && !m.whooshed) {
        m.whooshed = true;
        playMonsterSound(dist);
      }
    }
  }

  function playMonsterSound (dist) {
    if (!audioCtx) initAudio();
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const dest = _out();
      const vol = Math.max(0.03, 0.14 - dist * 0.01);
      // Engine rumble — low sawtooth with filter
      const osc = audioCtx.createOscillator();
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 200;
      const gain = audioCtx.createGain();
      osc.connect(lp); lp.connect(gain); gain.connect(dest);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(75, t);
      osc.frequency.linearRampToValueAtTime(130, t + 0.25);
      osc.frequency.linearRampToValueAtTime(55, t + 0.9);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.05);
      gain.gain.linearRampToValueAtTime(vol * 1.5, t + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      osc.start(t); osc.stop(t + 1.15);
      // Tire/road noise
      const n = _noise(true);
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.3;
      const ng = audioCtx.createGain();
      n.connect(bp); bp.connect(ng); ng.connect(dest);
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(vol * 0.4, t + 0.1);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      n.start(t); n.stop(t + 0.85);
      // Doppler whoosh — high noise
      const n2 = _noise(false);
      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 1500;
      const ng2 = audioCtx.createGain();
      n2.connect(hp); hp.connect(ng2); ng2.connect(dest);
      ng2.gain.setValueAtTime(0, t + 0.1);
      ng2.gain.linearRampToValueAtTime(vol * 0.3, t + 0.2);
      ng2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      n2.start(t + 0.1); n2.stop(t + 0.55);
    } catch (e) {}
  }

  function playerHitByMonster (m) {
    // Take heavy damage
    player.health = Math.max(0, player.health - 40);
    playSound('hurt');
    playSound('danger');

    // Knock player off the road (push them sideways)
    const knockDir = player.position.x > ROAD_X ? 1 : -1;
    player.position.x += knockDir * 5; // push 5 units off the road
    catGroup.position.x = player.position.x;

    // Flash screen red
    const flash = document.createElement('div');
    flash.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(255,0,0,0.6);z-index:9999;pointer-events:none;';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 400);

    if (player.health <= 0) {
      // Player killed by a monster! Respawn at medicine cat den
      queueMessage('Narrator', 'A monster hit you on the Thunderpath! Everything goes dark...', () => {
        queueMessage('Narrator', 'You feel yourself being dragged off the road by strong jaws... friendly ThunderClan paws carry you back to camp...', () => {
          respawnAtMedicineDen();
        });
      });
    } else {
      queueMessage('Narrator', 'A MONSTER nearly crushed you! You scramble off the Thunderpath, battered and bruised. (-40 HP) Stay off the road!');
    }
  }

  /* ====================================================
     TWOLEGS (humans in the house)
     ==================================================== */
  let twolegs = [];

  function createTwolegModel (color, height) {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshPhongMaterial({ color: 0xffcc99, shininess: 3 });
    const clothMat = new THREE.MeshPhongMaterial({ color: color, shininess: 8 });
    const hairMat = new THREE.MeshPhongMaterial({ color: 0x553322, shininess: 5 });

    // Body (torso)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), clothMat);
    torso.position.set(0, height * 0.55, 0); torso.castShadow = true; group.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), skinMat);
    head.position.set(0, height * 0.78, 0); head.castShadow = true; group.add(head);

    // Hair
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), hairMat);
    hair.position.set(0, height * 0.82, -0.02); hair.scale.set(1, 0.7, 1); group.add(hair);

    // Eyes
    const eyeMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), eyeMat);
    eyeL.position.set(-0.08, height * 0.79, 0.18); group.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), eyeMat);
    eyeR.position.set(0.08, height * 0.79, 0.18); group.add(eyeR);

    // Smile
    const smile = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.01),
      new THREE.MeshPhongMaterial({ color: 0xcc6666 }));
    smile.position.set(0, height * 0.73, 0.2); group.add(smile);

    // Arms
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 0.15), clothMat);
    armL.position.set(-0.38, height * 0.45, 0); group.add(armL);
    group.armL = armL;
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 0.15), clothMat);
    armR.position.set(0.38, height * 0.45, 0); group.add(armR);
    group.armR = armR;

    // Legs
    const legMat = new THREE.MeshPhongMaterial({ color: 0x334466, shininess: 8 });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), legMat);
    legL.position.set(-0.15, height * 0.17, 0); group.add(legL);
    group.legL = legL;
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), legMat);
    legR.position.set(0.15, height * 0.17, 0); group.add(legR);
    group.legR = legR;

    // Shoes
    const shoeMat = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 3 });
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.28), shoeMat);
    shoeL.position.set(-0.15, 0.05, 0.04); group.add(shoeL);
    const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.28), shoeMat);
    shoeR.position.set(0.15, 0.05, 0.04); group.add(shoeR);

    return group;
  }

  function createTwolegs () {
    // Two Twolegs that live in the house — they walk around inside
    const twoleg1 = createTwolegModel(0x5577aa, 2.8); // blue shirt
    twoleg1.position.set(-2, 0, 85.5); // inside house (world coords)
    scene.add(twoleg1);

    const twoleg2 = createTwolegModel(0xcc6688, 2.5); // pink shirt (slightly shorter)
    twoleg2.position.set(2, 0, 86.5);
    scene.add(twoleg2);

    twolegs = [
      {
        group: twoleg1, name: 'Twoleg',
        ai: { state: 'idle', timer: 0, target: { x: -2, z: 85.5 }, walkSpeed: 0.8 },
        _walkCycle: 0
      },
      {
        group: twoleg2, name: 'Twoleg',
        ai: { state: 'idle', timer: 0, target: { x: 2, z: 86.5 }, walkSpeed: 0.7 },
        _walkCycle: 0
      }
    ];

    // Add name labels
    twolegs.forEach(tl => {
      const label = makeNameLabel('Twoleg', 3.2);
      tl.group.add(label);
    });
  }

  function updateTwolegs (dt) {
    if (!twolegs.length) return;
    const houseCenter = { x: 0, z: 85 };
    // House interior bounds (world coords): x ∈ [-4.5, 4.5], z ∈ [82, 88]
    const hBounds = { minX: -4, maxX: 4, minZ: 82.5, maxZ: 87.5 };

    twolegs.forEach(tl => {
      const ai = tl.ai;
      ai.timer -= dt;

      if (ai.state === 'idle') {
        if (ai.timer <= 0) {
          // Pick a random spot inside the house to walk to
          ai.target = {
            x: hBounds.minX + Math.random() * (hBounds.maxX - hBounds.minX),
            z: hBounds.minZ + Math.random() * (hBounds.maxZ - hBounds.minZ)
          };
          ai.state = 'walking';
          ai.timer = 3 + Math.random() * 5;
        }
      }

      if (ai.state === 'walking') {
        const pos = tl.group.position;
        const dx = ai.target.x - pos.x;
        const dz = ai.target.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 0.3) {
          ai.state = 'idle';
          ai.timer = 2 + Math.random() * 4;
          // Stop leg/arm animation
          return;
        }

        const speed = ai.walkSpeed * dt;
        pos.x += (dx / dist) * speed;
        pos.z += (dz / dist) * speed;

        // Face walking direction
        tl.group.rotation.y = Math.atan2(dx, dz);

        // Animate legs and arms
        tl._walkCycle += dt * ai.walkSpeed * 3;
        const swing = Math.sin(tl._walkCycle * 3) * 0.3;
        if (tl.group.legL) tl.group.legL.rotation.x = swing;
        if (tl.group.legR) tl.group.legR.rotation.x = -swing;
        if (tl.group.armL) tl.group.armL.rotation.x = -swing * 0.5;
        if (tl.group.armR) tl.group.armR.rotation.x = swing * 0.5;
      }
    });
  }

  /** Check if a Twoleg is near the player and let them interact */
  function talkToNearestTwoleg () {
    if (!player || !twolegs.length) return false;
    const px = player.position.x, pz = player.position.z;
    let nearest = null, nearDist = 3;

    twolegs.forEach(tl => {
      const dx = tl.group.position.x - px, dz = tl.group.position.z - pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < nearDist) { nearest = tl; nearDist = d; }
    });

    if (nearest) {
      // Feed the cat!
      if (player.health < player.maxHealth) {
        player.health = Math.min(player.maxHealth, player.health + 15);
        queueMessage('Narrator', 'The Twoleg gives you some food! You eat happily and feel better. (+15 health)');
        playSound('eat');
      } else {
        const lines = [
          'The Twoleg reaches down and scratches behind your ears. You purr.',
          'The Twoleg smiles at you and says something in Twoleg language.',
          'The Twoleg gives you a gentle pat on the head.',
          'The Twoleg picks up a toy and dangles it. You bat at it playfully.',
          'The Twoleg opens a can of food and puts it in your bowl.'
        ];
        queueMessage('Narrator', lines[Math.floor(Math.random() * lines.length)]);
      }
      return true;
    }
    return false;
  }

  /* ====================================================
     GARDEN FENCE (between Twoleg house and forest)
     ==================================================== */
  function createGardenFence () {
    const fenceMat = new THREE.MeshPhongMaterial({ color: 0x997755 });
    const fenceGroup = new THREE.Group();

    // Helper: add a fence post + pointed top at (x, z)
    function addPost (x, z) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.15), fenceMat);
      post.position.set(x, 0.6, z);
      post.castShadow = true;
      fenceGroup.add(post);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 4), fenceMat);
      top.position.set(x, 1.3, z);
      fenceGroup.add(top);
    }

    // Helper: add a horizontal rail between two points
    function addRail (x1, z1, x2, z2, y) {
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.sqrt(dx * dx + dz * dz);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), fenceMat);
      rail.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
      rail.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
      fenceGroup.add(rail);
    }

    // === FRONT FENCE (z = 70, gap in center for the opening) ===
    for (let x = -20; x <= 20; x += 1.5) {
      if (Math.abs(x) < 2) continue; // Gap in the middle to walk through
      addPost(x, 70);
    }
    // Front horizontal rails (left and right of gap)
    [0.3, 1.0].forEach(y => {
      addRail(-20, 70, -2, 70, y);  // Left section
      addRail(2, 70, 20, 70, y);    // Right section
    });

    // === LEFT SIDE FENCE (x = -20, from z=70 back to z=95) ===
    for (let z = 70; z <= 95; z += 1.5) {
      addPost(-20, z);
    }
    [0.3, 1.0].forEach(y => {
      addRail(-20, 70, -20, 95, y);
    });

    // === RIGHT SIDE FENCE (x = 20, from z=70 back to z=95) ===
    for (let z = 70; z <= 95; z += 1.5) {
      addPost(20, z);
    }
    [0.3, 1.0].forEach(y => {
      addRail(20, 70, 20, 95, y);
    });

    // === BACK FENCE (z = 95, fully closed behind the house) ===
    for (let x = -20; x <= 20; x += 1.5) {
      addPost(x, 95);
    }
    [0.3, 1.0].forEach(y => {
      addRail(-20, 95, 20, 95, y);
    });

    const fLabel = makeNameLabel('Garden Fence', 2.0);
    fLabel.position.set(0, 0, 70);
    scene.add(fLabel);

    scene.add(fenceGroup);

    // === COLLISION WALLS (invisible) to block player from going through/around fence ===
    const wallMat = new THREE.MeshBasicMaterial({ visible: false });
    // Front fence left wall
    const wFL = new THREE.Mesh(new THREE.BoxGeometry(18, 2, 0.5), wallMat);
    wFL.position.set(-11, 1, 70); scene.add(wFL);
    // Front fence right wall
    const wFR = new THREE.Mesh(new THREE.BoxGeometry(18, 2, 0.5), wallMat);
    wFR.position.set(11, 1, 70); scene.add(wFR);
    // Left side wall
    const wL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, 26), wallMat);
    wL.position.set(-20, 1, 82.5); scene.add(wL);
    // Right side wall
    const wR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, 26), wallMat);
    wR.position.set(20, 1, 82.5); scene.add(wR);
    // Back wall
    const wB = new THREE.Mesh(new THREE.BoxGeometry(41, 2, 0.5), wallMat);
    wB.position.set(0, 1, 95); scene.add(wB);

    // House walls — with a wider gap for the cat flap (centered at x=0)
    // Gap = 2.0 units wide (x = -1.0 to 1.0) so player (radius 0.4) can pass through
    // Left of cat flap
    const wHouseL = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2, 0.5), wallMat);
    wHouseL.position.set(-3.25, 1, 81.7); scene.add(wHouseL);
    // Right of cat flap
    const wHouseR = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2, 0.5), wallMat);
    wHouseR.position.set(3.25, 1, 81.7); scene.add(wHouseR);
    // Left side of house
    const wHouseSL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, 7), wallMat);
    wHouseSL.position.set(-5.25, 1, 85); scene.add(wHouseSL);
    // Right side of house
    const wHouseSR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, 7), wallMat);
    wHouseSR.position.set(5.25, 1, 85); scene.add(wHouseSR);
    // Back of house
    const wHouseBack = new THREE.Mesh(new THREE.BoxGeometry(11, 2, 0.5), wallMat);
    wHouseBack.position.set(0, 1, 88.3); scene.add(wHouseBack);

    // Store garden fence walls (these stop blocking after leaving home)
    gardenWalls = [wFL, wFR, wL, wR, wB];
    // Store house walls (these ALWAYS block — only the cat flap gap lets you through)
    houseWalls = [wHouseL, wHouseR, wHouseSL, wHouseSR, wHouseBack];
  }

  /* ====================================================
     TERRITORY LANDMARKS (book-accurate borders & landmarks)
     ==================================================== */
  function createTerritoryLandmarks () {
    /* --- THUNDERPATH (road between ThunderClan & ShadowClan) --- */
    // Road base — dark asphalt with slight variation
    const roadMat = new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 4 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(7, 200), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(-58.5, 0.06, 0);
    scene.add(road);
    // Road edges — rougher shoulders
    const shoulderMat = new THREE.MeshPhongMaterial({ color: 0x5a5a50, shininess: 1 });
    [-1, 1].forEach(side => {
      const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 200), shoulderMat);
      shoulder.rotation.x = -Math.PI / 2;
      shoulder.position.set(-58.5 + side * 4.2, 0.055, 0);
      scene.add(shoulder);
    });
    // Yellow center line
    const lineMat = new THREE.MeshPhongMaterial({ color: 0xddcc00, shininess: 3 });
    const centerLine = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 200), lineMat);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(-58.5, 0.07, 0);
    scene.add(centerLine);
    // Dashed white edge lines
    const dashMat = new THREE.MeshPhongMaterial({ color: 0xeeeeee, shininess: 2 });
    for (let z = -95; z < 95; z += 6) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 3), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(-55.2, 0.07, z);
      scene.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 3), dashMat);
      dash2.rotation.x = -Math.PI / 2;
      dash2.position.set(-61.8, 0.07, z);
      scene.add(dash2);
    }
    const tpLabel = makeNameLabel('Thunderpath', 3.0);
    tpLabel.position.set(-58.5, 0, -10);
    scene.add(tpLabel);

    /* --- SUNNINGROCKS (large flat rocks near river) --- */
    // Sandy ground underneath
    const srGroundMat = new THREE.MeshPhongMaterial({ color: 0xc4b088, shininess: 1 });
    const srGround = new THREE.Mesh(new THREE.CircleGeometry(12, 16), srGroundMat);
    srGround.rotation.x = -Math.PI / 2; srGround.position.set(63, 0.01, 0);
    scene.add(srGround);
    // Large, warm-colored sunning rocks
    const srColors = [0xbbaa88, 0xccbb99, 0xaa9977, 0xddccaa];
    for (let i = 0; i < 12; i++) {
      const rx = 56 + Math.random() * 14;
      const rz = -12 + Math.random() * 24;
      const rs = 1.2 + Math.random() * 2.2;
      const srCol = srColors[Math.floor(Math.random()*srColors.length)];
      const srMat = new THREE.MeshPhongMaterial({ color: srCol, shininess: 4 });
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rs, 1), srMat);
      rock.position.set(rx, rs * 0.25, rz);
      rock.scale.set(1, 0.3, 1 + Math.random()*0.3);
      rock.rotation.y = Math.random() * Math.PI;
      rock.castShadow = true;
      scene.add(rock);
    }
    const srLabel = makeNameLabel('Sunningrocks', 3.0);
    srLabel.position.set(63, 0, 0);
    scene.add(srLabel);

    /* --- FOURTREES (sacred meeting place of all clans) --- */
    // Four massive ancient oaks in a hollow
    const ftBark = new THREE.MeshPhongMaterial({ color: 0x3a2510, shininess: 2 });
    const ftLeafColors = [0x1a4a0e, 0x1d5511, 0x154008, 0x1e4d0f];
    const ftPositions = [[-42, -42], [-42, -48], [-48, -42], [-48, -48]];
    ftPositions.forEach(([fx, fz], idx) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 9, 10), ftBark);
      trunk.position.set(fx, 4.5, fz); trunk.castShadow = true; scene.add(trunk);
      // Exposed roots
      for (let r = 0; r < 4; r++) {
        const rootAngle = (r / 4) * Math.PI * 2 + idx * 0.3;
        const root = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.18, 1.5, 5), ftBark);
        root.position.set(fx + Math.cos(rootAngle)*0.8, 0.2, fz + Math.sin(rootAngle)*0.8);
        root.rotation.z = Math.cos(rootAngle) * 0.6;
        root.rotation.x = Math.sin(rootAngle) * 0.6;
        scene.add(root);
      }
      // Multi-layer canopy
      const leafMat = new THREE.MeshPhongMaterial({ color: ftLeafColors[idx], shininess: 2 });
      const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(4.5, 1), leafMat);
      canopy.position.set(fx, 10, fz); canopy.castShadow = true; scene.add(canopy);
      const canopy2 = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 1),
        new THREE.MeshPhongMaterial({ color: ftLeafColors[(idx+1)%4], shininess: 2 }));
      canopy2.position.set(fx + 1, 11, fz - 0.5); scene.add(canopy2);
      // Ground shadow
      const fShadow = new THREE.Mesh(new THREE.CircleGeometry(4, 10),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 }));
      fShadow.rotation.x = -Math.PI / 2; fShadow.position.set(fx, 0.015, fz);
      scene.add(fShadow);
    });
    // Hollow ground (slightly sunken) with leaf litter
    const hollowGeo = new THREE.CircleGeometry(10, 20);
    const hollowMat = new THREE.MeshPhongMaterial({ color: 0x3a2a18, shininess: 1 });
    const hollow = new THREE.Mesh(hollowGeo, hollowMat);
    hollow.rotation.x = -Math.PI / 2; hollow.position.set(-45, 0.02, -45);
    scene.add(hollow);
    // Leaf litter in the hollow
    const leafLitterColors = [0x8a6a30, 0x7a5a28, 0x6a4a20, 0x9a7a40];
    for (let i = 0; i < 30; i++) {
      const lCol = leafLitterColors[Math.floor(Math.random()*leafLitterColors.length)];
      const leaf = new THREE.Mesh(
        new THREE.CircleGeometry(0.12 + Math.random()*0.1, 5),
        new THREE.MeshPhongMaterial({ color: lCol, side: THREE.DoubleSide })
      );
      leaf.rotation.x = -Math.PI / 2 + (Math.random()-0.5)*0.3;
      leaf.rotation.z = Math.random() * Math.PI;
      leaf.position.set(-45 + (Math.random()-0.5)*14, 0.025, -45 + (Math.random()-0.5)*14);
      scene.add(leaf);
    }
    // Great Rock in the center — imposing, detailed
    const greatRock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 1),
      new THREE.MeshPhongMaterial({ color: 0x777777, shininess: 4 }));
    greatRock.position.set(-45, 1.2, -45); greatRock.scale.set(1, 0.7, 1);
    greatRock.castShadow = true; scene.add(greatRock);
    // Moss on Great Rock
    const grMoss = new THREE.Mesh(new THREE.CircleGeometry(1, 8),
      new THREE.MeshPhongMaterial({ color: 0x4a7a3a, shininess: 1 }));
    grMoss.rotation.x = -Math.PI / 2; grMoss.position.set(-45, 2.1, -45);
    scene.add(grMoss);
    const ftLabel = makeNameLabel('Fourtrees', 3.0);
    ftLabel.position.set(-45, 0, -45);
    scene.add(ftLabel);

    /* --- SHADOWCLAN TERRITORY (dark pine forest, past Thunderpath) --- */
    const scGroundMat = new THREE.MeshPhongMaterial({ color: 0x3a5530, shininess: 2 });
    scGroundMat.polygonOffset = true; scGroundMat.polygonOffsetFactor = -1; scGroundMat.polygonOffsetUnits = -1;
    const scGround = new THREE.Mesh(new THREE.PlaneGeometry(33, 200), scGroundMat);
    scGround.rotation.x = -Math.PI / 2; scGround.position.set(-78.5, 0.08, 0);
    scene.add(scGround);
    const scLabel = makeNameLabel('ShadowClan Territory', 3.5);
    scLabel.position.set(-78, 0, 0);
    scene.add(scLabel);

    /* --- RIVERCLAN TERRITORY (past the river, marshy) --- */
    const rcGroundMat = new THREE.MeshPhongMaterial({ color: 0x4a8a55, shininess: 3 });
    rcGroundMat.polygonOffset = true; rcGroundMat.polygonOffsetFactor = -1; rcGroundMat.polygonOffsetUnits = -1;
    const rcGround = new THREE.Mesh(new THREE.PlaneGeometry(16, 200), rcGroundMat);
    rcGround.rotation.x = -Math.PI / 2; rcGround.position.set(87, 0.10, 0);
    scene.add(rcGround);
    // Reeds near water
    const reedMat = new THREE.MeshPhongMaterial({ color: 0x5a7a3a });
    for (let i = 0; i < 40; i++) {
      const rz = -80 + Math.random() * 160;
      const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.5 + Math.random(), 4), reedMat);
      reed.position.set(78 + Math.random() * 3, 0.75, rz);
      scene.add(reed);
    }
    const rcLabel = makeNameLabel('RiverClan Territory', 3.5);
    rcLabel.position.set(87, 0, 0);
    scene.add(rcLabel);

    /* --- WINDCLAN TERRITORY (open moorland, few trees) --- */
    const wcGroundMat = new THREE.MeshPhongMaterial({ color: 0x99aa66, shininess: 3 });
    wcGroundMat.polygonOffset = true; wcGroundMat.polygonOffsetFactor = -2; wcGroundMat.polygonOffsetUnits = -2;
    const wcGround = new THREE.Mesh(new THREE.PlaneGeometry(200, 35), wcGroundMat);
    wcGround.rotation.x = -Math.PI / 2; wcGround.position.set(0, 0.12, -77.5);
    scene.add(wcGround);
    // Rolling hills
    for (let i = 0; i < 12; i++) {
      const hx = -60 + Math.random() * 120;
      const hz = -65 - Math.random() * 25;
      const hs = 3 + Math.random() * 5;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(hs, 8, 6),
        new THREE.MeshPhongMaterial({ color: 0x8a9a55, shininess: 3 }));
      hill.position.set(hx, 0, hz); hill.scale.set(1, 0.3, 1);
      scene.add(hill);
    }
    const wcLabel = makeNameLabel('WindClan Territory', 3.5);
    wcLabel.position.set(0, 0, -75);
    scene.add(wcLabel);

    /* --- SCENT MARKERS (bright yellow strips at borders — step on them and patrols spot you!) --- */
    const scentMat = new THREE.MeshBasicMaterial({ color: 0xddcc00, transparent: true, opacity: 0.75 });
    const scentGlowMat = new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true, opacity: 0.35 });
    scentMarkerZones = []; // track zones for detection

    // ShadowClan scent line (along x = -50, continuous yellow strip)
    for (let z = -80; z <= 80; z += 5) {
      // Bright yellow pad on the ground
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 4.5), scentMat);
      pad.rotation.x = -Math.PI / 2; pad.position.set(-50, 0.18, z);
      scene.add(pad);
      // Faint glow halo
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), scentGlowMat);
      glow.rotation.x = -Math.PI / 2; glow.position.set(-50, 0.17, z);
      scene.add(glow);
      // Small upright marker stone
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.5, 5),
        new THREE.MeshPhongMaterial({ color: 0xaaaa44 }));
      stone.position.set(-50, 0.25, z); scene.add(stone);
      scentMarkerZones.push({ x: -50, z: z, radius: 2.5, clan: 'ShadowClan' });
    }

    // RiverClan scent line (along x = 70)
    for (let z = -80; z <= 80; z += 5) {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 4.5), scentMat);
      pad.rotation.x = -Math.PI / 2; pad.position.set(70, 0.18, z);
      scene.add(pad);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), scentGlowMat);
      glow.rotation.x = -Math.PI / 2; glow.position.set(70, 0.17, z);
      scene.add(glow);
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.5, 5),
        new THREE.MeshPhongMaterial({ color: 0x44aaaa }));
      stone.position.set(70, 0.25, z); scene.add(stone);
      scentMarkerZones.push({ x: 70, z: z, radius: 2.5, clan: 'RiverClan' });
    }

    // WindClan scent line (along z = -55)
    for (let x = -50; x <= 70; x += 5) {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.5), scentMat);
      pad.rotation.x = -Math.PI / 2; pad.position.set(x, 0.18, -55);
      scene.add(pad);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), scentGlowMat);
      glow.rotation.x = -Math.PI / 2; glow.position.set(x, 0.17, -55);
      scene.add(glow);
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.5, 5),
        new THREE.MeshPhongMaterial({ color: 0xaa8844 }));
      stone.position.set(x, 0.25, -55); scene.add(stone);
      scentMarkerZones.push({ x: x, z: -55, radius: 2.5, clan: 'WindClan' });
    }

    // Border labels
    const sbLabel = makeNameLabel('ShadowClan Border', 2.5);
    sbLabel.position.set(-50, 0, 20); scene.add(sbLabel);
    const rbLabel = makeNameLabel('RiverClan Border', 2.5);
    rbLabel.position.set(70, 0, 20); scene.add(rbLabel);
    const wbLabel = makeNameLabel('WindClan Border', 2.5);
    wbLabel.position.set(20, 0, -55); scene.add(wbLabel);

    /* --- HIGHSTONES & MOTHERMOUTH (far northwest, beyond WindClan) --- */
    // Rocky barren ground around Highstones
    const hsGroundMat = new THREE.MeshPhongMaterial({ color: 0x9a9a88, shininess: 3 });
    hsGroundMat.polygonOffset = true; hsGroundMat.polygonOffsetFactor = -3; hsGroundMat.polygonOffsetUnits = -3;
    const hsGround = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), hsGroundMat);
    hsGround.rotation.x = -Math.PI / 2; hsGround.position.set(-80, 0.15, -95);
    scene.add(hsGround);

    // Highstones — jagged rocky hills
    const hsRockMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
    const hsDarkMat = new THREE.MeshPhongMaterial({ color: 0x666666 });
    // Main peak
    const peak1 = new THREE.Mesh(new THREE.ConeGeometry(6, 14, 6), hsRockMat);
    peak1.position.set(-80, 7, -97); peak1.castShadow = true; scene.add(peak1);
    // Secondary peaks
    const peak2 = new THREE.Mesh(new THREE.ConeGeometry(4, 10, 5), hsDarkMat);
    peak2.position.set(-73, 5, -93); peak2.castShadow = true; scene.add(peak2);
    const peak3 = new THREE.Mesh(new THREE.ConeGeometry(5, 12, 5), hsRockMat);
    peak3.position.set(-87, 6, -95); peak3.castShadow = true; scene.add(peak3);
    const peak4 = new THREE.Mesh(new THREE.ConeGeometry(3.5, 8, 5), hsDarkMat);
    peak4.position.set(-76, 4, -100); peak4.castShadow = true; scene.add(peak4);
    const peak5 = new THREE.Mesh(new THREE.ConeGeometry(4, 9, 6), hsRockMat);
    peak5.position.set(-84, 4.5, -90); peak5.castShadow = true; scene.add(peak5);

    // Scattered boulders around the base
    for (let i = 0; i < 20; i++) {
      const bx = -80 + (Math.random() - 0.5) * 30;
      const bz = -95 + (Math.random() - 0.5) * 20;
      const bs = 0.5 + Math.random() * 1.5;
      const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(bs, 0), hsRockMat);
      boulder.position.set(bx, bs * 0.3, bz);
      boulder.rotation.set(Math.random(), Math.random(), Math.random());
      boulder.scale.set(1, 0.5 + Math.random() * 0.5, 1);
      boulder.castShadow = true;
      scene.add(boulder);
    }

    // Mothermouth cave entrance — dark opening in the main peak
    const caveMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    // Entrance arch
    const caveArch = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.6, 6, 8, Math.PI), hsRockMat);
    caveArch.position.set(-80, 2.5, -93); caveArch.rotation.x = Math.PI / 2;
    scene.add(caveArch);
    // Dark opening
    const caveHole = new THREE.Mesh(new THREE.CircleGeometry(2.2, 8), caveMat);
    caveHole.position.set(-80, 2.2, -93.4);
    scene.add(caveHole);
    // Cave floor (leading in)
    const caveFloor = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), hsDarkMat);
    caveFloor.rotation.x = -Math.PI / 2; caveFloor.position.set(-80, 0.16, -95);
    scene.add(caveFloor);

    // The Moonstone — a shimmering crystal inside the cave
    const moonstoneMat = new THREE.MeshPhongMaterial({
      color: 0xbbccff, emissive: 0x334488, emissiveIntensity: 0.3, specular: 0x888888, shininess: 20,
      transparent: true, opacity: 0.85
    });
    const moonstone = new THREE.Mesh(new THREE.OctahedronGeometry(1.2, 0), moonstoneMat);
    moonstone.position.set(-80, 1.5, -97); moonstone.rotation.y = Math.PI / 4;
    moonstone.castShadow = true; scene.add(moonstone);
    // Glow around the Moonstone
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x6688ff, transparent: true, opacity: 0.15
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(2.5, 12, 8), glowMat);
    glow.position.set(-80, 1.5, -97); scene.add(glow);

    // Labels
    const hsLabel = makeNameLabel('Highstones', 3.0);
    hsLabel.position.set(-80, 0, -88); scene.add(hsLabel);
    const mmLabel = makeNameLabel('Mothermouth', 2.5);
    mmLabel.position.set(-80, 0, -93); scene.add(mmLabel);
  }

  function makeOak (d) {
    const g = new THREE.Group(); const s = d.scale;
    g._branches = []; // store branch data for collision
    // Detailed trunk with bark texture feel
    const barkColor = new THREE.Color(0.35 + Math.random()*0.08, 0.25 + Math.random()*0.06, 0.15);
    const trunkMat = new THREE.MeshPhongMaterial({ color: barkColor, shininess: 2 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3*s, 0.55*s, 4*s, 10), trunkMat);
    trunk.position.y = 2*s; trunk.castShadow = true; g.add(trunk);
    // Trunk knots / bark bumps for detail
    for (let k = 0; k < 3; k++) {
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.12*s, 6, 5),
        new THREE.MeshPhongMaterial({ color: barkColor.clone().multiplyScalar(0.8) }));
      const angle = Math.random() * Math.PI * 2;
      knot.position.set(Math.cos(angle)*0.35*s, 1*s + k*1.2*s, Math.sin(angle)*0.35*s);
      knot.scale.set(1, 0.5, 1); g.add(knot);
    }
    // Exposed roots at base
    for (let r = 0; r < 4; r++) {
      const rootAngle = (r / 4) * Math.PI * 2 + Math.random() * 0.5;
      const rootMat = new THREE.MeshPhongMaterial({ color: barkColor.clone().multiplyScalar(0.9) });
      const root = new THREE.Mesh(new THREE.CylinderGeometry(0.06*s, 0.12*s, 1.2*s, 5), rootMat);
      root.position.set(Math.cos(rootAngle)*0.45*s, 0.15*s, Math.sin(rootAngle)*0.45*s);
      root.rotation.z = Math.cos(rootAngle) * 0.6;
      root.rotation.x = Math.sin(rootAngle) * 0.6;
      g.add(root);
    }

    // === BRANCHES — thick limbs you can jump onto ===
    const branchMat = new THREE.MeshPhongMaterial({ color: barkColor.clone().multiplyScalar(0.95), shininess: 2 });
    const numBranches = 2 + Math.floor(Math.random() * 2); // 2-3 branches per oak
    for (let b = 0; b < numBranches; b++) {
      const bAngle = (b / numBranches) * Math.PI * 2 + Math.random() * 0.8;
      const bHeight = 2.2*s + b * 1.1*s + Math.random() * 0.5*s; // stagger heights
      const bLen = 1.8*s + Math.random() * 0.8*s;
      const bRad = 0.12*s + Math.random() * 0.05*s;

      // Branch cylinder (angled outward and slightly up)
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(bRad*0.6, bRad, bLen, 6), branchMat);
      branch.position.set(
        Math.cos(bAngle) * bLen * 0.4,
        bHeight,
        Math.sin(bAngle) * bLen * 0.4
      );
      branch.rotation.z = -Math.cos(bAngle) * 0.7;
      branch.rotation.x = Math.sin(bAngle) * 0.7;
      branch.castShadow = true;
      g.add(branch);

      // Small leaf cluster at the end of the branch
      const leafCol = new THREE.Color(0.22+Math.random()*0.1, 0.50+Math.random()*0.1, 0.15+Math.random()*0.06);
      const leafCluster = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.6*s, 0),
        new THREE.MeshPhongMaterial({ color: leafCol, shininess: 2 })
      );
      leafCluster.position.set(
        Math.cos(bAngle) * bLen * 0.85,
        bHeight + 0.2*s,
        Math.sin(bAngle) * bLen * 0.85
      );
      leafCluster.castShadow = true;
      g.add(leafCluster);

      // Store branch platform data (local coords — will be converted to world when placed)
      g._branches.push({
        lx: Math.cos(bAngle) * bLen * 0.45,
        lz: Math.sin(bAngle) * bLen * 0.45,
        y: bHeight,
        radius: bLen * 0.45,
      });
    }

    // Richer, multi-toned canopy with more leaf clusters
    const baseGreen = new THREE.Color(0.20+Math.random()*0.1, 0.52+Math.random()*0.12, 0.14+Math.random()*0.08);
    const leafPositions = [
      [0, 5.5*s, 0, 2.5*s], [s*0.9, 5*s, 0.5*s, 2.0*s], [-0.8*s, 5*s, -0.5*s, 1.8*s],
      [0.3*s, 6.2*s, -0.4*s, 1.6*s], [-0.5*s, 6*s, 0.6*s, 1.4*s], [0.6*s, 5.8*s, 0.3*s, 1.3*s]
    ];
    leafPositions.forEach(([x,y,z,r]) => {
      const leafCol = baseGreen.clone().offsetHSL(Math.random()*0.04-0.02, Math.random()*0.1-0.05, Math.random()*0.08-0.04);
      const lm = new THREE.MeshPhongMaterial({ color: leafCol, shininess: 3 });
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), lm);
      l.position.set(x, y, z); l.castShadow = true; g.add(l);
    });
    // Shadow blob on ground beneath tree
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(2.5*s, 12), shadowMat);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; g.add(shadow);
    return g;
  }

  function makePine (d) {
    const g = new THREE.Group(); const s = d.scale;
    g._branches = []; // store branch data for collision
    const barkColor = new THREE.Color(0.30 + Math.random()*0.06, 0.22 + Math.random()*0.05, 0.12);
    const trunkMat = new THREE.MeshPhongMaterial({ color: barkColor, shininess: 2 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2*s, 0.38*s, 3.5*s, 8), trunkMat);
    trunk.position.y = 1.75*s; trunk.castShadow = true; g.add(trunk);

    // === PINE BRANCHES — shorter, angled down slightly ===
    const branchMat = new THREE.MeshPhongMaterial({ color: barkColor.clone().multiplyScalar(0.9), shininess: 2 });
    const numBranches = 1 + Math.floor(Math.random() * 2); // 1-2 branches per pine
    for (let b = 0; b < numBranches; b++) {
      const bAngle = (b / numBranches) * Math.PI * 2 + Math.random() * 1.2;
      const bHeight = 1.8*s + b * 1.5*s + Math.random() * 0.4*s;
      const bLen = 1.2*s + Math.random() * 0.5*s;
      const bRad = 0.08*s + Math.random() * 0.03*s;

      const branch = new THREE.Mesh(new THREE.CylinderGeometry(bRad*0.5, bRad, bLen, 5), branchMat);
      branch.position.set(
        Math.cos(bAngle) * bLen * 0.35,
        bHeight,
        Math.sin(bAngle) * bLen * 0.35
      );
      branch.rotation.z = -Math.cos(bAngle) * 0.8;
      branch.rotation.x = Math.sin(bAngle) * 0.8;
      branch.castShadow = true;
      g.add(branch);

      // Pine needle tuft at branch tip
      const needleCol = new THREE.Color(0.12+Math.random()*0.05, 0.38+Math.random()*0.08, 0.10);
      const needles = new THREE.Mesh(
        new THREE.ConeGeometry(0.4*s, 0.5*s, 6),
        new THREE.MeshPhongMaterial({ color: needleCol, shininess: 2 })
      );
      needles.position.set(
        Math.cos(bAngle) * bLen * 0.7,
        bHeight,
        Math.sin(bAngle) * bLen * 0.7
      );
      g.add(needles);

      g._branches.push({
        lx: Math.cos(bAngle) * bLen * 0.4,
        lz: Math.sin(bAngle) * bLen * 0.4,
        y: bHeight,
        radius: bLen * 0.35,
      });
    }

    // Deep, rich pine greens — 4 tiers for more detail
    const baseGreen = new THREE.Color(0.10+Math.random()*0.05, 0.35+Math.random()*0.10, 0.08+Math.random()*0.05);
    const tiers = [
      [2.4*s, 2.5*s, 3*s], [1.9*s, 2.2*s, 4.8*s],
      [1.4*s, 2.0*s, 6.2*s], [0.8*s, 1.5*s, 7.6*s]
    ];
    tiers.forEach(([r,h,y], i) => {
      const tierCol = baseGreen.clone().offsetHSL(0, 0, i * 0.03);
      const lm = new THREE.MeshPhongMaterial({ color: tierCol, shininess: 2 });
      const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), lm);
      c.position.y = y; c.castShadow = true; g.add(c);
    });
    // Shadow blob
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.8*s, 10), shadowMat);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; g.add(shadow);
    return g;
  }

  function makeRock (d) {
    const g = new THREE.Group(); const s = d.scale;
    // Higher detail rock with varied grey/brown tones
    const baseCol = new THREE.Color(0.45+Math.random()*0.12, 0.43+Math.random()*0.1, 0.40+Math.random()*0.08);
    const rm = new THREE.MeshPhongMaterial({ color: baseCol, shininess: 3 });
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), rm);
    r.position.y = s*0.4; r.rotation.set(Math.random(), Math.random(), Math.random());
    r.scale.set(1, 0.55, 0.8+Math.random()*0.4); r.castShadow = true;
    g.add(r);
    // Moss patch on some rocks
    if (Math.random() > 0.4) {
      const mossMat = new THREE.MeshPhongMaterial({ color: 0x4a8a3a, shininess: 2 });
      const moss = new THREE.Mesh(new THREE.SphereGeometry(s*0.5, 6, 5), mossMat);
      moss.position.set(Math.random()*0.2*s, s*0.5, Math.random()*0.2*s);
      moss.scale.set(1.2, 0.3, 1.0); g.add(moss);
    }
    return g;
  }

  /* ====================================================
     HIGHROCK  (in camp centre, slightly offset)
     ==================================================== */
  function createHighrock () {
    highrock = new THREE.Group();
    // Main rock body — more detailed with higher-order geometry
    const rockGeo = new THREE.DodecahedronGeometry(2.2, 2);
    const rockMat = new THREE.MeshPhongMaterial({ color: 0x6a6a6a, shininess: 4 });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.scale.set(1, 1.5, 0.9);
    rock.position.y = 1.5;
    rock.castShadow = true;
    highrock.add(rock);
    // Secondary rock details — smaller rocks around the base
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const detailGeo = new THREE.DodecahedronGeometry(0.5 + Math.random()*0.4, 1);
      const detail = new THREE.Mesh(detailGeo, new THREE.MeshPhongMaterial({ color: 0x5a5a5a, shininess: 3 }));
      detail.position.set(Math.cos(angle)*2, 0.3, Math.sin(angle)*1.8);
      detail.scale.y = 0.6; detail.castShadow = true;
      highrock.add(detail);
    }
    // Flat top with subtle moss
    const topMat = new THREE.MeshPhongMaterial({ color: 0x7a7a7a, shininess: 3 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.3, 16), topMat);
    top.position.y = 3.3;
    highrock.add(top);
    // Moss on top
    const mossMat = new THREE.MeshPhongMaterial({ color: 0x4a7a3a, shininess: 1 });
    const mossTop = new THREE.Mesh(new THREE.CircleGeometry(0.6, 8), mossMat);
    mossTop.rotation.x = -Math.PI / 2; mossTop.position.set(0.3, 3.46, -0.2);
    highrock.add(mossTop);
    // Steps — more natural looking
    const stepMat = new THREE.MeshPhongMaterial({ color: 0x5a5a5a, shininess: 3 });
    const step1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 1), stepMat);
    step1.position.set(1.2, 0.25, 0.8); step1.scale.y = 0.5; step1.castShadow = true;
    highrock.add(step1);
    const step2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 1), stepMat);
    step2.position.set(1.6, 0.8, 0.4); step2.scale.y = 0.5; step2.castShadow = true;
    highrock.add(step2);
    highrock.position.set(-3, 0, -4);
    // Highrock name label
    const hrLabel = makeNameLabel('Highrock', 4.2);
    highrock.add(hrLabel);
    scene.add(highrock);
  }

  /* ====================================================
     DETAILED CAT MODEL (Rusty / player)
     ==================================================== */
  function createCat () {
    catGroup = new THREE.Group();
    const orange = 0xff8c00, darkOrange = 0xcc6600, lightOrange = 0xffaa44;
    const cream = 0xffcc99, white = 0xffeedd, pink = 0xff7799;

    /* --- body (capsule oriented head-to-tail along Z axis) --- */
    const bodyMat = new THREE.MeshPhongMaterial({ color: orange, shininess: 3 });
    const bodyMain = makeCapsuleMesh(0.20, 0.90, 12, 16, bodyMat);
    bodyMain.rotation.x = Math.PI / 2; // round ends face head (front) and tail (back)
    bodyMain.position.set(0, 0.58, 0); bodyMain.castShadow = true;
    catGroup.add(bodyMain);
    // belly (lighter, slightly below)
    const bellyMat = new THREE.MeshPhongMaterial({ color: cream, shininess: 3 });
    const belly = makeCapsuleMesh(0.15, 0.60, 8, 12, bellyMat);
    belly.rotation.x = Math.PI / 2; // same orientation as body
    belly.position.set(0, 0.49, 0.04);
    catGroup.add(belly);

    /* --- head --- */
    const headMat = new THREE.MeshPhongMaterial({ color: orange, shininess: 5 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.30, 14, 12), headMat);
    head.position.set(0, 0.86, 0.60); head.scale.set(1, 0.92, 1.08); head.castShadow = true;
    catGroup.add(head);
    // cheeks
    const cheekMat = new THREE.MeshPhongMaterial({ color: lightOrange, shininess: 3 });
    [[-0.15, 0.80, 0.72],[0.15, 0.80, 0.72]].forEach(([x,y,z])=>{
      const ch = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), cheekMat);
      ch.position.set(x,y,z); catGroup.add(ch);
    });
    // chin
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 6), new THREE.MeshPhongMaterial({ color: white }));
    chin.position.set(0, 0.72, 0.72); catGroup.add(chin);
    // muzzle
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshPhongMaterial({ color: cream }));
    muzzle.position.set(0, 0.78, 0.82); muzzle.scale.set(1.1, 0.7, 0.8); catGroup.add(muzzle);

    /* --- ears (triangular with inner pink) --- */
    const earMat = new THREE.MeshPhongMaterial({ color: orange });
    const earInnerMat = new THREE.MeshPhongMaterial({ color: pink });
    [[-1, 1],[1, 1]].forEach(([side]) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 4), earMat);
      ear.position.set(side * 0.15, 1.10, 0.58); ear.rotation.z = side * 0.25; ear.castShadow = true;
      catGroup.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), earInnerMat);
      inner.position.set(side * 0.15, 1.08, 0.60); inner.rotation.z = side * 0.25;
      catGroup.add(inner);
      // fur tuft
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 3), new THREE.MeshPhongMaterial({ color: lightOrange }));
      tuft.position.set(side * 0.15, 1.22, 0.58);
      catGroup.add(tuft);
    });

    /* --- eyes (BIG cute eyes — Little Kitty Big City style!) --- */
    [[-1, 1],[1, 1]].forEach(([side]) => {
      const x = side * 0.13;
      // sclera (white of eye) — much bigger for cute cartoon look
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.10, 14, 12), new THREE.MeshPhongMaterial({ color: 0xf5fffa, shininess: 8 }));
      sclera.position.set(x, 0.90, 0.82); sclera.scale.set(1.15, 1.0, 0.55);
      catGroup.add(sclera);
      // iris (bright green, Rusty's signature eyes) — big and round
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.082, 14, 12), new THREE.MeshPhongMaterial({ color: 0x33dd44, shininess: 15, emissive: 0x0a1a0a }));
      iris.position.set(x, 0.90, 0.86); iris.scale.set(0.95, 0.95, 0.45);
      catGroup.add(iris);
      // pupil (vertical slit — cat eye!)
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), new THREE.MeshBasicMaterial({ color: 0x050505 }));
      pupil.position.set(x, 0.90, 0.89); pupil.scale.set(0.35, 0.85, 0.3);
      catGroup.add(pupil);
      // Big specular highlight (bright white — the "spark of life" in cartoon eyes)
      const hl1 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl1.position.set(x - side * 0.03, 0.94, 0.90);
      catGroup.add(hl1);
      // Smaller secondary highlight
      const hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl2.position.set(x + side * 0.02, 0.87, 0.90);
      catGroup.add(hl2);
      // dark eyelid line above eye (slightly thinner to not cover big eyes)
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.10, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.3), new THREE.MeshPhongMaterial({ color: darkOrange }));
      lid.position.set(x, 0.91, 0.85); lid.scale.set(1.1, 0.5, 0.55);
      catGroup.add(lid);
    });

    /* --- nose (triangle-shaped, pink, more prominent) --- */
    const noseMat = new THREE.MeshPhongMaterial({ color: pink, shininess: 10 });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), noseMat);
    nose.position.set(0, 0.815, 0.92); nose.scale.set(1.2, 0.6, 0.6);
    catGroup.add(nose);
    // nostrils (tiny dark dots)
    [[-1,1],[1,1]].forEach(([s]) => {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.010, 4, 4), new THREE.MeshBasicMaterial({ color: 0x331111 }));
      nostril.position.set(s * 0.022, 0.805, 0.94);
      catGroup.add(nostril);
    });
    // mouth line
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x332222 });
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.005, 0.005), mouthMat);
    mouth.position.set(0, 0.77, 0.91);
    catGroup.add(mouth);

    /* --- whiskers (thin cylinders) --- */
    const whiskerMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
    [[-1,1],[1,1]].forEach(([side])=>{
      for (let w = 0; w < 3; w++) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, 0.35, 3), whiskerMat);
        wh.rotation.z = side * (0.15 + w * 0.12);
        wh.rotation.x = -0.1 + w * 0.1;
        wh.position.set(side * 0.22, 0.80 - w * 0.02, 0.82);
        catGroup.add(wh);
      }
    });

    /* --- legs (four, with joints and paws) --- */
    const legMat = new THREE.MeshPhongMaterial({ color: orange });
    const pawMat = new THREE.MeshPhongMaterial({ color: white });
    const padMat = new THREE.MeshPhongMaterial({ color: pink });
    const legPositions = [
      [-0.16, 0.22, 0.32], [0.16, 0.22, 0.32],
      [-0.16, 0.22, -0.32],[0.16, 0.22, -0.32]
    ];
    catGroup.legs = [];
    legPositions.forEach(([x, y, z]) => {
      // upper leg
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.42, 8), legMat);
      leg.position.set(x, y, z); leg.castShadow = true;
      catGroup.add(leg); catGroup.legs.push(leg);
      // paw
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), pawMat);
      paw.position.set(x, 0.03, z); paw.scale.set(1, 0.5, 1.2);
      catGroup.add(paw);
      // toe beans (tiny pink dots under paw)
      for (let t = 0; t < 3; t++) {
        const bean = new THREE.Mesh(new THREE.SphereGeometry(0.018, 4, 4), padMat);
        bean.position.set(x + (t-1)*0.03, 0.01, z + 0.04);
        catGroup.add(bean);
      }
      const bigBean = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 4), padMat);
      bigBean.position.set(x, 0.01, z - 0.02);
      catGroup.add(bigBean);
    });

    /* --- tail (smooth connected curve — overlapping segments, no gaps) --- */
    const tailMat = new THREE.MeshPhongMaterial({ color: orange });
    catGroup.tailSegs = [];
    const tailSegs = 14; // more segments for smoother look
    for (let i = 0; i < tailSegs; i++) {
      const t = i / (tailSegs - 1); // 0 to 1
      const radius = 0.065 - t * 0.040; // tapers from 0.065 to 0.025
      const seg = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.022, radius), 8, 6), tailMat);
      // tail curves upward and back in a smooth arc — segments OVERLAP
      const zOff = -0.40 - t * 0.38; // goes back (closer together)
      const yOff = 0.52 + t * 0.30;  // curves up gently
      seg.position.set(0, yOff, zOff);
      catGroup.add(seg);
      catGroup.tailSegs.push(seg);
    }
    // tail tip (slightly darker, overlaps last segment)
    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.020, 6, 4), new THREE.MeshPhongMaterial({ color: darkOrange }));
    tailTip.position.set(0, 0.82, -0.78);
    catGroup.add(tailTip);
    catGroup.tailSegs.push(tailTip);

    /* --- chest patch --- */
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.20, 10, 8), new THREE.MeshPhongMaterial({ color: cream }));
    chest.position.set(0, 0.55, 0.36); chest.scale.set(0.6, 0.7, 0.45);
    catGroup.add(chest);

    /* --- kittypet collar (red with a golden bell — visible only when storyPhase is 'house') --- */
    const collarMat = new THREE.MeshPhongMaterial({ color: 0xcc2222, shininess: 5 });
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 20), collarMat);
    collar.position.set(0, 0.72, 0.45);
    collar.rotation.x = Math.PI / 2.2; // angled slightly to sit on neck
    catGroup.add(collar);
    // Bell on the collar
    const bellMat = new THREE.MeshPhongMaterial({ color: 0xffdd00, shininess: 12 });
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), bellMat);
    bell.position.set(0, 0.62, 0.58);
    catGroup.add(bell);
    // Tiny slit on the bell
    const bellSlit = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.03, 0.01), new THREE.MeshBasicMaterial({ color: 0x333300 }));
    bellSlit.position.set(0, 0.62, 0.60);
    catGroup.add(bellSlit);
    // Store collar parts so we can show/hide them
    catGroup.collarParts = [collar, bell, bellSlit];

    /* --- tabby forehead M marking (no body stripes — Rusty is a clean ginger cat) --- */
    const stripeMat = new THREE.MeshPhongMaterial({ color: darkOrange });
    const mMark = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.015, 0.03), stripeMat);
    mMark.position.set(0, 1.02, 0.65);
    catGroup.add(mMark);

    catGroup.position.set(0, 0, 0);
    catGroup.visible = false; // hidden until game starts
    scene.add(catGroup);
  }

  /* ====================================================
     NAME LABEL (floating text sprite above a cat)
     ==================================================== */
  function drawLabelCanvas (canvas, text, color) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    // background pill
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(8, 8, 240, 48, 12);
    } else {
      const x=8,y=8,w=240,h=48,r=12;
      ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
      ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
      ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
      ctx.closePath();
    }
    ctx.fill();
    // text
    ctx.font = 'bold 28px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color || '#ffe0a0';
    ctx.fillText(text, 128, 34);
  }

  function makeNameLabel (name, yOffset) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    drawLabelCanvas(canvas, name);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.0, 0.5, 1);
    sprite.position.set(0, yOffset || 1.6, 0);
    sprite.renderOrder = 999;
    sprite._labelCanvas = canvas;   // keep ref so we can update it
    sprite._labelTexture = tex;
    return sprite;
  }

  /** Update the text on an existing name label sprite */
  function updateLabelText (sprite, newText, color) {
    if (!sprite || !sprite._labelCanvas) return;
    drawLabelCanvas(sprite._labelCanvas, newText, color);
    sprite._labelTexture.needsUpdate = true;
  }

  /** Reveal a cat's real name (called when the player learns it) */
  function revealCatName (catName) {
    if (knownCats.has(catName)) return;
    knownCats.add(catName);
    const npc = npcCats.find(c => c.name === catName);
    if (npc && npc.label) {
      updateLabelText(npc.label, catName, '#ffe0a0');
    }
  }

  /** Reveal multiple cat names at once */
  function revealCatNames (names) {
    names.forEach(n => revealCatName(n));
  }

  /* ====================================================
     BOOK-ACCURATE NPC CATS
     ==================================================== */
  /**
   * Build a detailed cat from a descriptor object:
   * { name, fur, belly, stripeColor, stripes, eyeColor, earInner,
   *   noseColor, size, longFur, whiteChest, whitePaws, maneColor }
   */
  function makeBookCat (desc, px, pz) {
    const g = new THREE.Group();
    const sz = desc.size || 1;
    const furMat  = new THREE.MeshPhongMaterial({ color: desc.fur, shininess: 3 });
    const bellyC  = desc.belly || desc.fur;
    const bellyMat = new THREE.MeshPhongMaterial({ color: bellyC, shininess: 8 });
    const earInC  = desc.earInner || 0xff9999;
    const noseC   = desc.noseColor || 0xff7799;
    const eyeC    = desc.eyeColor || 0xffdd44;
    const pawC    = desc.whitePaws ? 0xffeedd : desc.fur;

    /* body (oriented head-to-tail like player cat) */
    const bodyR = 0.34 * sz, bodyL = 0.7 * sz;
    const body = makeCapsuleMesh(bodyR, bodyL, 12, 16, furMat);
    body.rotation.x = Math.PI / 2; body.position.y = 0.58 * sz; body.castShadow = true;
    g.add(body);
    // belly
    const bellyM = makeCapsuleMesh(bodyR * 0.78, bodyL * 0.65, 8, 12, bellyMat);
    bellyM.rotation.x = Math.PI / 2; bellyM.position.set(0, 0.48 * sz, 0.04);
    g.add(bellyM);

    /* mane / thick neck fur (for Lionheart etc.) */
    if (desc.maneColor) {
      const maneMat = new THREE.MeshPhongMaterial({ color: desc.maneColor, shininess: 8 });
      const mane = new THREE.Mesh(new THREE.SphereGeometry(0.38 * sz, 10, 8), maneMat);
      mane.position.set(0, 0.7 * sz, 0.25 * sz); mane.scale.set(1.3, 1.1, 1.0);
      g.add(mane);
    }

    /* head (higher detail like player cat) */
    const headR = 0.30 * sz;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 14, 12), furMat);
    head.position.set(0, 0.82 * sz, 0.52 * sz); head.scale.set(1, 0.92, 1.06);
    head.castShadow = true; g.add(head);
    // cheeks
    const cheekMat = new THREE.MeshPhongMaterial({ color: desc.belly || desc.fur, shininess: 3 });
    [[-1,1],[1,1]].forEach(([s]) => {
      const ch = new THREE.Mesh(new THREE.SphereGeometry(0.12 * sz, 10, 8), cheekMat);
      ch.position.set(s * 0.16 * sz, 0.76 * sz, 0.62 * sz); g.add(ch);
    });
    // muzzle — pushed forward so nose/mouth sit on it visibly
    const mzlMat = new THREE.MeshPhongMaterial({ color: bellyC, shininess: 3 });
    const mzl = new THREE.Mesh(new THREE.SphereGeometry(0.13 * sz, 10, 8), mzlMat);
    mzl.position.set(0, 0.77 * sz, 0.80 * sz); mzl.scale.set(1.1, 0.65, 0.8);
    g.add(mzl);
    // chin (always visible, just use belly or fur color)
    const chinC = desc.whiteChest ? 0xffeedd : bellyC;
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.09 * sz, 8, 6), new THREE.MeshPhongMaterial({ color: chinC }));
    chin.position.set(0, 0.70 * sz, 0.72 * sz); g.add(chin);

    /* ears (with inner pink and fur tufts, matching player quality) */
    const earMat = new THREE.MeshPhongMaterial({ color: desc.fur, shininess: 3 });
    const earIn  = new THREE.MeshPhongMaterial({ color: earInC });
    [[-1,1],[1,1]].forEach(([s]) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12 * sz, 0.22 * sz, 4), earMat);
      ear.position.set(s * 0.15 * sz, 1.06 * sz, 0.50 * sz); ear.rotation.z = s * 0.25;
      ear.castShadow = true; g.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.06 * sz, 0.14 * sz, 4), earIn);
      inner.position.set(s * 0.15 * sz, 1.04 * sz, 0.52 * sz); inner.rotation.z = s * 0.25;
      g.add(inner);
      // fur tuft at tip of ear (all cats get this now)
      const tuftC = desc.longFur ? desc.fur : new THREE.Color(desc.fur).lerp(new THREE.Color(bellyC), 0.3);
      const tf = new THREE.Mesh(new THREE.ConeGeometry(0.04 * sz, 0.08 * sz, 3), new THREE.MeshPhongMaterial({ color: tuftC }));
      tf.position.set(s * 0.15 * sz, 1.18 * sz, 0.50 * sz); g.add(tf);
    });

    /* eyes (BIG cute cartoon eyes — matching player cat quality!) */
    [[-1,1],[1,1]].forEach(([s]) => {
      const x = s * 0.13 * sz;
      // sclera — bigger for cartoon look, pushed forward so visible
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.10 * sz, 14, 12), new THREE.MeshPhongMaterial({ color: 0xf5fffa, shininess: 8 }));
      sclera.position.set(x, 0.88 * sz, 0.82 * sz); sclera.scale.set(1.15, 1.0, 0.55); g.add(sclera);
      // iris — big and bright
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.082 * sz, 14, 12), new THREE.MeshPhongMaterial({ color: eyeC, shininess: 15, emissive: 0x0a1a0a }));
      iris.position.set(x, 0.88 * sz, 0.85 * sz); iris.scale.set(0.95, 0.95, 0.45); g.add(iris);
      // pupil — vertical slit
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.042 * sz, 10, 8), new THREE.MeshBasicMaterial({ color: 0x050505 }));
      pupil.position.set(x, 0.88 * sz, 0.88 * sz); pupil.scale.set(0.35, 0.85, 0.3); g.add(pupil);
      // Big specular highlight (spark of life!)
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.025 * sz, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl.position.set(x - s * 0.03 * sz, 0.92 * sz, 0.89 * sz); g.add(hl);
      // Smaller secondary highlight
      const hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.013 * sz, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl2.position.set(x + s * 0.02 * sz, 0.85 * sz, 0.89 * sz); g.add(hl2);
      // Dark eyelid line above eye (like player cat)
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.10 * sz, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.3), new THREE.MeshPhongMaterial({ color: desc.fur }));
      lid.position.set(x, 0.89 * sz, 0.83 * sz); lid.scale.set(1.1, 0.5, 0.55);
      g.add(lid);
    });

    /* nose (more detailed like player cat — pushed forward) */
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05 * sz, 8, 6), new THREE.MeshPhongMaterial({ color: noseC, shininess: 10 }));
    nose.position.set(0, 0.80 * sz, 0.90 * sz); nose.scale.set(1.2, 0.6, 0.6); g.add(nose);
    // nostrils
    [[-1,1],[1,1]].forEach(([s]) => {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.010 * sz, 4, 4), new THREE.MeshBasicMaterial({ color: 0x331111 }));
      nostril.position.set(s * 0.022 * sz, 0.79 * sz, 0.93 * sz); g.add(nostril);
    });
    // mouth line — wider and pushed forward
    const mouthLine = new THREE.Mesh(new THREE.BoxGeometry(0.06 * sz, 0.006, 0.006), new THREE.MeshBasicMaterial({ color: 0x332222 }));
    mouthLine.position.set(0, 0.74 * sz, 0.88 * sz); g.add(mouthLine);
    // mouth curves (V shape under nose for cute cat smile)
    [[-1,1],[1,1]].forEach(([s]) => {
      const mc = new THREE.Mesh(new THREE.BoxGeometry(0.03 * sz, 0.005, 0.005), new THREE.MeshBasicMaterial({ color: 0x332222 }));
      mc.position.set(s * 0.02 * sz, 0.735 * sz, 0.87 * sz);
      mc.rotation.z = s * 0.5;
      g.add(mc);
    });

    /* whiskers (matching player cat quality) */
    const whMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
    [[-1,1],[1,1]].forEach(([s]) => {
      for (let w = 0; w < 3; w++) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, 0.35 * sz, 3), whMat);
        wh.rotation.z = s * (0.15 + w * 0.12); wh.rotation.x = -0.1 + w * 0.1;
        wh.position.set(s * 0.22 * sz, 0.76 * sz - w * 0.02, 0.72 * sz);
        g.add(wh);
      }
    });

    /* legs & paws (matching player cat detail) */
    const legMat = new THREE.MeshPhongMaterial({ color: desc.fur, shininess: 3 });
    const pawMat = new THREE.MeshPhongMaterial({ color: pawC, shininess: 3 });
    const padMat = new THREE.MeshPhongMaterial({ color: 0xff8899 });
    const legPos = [
      [-0.16*sz, 0.22*sz, 0.32*sz], [0.16*sz, 0.22*sz, 0.32*sz],
      [-0.16*sz, 0.22*sz, -0.32*sz],[0.16*sz, 0.22*sz, -0.32*sz]
    ];
    g.legs = [];
    legPos.forEach(([x,y,z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07*sz, 0.055*sz, 0.42*sz, 8), legMat);
      leg.position.set(x,y,z); leg.castShadow = true; g.add(leg); g.legs.push(leg);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.065*sz, 8, 6), pawMat);
      paw.position.set(x, 0.03, z); paw.scale.set(1, 0.5, 1.2); g.add(paw);
      // toe beans (3 small + 1 big pad, matching player)
      for (let t = 0; t < 3; t++) {
        const bean = new THREE.Mesh(new THREE.SphereGeometry(0.018*sz, 4, 4), padMat);
        bean.position.set(x+(t-1)*0.03*sz, 0.01, z+0.04*sz); g.add(bean);
      }
      const bigBean = new THREE.Mesh(new THREE.SphereGeometry(0.025*sz, 4, 4), padMat);
      bigBean.position.set(x, 0.01, z-0.02*sz); g.add(bigBean);
    });

    /* tail (14 smooth overlapping segments like player cat) */
    g.tailSegs = [];
    const tailSegCount = 14;
    for (let i = 0; i < tailSegCount; i++) {
      const t = i / (tailSegCount - 1);
      const r = (0.065 - t * 0.040) * sz;
      const seg = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.022 * sz, r), 8, 6), furMat);
      const zOff = (-0.40 - t * 0.38) * sz;
      const yOff = (0.52 + t * 0.30) * sz;
      seg.position.set(0, yOff, zOff);
      g.add(seg); g.tailSegs.push(seg);
    }
    // tail tip (slightly darker)
    const tailTipC = new THREE.Color(desc.fur).multiplyScalar(0.75);
    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.020 * sz, 6, 4), new THREE.MeshPhongMaterial({ color: tailTipC }));
    tailTip.position.set(0, 0.82 * sz, -0.78 * sz);
    g.add(tailTip); g.tailSegs.push(tailTip);

    /* chest patch (always visible — use belly or fur-lighter color) */
    const chestC = desc.whiteChest ? 0xffeedd : bellyC;
    const cp = new THREE.Mesh(new THREE.SphereGeometry(0.20*sz, 10, 8), new THREE.MeshPhongMaterial({ color: chestC, shininess: 8 }));
    cp.position.set(0, 0.52*sz, 0.32*sz); cp.scale.set(0.6, 0.7, 0.45); g.add(cp);

    /* tabby stripes */
    if (desc.stripes && desc.stripeColor) {
      const stMat = new THREE.MeshPhongMaterial({ color: desc.stripeColor });
      for (let i = 0; i < desc.stripes; i++) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.36*sz, 0.012, 0.05*sz), stMat);
        st.position.set(0, 0.90*sz, (0.12 - i*0.14)*sz); g.add(st);
      }
      // forehead M
      const mM = new THREE.Mesh(new THREE.BoxGeometry(0.16*sz, 0.012, 0.025*sz), stMat);
      mM.position.set(0, 0.96*sz, 0.56*sz); g.add(mM);
    }

    /* name label - starts as ??? until the player meets this cat */
    const displayName = knownCats.has(desc.name) ? desc.name : '???';
    const label = makeNameLabel(displayName, 1.45 * sz);
    g.add(label);

    g.position.set(px, 0, pz);
    g.visible = false;
    scene.add(g);
    return { group: g, name: desc.name, data: desc, label: label };
  }

  function createNPCCats () {
    /* Book-accurate descriptions from Warriors: Into the Wild */
    npcCats = [
      // Bluestar - blue-gray she-cat, silver muzzle, piercing ice-blue eyes
      makeBookCat({
        name: 'Bluestar', fur: 0x6680aa, belly: 0x8899bb,
        eyeColor: 0x66bbff, earInner: 0xcc8899, noseColor: 0x8888aa,
        size: 1.05, whiteChest: false, whitePaws: false,
        stripes: 0, longFur: false
      }, -3, -1.5),

      // Lionheart - magnificent golden tabby tom, thick fur, amber eyes, lion-like mane
      makeBookCat({
        name: 'Lionheart', fur: 0xccaa33, belly: 0xddcc77,
        stripeColor: 0x997711, stripes: 5,
        eyeColor: 0xffaa22, earInner: 0xffaa88, noseColor: 0xdd8866,
        size: 1.2, maneColor: 0xddbb44,
        whiteChest: false, whitePaws: false, longFur: true
      }, -1, 1),

      // Graypaw - long-haired solid gray tom, yellow eyes, thick fur
      makeBookCat({
        name: 'Graypaw', fur: 0x777788, belly: 0x9999aa,
        eyeColor: 0xeedd33, earInner: 0xcc9999, noseColor: 0x887788,
        size: 0.9, whiteChest: false, whitePaws: false,
        stripes: 0, longFur: true
      }, 1, 2),

      // Whitestorm - big white tom, yellow eyes
      makeBookCat({
        name: 'Whitestorm', fur: 0xeeeeee, belly: 0xffffff,
        eyeColor: 0xeedd44, earInner: 0xffaaaa, noseColor: 0xffaabb,
        size: 1.15, whiteChest: false, whitePaws: false,
        stripes: 0, longFur: false
      }, 2, -1),

      // Dustpaw - dark brown tabby tom, amber eyes
      makeBookCat({
        name: 'Dustpaw', fur: 0x7a5533, belly: 0x997755,
        stripeColor: 0x442200, stripes: 4,
        eyeColor: 0xddaa22, earInner: 0xcc8877, noseColor: 0x664433,
        size: 0.85, whiteChest: false, whitePaws: false, longFur: false
      }, -2, 3),

      // Sandpaw - pale ginger (sandy) she-cat, green eyes, small and sleek
      makeBookCat({
        name: 'Sandpaw', fur: 0xddbb88, belly: 0xeedd99,
        eyeColor: 0x44cc44, earInner: 0xffbb99, noseColor: 0xddaa88,
        size: 0.82, whiteChest: false, whitePaws: false,
        stripes: 0, longFur: false
      }, 0, 3.5),

      // Mousefur - small dusky brown she-cat, amber eyes
      makeBookCat({
        name: 'Mousefur', fur: 0x8b6b4a, belly: 0xa08060,
        eyeColor: 0xddaa33, earInner: 0xcc9988, noseColor: 0x886655,
        size: 0.78, whiteChest: false, whitePaws: false,
        stripes: 0, longFur: false
      }, 3, 1),

      // Darkstripe - large dark gray tabby tom, black stripes, amber eyes
      makeBookCat({
        name: 'Darkstripe', fur: 0x555566, belly: 0x6b6b7a,
        stripeColor: 0x222233, stripes: 5,
        eyeColor: 0xddaa22, earInner: 0xaa7788, noseColor: 0x555555,
        size: 1.1, whiteChest: false, whitePaws: false, longFur: false
      }, -4, 2),

      // Ravenpaw - sleek black tom, white-tipped tail, amber eyes, nervous
      makeBookCat({
        name: 'Ravenpaw', fur: 0x1a1a1a, belly: 0x2a2a2a,
        eyeColor: 0xddaa33, earInner: 0x885566, noseColor: 0x333333,
        size: 0.85, whiteChest: true, whitePaws: false,
        stripes: 0, longFur: false
      }, 1, -2),

      // Spottedleaf - beautiful tortoiseshell she-cat, amber eyes, dappled coat
      makeBookCat({
        name: 'Spottedleaf', fur: 0xaa6633, belly: 0xcc9966,
        stripeColor: 0x553311, stripes: 3,
        eyeColor: 0xddaa44, earInner: 0xffaa88, noseColor: 0xcc7755,
        size: 0.88, whiteChest: true, whitePaws: true, longFur: false
      }, 4, -3),

      // Tigerclaw - big dark brown tabby, unusually long claws, amber eyes
      makeBookCat({
        name: 'Tigerclaw', fur: 0x5a3a1a, belly: 0x7a5a3a,
        stripeColor: 0x221100, stripes: 6,
        eyeColor: 0xffaa11, earInner: 0xaa7766, noseColor: 0x553322,
        size: 1.25, whiteChest: false, whitePaws: false, longFur: false
      }, -5, 0),

      // Yellowfang - old dark gray she-cat, flat face, orange eyes, matted fur
      makeBookCat({
        name: 'Yellowfang', fur: 0x555555, belly: 0x666666,
        eyeColor: 0xff8822, earInner: 0x886677, noseColor: 0x555544,
        size: 0.95, whiteChest: false, whitePaws: false,
        stripes: 0, longFur: true
      }, 5, 2),

      // Longtail - pale tabby tom with dark black stripes, green eyes
      makeBookCat({
        name: 'Longtail', fur: 0xccbb99, belly: 0xddccaa,
        stripeColor: 0x222211, stripes: 5,
        eyeColor: 0x44cc44, earInner: 0xffbb99, noseColor: 0xbbaa88,
        size: 1.05, whiteChest: false, whitePaws: false, longFur: false
      }, -6, 1),

      // Smudge - plump black-and-white tom, Rusty's kittypet friend
      makeBookCat({
        name: 'Smudge', fur: 0x222222, belly: 0xeeeeee,
        eyeColor: 0xddcc33, earInner: 0xffaaaa, noseColor: 0x333333,
        size: 0.95, whiteChest: true, whitePaws: true,
        stripes: 0, longFur: false
      }, 3, 83),

      // Princess - light brown tabby-and-white she-cat, Rusty's sister
      makeBookCat({
        name: 'Princess', fur: 0xccaa77, belly: 0xeeddbb,
        stripeColor: 0x997744, stripes: 3,
        eyeColor: 0x66bb44, earInner: 0xffbb99, noseColor: 0xddaa88,
        size: 0.82, whiteChest: true, whitePaws: true, longFur: false
      }, -3, 84),

      // === QUEENS (Nursery she-cats) ===

      // Frostfur - beautiful white she-cat with blue eyes, queen
      makeBookCat({
        name: 'Frostfur', fur: 0xeeeeee, belly: 0xffffff,
        eyeColor: 0x66aaee, earInner: 0xffbbbb, noseColor: 0xffaabb,
        size: 0.92, whiteChest: false, whitePaws: false,
        stripes: 0, longFur: true
      }, -8, 5),

      // Brindleface - pale gray tabby she-cat, green eyes, gentle queen
      makeBookCat({
        name: 'Brindleface', fur: 0x999999, belly: 0xbbbbbb,
        stripeColor: 0x666666, stripes: 3,
        eyeColor: 0x77cc55, earInner: 0xddaaaa, noseColor: 0x998888,
        size: 0.88, whiteChest: false, whitePaws: false, longFur: false
      }, -9, 5.5),

      // Goldenflower - pale ginger she-cat, yellow eyes, sleek queen
      makeBookCat({
        name: 'Goldenflower', fur: 0xddaa55, belly: 0xeebb77,
        eyeColor: 0xeedd33, earInner: 0xffbb88, noseColor: 0xdd9966,
        size: 0.90, whiteChest: false, whitePaws: false,
        stripes: 0, longFur: false
      }, -7, 5.5),

      // === KITS (tiny baby cats in the Nursery) ===

      // Cinderkit - dark gray she-kit, blue eyes (Frostfur's kit)
      makeBookCat({
        name: 'Cinderkit', fur: 0x666677, belly: 0x888899,
        eyeColor: 0x66aaee, earInner: 0xddaaaa, noseColor: 0x777788,
        size: 0.45, whiteChest: false, whitePaws: false,
        stripes: 0, longFur: false
      }, -8.5, 4.5),

      // Brackenkit - golden-brown tabby tom-kit (Frostfur's kit)
      makeBookCat({
        name: 'Brackenkit', fur: 0xbb8833, belly: 0xccaa66,
        stripeColor: 0x886622, stripes: 3,
        eyeColor: 0xddaa33, earInner: 0xffbb99, noseColor: 0xaa7744,
        size: 0.42, whiteChest: false, whitePaws: false, longFur: false
      }, -7.5, 4.2),

      // Brightkit - white she-kit with ginger patches (Frostfur's kit)
      makeBookCat({
        name: 'Brightkit', fur: 0xeeeeee, belly: 0xffffff,
        stripeColor: 0xdd8844, stripes: 2,
        eyeColor: 0xddaa33, earInner: 0xffaaaa, noseColor: 0xffaabb,
        size: 0.43, whiteChest: false, whitePaws: true, longFur: false
      }, -8.8, 5.5),

      // Thornkit - golden-brown tabby tom-kit (Frostfur's kit)
      makeBookCat({
        name: 'Thornkit', fur: 0xbb9944, belly: 0xccbb77,
        stripeColor: 0x886622, stripes: 4,
        eyeColor: 0xddaa33, earInner: 0xffbb99, noseColor: 0xaa8855,
        size: 0.40, whiteChest: false, whitePaws: false, longFur: false
      }, -7.2, 5.8),

      // Ashkit - pale gray tom-kit with darker flecks (Brindleface's kit)
      makeBookCat({
        name: 'Ashkit', fur: 0xaaaaaa, belly: 0xcccccc,
        stripeColor: 0x777777, stripes: 2,
        eyeColor: 0x66bbdd, earInner: 0xddbbbb, noseColor: 0xaa9999,
        size: 0.40, whiteChest: false, whitePaws: false, longFur: false
      }, -9.3, 4.8),

      // Fernkit - pale gray she-kit with green eyes (Brindleface's kit)
      makeBookCat({
        name: 'Fernkit', fur: 0xbbbbaa, belly: 0xddddcc,
        eyeColor: 0x55cc55, earInner: 0xddbbbb, noseColor: 0xaa9999,
        size: 0.38, whiteChest: false, whitePaws: false,
        stripes: 0, longFur: false
      }, -9, 6),
    ];

    // --- BORDER PATROL CATS (visible in enemy territories, walk along borders) ---
    createBorderPatrols();
  }

  /* Border patrol GROUPS — each patrol is a group of cats that walk together
   * with a visible yellow detection circle in front of them.
   * borderPatrols = [{ clan, cats: [{group, name, fur, eye, stripes, stripeColor, size}], 
   *                    patrolPath, pathIdx, speed, spotted, spotCooldown, detectionCircle, _walkCycle }] */
  let borderPatrols = [];

  function createBorderPatrols () {
    borderPatrols = [];

    // Each patrol is a GROUP of cats walking the same path together
    const patrolDefs = [
      // ShadowClan patrol (2 cats)
      { clan: 'ShadowClan',
        cats: [
          { name: 'ShadowClan Warrior', fur: 0x333333, belly: 0x444444, eyeColor: 0xffcc00, stripes: 0, size: 1.1 },
          { name: 'ShadowClan Fighter', fur: 0x2a2a2a, belly: 0x3a3a3a, eyeColor: 0xee9900, stripes: 3, stripeColor: 0x111111, size: 1.05 },
        ],
        path: [{ x: -66, z: -40 }, { x: -66, z: -10 }, { x: -66, z: 20 }, { x: -66, z: 40 }, { x: -66, z: 20 }, { x: -66, z: -10 }],
        speed: 2.5,
      },

      // RiverClan patrol (2 cats)
      { clan: 'RiverClan',
        cats: [
          { name: 'RiverClan Warrior', fur: 0x6688aa, belly: 0x88aacc, eyeColor: 0x44cccc, stripes: 0, size: 1.0 },
          { name: 'RiverClan Fighter', fur: 0x5577aa, belly: 0x7799bb, eyeColor: 0x33bbbb, stripes: 2, stripeColor: 0x334455, size: 1.1 },
        ],
        path: [{ x: 82, z: -30 }, { x: 82, z: 0 }, { x: 82, z: 25 }, { x: 82, z: 40 }, { x: 82, z: 25 }, { x: 82, z: 0 }],
        speed: 2.5,
      },

      // WindClan patrol (2 cats — WindClan is faster)
      { clan: 'WindClan',
        cats: [
          { name: 'WindClan Runner', fur: 0xbbaa77, belly: 0xddcc99, eyeColor: 0xddbb33, stripes: 2, stripeColor: 0x887744, size: 0.9 },
          { name: 'WindClan Scout', fur: 0xaa9966, belly: 0xccbb88, eyeColor: 0xccaa22, stripes: 0, size: 0.85 },
        ],
        path: [{ x: -30, z: -65 }, { x: -5, z: -65 }, { x: 20, z: -65 }, { x: 45, z: -65 }, { x: 20, z: -65 }, { x: -5, z: -65 }],
        speed: 3.5,
      },
    ];

    patrolDefs.forEach(pd => {
      const startPos = pd.path[0];
      const catObjs = [];

      pd.cats.forEach((c, idx) => {
        const catData = {
          name: c.name, fur: c.fur, belly: c.belly,
          eyeColor: c.eyeColor, earInner: 0xcc8888, noseColor: 0x886666,
          size: c.size, whiteChest: false, whitePaws: false, longFur: false
        };
        if (c.stripes) { catData.stripes = c.stripes; catData.stripeColor = c.stripeColor || 0x333322; }
        else { catData.stripes = 0; }

        // Offset cats slightly so they walk side by side
        const offsetX = (idx === 0) ? -1 : 1;
        const catObj = makeBookCat(catData, startPos.x + offsetX, startPos.z);
        catObj.group.visible = true;

        catObjs.push({
          group: catObj.group,
          label: catObj.label,
          name: c.name,
          fur: c.fur,
          eyeColor: c.eyeColor,
          stripes: c.stripes || 0,
          stripeColor: c.stripeColor || 0,
          size: c.size,
          offsetX: offsetX,
        });
      });

      // Create yellow detection circle (visible on the ground in front of the patrol)
      const circleGeo = new THREE.RingGeometry(6, 7, 32);
      const circleMat = new THREE.MeshBasicMaterial({
        color: 0xffdd00, transparent: true, opacity: 0.45, side: THREE.DoubleSide
      });
      const circle = new THREE.Mesh(circleGeo, circleMat);
      circle.rotation.x = -Math.PI / 2;
      circle.position.set(startPos.x, 0.08, startPos.z);
      scene.add(circle);

      // Inner glow fill
      const innerGeo = new THREE.CircleGeometry(6, 32);
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0xffee44, transparent: true, opacity: 0.12, side: THREE.DoubleSide
      });
      const innerCircle = new THREE.Mesh(innerGeo, innerMat);
      innerCircle.rotation.x = -Math.PI / 2;
      innerCircle.position.set(startPos.x, 0.07, startPos.z);
      scene.add(innerCircle);

      borderPatrols.push({
        clan: pd.clan,
        cats: catObjs,
        patrolPath: pd.path,
        pathIdx: 0,
        speed: pd.speed,
        detectionCircle: circle,
        detectionInner: innerCircle,
        detectionRadius: 7,
        _walkCycle: 0,
        spotted: false,
        spotCooldown: 0,
      });
    });
  }

  /* ====================================================
     LIGHTING
     ==================================================== */
  // Store light references for day/night transitions
  let lightAmbient, lightSun, lightHemi, lightFill, lightRim, lightBounce;
  let isNightMode = false;

  function createLighting () {
    // Soft warm ambient — gives everything a gentle base illumination
    lightAmbient = new THREE.AmbientLight(0xfff0e0, 0.5);
    scene.add(lightAmbient);

    // Main sun — warm golden light with high-quality shadows
    lightSun = new THREE.DirectionalLight(0xffeedd, 0.85);
    lightSun.position.set(30, 50, 25); lightSun.castShadow = true;
    lightSun.shadow.mapSize.width = 4096; lightSun.shadow.mapSize.height = 4096;
    lightSun.shadow.camera.near = 0.5; lightSun.shadow.camera.far = 150;
    lightSun.shadow.camera.left = -60; lightSun.shadow.camera.right = 60;
    lightSun.shadow.camera.top = 60;  lightSun.shadow.camera.bottom = -60;
    lightSun.shadow.bias = -0.0005;
    lightSun.shadow.normalBias = 0.02;
    scene.add(lightSun);

    // Hemisphere light — rich sky-to-ground color gradient for natural feel
    lightHemi = new THREE.HemisphereLight(0x7ab5e0, 0x3a7a2a, 0.4);
    scene.add(lightHemi);

    // Soft fill light from the other side (removes harsh shadows, adds depth)
    lightFill = new THREE.DirectionalLight(0x99bbee, 0.22);
    lightFill.position.set(-25, 20, -15);
    scene.add(lightFill);

    // Warm rim/back light — adds gentle glow to edges
    lightRim = new THREE.DirectionalLight(0xffcc88, 0.15);
    lightRim.position.set(-10, 12, -30);
    scene.add(lightRim);

    // Soft bounce light from below — prevents pitch-black undersides
    lightBounce = new THREE.DirectionalLight(0x88aa66, 0.08);
    lightBounce.position.set(0, -5, 0);
    scene.add(lightBounce);
  }

  /** Switch to night mode — dark blue sky, moonlight, stars feel */
  function setNightMode () {
    if (isNightMode) return;
    isNightMode = true;
    // Dark sky
    scene.background = new THREE.Color(0.05, 0.08, 0.18);
    scene.fog = new THREE.Fog(0x0a1020, 30, 120);
    // Dim ambient to cool blue
    lightAmbient.color.set(0x2233aa);
    lightAmbient.intensity = 0.25;
    // Moon replaces sun — cold silver light from above
    lightSun.color.set(0x8899cc);
    lightSun.intensity = 0.35;
    lightSun.position.set(-20, 45, -15);
    // Hemisphere: dark blue sky to dark ground
    lightHemi.color.set(0x223355);
    lightHemi.groundColor.set(0x111a11);
    lightHemi.intensity = 0.2;
    // Fill light — very dim cool
    lightFill.color.set(0x334466);
    lightFill.intensity = 0.08;
    // Rim — faint moonshine
    lightRim.color.set(0x6677aa);
    lightRim.intensity = 0.1;
    // Bounce — nearly off
    lightBounce.intensity = 0.03;
  }

  /** Switch back to daytime — restores original warm lighting */
  function setDayMode () {
    if (!isNightMode) return;
    isNightMode = false;
    // Original sky
    scene.background = new THREE.Color(0.48, 0.72, 0.92);
    scene.fog = new THREE.Fog(0x7ab5d8, 50, 180);
    // Restore ambient
    lightAmbient.color.set(0xfff0e0);
    lightAmbient.intensity = 0.5;
    // Restore sun
    lightSun.color.set(0xffeedd);
    lightSun.intensity = 0.85;
    lightSun.position.set(30, 50, 25);
    // Restore hemisphere
    lightHemi.color.set(0x7ab5e0);
    lightHemi.groundColor.set(0x3a7a2a);
    lightHemi.intensity = 0.4;
    // Restore fill
    lightFill.color.set(0x99bbee);
    lightFill.intensity = 0.22;
    // Restore rim
    lightRim.color.set(0xffcc88);
    lightRim.intensity = 0.15;
    // Restore bounce
    lightBounce.intensity = 0.08;
  }

  /* ====================================================
     FIREFLIES
     ==================================================== */
  function addFireflies () {
    const n = 50;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const b = GameLogic.getForestBounds();
    for (let i = 0; i < n; i++) {
      pos[i*3]   = b.minX + Math.random() * (b.maxX - b.minX);
      pos[i*3+1] = 1 + Math.random() * 4;
      pos[i*3+2] = b.minZ + Math.random() * (b.maxZ - b.minZ);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffdd66, size: 0.3, transparent: true, opacity: 0.8, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat); pts.name = 'fireflies';
    scene.add(pts);
  }

  function addTitleFireflies () {
    for (let i = 0; i < 20; i++) {
      const d = document.createElement('div');
      d.className = 'firefly';
      d.style.left = Math.random()*100+'%'; d.style.top = Math.random()*100+'%';
      d.style.animationDelay = Math.random()*6+'s';
      d.style.animationDuration = (4+Math.random()*4)+'s';
      titleScreen.appendChild(d);
    }
  }

  /* ====================================================
     CONTROLS
     ==================================================== */
  function setupControls () {
    window.addEventListener('keydown', e => {
      keys[e.key.toLowerCase()] = true; keys[e.code] = true;
      if (gameState === 'title') { initAudio(); goToSaveScreen(); }
      if (e.key === ' ' || e.key === 'Enter') {
        if (gameState === 'cutscene') advanceCutscene();
        if (messageBox.classList.contains('visible')) advanceMessage();
      }
      // 'E' or 'e' to talk to nearest cat
      if ((e.key === 'e' || e.key === 'E') && gameState === 'playing' && !denOpen) {
        // Check intruders first, then dens, then talk
        if (intruderActive && intruderPatrolAssigned && confrontIntruder()) {
          // confronted an intruder
        } else {
          const nearDen = getNearestDen();
          if (nearDen) {
            enterDen(nearDen);
          } else {
            talkToNearestCat();
          }
        }
      }
      // 'M' or 'm' to toggle map
      if ((e.key === 'm' || e.key === 'M')) {
        if ($('map-overlay').classList.contains('hidden') && gameState === 'playing') openMap();
        else if (!$('map-overlay').classList.contains('hidden')) closeMap();
      }
      // Escape to close map or den
      if (e.key === 'Escape' && !$('map-overlay').classList.contains('hidden')) closeMap();
      if (e.key === 'Escape' && denOpen) leaveDen();
      // SPACE to jump (can't jump while swimming)
      if (e.key === ' ' && gameState === 'playing' && isOnGround && !isSwimming && !messageBox.classList.contains('visible')) {
        playerJump();
      }
      // Number keys for emotes (1-6)
      if (gameState === 'playing') {
        const emoteKeys = { '1': 'happy', '2': 'sad', '3': 'angry', '4': 'nervous', '5': 'sit', '6': 'sleep' };
        if (emoteKeys[e.key]) triggerEmote(emoteKeys[e.key]);
      }
    });
    window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; keys[e.code] = false; });

    // Left click: talk to cats (no pointer lock — cursor is always visible)
    renderer.domElement.addEventListener('click', (e) => {
      if (gameState === 'playing' && !isMobile) {
        tryTalkByRaycast(e.clientX, e.clientY);
      }
    });

    // Right-click drag OR left-click drag: look around (camera control)
    let isDragging = false;
    let lastMouseX = 0, lastMouseY = 0;
    renderer.domElement.addEventListener('mousedown', (e) => {
      if (gameState === 'playing') {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      }
    });
    document.addEventListener('mouseup', (e) => {
      isDragging = false;
    });
    renderer.domElement.addEventListener('contextmenu', (e) => { e.preventDefault(); }); // prevent right-click menu
    document.addEventListener('mousemove', e => {
      if (isDragging && gameState === 'playing') {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        cameraAngleY -= dx * 0.004;
        cameraAngleX = Math.max(-1.2, Math.min(1.3, cameraAngleX + dy * 0.004));
      }
    });

    titleScreen.addEventListener('click', () => { if (gameState === 'title') { initAudio(); goToSaveScreen(); } });
    titleScreen.addEventListener('touchstart', e => { e.preventDefault(); if (gameState === 'title') { initAudio(); goToSaveScreen(); } });

    cutsceneOverlay.addEventListener('click', () => { if (gameState === 'cutscene') advanceCutscene(); });
    cutsceneOverlay.addEventListener('touchstart', e => { e.preventDefault(); if (gameState === 'cutscene') advanceCutscene(); });

    messageBox.addEventListener('click', advanceMessage);
    messageBox.addEventListener('touchstart', e => { e.preventDefault(); advanceMessage(); });

    // name input
    nameInput.addEventListener('input', () => {
      const raw = nameInput.value.trim();
      const formatted = GameLogic.formatNamePrefix(raw);
      if (formatted && GameLogic.validateNamePrefix(formatted)) {
        namePreview.textContent = formatted + 'paw';
        nameSubmitBtn.disabled = false;
        nameError.textContent = '';
      } else {
        namePreview.textContent = '___paw';
        nameSubmitBtn.disabled = true;
        if (raw.length > 0 && raw.length < 2) nameError.textContent = 'Name must be at least 2 letters';
        else if (raw.length > 0) nameError.textContent = 'Letters only please!';
        else nameError.textContent = '';
      }
    });
    nameSubmitBtn.addEventListener('click', submitName);
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !nameSubmitBtn.disabled) submitName(); });

    // save slot clicks
    document.querySelectorAll('.save-slot-content').forEach(el => {
      el.addEventListener('click', () => { pickSaveSlot(parseInt(el.id.split('-')[2])); });
    });
    document.querySelectorAll('.save-delete-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const slot = parseInt(btn.dataset.slot);
        if (confirm('Delete this save?')) {
          localStorage.removeItem('warriors-save-' + slot);
          refreshSaveSlots();
        }
      });
    });

    // Forest choice buttons (Smudge & Princess warning)
    $('forest-yes-btn').addEventListener('click', () => { playerChoseForest(); });
    $('forest-no-btn').addEventListener('click', () => {
      forestChoiceScreen.classList.add('hidden');
      forestConfirmScreen.classList.remove('hidden');
    });
    $('confirm-go-forest').addEventListener('click', () => { playerChoseForest(); });
    $('confirm-stay-home').addEventListener('click', () => { playerStayedHome(); });

    // HUD Save button — save game immediately
    $('hud-save-btn').addEventListener('click', () => {
      if (gameState === 'playing' || gameState === 'cutscene') {
        saveGame();
        queueMessage('Narrator', 'Game saved!');
      }
    });

    // HUD Saves button — open save management screen mid-game
    $('hud-saves-btn').addEventListener('click', () => {
      if (gameState === 'playing') {
        openSaveManager();
      }
    });

    // HUD Map button — open territory map
    $('hud-map-btn').addEventListener('click', () => {
      if (gameState === 'playing') openMap();
    });
    // Mobile Map button
    if ($('btn-map')) {
      $('btn-map').addEventListener('click', () => {
        if (gameState === 'playing') openMap();
      });
      $('btn-map').addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (gameState === 'playing') openMap();
      });
    }
    // Map close button
    $('map-close-btn').addEventListener('click', closeMap);
    $('map-close-btn').addEventListener('touchstart', e => { e.preventDefault(); closeMap(); });
    // Den leave button
    $('den-leave-btn').addEventListener('click', leaveDen);
    $('den-leave-btn').addEventListener('touchstart', e => { e.preventDefault(); leaveDen(); });

    // Save screen back button — return to game
    $('save-back-btn').addEventListener('click', () => {
      if (saveManagerMode) {
        closeSaveManager();
      }
    });

    // Next Chapter button
    $('next-chapter-btn').addEventListener('click', () => { advanceChapter(); });
    $('next-chapter-btn').addEventListener('touchstart', e => { e.preventDefault(); advanceChapter(); });

    // mobile
    setupMobileControls();

    // Touch camera — drag anywhere on the screen (not on joystick) to look around
    // Tablet gets higher sensitivity since finger movements are bigger on larger screens
    let touchCamId = null, ltx = 0, lty = 0;
    const isTablet = window.innerWidth >= 769;
    const camSensitivity = isTablet ? 0.004 : 0.005;

    renderer.domElement.addEventListener('touchstart', e => {
      if (gameState !== 'playing') return;
      for (const t of e.changedTouches) {
        // Try to talk to a cat by tapping on them
        if (tryTalkByRaycast(t.clientX, t.clientY)) return;
        // Any touch on the canvas that's not on the joystick side = camera
        // On small screens: right 50%; on larger screens: right 55%
        const camZone = window.innerWidth < 480 ? 0.38 : 0.35;
        if (t.clientX > window.innerWidth * camZone) {
          touchCamId = t.identifier;
          ltx = t.clientX;
          lty = t.clientY;
        }
      }
    });
    renderer.domElement.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === touchCamId) {
          cameraAngleY -= (t.clientX - ltx) * camSensitivity;
          cameraAngleX = Math.max(-1.2, Math.min(1.3, cameraAngleX + (t.clientY - lty) * camSensitivity));
          ltx = t.clientX;
          lty = t.clientY;
        }
      }
    });
    renderer.domElement.addEventListener('touchend', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === touchCamId) touchCamId = null;
      }
    });
  }

  function setupMobileControls () {
    const jArea = $('joystick-area'), jStick = $('joystick-stick');
    const bSprint = $('btn-sprint'), bAction = $('btn-action');
    let jTid = null, jCenter = { x: 0, y: 0 };
    // Bigger max joystick distance — more responsive feel; tablets get more range
    const joyMax = (window.innerWidth >= 1024) ? 80 : (window.innerWidth > 768) ? 70 : 50;

    jArea.addEventListener('touchstart', e => {
      e.preventDefault(); const t = e.changedTouches[0]; jTid = t.identifier;
      const r = jArea.getBoundingClientRect(); jCenter = { x: r.left+r.width/2, y: r.top+r.height/2 };
    });
    jArea.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === jTid) {
          let dx = t.clientX - jCenter.x, dy = t.clientY - jCenter.y;
          const d = Math.sqrt(dx*dx+dy*dy), mx = joyMax;
          if (d > mx) { dx = dx/d*mx; dy = dy/d*mx; }
          jStick.style.transform = `translate(${dx}px,${dy}px)`;
          joystickInput.x = dx/mx; joystickInput.z = dy/mx;
        }
      }
    });
    const resetJ = e => { for (const t of e.changedTouches) if (t.identifier === jTid) { jTid = null; jStick.style.transform = 'translate(0,0)'; joystickInput.x = 0; joystickInput.z = 0; } };
    jArea.addEventListener('touchend', resetJ); jArea.addEventListener('touchcancel', resetJ);
    // Sprint is a TOGGLE on mobile — tap to start running, tap again to stop
    // Much easier than holding the button while also using the joystick
    bSprint.addEventListener('touchstart', e => {
      e.preventDefault();
      if (player) {
        player.isSprinting = !player.isSprinting;
        bSprint.style.background = player.isSprinting
          ? 'rgba(60, 130, 200, 0.5)' : '';
        bSprint.style.borderColor = player.isSprinting
          ? 'rgba(100, 200, 255, 0.9)' : '';
      }
    });
    bAction.addEventListener('touchstart', e => {
      e.preventDefault(); initAudio();
      if (denOpen) { leaveDen(); return; }
      // Check intruders first
      if (intruderActive && intruderPatrolAssigned && gameState === 'playing' && confrontIntruder()) return;
      const nearDen = getNearestDen();
      if (nearDen && gameState === 'playing') { enterDen(nearDen); }
      else { talkToNearestCat(); }
    });

    // Jump button
    const bJump = $('btn-jump');
    if (bJump) {
      bJump.addEventListener('touchstart', e => { e.preventDefault(); initAudio(); if (gameState === 'playing' && isOnGround && !isSwimming) playerJump(); });
    }

    // Emote toggle button — shows/hides the emote bar
    const bEmoteToggle = $('btn-emote-toggle');
    if (bEmoteToggle) {
      bEmoteToggle.addEventListener('touchstart', e => {
        e.preventDefault(); initAudio();
        const bar = $('emote-bar');
        if (bar) bar.classList.toggle('hidden');
      });
      bEmoteToggle.addEventListener('click', () => {
        initAudio();
        const bar = $('emote-bar');
        if (bar) bar.classList.toggle('hidden');
      });
    }

    // Emote buttons
    document.querySelectorAll('.emote-btn').forEach(btn => {
      btn.addEventListener('click', () => { initAudio(); triggerEmote(btn.dataset.emote); });
      btn.addEventListener('touchstart', e => { e.preventDefault(); initAudio(); triggerEmote(btn.dataset.emote); });
    });
  }

  /* ====================================================
     NPC INTERACTION (Talk to cats)
     ==================================================== */
  const catDialogue = {
    'Bluestar': [
      '"Remember, young one: fire alone will save our Clan."',
      '"A true warrior fights for what is right, not for glory."',
      '"StarClan watches over us all. Trust in their guidance."',
      '"The forest needs brave cats now more than ever."',
      '"I see great things in your future."',
    ],
    'Lionheart': [
      '"Keep your eyes open and your ears pricked when you\'re in the forest."',
      '"A warrior must be strong, but also wise."',
      '"Never turn your back on a fight, but never fight without reason."',
      '"You\'re learning fast. I\'m proud to be your mentor."',
      '"Always protect your Clanmates. That is the warrior code."',
    ],
    'Graypaw': [
      '"Hey! Want to go hunting later? I bet I can catch more prey than you!"',
      '"Did you hear? Tigerclaw caught a huge rabbit yesterday!"',
      '"Being an apprentice is awesome! Way better than being a kittypet, right?"',
      '"Shh, don\'t tell anyone, but I swiped an extra mouse from the fresh-kill pile!"',
      '"You\'re my best friend, you know that?"',
    ],
    'Tigerclaw': [
      '"Hmph. A kittypet will never truly be a warrior."',
      '"Don\'t get in my way."',
      '"I have my eye on you..."',
      '"ThunderClan needs strong cats, not soft ones."',
    ],
    'Whitestorm': [
      '"The forest is peaceful today. Enjoy it while it lasts."',
      '"I remember when Bluestar was just a young warrior. Time moves fast."',
      '"Respect your elders, young one. They have much to teach."',
    ],
    'Spottedleaf': [
      '"Come to me if you\'re ever hurt. I have herbs that can help."',
      '"StarClan speaks to me in dreams... I sense great things ahead."',
      '"Be careful out there. The forest holds many dangers."',
    ],
    'Dustpaw': [
      '"I bet I can beat you in a fight any day."',
      '"Don\'t think you\'re special just because Bluestar chose you."',
      '"Hmph. I was here first, kittypet."',
    ],
    'Sandpaw': [
      '"You\'re not bad... for a kittypet."',
      '"Keep up if you can!"',
      '"Maybe you\'ll make a decent warrior one day. Maybe."',
    ],
    'Ravenpaw': [
      '"H-hey... can I tell you something? I... never mind."',
      '"I saw something terrible at Sunningrocks... but I can\'t talk about it here. Tigerclaw might hear."',
      '"Tigerclaw scares me... don\'t tell anyone I said that!"',
      '"It wasn\'t Oakheart who killed Redtail... I saw... I saw what really happened. But please, don\'t tell Tigerclaw I told you!"',
      '"I have to get away from here. Tigerclaw knows I saw everything. I\'m not safe..."',
      '"Please... you have to believe me. Tigerclaw is not what he seems."',
    ],
    'Darkstripe': [
      '"What do you want, kittypet?"',
      '"Tigerclaw is the greatest warrior in the Clan. You\'d do well to remember that."',
      '"I\'m watching you..."',
    ],
    'Mousefur': [
      '"When I was your age, we didn\'t stand around chatting. Get to work!"',
      '"The borders need checking. Always."',
    ],
    'Yellowfang': [
      '"What are you staring at, mouse-brain?"',
      '"Ugh, my old bones ache. Fetch me some mouse bile, would you?"',
      '"I wasn\'t always a medicine cat, you know. I was a fierce warrior once."',
    ],
    'Longtail': [
      '"A kittypet doesn\'t belong in ThunderClan."',
      '"Bluestar made a mistake bringing you here."',
      '"Stay out of my way."',
    ],
    'Smudge': [
      '"Rusty! Why did you go into the forest? It\'s so scary out there!"',
      '"I miss you! Come home soon, okay?"',
      '"The Twoleg gave me extra food today! I saved some for you!"',
    ],
    'Princess': [
      '"Oh, Rusty! I\'m so glad you\'re okay!"',
      '"Tell me all about the wild cats! Is it exciting?"',
      '"Be safe out there, okay? I worry about you."',
    ],
    // Queens
    'Frostfur': [
      '"Keep your voice down — the kits just fell asleep!"',
      '"My kits are the most beautiful in all of ThunderClan. Don\'t you agree?"',
      '"If anything ever happened to my kits, I don\'t know what I\'d do."',
      '"Being a queen is hard work, but I wouldn\'t trade it for the world."',
      '"Stay away from my kits if you\'re going to track mud everywhere!"',
      '"Cinderkit is always getting into trouble. She has so much energy!"',
    ],
    'Brindleface': [
      '"Hello, dear. Would you like to sit with us for a while?"',
      '"The nursery is always warm. The kits make sure of that!"',
      '"Ashkit is so shy, but Fernkit is bold enough for both of them."',
      '"I hope my kits grow up to be strong warriors."',
      '"There\'s nothing more precious than a sleeping kit."',
    ],
    'Goldenflower': [
      '"It\'s a beautiful day. The kits will want to play outside."',
      '"I keep the nursery tidy. It\'s important for the kits."',
      '"Would you mind bringing some fresh moss for the nests?"',
      '"The kits love hearing stories about brave warriors."',
    ],
    // Kits
    'Cinderkit': [
      '"I\'m gonna be the BEST warrior ever! Watch me pounce!"',
      '"Can you teach me some fighting moves? Pleeeease?"',
      '"I bet I could beat Brackenkit in a race! Wanna see?"',
      '"When I\'m a warrior, I\'m gonna catch the biggest prey EVER!"',
      '"Frostfur says I have to stay near the nursery. Boring!"',
    ],
    'Brackenkit': [
      '"I was pretending to hunt a mouse! Did you see?"',
      '"Thornkit and I are playing warriors! He\'s the enemy and I\'m the hero!"',
      '"When can I leave camp? I want to see the whole forest!"',
      '"I\'m going to be the bravest warrior in all the Clans!"',
    ],
    'Brightkit': [
      '"Look at my paws! Frostfur says they\'re the whitest in the Clan!"',
      '"Do you want to play with us? You can be the fox!"',
      '"I had the BEST dream last night! StarClan was in it!"',
      '"Cinderkit dared me to touch the Highrock. Should I do it?"',
    ],
    'Thornkit': [
      '"Rrraawr! I\'m a fierce warrior! Fear me!"',
      '"I pounced on Brackenkit\'s tail! He didn\'t even see me coming!"',
      '"I don\'t need a mentor. I already know everything!"',
      '"When I grow up, I want to be just like Tigerclaw! He\'s so strong!"',
    ],
    'Ashkit': [
      '"H-hello... I\'m Ashkit..."',
      '"Fernkit keeps pushing me around... but don\'t tell anyone."',
      '"Do you think I\'ll make a good warrior? I\'m kind of small..."',
      '"I like watching the warriors from the nursery. They\'re so brave."',
    ],
    'Fernkit': [
      '"Come play with us! We\'re making a den out of leaves!"',
      '"I found a feather! Look, isn\'t it pretty?"',
      '"Ashkit is being boring again. Ashkit, come PLAY!"',
      '"I want to go outside the camp! Can you take us? Please?"',
    ],
    'Yellowfang': [
      '"Stop hovering, kit. I\'m fine. Go catch a mouse or something useful."',
      '"Brokenstar is a fool and a tyrant. ShadowClan deserves better."',
      '"Hmph. You\'re not as useless as most ThunderClan cats. Don\'t let it go to your head."',
      '"These herbs need sorting. Juniper berries for bellyache, cobwebs for wounds. Pay attention!"',
      '"I was ShadowClan\'s medicine cat for many moons. I know things that would make your fur stand on end."',
      '"Don\'t give me that look. I may be old but I can still cuff your ears."',
      '"StarClan speaks to me in my dreams... they say dark times are coming."',
    ],
  };

  let lastTalkTime = 0;
  const TALK_COOLDOWN = 2000; // ms between talks
  const TALK_RANGE = 5; // distance to talk

  function talkToNearestCat () {
    if (gameState !== 'playing' || !player) return;
    if (messageBox.classList.contains('visible')) return; // already in conversation
    if (Date.now() - lastTalkTime < TALK_COOLDOWN) return;

    // Try to catch training prey first
    if (trainingPrey && trainingPrey.alive && tryToCatchPrey()) {
      lastTalkTime = Date.now();
      return;
    }

    // Find the nearest visible NPC cat in range
    let nearest = null, nearestDist = TALK_RANGE;
    for (const npc of npcCats) {
      if (!npc.group.visible) continue;
      const dx = npc.group.position.x - player.position.x;
      const dz = npc.group.position.z - player.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = npc;
      }
    }

    if (!nearest) {
      // Check for Twolegs nearby
      if (talkToNearestTwoleg()) {
        lastTalkTime = Date.now();
        return;
      }
      queueMessage('Narrator', 'There\'s no one close enough to talk to. Walk closer to a cat!');
      lastTalkTime = Date.now();
      return;
    }

    talkToCat(nearest);
  }

  function talkToCat (npc) {
    if (!npc) return;
    lastTalkTime = Date.now();

    const displayName = knownCats.has(npc.name) ? npc.name : '???';

    // Dynamic dialogue based on context
    let line;
    if (intruderActive && clanPatrollers.includes(npc.name) && npc.ai && npc.ai.task === 'intruder_patrol') {
      // On intruder patrol — context-specific dialogue
      const patrolLines = [
        '"Stay alert! I can smell them nearby. Those trespassers won\'t get away!"',
        '"Bluestar sent us for a reason. Let\'s find those intruders and drive them out!"',
        '"I think they went this way. Keep your eyes peeled!"',
        '"No enemy cat sets paw on ThunderClan territory and gets away with it!"',
        '"We\'ll show them what happens when you mess with ThunderClan!"',
        '"I\'ve got their scent. They\'re close — be ready for a fight!"',
        '"This is OUR territory. Time to remind them of that!"',
        '"Stick together. We\'re stronger as a patrol!"',
      ];
      line = patrolLines[Math.floor(Math.random() * patrolLines.length)];
    } else if ((npc.name === 'Spottedleaf' || npc.name === 'Yellowfang') && player.health < player.maxHealth) {
      // Medicine cat healing — if player is hurt, offer to heal
      const isMedCat = npc.name === 'Spottedleaf' || (npc.name === 'Yellowfang' && npc.ai && npc.ai.role === 'medicine');
      if (isMedCat) {
        const pName = player.name || 'Firepaw';
        const hpPercent = Math.round((player.health / player.maxHealth) * 100);

        // Make the cat face the player
        npc.group.lookAt(player.position.x, 0, player.position.z);
        const dx2 = npc.group.position.x - player.position.x;
        const dz2 = npc.group.position.z - player.position.z;
        catGroup.rotation.y = Math.atan2(dx2, dz2);

        if (hpPercent < 30) {
          // Very hurt
          queueMessage(displayName, '"Great StarClan, ' + pName + '! You look terrible! Hold still — let me treat those wounds right away."', () => {
            queueMessage(displayName, '"Here, chew these herbs. Cobwebs for the bleeding, marigold for infection..."', () => {
              const healed = player.maxHealth - player.health;
              player.health = player.maxHealth;
              playSound('eat');
              queueMessage('Narrator', npc.name + ' carefully treats your wounds with herbs. You feel much better! (+' + healed + ' HP)');
            });
          });
        } else if (hpPercent < 70) {
          // Moderately hurt
          queueMessage(displayName, '"You\'ve got some scratches there, ' + pName + '. Come, let me patch you up."', () => {
            const healed = player.maxHealth - player.health;
            player.health = player.maxHealth;
            playSound('eat');
            queueMessage('Narrator', npc.name + ' applies herbs to your wounds. Fully healed! (+' + healed + ' HP)');
          });
        } else {
          // Just a little hurt
          queueMessage(displayName, '"Just a few scrapes? Here, let me fix that up quickly."', () => {
            const healed = player.maxHealth - player.health;
            player.health = player.maxHealth;
            playSound('eat');
            queueMessage('Narrator', npc.name + ' treats your minor wounds. Good as new! (+' + healed + ' HP)');
          });
        }
        playCatVoice(npc.name);
        return;
      }
      // Yellowfang as elder — just normal dialogue
      const lines = catDialogue[npc.name] || ['"..."'];
      line = lines[Math.floor(Math.random() * lines.length)];
    } else if (npc.name === 'Smudge' || npc.name === 'Princess') {
      line = getKittypetDialogue(npc.name);
    } else {
      const lines = catDialogue[npc.name] || ['"..."'];
      line = lines[Math.floor(Math.random() * lines.length)];
    }

    // Make the cat face the player
    npc.group.lookAt(player.position.x, 0, player.position.z);

    // Make the player face the cat
    const dx = npc.group.position.x - player.position.x;
    const dz = npc.group.position.z - player.position.z;
    const angle = Math.atan2(dx, dz);
    catGroup.rotation.y = angle;

    queueMessage(displayName, line);
    playCatVoice(npc.name);
  }

  /**
   * Dynamic dialogue for Smudge and Princess.
   * Smudge gets more scared the longer you've been a wildcat.
   * Princess is always happy to see you.
   */
  function getKittypetDialogue (catName) {
    const pName = (player && player.name) ? player.name : 'Rusty';
    // battlesWon is a rough measure of how wild the player has become
    const battles = (player && player.battlesWon) || 0;
    const level = (player && player.level) || 1;
    const wildness = battles + level; // higher = more wild

    if (catName === 'Smudge') {
      // Smudge gets increasingly scared the wilder you become
      if (wildness <= 2) {
        // Early: Smudge is just a worried friend
        const lines = [
          '"' + pName + '! You came back! I was so worried about you!"',
          '"The forest sounds so scary at night... are you okay out there?"',
          '"I saved you some of my food! The Twolegs gave me extra today!"',
          '"Why did you leave? It\'s so warm and safe here..."',
          '"I had a dream about mice last night. Do you actually catch real ones now?!"',
        ];
        return lines[Math.floor(Math.random() * lines.length)];
      } else if (wildness <= 5) {
        // Mid: Smudge is nervous around you
        const lines = [
          '"' + pName + '...? You smell... different. Like the forest. And... blood?"',
          '"Y-you look different. More... wild. Your eyes are sharper somehow."',
          '"I heard fighting in the forest last night! Was that you?! Are you okay?!"',
          '"The other kittypets are scared of you now. They say you fight wild cats..."',
          '"Do you... do you still remember being a house cat? Being Rusty?"',
          '"Please be careful... I don\'t want to lose my best friend."',
        ];
        return lines[Math.floor(Math.random() * lines.length)];
      } else if (wildness <= 10) {
        // Late: Smudge is properly scared
        const lines = [
          '"' + pName + '?! Oh no... y-you startled me! You move so quietly now..."',
          '"You have SCARS! Real scars! What happened to you out there?!"',
          '"I-I can barely recognize you... you used to be Rusty, my friend..."',
          '"P-please don\'t bring any of those wild cats here... they terrify me!"',
          '"You smell like blood and forest and... I don\'t even know. It\'s scary."',
          '"I hide under the bed when I hear yowling from the forest now..."',
        ];
        return lines[Math.floor(Math.random() * lines.length)];
      } else {
        // Very late: Smudge is terrified
        const lines = [
          '"' + pName + '?! *jumps back* D-don\'t sneak up on me like that!"',
          '"You... you\'re not really Rusty anymore, are you? You\'re a wild cat now..."',
          '"I can see it in your eyes... you\'ve seen things. Done things. I-I\'m scared..."',
          '"PLEASE don\'t hurt me! I-I know you wouldn\'t but... you look so fierce now!"',
          '"*trembling* The other kittypets won\'t even come near the fence anymore because of you..."',
          '"I miss the old Rusty... the one who shared my food bowl and slept on the windowsill..."',
          '"Y-your claws... they\'re so long now. And sharp. Please keep them sheathed around me..."',
        ];
        return lines[Math.floor(Math.random() * lines.length)];
      }
    }

    if (catName === 'Princess') {
      // Princess is ALWAYS happy and excited to see you, no matter what
      const lines = [
        '"' + pName + '!! Oh my gosh, you\'re here! I\'m SO happy to see you!"',
        '"Tell me EVERYTHING! Did you catch any mice? Did you fight any cats? Tell me, tell me!"',
        '"You look so STRONG and brave now! I\'m so proud of you!"',
        '"I tell all the other kittypets about my sibling the wild cat warrior! They don\'t believe me!"',
        '"Do the other warrior cats like you? Do you have friends? I bet everyone loves you!"',
        '"I wish I could come visit your camp! But I\'m too scared of the forest... Is it beautiful?"',
        '"You smell like pine trees and wind! That\'s so much better than Twoleg house smell!"',
        '"I had KITS! Can you believe it?! Maybe one day one of them could join your Clan too!"',
        '"Every time I hear cats in the forest at night, I think of you and hope you\'re safe!"',
        '"You\'re the bravest cat I know, ' + pName + '! I love you so much! Come visit again soon!"',
        '"Look at your fur! It\'s all ruffled and wild! I think it looks AMAZING!"',
        '"Are the stars really the spirits of dead warrior cats? That\'s so beautiful and scary!"',
      ];
      return lines[Math.floor(Math.random() * lines.length)];
    }

    return '"..."';
  }

  function tryTalkByRaycast (clientX, clientY) {
    if (gameState !== 'playing' || !player) return false;
    if (messageBox.classList.contains('visible')) return false;
    if (Date.now() - lastTalkTime < TALK_COOLDOWN) return false;

    // Raycast from click position
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Check each visible NPC group
    for (const npc of npcCats) {
      if (!npc.group.visible) continue;
      const dx = npc.group.position.x - player.position.x;
      const dz = npc.group.position.z - player.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > TALK_RANGE) continue;

      // Test against all meshes in the NPC group
      const hits = raycaster.intersectObjects(npc.group.children, true);
      if (hits.length > 0) {
        talkToCat(npc);
        return true;
      }
    }
    return false;
  }

  /* ====================================================
     SAVE SLOTS
     ==================================================== */
  let saveManagerMode = false; // true when viewing saves mid-game (not from title screen)
  let savedGameState = null;   // preserve game state when opening save manager

  function goToSaveScreen () {
    gameState = 'saves';
    saveManagerMode = false;
    titleScreen.classList.add('hidden');
    saveScreen.classList.remove('hidden');
    $('save-screen-title').textContent = 'Choose a Save';
    $('save-back-btn').classList.add('hidden');
    refreshSaveSlots();
  }

  /** Open save manager mid-game — view and delete saves without leaving the game */
  function openSaveManager () {
    savedGameState = gameState;
    gameState = 'saves';
    saveManagerMode = true;
    saveScreen.classList.remove('hidden');
    $('save-screen-title').textContent = 'Your Saves';
    $('save-back-btn').classList.remove('hidden');
    refreshSaveSlots();
  }

  /** Close save manager and return to game */
  function closeSaveManager () {
    saveScreen.classList.add('hidden');
    gameState = savedGameState || 'playing';
    saveManagerMode = false;
    savedGameState = null;
  }

  function refreshSaveSlots () {
    for (let i = 1; i <= 3; i++) {
      const data = loadGame(i);
      const el = $('save-slot-' + i);
      const delBtn = document.querySelector(`.save-delete-btn[data-slot="${i}"]`);
      if (data && data.player) {
        const p = data.player;
        el.querySelector('.save-slot-label').textContent = 'Save ' + i + ' - Continue';
        // Friendly story phase label
        const phaseLabels = {
          house: 'At the Twoleg House', forest: 'Exploring the Forest',
          met_graypaw: 'Met a Forest Cat', fought_graypaw: 'Forest Encounter',
          met_bluestar: 'Meeting the Clan Leader', named: 'Naming Ceremony',
          training: 'Apprentice Training', playing: 'Warrior Life'
        };
        const phaseLabel = phaseLabels[data.storyPhase] || 'Adventure';
        // Time ago
        let timeStr = '';
        if (data.savedAt) {
          const ago = Date.now() - data.savedAt;
          if (ago < 60000) timeStr = 'just now';
          else if (ago < 3600000) timeStr = Math.floor(ago / 60000) + 'm ago';
          else if (ago < 86400000) timeStr = Math.floor(ago / 3600000) + 'h ago';
          else timeStr = Math.floor(ago / 86400000) + 'd ago';
        }
        // Chapter info
        let chapterStr = '';
        if (data.storyPhase === 'playing' && data.storyChapter !== undefined) {
          const chapIdx = data.storyChapter;
          if (chapIdx > 0 && chapIdx <= STORY_CHAPTERS.length) {
            chapterStr = ' &bull; Ch.' + chapIdx;
          } else if (chapIdx === 0) {
            chapterStr = ' &bull; Free Roam';
          }
        }
        el.querySelector('.save-slot-info').innerHTML =
          '<span class="save-name">' + (p.name || 'Firepaw') + '</span><br>' +
          '<span class="save-detail">Lvl ' + (p.level || 1) + ' &bull; ' + phaseLabel +
          chapterStr + (timeStr ? ' &bull; ' + timeStr : '') + '</span>';
        delBtn.classList.remove('hidden');
        continue;
      }
      el.querySelector('.save-slot-label').textContent = 'Save ' + i;
      el.querySelector('.save-slot-info').textContent = '- New Game -';
      delBtn.classList.add('hidden');
    }
  }

  function pickSaveSlot (slot) {
    // If we're just viewing saves mid-game, don't load — just close the manager
    if (saveManagerMode) {
      closeSaveManager();
      return;
    }
    activeSaveSlot = slot;
    let data;
    try {
      data = loadGame(slot);
    } catch (e) {
      console.error('Failed to load save slot', slot, e);
      localStorage.removeItem('warriors-save-' + slot);
      data = null;
    }
    if (data && data.player) {
      player = data.player;
      // Ensure player has required fields (backward compatibility)
      if (!player.speed) player.speed = 5;
      if (!player.sprintSpeed) player.sprintSpeed = 9;
      if (!player.health) player.health = 100;
      if (!player.maxHealth) player.maxHealth = 100;
      if (!player.energy) player.energy = 100;
      if (!player.maxEnergy) player.maxEnergy = 100;
      if (!player.position) player.position = { x: 0, z: 0 };
      storyPhase = data.storyPhase || 'playing';
      fenceWarningTriggered = data.fenceWarningTriggered || false;
      graypawEncounterTriggered = data.graypawEncounterTriggered !== false;
      bluestarEncounterTriggered = data.bluestarEncounterTriggered !== false;
      redtailEventTriggered = data.redtailEventTriggered !== false;
      mothermouthTriggered = data.mothermouthTriggered || false;
      mothermouthTimer = data.mothermouthTimer || 0;
      yellowfangEncounterTriggered = data.yellowfangEncounterTriggered || false;
      storyChapter = data.storyChapter || 0;
      scentMarkerWarned = data.scentMarkerWarned || {};
      playingTimer = data.playingTimer || 0;
      gameTime = data.gameTime || 0;
      // Restore known cats
      if (data.knownCats && data.knownCats.length > 0) {
        data.knownCats.forEach(n => knownCats.add(n));
      } else {
        // Old save format - reveal all known cats (NOT Yellowfang — story-locked)
        ['Bluestar','Lionheart','Graypaw','Whitestorm','Dustpaw','Sandpaw',
         'Mousefur','Darkstripe','Ravenpaw','Spottedleaf','Tigerclaw',
         'Smudge','Princess'].forEach(n => knownCats.add(n));
      }
      // Update name labels for all known cats
      npcCats.forEach(c => {
        if (knownCats.has(c.name) && c.label) {
          updateNameLabel(c);
        }
      });
      saveScreen.classList.add('hidden');

      // Resume from the correct story phase
      if (storyPhase === 'house' || storyPhase === 'forest') {
        startExploring(); // Restart from Twoleg house
      } else if (storyPhase === 'training') {
        startTraining(); // Resume training
      } else {
        startPlaying(); // Free roam
      }
      return;
    }
    // New game → opening cutscene
    player = GameLogic.createPlayer('Fire');
    saveScreen.classList.add('hidden');
    startOpeningCutscene();
  }

  /** Update a cat's name label to show their real name */
  function updateNameLabel (npc) {
    if (!npc || !npc.label || !npc.group) return;
    // Remove old label and make a new one
    npc.group.remove(npc.label);
    const newLabel = makeNameLabel(npc.name, (npc.data.size || 1) * 1.45);
    npc.group.add(newLabel);
    npc.label = newLabel;
  }

  /* ====================================================
     CUTSCENE SYSTEM — Cinematic with typewriter & transitions
     ==================================================== */
  let typewriterInterval = null;
  let typewriterDone = false;
  let typewriterFullHTML = '';
  let cutsceneCamLerp = null; // for smooth camera transitions

  // Cat emoji / icon mapping for speaker portraits
  const speakerIcons = {
    'Bluestar':   '🐱', 'Lionheart':  '🦁', 'Tigerclaw':  '🐯',
    'Spottedleaf':'🌸', 'Whitestorm': '⚪', 'Graypaw':    '🐺',
    'Ravenpaw':   '🖤', 'Dustpaw':    '🟤', 'Sandpaw':    '🟡',
    'Darkstripe': '🐱', 'Longtail':   '🐱', 'Yellowfang': '🟠',
    'Smudge':     '🐱', 'Princess':   '👑', 'Narrator':   '📖',
  };

  function startCutscene (scenes, onDone) {
    gameState = 'cutscene';
    hideNextChapterButton();
    if (catGroup) catGroup.visible = true;
    setCatFirstPerson(false);
    cutsceneQueue = scenes.slice();
    cutsceneOverlay.classList.remove('hidden');
    cutsceneOverlay._onDone = onDone;
    showCutsceneSlide();
  }

  function showCutsceneSlide () {
    if (cutsceneQueue.length === 0) {
      // Clean up
      if (typewriterInterval) { clearInterval(typewriterInterval); typewriterInterval = null; }
      cutsceneCamLerp = null;
      cutsceneOverlay.classList.add('hidden');
      const speakerIcon = $('cutscene-speaker-icon');
      if (speakerIcon) speakerIcon.classList.remove('visible');
      if (cutsceneOverlay._onDone) cutsceneOverlay._onDone();
      return;
    }

    const slide = cutsceneQueue[0];
    const speakerIcon = $('cutscene-speaker-icon');

    // --- Speaker portrait icon ---
    if (speakerIcon) {
      if (slide.speaker) {
        speakerIcon.textContent = speakerIcons[slide.speaker] || '🐱';
        speakerIcon.classList.remove('narration-icon');
        speakerIcon.classList.add('visible');
      } else if (slide.narration) {
        speakerIcon.textContent = '✨';
        speakerIcon.classList.add('narration-icon');
        speakerIcon.classList.add('visible');
      } else {
        speakerIcon.classList.remove('visible');
      }
    }

    // --- Title slide styling ---
    const isTitle = slide.text && (slide.text.includes('WARRIOR CATS') || slide.text.includes('INTO THE WILD'));
    if (isTitle) {
      cutsceneText.classList.add('title-slide');
    } else {
      cutsceneText.classList.remove('title-slide');
    }

    // --- Build HTML (but don't show it all at once — typewriter!) ---
    let speakerHTML = '';
    let bodyText = '';
    if (slide.speaker) {
      speakerHTML = '<span class="speaker">' + slide.speaker + '</span>';
      bodyText = slide.text;
    } else if (slide.narration) {
      bodyText = '<span class="narration">' + slide.text + '</span>';
    } else {
      bodyText = slide.text;
    }

    // Store full HTML for skip-ahead
    typewriterFullHTML = speakerHTML + bodyText;
    typewriterDone = false;

    // --- Typewriter effect ---
    if (typewriterInterval) clearInterval(typewriterInterval);

    // Extract plain text from body for typewriter (handle HTML tags gracefully)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = bodyText;
    const plainText = tempDiv.textContent || tempDiv.innerText || '';

    // Show speaker name immediately, type out the body
    let charIdx = 0;
    const typeSpeed = slide.narration ? 28 : 22; // ms per character (narration slightly slower)

    // Start with speaker name + cursor
    cutsceneText.innerHTML = speakerHTML + '<span class="typewriter-body"></span><span class="typewriter-cursor"></span>';
    const bodyEl = cutsceneText.querySelector('.typewriter-body');

    typewriterInterval = setInterval(() => {
      if (charIdx >= plainText.length) {
        clearInterval(typewriterInterval);
        typewriterInterval = null;
        typewriterDone = true;
        // Replace with full HTML (includes formatting like <strong>, <em>)
        cutsceneText.innerHTML = typewriterFullHTML;
        return;
      }
      charIdx++;
      // Show characters up to charIdx (plain text, preserving spaces)
      if (bodyEl) bodyEl.textContent = plainText.substring(0, charIdx);

      // Soft typing sound every few characters
      if (charIdx % 3 === 0 && audioCtx) {
        try {
          const osc = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          osc.connect(g); g.connect(_out());
          osc.type = 'sine';
          osc.frequency.value = 800 + Math.random() * 400;
          g.gain.value = 0.008;
          osc.start(); osc.stop(audioCtx.currentTime + 0.02);
        } catch (e) {}
      }
    }, typeSpeed);

    // --- Smooth camera transition ---
    if (slide.camPos || slide.camLook) {
      const startPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
      const endPos = slide.camPos || startPos;

      // Compute target quaternion for lookAt
      const startQuat = camera.quaternion.clone();
      if (slide.camLook) {
        const tmpCam = camera.clone();
        tmpCam.position.set(endPos.x, endPos.y, endPos.z);
        tmpCam.lookAt(new THREE.Vector3(slide.camLook.x, slide.camLook.y, slide.camLook.z));
        var endQuat = tmpCam.quaternion.clone();
      } else {
        var endQuat = startQuat.clone();
      }

      cutsceneCamLerp = {
        startPos, endPos,
        startQuat, endQuat,
        t: 0,
        duration: 0.8 // seconds
      };
    } else {
      cutsceneCamLerp = null;
    }

    // Play cat voice for speaker
    if (slide.speaker) {
      playCatVoice(slide.speaker);
    } else if (slide.narration) {
      playWindRustle();
    }

    // Optional callback when this slide is first shown (e.g. night/day transitions)
    if (slide.onShow) {
      try { slide.onShow(); } catch (e) {}
    }
  }

  /** Called every frame to smoothly animate the camera during cutscenes */
  function updateCutsceneCamera (dt) {
    if (!cutsceneCamLerp) return;
    const lerp = cutsceneCamLerp;
    lerp.t += dt / lerp.duration;
    if (lerp.t >= 1) {
      lerp.t = 1;
      camera.position.set(lerp.endPos.x, lerp.endPos.y, lerp.endPos.z);
      camera.quaternion.copy(lerp.endQuat);
      cutsceneCamLerp = null;
      return;
    }
    // Smooth ease (cubic ease-in-out)
    const e = lerp.t < 0.5 ? 4 * lerp.t * lerp.t * lerp.t : 1 - Math.pow(-2 * lerp.t + 2, 3) / 2;
    camera.position.set(
      lerp.startPos.x + (lerp.endPos.x - lerp.startPos.x) * e,
      lerp.startPos.y + (lerp.endPos.y - lerp.startPos.y) * e,
      lerp.startPos.z + (lerp.endPos.z - lerp.startPos.z) * e
    );
    camera.quaternion.slerpQuaternions(lerp.startQuat, lerp.endQuat, e);
  }

  let lastCutsceneAdvance = 0;
  function advanceCutscene () {
    const now = Date.now();
    if (now - lastCutsceneAdvance < 300) return;
    lastCutsceneAdvance = now;

    // If typewriter is still typing, skip to full text first
    if (!typewriterDone && typewriterInterval) {
      clearInterval(typewriterInterval);
      typewriterInterval = null;
      typewriterDone = true;
      cutsceneText.innerHTML = typewriterFullHTML;
      // Also snap camera to final position
      if (cutsceneCamLerp) {
        camera.position.set(cutsceneCamLerp.endPos.x, cutsceneCamLerp.endPos.y, cutsceneCamLerp.endPos.z);
        camera.quaternion.copy(cutsceneCamLerp.endQuat);
        cutsceneCamLerp = null;
      }
      return; // First tap = finish text; second tap = next slide
    }

    cutsceneQueue.shift();
    showCutsceneSlide();
  }

  /* ====================================================
     OPENING CUTSCENE  (Into the Wild intro)
     ==================================================== */
  function startOpeningCutscene () {
    // Position NPC cats for the prologue scene
    // Place Tigerclaw, Bluestar, Spottedleaf in camp for the prologue shots
    const tc = npcCats.find(c => c.name === 'Tigerclaw');
    const bs = npcCats.find(c => c.name === 'Bluestar');
    const sl = npcCats.find(c => c.name === 'Spottedleaf');
    const lh = npcCats.find(c => c.name === 'Lionheart');
    const wh = npcCats.find(c => c.name === 'Whitestorm');

    // Make them visible for the cutscene
    if (tc) { tc.group.visible = true; tc.group.position.set(30, 0, -30); }
    if (bs) { bs.group.visible = true; bs.group.position.set(-3, 3.3, -4); } // on Highrock
    if (sl) { sl.group.visible = true; sl.group.position.set(-10, 0, 3); }
    if (lh) { lh.group.visible = true; lh.group.position.set(2, 0, -2); }
    if (wh) { wh.group.visible = true; wh.group.position.set(4, 0, -1); }

    // Hide the player cat during the prologue
    catGroup.visible = false;

    const scenes = [
      // --- PROLOGUE: The Battle (night) ---
      { narration: true, text: '<strong>WARRIOR CATS: INTO THE WILD</strong><br><br><em>The Prophecy Begins...</em>',
        camPos: { x: 0, y: 25, z: 55 }, camLook: { x: 0, y: 0, z: 0 },
        onShow: function () { setNightMode(); } },

      { narration: true, text: 'The forest is dark. Moonlight filters through the canopy as the sounds of battle echo through the trees...',
        camPos: { x: 35, y: 3, z: -28 }, camLook: { x: 30, y: 1, z: -30 } },

      { narration: true, text: 'A massive dark tabby tom slashes through the undergrowth, his claws gleaming in the moonlight. This is <strong>Tigerclaw</strong>, ThunderClan\'s most fearsome warrior.',
        camPos: { x: 32, y: 2, z: -28 }, camLook: { x: 30, y: 1, z: -30 } },

      { narration: true, text: 'RiverClan warriors have been driven back from Sunningrocks. Tigerclaw lets out a triumphant yowl. The battle is won... but at a terrible cost.',
        camPos: { x: 28, y: 4, z: -32 }, camLook: { x: 30, y: 1, z: -30 } },

      { narration: true, text: 'ThunderClan has lost another warrior. The Clan is weaker than it has been in many moons...',
        camPos: { x: 0, y: 8, z: 10 }, camLook: { x: 0, y: 2, z: -4 } },

      // --- PROLOGUE: Bluestar on Highrock ---
      { narration: true, text: 'At ThunderClan camp, Bluestar stands atop the Highrock, her blue-gray fur silver in the moonlight. Her eyes are troubled.',
        camPos: { x: 2, y: 4, z: 0 }, camLook: { x: -3, y: 3.5, z: -4 } },

      { speaker: 'Bluestar', text: '"We cannot go on like this. ThunderClan grows weaker with each passing moon. We need more warriors."',
        camPos: { x: -1, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.5, z: -4 } },

      { speaker: 'Lionheart', text: '"ShadowClan senses our weakness, Bluestar. Brokenstar grows bolder every day."',
        camPos: { x: 3, y: 2, z: -1 }, camLook: { x: 2, y: 1, z: -2 } },

      { speaker: 'Bluestar', text: '"I know. And Tigerclaw... he fights well, but I worry about his ambition. I need cats I can trust."',
        camPos: { x: -1, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.5, z: -4 } },

      // --- PROLOGUE: Spottedleaf's Prophecy ---
      { narration: true, text: 'Later that night, in the Medicine Den, Spottedleaf stares up at the stars of Silverpelt. Her eyes grow wide...',
        camPos: { x: -8, y: 2, z: 5 }, camLook: { x: -10, y: 1, z: 3 } },

      { speaker: 'Spottedleaf', text: '"Bluestar... StarClan has spoken to me. I have received a prophecy."',
        camPos: { x: -7, y: 2, z: 4 }, camLook: { x: -10, y: 1, z: 3 } },

      { speaker: 'Bluestar', text: '"A prophecy? What did they say, Spottedleaf?"',
        camPos: { x: -5, y: 3, z: 2 }, camLook: { x: -3, y: 3.3, z: -4 } },

      { speaker: 'Spottedleaf', text: '<span class="prophecy">"Fire alone will save our Clan."</span>',
        camPos: { x: -9, y: 2.5, z: 4 }, camLook: { x: -10, y: 1.2, z: 3 } },

      { speaker: 'Bluestar', text: '"Fire? But fire is the enemy of every Clan... How can fire save us?"',
        camPos: { x: -5, y: 3, z: 1 }, camLook: { x: -3, y: 3.3, z: -4 } },

      { speaker: 'Spottedleaf', text: '"I do not know, Bluestar. But StarClan does not lie. We must trust in their wisdom and watch for the sign."',
        camPos: { x: -8, y: 2, z: 5 }, camLook: { x: -10, y: 1, z: 3 } },

      { narration: true, text: 'Bluestar gazes out toward the forest beyond the camp walls. Somewhere out there, the answer is waiting...',
        camPos: { x: -2, y: 4, z: 3 }, camLook: { x: 0, y: 2, z: 60 } },

      // --- TRANSITION: To Rusty ---
      { narration: true, text: 'Meanwhile, beyond the forest... at the edge of the Twoleg neighborhood...',
        camPos: { x: 0, y: 10, z: 70 }, camLook: { x: 0, y: 2, z: 82 } },

      { narration: true, text: 'A young ginger cat sits on the windowsill of his Twoleg house, gazing at the dark forest. His name is <strong>Rusty</strong>.',
        camPos: { x: 3, y: 3, z: 84 }, camLook: { x: 0, y: 1, z: 82 } },

      { narration: true, text: 'Every night he dreams of hunting in the forest - the thrill of the chase, the wind in his fur. Something out there is calling to him...',
        camPos: { x: -5, y: 4, z: 78 }, camLook: { x: 0, y: 1, z: 60 } },

      { narration: true, text: 'Tonight, he has decided. He will leave the garden, cross the fence, and discover what lies beyond.',
        camPos: { x: 0, y: 3, z: 72 }, camLook: { x: 0, y: 1, z: 68 } },

      { narration: true, text: '<em>Your adventure begins now. Walk to the garden fence and cross into the forest...</em>',
        camPos: { x: 2, y: 2, z: 82 }, camLook: { x: 0, y: 0.5, z: 80 } },
    ];

    startCutscene(scenes, () => {
      setDayMode(); // restore daytime for gameplay
      // Hide all NPCs and start the exploring phase
      npcCats.forEach(c => { c.group.visible = false; });
      startExploring();
    });
  }

  /* ====================================================
     EXPLORING PHASE (Rusty leaves the house)
     ==================================================== */
  let storyPhase = 'house'; // house | forest | met_graypaw | fought_graypaw | met_bluestar | named | training | playing
  let fenceWarningTriggered = false;
  let graypawEncounterTriggered = false;
  let bluestarEncounterTriggered = false;
  let redtailEventTriggered = false;
  let playingTimer = 0; // counts frames since free-roam started

  /* --- CHAPTER SYSTEM ---
     After training, the story is split into chapters. The player can explore
     freely, and when they're ready to continue the story they press the
     "Next Chapter" button at the top of the screen. */
  let storyChapter = 0; // 0 = not yet in chapter mode
  let chapterReady = false; // true when the player can advance

  const STORY_CHAPTERS = [
    { id: 1,  name: "Redtail's Death",           trigger: 'triggerRedtailEvent' },
    { id: 2,  name: 'Journey to Mothermouth',    trigger: 'triggerMothermouthJourney' },
    { id: 3,  name: 'Yellowfang',                trigger: 'triggerYellowfangEncounter' },
    { id: 4,  name: 'Driving Out Brokenstar',      trigger: 'triggerDrivingOutBrokenstar' },
    { id: 5,  name: 'Spottedleaf\'s Warning',     trigger: 'triggerSpottedleafWarning' },
    { id: 6,  name: 'Ravenpaw\'s Secret',          trigger: 'triggerRavenpawSecret' },
    { id: 7,  name: 'Ravenpaw Leaves',            trigger: 'triggerRavenpawLeaves' },
    { id: 8,  name: 'Fire and Ice',               trigger: 'triggerFireAndIce' },
    { id: 9,  name: 'Bring Back WindClan',         trigger: 'triggerWindClanRescue' },
    { id: 10, name: 'Tigerclaw\'s Treachery',      trigger: 'triggerTigerclawTreachery' },
    { id: 11, name: 'Tigerclaw\'s Exile',           trigger: 'triggerTigerclawExile' },
    { id: 12, name: 'Warrior Ceremony',            trigger: 'triggerWarriorCeremony' },
    { id: 13, name: 'A Dangerous Path',            trigger: 'triggerDangerousPath' },
    { id: 14, name: 'The Dog Pack',                trigger: 'triggerDogPack' },
    { id: 15, name: 'Bluestar\'s Last Life',        trigger: 'triggerBluestarLastLife' },
    { id: 16, name: 'Firestar\'s Leadership',       trigger: 'triggerFirestarLeadership' },
    { id: 17, name: 'TigerClan Rises',              trigger: 'triggerTigerClanRises' },
    { id: 18, name: 'BloodClan Arrives',             trigger: 'triggerBloodClanArrives' },
    { id: 19, name: 'The Final Battle: Scourge',     trigger: 'triggerScourge' },
  ];

  function showNextChapterButton () {
    const btn = $('next-chapter-btn');
    const nameEl = $('next-chapter-name');
    if (!btn) return;
    const nextChap = STORY_CHAPTERS[storyChapter]; // storyChapter is 0-indexed into next
    if (nextChap && storyPhase === 'playing') {
      nameEl.textContent = '— ' + nextChap.name;
      btn.classList.remove('hidden');
      chapterReady = true;
    } else {
      btn.classList.add('hidden');
      chapterReady = false;
    }
  }

  function hideNextChapterButton () {
    const btn = $('next-chapter-btn');
    if (btn) btn.classList.add('hidden');
    chapterReady = false;
  }

  function advanceChapter () {
    if (!chapterReady) return;
    const chapter = STORY_CHAPTERS[storyChapter];
    if (!chapter) return;

    hideNextChapterButton();
    storyChapter++;
    saveGame();

    // Call the trigger function by name
    const triggerFn = {
      triggerRedtailEvent, triggerMothermouthJourney, triggerYellowfangEncounter,
      triggerDrivingOutBrokenstar, triggerSpottedleafWarning, triggerRavenpawSecret,
      triggerRavenpawLeaves, triggerFireAndIce, triggerWindClanRescue,
      triggerTigerclawTreachery, triggerTigerclawExile, triggerWarriorCeremony,
      triggerDangerousPath, triggerDogPack, triggerBluestarLastLife,
      triggerFirestarLeadership, triggerTigerClanRises, triggerBloodClanArrives,
      triggerScourge,
    }[chapter.trigger];
    if (triggerFn) triggerFn();
  }

  function startExploring () {
    gameState = 'playing';
    catGroup.visible = true;
    // Place Rusty in the garden, in front of the cat flap so they can enter or leave
    player.position = { x: 0, y: 0, z: 79 };
    catGroup.position.set(0, 0, 79);
    storyPhase = 'house';
    graypawEncounterTriggered = false;
    bluestarEncounterTriggered = false;

    // Hide all NPC cats initially
    npcCats.forEach(c => { c.group.visible = false; });

    // But show Smudge and Princess at the house - they're your kittypet friends!
    const smudge = npcCats.find(c => c.name === 'Smudge');
    const princess = npcCats.find(c => c.name === 'Princess');
    if (smudge) { smudge.group.visible = true; smudge.group.position.set(3, 0, 83); }
    if (princess) { princess.group.visible = true; princess.group.position.set(-3, 0, 84); }
    revealCatNames(['Smudge', 'Princess']);

    gameHud.classList.add('visible');
    playerNameEl.textContent = 'Rusty';
    if (!isMobile) $('emote-bar').classList.remove('hidden');

    if (isMobile) mobileControls.classList.add('visible');

    startForestAmbience();

    queueMessage('Narrator',
      'You are Rusty, a house cat. The forest beyond the fence calls to you. ' +
      (isMobile ? 'Use the joystick to walk to the fence.' : 'Use WASD to walk toward the fence and explore the forest.'));
  }

  /* Check story triggers based on player position */
  function checkStoryTriggers () {
    if (!player || gameState !== 'playing') return;

    const pz = player.position.z;
    const px = player.position.x;
    const dist = Math.sqrt(px * px + pz * pz); // dist from camp center (0,0)

    // TRIGGER 1: Player approaches the fence opening (z < 73) → Smudge & Princess warn you
    if (storyPhase === 'house' && pz < 73 && !fenceWarningTriggered) {
      fenceWarningTriggered = true;
      triggerFenceWarning();
    }

    // TRIGGER 2: Player walks deeper into the forest (z < 55) → encounter Graypaw
    if (storyPhase === 'forest' && pz < 55 && !graypawEncounterTriggered) {
      graypawEncounterTriggered = true;
      triggerGraypawEncounter();
    }

    // TRIGGER 3: After fighting Graypaw, walk further (z < 45) → meet Bluestar
    if (storyPhase === 'fought_graypaw' && pz < 45 && !bluestarEncounterTriggered) {
      bluestarEncounterTriggered = true;
      triggerBluestarEncounter();
    }

    // TRIGGER: Territory trespassing (only when free-roaming, not training)
    if (storyPhase === 'playing') {
      checkTerritoryTrespass();
    }

    // Show the Next Chapter button if it should be visible
    // (the player controls when to advance — no more auto-triggers)
    if (storyPhase === 'playing' && !chapterReady && storyChapter < STORY_CHAPTERS.length && gameState === 'playing') {
      showNextChapterButton();
    }
  }

  /* ====================================================
     BORDER PATROL AI (enemy cats patrolling their borders)
     ==================================================== */
  function updateBorderPatrols (dt) {
    if (!borderPatrols || borderPatrols.length === 0) return;

    borderPatrols.forEach(bp => {
      if (bp.spotCooldown > 0) bp.spotCooldown -= dt;

      // Walk along patrol path — use first cat as the "leader" position
      const target = bp.patrolPath[bp.pathIdx];
      const leader = bp.cats[0];
      const gx = leader.group.position.x - leader.offsetX; // center position
      const gz = leader.group.position.z;
      const dx = target.x - gx;
      const dz = target.z - gz;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 1.5) {
        bp.pathIdx = (bp.pathIdx + 1) % bp.patrolPath.length;
      } else {
        const speed = bp.speed * dt;
        const mx = (dx / dist) * speed;
        const mz = (dz / dist) * speed;

        // Move ALL cats in the patrol together
        bp.cats.forEach(c => {
          c.group.position.x += mx;
          c.group.position.z += mz;
          c.group.lookAt(target.x + c.offsetX, 0, target.z);
        });
      }

      // Animate legs for all cats
      bp._walkCycle += dt * bp.speed * 2;
      const sw = Math.sin(bp._walkCycle) * 0.4;
      bp.cats.forEach(c => {
        if (c.group.legs) {
          c.group.legs[0].rotation.x = sw;  c.group.legs[1].rotation.x = -sw;
          c.group.legs[2].rotation.x = -sw; c.group.legs[3].rotation.x = sw;
        }
      });

      // Move detection circle with the patrol (centered on the group)
      const cx = leader.group.position.x - leader.offsetX;
      const cz = leader.group.position.z;
      bp.detectionCircle.position.set(cx, 0.08, cz);
      bp.detectionInner.position.set(cx, 0.07, cz);

      // Pulse the detection circle opacity for visibility
      const pulse = 0.3 + Math.sin(Date.now() * 0.003) * 0.15;
      bp.detectionCircle.material.opacity = pulse;

      // Check if player steps into the detection circle
      if (storyPhase !== 'playing' || gameState !== 'playing') return;
      if (bp.spotCooldown > 0 || bp.spotted) return;

      const px = player.position.x;
      const pz = player.position.z;
      const pdx = px - cx;
      const pdz = pz - cz;
      const playerDist = Math.sqrt(pdx * pdx + pdz * pdz);

      // Spotted if player is inside the yellow detection circle
      if (playerDist < bp.detectionRadius) {
        bp.spotted = true;
        triggerPatrolSpotted(bp);
      }
    });
  }

  /** A border patrol has spotted the player — show all cats and let player pick who to fight! */
  function triggerPatrolSpotted (bp) {
    gameState = 'cutscene';
    playSound('danger');

    const catCount = bp.cats.length;
    const leaderName = bp.cats[0].name;

    const scenes = [
      { narration: true, text: 'A ' + bp.clan + ' patrol of <strong>' + catCount + ' cats</strong> has spotted you! They race toward you, fur bristling!' },
      { speaker: leaderName, text: '"' + (bp.clan === 'ShadowClan'
          ? 'A ThunderClan intruder! You dare set paw on ShadowClan territory?!'
          : bp.clan === 'RiverClan'
          ? 'ThunderClan! This is our territory! You have no right to be here!'
          : 'ThunderClan cat on the moor?! You\'re trespassing! Prepare to be taught a lesson!') + '"' },
    ];

    startCutscene(scenes, () => {
      // Build enemy list from patrol cats
      const lvl = player.level || 1;
      const clanStatBase = {
        'ShadowClan': { hp: 60, atk: 11, def: 5 },
        'RiverClan':  { hp: 55, atk: 9,  def: 6 },
        'WindClan':   { hp: 45, atk: 13, def: 3 },
      };
      const base = clanStatBase[bp.clan] || clanStatBase['ShadowClan'];

      const enemies = bp.cats.map((c, idx) => ({
        name: c.name,
        hp: base.hp + lvl * 8 + idx * 5,
        maxHP: base.hp + lvl * 8 + idx * 5,
        atk: base.atk + lvl * 2 + idx,
        def: base.def + lvl + idx,
        fur: c.fur,
        eye: c.eyeColor,
        stripes: c.stripes,
        stripeColor: c.stripeColor,
        defeated: false,
      }));

      startPatrolBattle({
        clan: bp.clan,
        enemies: enemies,
        expReward: (40 + lvl * 8) * catCount,
        onWin: function () {
          const s2 = [
            { narration: true, text: 'The ' + bp.clan + ' patrol stumbles back, defeated! All ' + catCount + ' cats retreat!' },
            { speaker: leaderName, text: '"This isn\'t over, ThunderClan! We\'ll be back with more warriors!"' },
            { narration: true, text: 'You should head back to ThunderClan land before another patrol arrives.' },
          ];
          startCutscene(s2, () => {
            gameState = 'playing';
            bp.spotted = false;
            bp.spotCooldown = 45; // longer cooldown for multi-cat patrols
          });
        },
        onLose: function () {
          const s2 = [
            { narration: true, text: 'The ' + bp.clan + ' warriors overpower you and chase you back to the border!' },
            { speaker: leaderName, text: '"And STAY OUT! Next time you won\'t get off so easy!"' },
          ];
          startCutscene(s2, () => {
            bp.spotted = false;
            bp.spotCooldown = 45;
            respawnAtMedicineDen();
          });
        },
      });
    });
  }

  /* ====================================================
     TERRITORY INTRUDERS — enemy cats that sneak into ThunderClan
     Bluestar assigns a patrol to chase them out!
     ==================================================== */
  let intruderTimer = 0;          // seconds until next intruder event
  let intruderCooldown = 120;     // minimum seconds between intruder events
  let intruderActive = false;     // is there an active intruder to chase?
  let intruderCats = [];          // { group, name, clan, x, z, fur, eye, stripes, stripeColor }
  let intruderPatrolAssigned = false; // has Bluestar assigned the patrol?
  let intruderArea = null;        // { x, z } — where the intruders are, so clan cats can head there
  let clanPatrollers = [];        // names of ThunderClan cats assigned to help patrol

  const INTRUDER_CLANS = [
    { clan: 'ShadowClan', names: ['Blackfoot', 'Clawface', 'Boulder'], fur: [0x222222, 0x5a4a3a, 0x666666], eye: [0xffaa11, 0xddaa33, 0xeedd33] },
    { clan: 'RiverClan',  names: ['Oakheart', 'Loudbelly', 'Silverstream'], fur: [0x7a5533, 0x887755, 0xaaaabb], eye: [0xddaa33, 0x44cc44, 0x66aaee] },
    { clan: 'WindClan',   names: ['Mudclaw', 'Onewhisker', 'Deadfoot'], fur: [0x8b6b4a, 0xbbaa88, 0x333333], eye: [0xddaa33, 0xddaa33, 0xddaa33] },
  ];

  function spawnIntruders () {
    if (intruderActive || storyPhase !== 'playing') return;

    // Pick a random enemy clan
    const clanDef = INTRUDER_CLANS[Math.floor(Math.random() * INTRUDER_CLANS.length)];
    const numCats = 1 + Math.floor(Math.random() * 2); // 1-2 intruders

    // Spawn positions in ThunderClan territory (away from camp, near borders)
    const spawnPoints = [
      { x: -30 + Math.random() * 15, z: -20 + Math.random() * 15 },  // near ShadowClan border
      { x: 35 + Math.random() * 15,  z: -10 + Math.random() * 15 },  // near RiverClan border
      { x: -10 + Math.random() * 20, z: -35 + Math.random() * 10 },  // near WindClan border
      { x: 15 + Math.random() * 15,  z: 15 + Math.random() * 15  },  // in the forest
    ];
    const spawnArea = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];

    intruderCats = [];
    for (let i = 0; i < numCats; i++) {
      const catIdx = i % clanDef.names.length;
      const ix = spawnArea.x + (Math.random() - 0.5) * 4;
      const iz = spawnArea.z + (Math.random() - 0.5) * 4;
      const hasStripes = Math.random() > 0.5;

      const catObj = makeBookCat({
        name: clanDef.names[catIdx],
        fur: clanDef.fur[catIdx],
        belly: clanDef.fur[catIdx],
        eyeColor: clanDef.eye[catIdx],
        earInner: 0xcc8888,
        noseColor: 0x886666,
        size: 0.95 + Math.random() * 0.2,
        stripes: hasStripes ? 3 : 0,
        stripeColor: 0x333322,
        whiteChest: false, whitePaws: false, longFur: false
      }, ix, iz);

      catObj.group.visible = true;
      // Give them a known name so the label shows
      revealCatName(clanDef.names[catIdx]);

      intruderCats.push({
        group: catObj.group,
        name: clanDef.names[catIdx],
        clan: clanDef.clan,
        x: ix, z: iz,
        fur: clanDef.fur[catIdx],
        eye: clanDef.eye[catIdx],
        stripes: hasStripes,
        stripeColor: 0x333322,
        _walkAngle: Math.random() * Math.PI * 2,
        _walkTimer: 0,
      });
    }

    intruderActive = true;
    intruderPatrolAssigned = false;
    intruderArea = { x: spawnArea.x, z: spawnArea.z };

    // Pick ThunderClan warriors and apprentices to help patrol
    const patrolCandidates = ['Dustpaw', 'Sandpaw', 'Whitestorm', 'Mousefur', 'Darkstripe', 'Longtail', 'Lionheart', 'Tigerclaw'];
    const numHelpers = 2 + Math.floor(Math.random() * 2); // 2-3 helpers
    const shuffled = patrolCandidates.sort(() => Math.random() - 0.5);
    clanPatrollers = shuffled.slice(0, numHelpers);

    // Bluestar announces the intruder patrol
    const clanName = clanDef.clan;
    const intruderCount = numCats === 1 ? 'a ' + clanName + ' cat' : numCats + ' ' + clanName + ' cats';
    const helperNames = clanPatrollers.join(', ');
    const pName = player.name || 'Firepaw';
    queueMessage('Bluestar', 'I\'ve received word that ' + intruderCount + ' has been spotted trespassing in our territory!', () => {
      queueMessage('Bluestar', pName + ', ' + helperNames + ' — I\'m sending you all on patrol. Find them and drive them out! ThunderClan defends its borders!', () => {
        intruderPatrolAssigned = true;

        // Send the helper cats toward the intruder area
        clanPatrollers.forEach(name => {
          const npc = npcCats.find(c => c.name === name);
          if (npc && npc.ai) {
            npc.ai.task = 'intruder_patrol';
            npc.ai.target = {
              x: spawnArea.x + (Math.random() - 0.5) * 8,
              z: spawnArea.z + (Math.random() - 0.5) * 8
            };
            npc.ai.timer = 120; // keep patrolling for a long time
            npc.group.visible = true;
          }
        });

        // Show a hint about where to go
        const area = spawnArea.x < -15 ? 'near the ShadowClan border' :
                     spawnArea.x > 30 ? 'near the RiverClan border' :
                     spawnArea.z < -25 ? 'near the WindClan border' : 'deep in the forest';
        queueMessage('Narrator', 'Bluestar has sent a patrol! ' + helperNames + ' and you are heading ' + area + '. Look for the ' + clanName + ' cats and press E (or ACT) to confront them.');
      });
    });
  }

  /** Update intruder cats — make them wander and check if player confronts them */
  function updateIntruders (dt) {
    if (!intruderActive || !intruderPatrolAssigned) return;

    // Make intruder cats wander around their area
    intruderCats.forEach(ic => {
      if (!ic.group.visible) return;
      ic._walkTimer -= dt;
      if (ic._walkTimer <= 0) {
        ic._walkAngle += (Math.random() - 0.5) * 1.5;
        ic._walkTimer = 2 + Math.random() * 3;
      }
      const speed = 1.5 * dt;
      ic.group.position.x += Math.cos(ic._walkAngle) * speed;
      ic.group.position.z += Math.sin(ic._walkAngle) * speed;
      ic.group.rotation.y = ic._walkAngle + Math.PI;
      // Animate legs
      if (ic.group.legs) {
        if (!ic._wc) ic._wc = 0;
        ic._wc += dt * 4;
        const sw = Math.sin(ic._wc) * 0.3;
        ic.group.legs[0].rotation.x = sw; ic.group.legs[1].rotation.x = -sw;
        ic.group.legs[2].rotation.x = -sw; ic.group.legs[3].rotation.x = sw;
      }
    });

    // Check if player is close enough to confront
    if (gameState !== 'playing') return;
    const activeCats = intruderCats.filter(c => c.group.visible);
    if (activeCats.length === 0) {
      // All defeated — patrol success!
      finishIntruderPatrol();
      return;
    }

    // Check proximity — update interact hint
    let nearestIntruder = null;
    let nearestDist = Infinity;
    for (const ic of activeCats) {
      const dx = player.position.x - ic.group.position.x;
      const dz = player.position.z - ic.group.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIntruder = ic;
      }
    }
    if (nearestIntruder && nearestDist < 4) {
      interactHintText.textContent = 'Confront ' + nearestIntruder.name + ' (' + nearestIntruder.clan + ')';
      interactHint.classList.remove('hidden');
    }
  }

  /** Player confronts an intruder — triggers a battle */
  function confrontIntruder () {
    if (!intruderActive || !intruderPatrolAssigned || gameState !== 'playing') return false;

    const activeCats = intruderCats.filter(c => c.group.visible);
    // Find nearest intruder
    let nearest = null, nearestDist = Infinity;
    for (const ic of activeCats) {
      const dx = player.position.x - ic.group.position.x;
      const dz = player.position.z - ic.group.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 5 && dist < nearestDist) {
        nearest = ic;
        nearestDist = dist;
      }
    }
    if (!nearest) return false;

    const ic = nearest;
    const pName = player.name || 'Firepaw';

    // Confrontation dialogue then battle
    gameState = 'cutscene';
    playSound('danger');
    const scenes = [
      { speaker: pName, text: '"You\'re trespassing on ThunderClan territory! Leave now or face the consequences!"' },
      { speaker: ic.name, text: '"' + (ic.clan === 'ShadowClan'
        ? 'Ha! A ThunderClan apprentice thinks they can tell ME what to do? You\'ll regret this!'
        : ic.clan === 'RiverClan'
        ? 'This land should belong to RiverClan anyway! You can\'t make me leave!'
        : 'The moor has no borders! Try and stop me, tree-cat!') + '"' },
    ];

    startCutscene(scenes, () => {
      const lvl = player.level || 1;
      startBattle({
        enemyName: ic.name + ' (' + ic.clan + ')',
        enemyHP: 50 + lvl * 8,
        enemyMaxHP: 50 + lvl * 8,
        enemyAttack: 8 + lvl * 2,
        enemyDefense: 3 + lvl,
        enemyFurColor: ic.fur,
        enemyEyeColor: ic.eye,
        enemyStripes: ic.stripes,
        enemyStripeColor: ic.stripeColor,
        expReward: 35 + lvl * 5,
        onWin: function () {
          // This intruder is defeated — hide them
          ic.group.visible = false;
          const remaining = intruderCats.filter(c => c.group.visible).length;
          if (remaining > 0) {
            queueMessage('Narrator', ic.name + ' flees! But there are still ' + remaining + ' more intruder' + (remaining > 1 ? 's' : '') + ' in the territory. Keep patrolling!');
          } else {
            finishIntruderPatrol();
          }
        },
        onLose: function () {
          // Lost — respawn at medicine den but intruder is still there
          respawnAtMedicineDen();
          queueMessage('Narrator', 'The ' + ic.clan + ' intruder is still in the territory. Heal up and try again!');
        },
      });
    });
    return true;
  }

  /** All intruders chased out — report back to Bluestar */
  function finishIntruderPatrol () {
    intruderActive = false;
    intruderPatrolAssigned = false;
    intruderCooldown = 90 + Math.random() * 120; // 1.5-3.5 minutes until next event
    intruderTimer = 0;
    intruderArea = null;

    // Remove intruder cat meshes from scene
    intruderCats.forEach(ic => {
      if (ic.group.parent) ic.group.parent.remove(ic.group);
    });
    intruderCats = [];

    // Send clan patrollers back to normal duties
    clanPatrollers.forEach(name => {
      const npc = npcCats.find(c => c.name === name);
      if (npc && npc.ai && npc.ai.task === 'intruder_patrol') {
        npc.ai.task = 'patrol';
        npc.ai.target = { x: (Math.random()-0.5) * 10, z: (Math.random()-0.5) * 10 };
        npc.ai.timer = 10 + Math.random() * 8;
      }
    });
    clanPatrollers = [];

    // Bluestar congratulates
    const pName = player.name || 'Firepaw';
    queueMessage('Bluestar', 'Well done, ' + pName + '! The patrol was a success — you\'ve all driven the intruders out of our territory!', () => {
      queueMessage('Bluestar', 'ThunderClan is safe thanks to your bravery. I\'m proud of every one of you.', () => {
        // Bonus XP for completing the patrol
        player = GameLogic.addExperience(player, 50);
        queueMessage('Narrator', 'Patrol complete! +50 experience. Bluestar is pleased with the whole patrol.');
        saveGame();
      });
    });
  }

  /** Timer-based intruder spawning during free play */
  function checkIntruderSpawn (dt) {
    if (storyPhase !== 'playing' || intruderActive) return;
    if (trainingStep >= 0 && trainingStep < 11) return; // not during training

    intruderTimer += dt;
    if (intruderTimer >= intruderCooldown) {
      intruderTimer = 0;
      spawnIntruders();
    }
  }

  /* ====================================================
     PATROL BATTLE — fight multiple cats, pick your target
     ==================================================== */
  let patrolBattleData = null; // { enemies, currentIdx, expReward, onWin, onLose, clan }

  function startPatrolBattle (opts) {
    patrolBattleData = {
      enemies: opts.enemies,
      currentIdx: -1, // no cat selected yet
      expReward: opts.expReward,
      onWin: opts.onWin,
      onLose: opts.onLose,
      clan: opts.clan,
      retreatOnFirstWin: opts.retreatOnFirstWin || false, // if true, beating 1 cat = all retreat
    };

    gameState = 'battle';
    battleScreen.classList.remove('hidden');
    battleLog.innerHTML = '';
    battleHeader.textContent = opts.clan + ' PATROL — ' + opts.enemies.length + ' cats!';
    battlePlayerName.textContent = player.name || 'Rusty';

    // Draw player cat
    const pCtx = battlePlayerCanvas.getContext('2d');
    drawBattleCat(pCtx, 0xff8833, 0x44cc44, false, false, 0);

    // Set up player HP
    currentBattle = {
      playerHP: player.health,
      playerMaxHP: player.maxHealth,
      playerMinHP: 5,
    };

    addBattleLog('A patrol of <strong>' + opts.enemies.length + '</strong> ' + opts.clan + ' cats blocks your path!', 'battle-log-fierce');
    addBattleLog('Choose which cat to fight first!', '');
    playSound('battle');

    // Show enemy selector
    showEnemySelector();
  }

  function showEnemySelector () {
    if (!patrolBattleData) return;
    const selector = document.getElementById('battle-enemy-selector');
    const list = document.getElementById('battle-enemy-list');
    list.innerHTML = '';

    patrolBattleData.enemies.forEach((e, idx) => {
      const btn = document.createElement('button');
      btn.className = 'enemy-select-btn' + (e.defeated ? ' defeated' : '');
      btn.textContent = e.name + (e.defeated ? ' (defeated)' : ' — HP: ' + e.hp + '/' + e.maxHP);
      btn.disabled = e.defeated;
      if (!e.defeated) {
        btn.addEventListener('click', () => selectPatrolEnemy(idx));
      }
      list.appendChild(btn);
    });

    selector.classList.remove('hidden');
    enableBattleButtons(false); // hide attack buttons until a cat is selected

    // Hide enemy side until selected
    battleEnemyName.textContent = '???';
    const eCtx = battleEnemyCanvas.getContext('2d');
    eCtx.clearRect(0, 0, 200, 200);
    document.getElementById('battle-enemy-hp-text').textContent = '?/?';
    document.getElementById('battle-enemy-hp').style.width = '100%';
  }

  function selectPatrolEnemy (idx) {
    if (!patrolBattleData) return;
    const e = patrolBattleData.enemies[idx];
    if (e.defeated) return;

    patrolBattleData.currentIdx = idx;

    // Hide selector, show battle UI
    document.getElementById('battle-enemy-selector').classList.add('hidden');

    // Mark fighting in selector buttons
    const buttons = document.querySelectorAll('.enemy-select-btn');
    buttons.forEach((b, i) => b.classList.toggle('fighting', i === idx));

    // Set up the current battle against this specific enemy
    currentBattle = {
      enemyName: e.name,
      enemyHP: e.hp,
      enemyMaxHP: e.maxHP,
      enemyAttack: e.atk,
      enemyDefense: e.def,
      enemyFurColor: e.fur,
      enemyEyeColor: e.eye,
      enemyStripes: e.stripes,
      enemyStripeColor: e.stripeColor || 0x333333,
      playerHP: player.health,
      playerMaxHP: player.maxHealth,
      playerMinHP: 5,
      expReward: 0, // awarded at end of full patrol fight
      playerTurn: true,
      dodging: false,
      round: 0,
      _fierceVulnerable: false,
      // Override win/lose for multi-cat fights
      onWin: function () {
        // Mark this cat as defeated
        e.defeated = true;
        e.hp = 0;
        addBattleLog('<strong>' + e.name + '</strong> is defeated!', 'battle-log-player');

        // Check if all enemies are defeated (or retreat on first win)
        const allDefeated = patrolBattleData.retreatOnFirstWin || patrolBattleData.enemies.every(en => en.defeated);
        if (allDefeated) {
          // Won the entire patrol fight!
          if (patrolBattleData.retreatOnFirstWin) {
            addBattleLog('<strong>The ' + patrolBattleData.clan + ' cats see their warrior fall and RETREAT!</strong>', 'battle-log-fierce');
          } else {
            addBattleLog('<strong>All ' + patrolBattleData.clan + ' patrol cats are defeated!</strong>', 'battle-log-fierce');
          }
          player = GameLogic.addExperience(player, patrolBattleData.expReward);
          player.battlesWon = (player.battlesWon || 0) + patrolBattleData.enemies.length;
          player.health = Math.min(player.maxHealth, player.health + Math.floor(player.maxHealth * 0.3));
          addBattleLog('+' + patrolBattleData.expReward + ' experience! Level ' + player.level, 'battle-log-player');

          setTimeout(() => {
            battleScreen.classList.add('hidden');
            document.getElementById('battle-enemy-selector').classList.add('hidden');
            const cb = patrolBattleData.onWin;
            patrolBattleData = null;
            currentBattle = null;
            if (cb) cb();
            saveGame();
          }, 1500);
        } else {
          // More cats to fight — let player choose next
          addBattleLog('Choose your next opponent!', '');
          player.health = Math.min(player.maxHealth, player.health + Math.floor(player.maxHealth * 0.15)); // small heal between fights
          setTimeout(() => showEnemySelector(), 800);
        }
      },
      onLose: function () {
        // Lost the patrol fight
        setTimeout(() => {
          battleScreen.classList.add('hidden');
          document.getElementById('battle-enemy-selector').classList.add('hidden');
          const cb = patrolBattleData.onLose;
          patrolBattleData = null;
          currentBattle = null;
          if (cb) cb();
        }, 1000);
      },
    };

    // Draw enemy cat sprite
    battleEnemyName.textContent = e.name;
    const eCtx = battleEnemyCanvas.getContext('2d');
    drawBattleCat(eCtx, e.fur, e.eye, true, e.stripes, e.stripeColor || 0x333333);
    updateBattleHP();
    enableBattleButtons(true);

    addBattleLog('You face <strong>' + e.name + '</strong>!', 'battle-log-fierce');
    playSound('battle');
  }

  /* ====================================================
     TERRITORY TRESPASSING SYSTEM (scent marker detection)
     ==================================================== */
  let trespassCooldown = 0; // prevent spamming
  let lastTerritory = 'ThunderClan';
  let scentMarkerWarned = {}; // track per-clan warnings

  function checkTerritoryTrespass () {
    if (!player || gameState !== 'playing') return;
    if (trespassCooldown > 0) { trespassCooldown -= 1; return; }

    const territory = GameLogic.getTerritory(player.position);
    const px = player.position.x;
    const pz = player.position.z;

    // Thunderpath - danger warning
    if (territory === 'Thunderpath' && lastTerritory !== 'Thunderpath') {
      lastTerritory = 'Thunderpath';
      trespassCooldown = 300; // ~5 seconds at 60fps
      queueMessage('Narrator', 'DANGER! You are on the Thunderpath! Monsters (cars) race past here. Get off quickly!');
      playSound('danger');
      return;
    }

    // Check if player is standing on a yellow scent marker
    for (let i = 0; i < scentMarkerZones.length; i++) {
      const sm = scentMarkerZones[i];
      const dx = px - sm.x;
      const dz = pz - sm.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < sm.radius) {
        // Player is on a scent marker!
        trespassCooldown = 600; // 10 second cooldown

        if (!scentMarkerWarned[sm.clan]) {
          // First time stepping on this clan's markers: warning
          scentMarkerWarned[sm.clan] = true;
          queueMessage('Narrator', 'You\'ve stepped on ' + sm.clan + '\'s scent markers! You can smell their border markings strongly here.', () => {
            queueMessage('Narrator', 'If their patrol cats see you here, they WILL attack! Turn back or be ready to fight!');
          });
          playSound('danger');
          // Alert nearby border patrols
          alertNearbyPatrols(sm.clan, px, pz);
        } else {
          // Subsequent times - patrols rush to investigate
          queueMessage('Narrator', 'You\'re on ' + sm.clan + ' scent markers again! Their patrol is heading your way!');
          playSound('danger');
          alertNearbyPatrols(sm.clan, px, pz);
        }
        return;
      }
    }

    if (territory === 'ThunderClan' || territory === 'neutral') {
      lastTerritory = territory;
    } else if (territory !== 'Thunderpath') {
      lastTerritory = territory;
    }
  }

  /** Alert border patrols of a specific clan — make them rush toward the player */
  function alertNearbyPatrols (clan, px, pz) {
    borderPatrols.forEach(bp => {
      if (bp.clan === clan && !bp.spotted && bp.spotCooldown <= 0) {
        // Redirect patrol to rush toward the player's position
        // Insert a waypoint toward the player
        bp.patrolPath.splice(bp.pathIdx + 1, 0, { x: px, z: pz });
        bp.speed = bp.clan === 'WindClan' ? 6 : 4.5; // Speed up!
      }
    });
  }

  /* ====================================================
     RAVENPAW RETURNS - REDTAIL'S DEATH
     ==================================================== */
  function triggerRedtailEvent () {
    gameState = 'cutscene';

    // Position cats for the scene
    const rp = npcCats.find(c => c.name === 'Ravenpaw');
    const tc = npcCats.find(c => c.name === 'Tigerclaw');
    const bs = npcCats.find(c => c.name === 'Bluestar');
    const lh = npcCats.find(c => c.name === 'Lionheart');
    const gp = npcCats.find(c => c.name === 'Graypaw');
    const ds = npcCats.find(c => c.name === 'Dustpaw');
    const wh = npcCats.find(c => c.name === 'Whitestorm');

    // Ravenpaw staggers in from the forest entrance (south)
    if (rp) { rp.group.visible = true; rp.group.position.set(0, 0, 25); }
    // Bluestar on Highrock
    if (bs) { bs.group.visible = true; bs.group.position.set(-3, 3.3, -4); }
    // Others gathered in camp
    if (lh) { lh.group.visible = true; lh.group.position.set(-1, 0, 1); }
    if (tc) { tc.group.visible = true; tc.group.position.set(3, 0, 20); } // behind Ravenpaw
    if (gp) { gp.group.visible = true; gp.group.position.set(player.position.x + 2, 0, player.position.z); }
    if (ds) { ds.group.visible = true; ds.group.position.set(4, 0, 3); }
    if (wh) { wh.group.visible = true; wh.group.position.set(5, 0, -1); }

    // Make all other cats visible and face the entrance
    npcCats.forEach(c => {
      if (c.group.visible) c.group.lookAt(0, 0, 20);
    });

    const pName = player.name || 'apprentice';

    const scenes = [
      // Ravenpaw staggers in
      { narration: true, text: 'A yowl echoes through the camp. Cats look up, alarmed. A small black shape staggers through the camp entrance...',
        camPos: { x: 5, y: 3, z: 28 }, camLook: { x: 0, y: 1, z: 22 } },

      { narration: true, text: 'It\'s <strong>Ravenpaw</strong>! His black pelt is torn and streaked with blood. He collapses in the clearing, gasping for breath.',
        camPos: { x: 3, y: 2, z: 24 }, camLook: { x: 0, y: 0.5, z: 25 } },

      { speaker: 'Ravenpaw', text: '"B-Bluestar...! Redtail... Redtail is... dead!"',
        camPos: { x: 2, y: 1.5, z: 23 }, camLook: { x: 0, y: 0.8, z: 25 } },

      { narration: true, text: 'A shocked silence falls over the camp. Cats stare in disbelief. Redtail - the deputy - dead?',
        camPos: { x: -2, y: 4, z: 5 }, camLook: { x: 0, y: 1, z: 15 } },

      { speaker: 'Bluestar', text: '"Redtail?! What happened, Ravenpaw? Tell me everything!"',
        camPos: { x: -1, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.3, z: -4 } },

      { speaker: 'Ravenpaw', text: '"The battle... at Sunningrocks... RiverClan attacked... Oakheart... Redtail fought Oakheart..."',
        camPos: { x: 1, y: 1.5, z: 23 }, camLook: { x: 0, y: 0.5, z: 25 } },

      // Tigerclaw enters carrying Redtail's body
      { narration: true, text: 'Heavy pawsteps. <strong>Tigerclaw</strong> pushes through the gorse tunnel, dragging the limp body of a small tortoiseshell tom.',
        camPos: { x: 5, y: 2.5, z: 22 }, camLook: { x: 3, y: 0.5, z: 20 } },

      { narration: true, text: 'It is Redtail. His ginger-and-black dappled fur is matted with blood. His eyes are closed forever.',
        camPos: { x: 4, y: 1.5, z: 19 }, camLook: { x: 3, y: 0.3, z: 20 } },

      { speaker: 'Tigerclaw', text: '"Redtail is dead. I avenged his death. Oakheart of RiverClan will trouble us no more — I killed him myself."',
        camPos: { x: 5, y: 2, z: 18 }, camLook: { x: 3, y: 1, z: 20 } },

      { narration: true, text: 'Tigerclaw stands tall over Redtail\'s body, his amber eyes gleaming. He looks almost... proud.',
        camPos: { x: 4, y: 2, z: 19 }, camLook: { x: 3, y: 1.2, z: 20 } },

      // Ravenpaw looks terrified
      { narration: true, text: 'You notice Ravenpaw staring at Tigerclaw with wide, terrified eyes. His whole body is trembling. Something about his expression seems... wrong.',
        camPos: { x: 1, y: 1.5, z: 24 }, camLook: { x: 0, y: 0.8, z: 25 } },

      // Bluestar mourns
      { speaker: 'Bluestar', text: '"Redtail..."',
        camPos: { x: -2, y: 3, z: -2 }, camLook: { x: -3, y: 3.3, z: -4 } },

      { narration: true, text: 'Bluestar leaps down from Highrock and presses her nose to Redtail\'s cold fur. The whole Clan watches in grief.',
        camPos: { x: 0, y: 3, z: 8 }, camLook: { x: 1, y: 1, z: 15 } },

      { speaker: 'Bluestar', text: '"Redtail was a brave warrior. He served ThunderClan with loyalty and courage. We will sit vigil for him tonight."',
        camPos: { x: -1, y: 2, z: 10 }, camLook: { x: -3, y: 1.5, z: -2 } },

      // Dustpaw mourns his mentor
      { speaker: 'Dustpaw', text: '"Redtail... he was my mentor... He can\'t be dead..."',
        camPos: { x: 5, y: 1.5, z: 4 }, camLook: { x: 4, y: 0.8, z: 3 } },

      // Graypaw whispers to you
      { speaker: 'Graypaw', text: '"' + pName + '... this is terrible. Redtail was Bluestar\'s deputy. Did you see Ravenpaw\'s face? He looked so scared..."',
        camPos: { x: player.position.x + 2, y: 2, z: player.position.z + 1 },
        camLook: { x: player.position.x + 1, y: 1, z: player.position.z } },

      // Bluestar names new deputy
      { narration: true, text: 'The next day, Bluestar leaps atop the Highrock once more. Her voice rings through the camp.',
        camPos: { x: 2, y: 4, z: 2 }, camLook: { x: -3, y: 3.5, z: -4 } },

      { speaker: 'Bluestar', text: '"The time has come to appoint a new deputy. I say these words before the body of Redtail, so that his spirit may hear and approve my choice."',
        camPos: { x: -1, y: 3.5, z: 0 }, camLook: { x: -3, y: 3.5, z: -4 } },

      { speaker: 'Bluestar', text: '"<strong>Lionheart</strong> will be the new deputy of ThunderClan."',
        camPos: { x: 0, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.5, z: -4 } },

      { speaker: 'Lionheart', text: '"I am honored, Bluestar. I will serve ThunderClan with all my strength."',
        camPos: { x: 0, y: 2, z: 2 }, camLook: { x: -1, y: 1, z: 1 } },

      { narration: true, text: 'The Clan murmurs in approval. Lionheart touches noses with Bluestar.',
        camPos: { x: 3, y: 3, z: 4 }, camLook: { x: -2, y: 2, z: -2 } },

      // Tigerclaw's reaction
      { narration: true, text: 'You catch Tigerclaw watching from the shadows. His eyes narrow as Lionheart is named deputy. For just a moment, you see a flash of something dark cross his face...',
        camPos: { x: 5, y: 2, z: 15 }, camLook: { x: 3, y: 1.2, z: 20 } },

      // Graypaw's final whisper
      { speaker: 'Graypaw', text: '"Hey, ' + pName + '... did you notice Ravenpaw? He looked terrified of Tigerclaw. And why was Tigerclaw the only one who came back from the battle? Something doesn\'t add up..."',
        camPos: { x: player.position.x + 2, y: 1.8, z: player.position.z + 1 },
        camLook: { x: player.position.x, y: 1, z: player.position.z } },

      { narration: true, text: '<em>Fire alone will save our Clan...</em> The prophecy echoes in your mind. What did Ravenpaw really see at Sunningrocks? What is Tigerclaw hiding?',
        camPos: { x: 0, y: 6, z: 10 }, camLook: { x: 0, y: 2, z: 0 } },
    ];

    startCutscene(scenes, () => {
      gameState = 'playing';
      redtailEventTriggered = true;
      // Move Ravenpaw to medicine den (he's hurt)
      if (rp) { rp.group.position.set(-9, 0, 4); }
      // Tigerclaw goes to his spot
      if (tc) { tc.group.position.set(6, 0, -4); }
      // Bluestar back in camp
      if (bs) { bs.group.position.set(-4, 0, -2); }
      placeCatsInCamp();
      saveGame();
      queueMessage('Narrator', 'The Clan mourns Redtail. But you can\'t shake the feeling that something is wrong. Keep your eyes on Ravenpaw... and Tigerclaw. Explore the territory and press "Next Chapter" when you\'re ready to continue.');
      showNextChapterButton();
    });
  }

  /* ====================================================
     JOURNEY TO MOTHERMOUTH (Bluestar takes Firepaw to
     the Moonstone so she can share dreams with StarClan)
     ==================================================== */
  let mothermouthTriggered = false;
  let mothermouthTimer = 0;

  function triggerMothermouthJourney () {
    gameState = 'cutscene';
    mothermouthTriggered = true;

    const bs = npcCats.find(c => c.name === 'Bluestar');
    const tc = npcCats.find(c => c.name === 'Tigerclaw');
    const gp = npcCats.find(c => c.name === 'Graypaw');
    const rp = npcCats.find(c => c.name === 'Ravenpaw');

    // Position cats for the scene — gathering at Highrock
    if (bs) { bs.group.visible = true; bs.group.position.set(-3, 3.3, -4); }
    if (tc) { tc.group.visible = true; tc.group.position.set(4, 0, -2); }
    if (gp) { gp.group.visible = true; gp.group.position.set(player.position.x + 2, 0, player.position.z); }
    if (rp) { rp.group.visible = true; rp.group.position.set(player.position.x - 1, 0, player.position.z + 1); }

    const pName = player.name || 'apprentice';

    const preBattleScenes = [
      // Bluestar summons the patrol
      { speaker: 'Bluestar', text: '"' + pName + ', Graypaw, Ravenpaw, Tigerclaw — come here. I need to speak with all of you."',
        camPos: { x: -1, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.3, z: -4 } },

      { speaker: 'Bluestar', text: '"It is time for me to travel to the Moonstone at Mothermouth to share tongues with StarClan. I must seek their guidance."',
        camPos: { x: -2, y: 3, z: -2 }, camLook: { x: -3, y: 3.3, z: -4 } },

      { speaker: 'Bluestar', text: '"All four of you will come with me. Graypaw, Ravenpaw, ' + pName + ' — and Tigerclaw will lead the escort."',
        camPos: { x: 0, y: 3, z: -1 }, camLook: { x: -3, y: 3.3, z: -4 } },

      { speaker: 'Graypaw', text: '"The Moonstone?! We\'re actually going to Mothermouth? I\'ve heard the elders talk about it — this is amazing!"',
        camPos: { x: player.position.x + 3, y: 2, z: player.position.z }, camLook: { x: player.position.x + 2, y: 1, z: player.position.z } },

      { speaker: 'Ravenpaw', text: '"M-Mothermouth? Isn\'t that all the way past WindClan territory? That\'s... that\'s really far..."',
        camPos: { x: player.position.x, y: 2, z: player.position.z + 2 }, camLook: { x: player.position.x - 1, y: 1, z: player.position.z + 1 } },

      { speaker: 'Tigerclaw', text: '"The moors are dangerous now. WindClan has been driven out by ShadowClan. I will protect the patrol."',
        camPos: { x: 5, y: 2, z: -1 }, camLook: { x: 4, y: 1, z: -2 } },

      { speaker: 'Bluestar', text: '"We leave at once. Stay close together and keep your eyes open. Let\'s go."',
        camPos: { x: -1, y: 3, z: 0 }, camLook: { x: -3, y: 3, z: -4 } },

      // The journey begins — night falls as they travel
      { narration: true, text: 'The five of you set out from camp as the sun begins to set. By the time you reach the edge of the forest, night has fallen. Stars glitter overhead.',
        camPos: { x: -20, y: 8, z: -20 }, camLook: { x: -40, y: 2, z: -50 },
        onShow: function () { setNightMode(); } },

      { speaker: 'Graypaw', text: '"Can you believe it, ' + pName + '? We\'re going to the MOONSTONE! I bet it glows like a star!"',
        camPos: { x: -25, y: 3, z: -30 }, camLook: { x: -28, y: 1.5, z: -35 } },

      { speaker: 'Ravenpaw', text: '"I-I don\'t like the dark... I hope we don\'t run into any ShadowClan patrols out here..."',
        camPos: { x: -27, y: 2.5, z: -33 }, camLook: { x: -30, y: 1.5, z: -38 } },

      { narration: true, text: 'The trees thin as you reach the edge of ThunderClan\'s forest. The moon hangs low over the open moorland of WindClan — eerily empty and silent under the starlight.',
        camPos: { x: -30, y: 6, z: -55 }, camLook: { x: -50, y: 3, z: -70 } },

      { speaker: 'Tigerclaw', text: '"This territory stinks of ShadowClan. Brokenstar has driven WindClan out. Stay alert, all of you."',
        camPos: { x: -35, y: 3, z: -60 }, camLook: { x: -40, y: 2, z: -65 } },

      { narration: true, text: 'The cold night wind howls across the barren moor. Without WindClan\'s patrols, the moonlit hills feel dangerous and exposed. You press on in silence, your breath misting in the cold.',
        camPos: { x: -50, y: 10, z: -70 }, camLook: { x: -70, y: 3, z: -85 } },

      { speaker: 'Bluestar', text: '"The Moonstone lies deep inside Mothermouth, a cave in Highstones. Medicine cats and leaders come here to share tongues with StarClan."',
        camPos: { x: -60, y: 5, z: -80 }, camLook: { x: -80, y: 5, z: -90 } },

      // Arriving at Highstones
      { narration: true, text: 'At last, the rocky peaks of <strong>Highstones</strong> rise before you — jagged grey mountains silhouetted against the star-filled sky. The moon is nearly at its peak.',
        camPos: { x: -65, y: 10, z: -85 }, camLook: { x: -80, y: 7, z: -97 } },

      { narration: true, text: 'A dark opening yawns in the rock face, blacker than the night itself. This is <strong>Mothermouth</strong> — the entrance to the cave where the Moonstone lies.',
        camPos: { x: -78, y: 4, z: -90 }, camLook: { x: -80, y: 2, z: -94 } },

      { speaker: 'Bluestar', text: '"We must wait for moonrise. When the moon shines into the cave, the Moonstone will glow with StarClan\'s light."',
        camPos: { x: -76, y: 3, z: -91 }, camLook: { x: -80, y: 2, z: -93 } },

      { speaker: 'Bluestar', text: '"Graypaw, Ravenpaw, Tigerclaw — you three will wait out here. ' + pName + ', you are coming inside with me."',
        camPos: { x: -76, y: 3, z: -90 }, camLook: { x: -78, y: 2, z: -92 } },

      { speaker: 'Graypaw', text: '"Aw, we have to wait outside? I wanted to see the Moonstone!"',
        camPos: { x: -74, y: 2, z: -89 }, camLook: { x: -75, y: 1.2, z: -90 } },

      { speaker: 'Tigerclaw', text: '"I will guard the entrance. No one enters while Bluestar is inside. Go."',
        camPos: { x: -75, y: 2.5, z: -90 }, camLook: { x: -76, y: 1.2, z: -91 } },

      { speaker: 'Ravenpaw', text: '"G-good luck in there, ' + pName + '... I\'ve heard it\'s really dark inside..."',
        camPos: { x: -73, y: 2, z: -89 }, camLook: { x: -74, y: 1, z: -90 } },

      // Going inside — just you and Bluestar
      { narration: true, text: 'You follow Bluestar into the pitch-black tunnel, leaving the others behind. The stone is ice-cold beneath your paws. The darkness swallows you whole.',
        camPos: { x: -80, y: 2, z: -94 }, camLook: { x: -80, y: 1.5, z: -97 } },

      { narration: true, text: 'You can\'t see a thing. You follow the soft sound of Bluestar\'s paws ahead, feeling your whiskers brush the tunnel walls.',
        camPos: { x: -80, y: 1.8, z: -95 }, camLook: { x: -80, y: 1.2, z: -97 } },

      { narration: true, text: 'The tunnel opens into a vast underground cavern. In the center stands a great rock — the <strong>Moonstone</strong>. It sits in total darkness, waiting.',
        camPos: { x: -80, y: 3, z: -95.5 }, camLook: { x: -80, y: 1.5, z: -97 } },

      { speaker: 'Bluestar', text: '"Do not speak from this moment on, ' + pName + '. Watch, and be still."',
        camPos: { x: -81, y: 2, z: -95.5 }, camLook: { x: -80, y: 1.5, z: -97 } },

      // The Moonstone lights up
      { narration: true, text: 'A shaft of moonlight pierces through a hole in the cavern roof. It strikes the Moonstone — and the crystal ERUPTS in blazing silver-white light!',
        camPos: { x: -79, y: 2.5, z: -96 }, camLook: { x: -80, y: 1.5, z: -97 } },

      { narration: true, text: 'The light is blinding. The rock shimmers and shines, casting dazzling reflections across every surface. It\'s like a star has fallen into the earth. You shiver at the sheer power of it.',
        camPos: { x: -80, y: 2, z: -96.5 }, camLook: { x: -80, y: 1.5, z: -97 } },

      { narration: true, text: 'The Moonstone glows with an otherworldly light — shimmering silver, then blazing white, then pulsing blue. It seems alive. The whole cavern trembles with its energy.',
        camPos: { x: -79.5, y: 1.8, z: -96 }, camLook: { x: -80, y: 1.5, z: -97 } },

      // Bluestar sleeps next to the stone
      { narration: true, text: 'Bluestar pads forward slowly and lies down right next to the shimmering Moonstone. She curls her body against the glowing rock and closes her eyes.',
        camPos: { x: -81, y: 1.5, z: -96.5 }, camLook: { x: -80, y: 0.6, z: -97 } },

      { narration: true, text: 'She presses her nose gently against the stone. The glow intensifies, washing over her blue-grey fur, making it shimmer like starlight.',
        camPos: { x: -80.5, y: 1.2, z: -96.8 }, camLook: { x: -80, y: 0.5, z: -97 } },

      { narration: true, text: 'Bluestar lies perfectly still, sleeping beside the shining stone. The Moonstone pulses gently, each pulse sending waves of silver light across her fur and the cavern walls.',
        camPos: { x: -80, y: 1, z: -96.5 }, camLook: { x: -80, y: 0.5, z: -97.2 } },

      { narration: true, text: 'You watch in silence and awe. Bluestar is dreaming — sharing tongues with StarClan, the warrior ancestors who watch over the Clans from Silverpelt.',
        camPos: { x: -80, y: 2, z: -96 }, camLook: { x: -80, y: 0.5, z: -97 } },

      { narration: true, text: 'The shimmering light plays across the cavern ceiling like dancing stars. You feel a strange warmth despite the cold stone. Something brushes against your mind...',
        camPos: { x: -80, y: 3, z: -96 }, camLook: { x: -80, y: 1.5, z: -97 } },

      { narration: true, text: '<em>"Fire alone will save our Clan..."</em> The words drift through your mind like a whisper. Is StarClan speaking to you too? You shiver — not from the cold.',
        camPos: { x: -80, y: 2, z: -96.5 }, camLook: { x: -80, y: 1.5, z: -97 } },

      // Bluestar wakes
      { narration: true, text: 'After what feels like an eternity, Bluestar stirs. Her eyes flutter open. The moonlight begins to fade. The shimmering glow dies away, and the Moonstone becomes ordinary grey rock once more.',
        camPos: { x: -79, y: 2.5, z: -96 }, camLook: { x: -80, y: 1, z: -97 } },

      { speaker: 'Bluestar', text: '"It is done. StarClan has spoken to me... but their message was unclear. They showed me fire and shadow, locked in battle."',
        camPos: { x: -81, y: 2, z: -95 }, camLook: { x: -80, y: 1.5, z: -96 } },

      { speaker: 'Bluestar', text: '"Come, ' + pName + '. We must return to the others before dawn."',
        camPos: { x: -80, y: 2, z: -94 }, camLook: { x: -80, y: 1.5, z: -93 } },

      // Rejoining the others outside
      { narration: true, text: 'You emerge from Mothermouth into the cold night air. The stars still blaze above. Tigerclaw stands guard like a shadow. Graypaw and Ravenpaw are huddled together nearby, shivering.',
        camPos: { x: -77, y: 3, z: -91 }, camLook: { x: -76, y: 1, z: -90 } },

      { speaker: 'Graypaw', text: '"' + pName + '! What was it like in there? Was the Moonstone amazing?!"',
        camPos: { x: -74, y: 2, z: -89 }, camLook: { x: -75, y: 1.2, z: -90 } },

      { speaker: 'Ravenpaw', text: '"Y-you were in there for so long... we were starting to worry..."',
        camPos: { x: -73, y: 2, z: -89 }, camLook: { x: -74, y: 1, z: -90 } },

      { speaker: 'Bluestar', text: '"Let us go. We have a long journey home."',
        camPos: { x: -76, y: 2.5, z: -90 }, camLook: { x: -78, y: 1.5, z: -92 } },

      // The return — the rat attack (still night)
      { narration: true, text: 'The five of you begin the long journey home through the darkness. Near an old Twoleg barn, a musty, foul smell fills the night air.',
        camPos: { x: -60, y: 5, z: -75 }, camLook: { x: -55, y: 2, z: -70 } },

      { speaker: 'Tigerclaw', text: '"Rats! Everyone, be on your guard!"',
        camPos: { x: -55, y: 3, z: -72 }, camLook: { x: -50, y: 1, z: -70 } },

      { narration: true, text: 'A swarm of rats pours from the barn! Dozens of them, their eyes gleaming red in the darkness. They attack without fear!',
        camPos: { x: -52, y: 3, z: -70 }, camLook: { x: -50, y: 1, z: -68 } },
    ];

    // Start first part of cutscene, then launch the rat battle
    startCutscene(preBattleScenes, () => {
      startBattle({
        enemyName: 'Rat Swarm',
        enemyHP: 80,
        enemyMaxHP: 80,
        enemyAttack: 8,
        enemyDefense: 1,
        enemyFurColor: 0x554433,
        enemyEyeColor: 0xff3333,
        enemyStripes: false,
        expReward: 35,
        allies: [
          { name: 'Bluestar', attack: 12, phrases: ['For ThunderClan!', 'Stand your ground!', 'Fight together!'] },
          { name: 'Tigerclaw', attack: 14, phrases: ['Filthy vermin!', 'Die, rat!', 'I\'ll shred every one of them!'] },
          { name: 'Graypaw', attack: 7, phrases: ['Take THAT!', 'Get away from us!', 'There\'s too many!'] },
          { name: 'Ravenpaw', attack: 5, phrases: ['G-get back!', 'Leave us alone!', 'I won\'t run this time!'] },
        ],
        onWin: function () {
          // Continue the story after the rat battle
          gameState = 'cutscene';
          const postBattleScenes = [
            { narration: true, text: 'The last rats scatter and flee back into the barn! But the damage is done — Bluestar is badly wounded.',
              camPos: { x: -50, y: 3, z: -69 }, camLook: { x: -52, y: 1, z: -71 } },
            { narration: true, text: 'A tabby barn cat appears from the shadows. "I\'m Barley. You\'re lucky to be alive — those rats are vicious."',
              camPos: { x: -48, y: 3, z: -68 }, camLook: { x: -50, y: 1.5, z: -70 } },
            { narration: true, text: 'Bluestar staggers and falls. Her body goes still... then, after a terrible moment, she draws a shuddering breath. She\'s alive — but barely.',
              camPos: { x: -38, y: 2, z: -57 }, camLook: { x: -40, y: 0.5, z: -59 } },
            { narration: true, text: '<em>You realize with horror: Bluestar just lost a life.</em> Leaders have nine lives given by StarClan — but they are not limitless.',
              camPos: { x: -35, y: 3, z: -55 }, camLook: { x: -38, y: 1, z: -58 } },
            { speaker: 'Bluestar', text: '"I... I am alright. StarClan has returned me. But I have fewer lives now. We must be more careful."',
              camPos: { x: -37, y: 2, z: -56 }, camLook: { x: -40, y: 1, z: -58 } },
            { speaker: 'Graypaw', text: '"Bluestar lost a LIFE?! That\'s... that\'s really scary, ' + pName + '..."',
              camPos: { x: -36, y: 2, z: -54 }, camLook: { x: -37, y: 1.2, z: -55 } },
            { speaker: 'Ravenpaw', text: '"I-I thought she was dead... I was so scared..."',
              camPos: { x: -35, y: 2, z: -54 }, camLook: { x: -36, y: 1, z: -55 } },
            // Return to camp — dawn breaks
            { narration: true, text: 'Slowly, painfully, you all help Bluestar back through WindClan\'s empty territory and into ThunderClan\'s forest. The sky begins to lighten in the east.',
              camPos: { x: -15, y: 8, z: -30 }, camLook: { x: 0, y: 2, z: 0 } },
            { narration: true, text: 'You reach ThunderClan camp just as the sun rises, painting the sky gold and pink. Spottedleaf rushes to tend Bluestar\'s wounds.',
              camPos: { x: 2, y: 4, z: 10 }, camLook: { x: 0, y: 1, z: 0 },
              onShow: function () { setDayMode(); } },
            { speaker: 'Spottedleaf', text: '"Bluestar! What happened? These wounds..."',
              camPos: { x: -9, y: 2, z: 5 }, camLook: { x: -10, y: 1, z: 3 } },
            { speaker: 'Bluestar', text: '"Rats... near the barn on the way back from Highstones. We were outnumbered."',
              camPos: { x: -8, y: 2, z: 4 }, camLook: { x: -10, y: 1.5, z: 3 } },
            { speaker: 'Graypaw', text: '"' + pName + '! You actually saw the Moonstone up close! What was it like? Tell me everything!"',
              camPos: { x: 3, y: 2, z: 4 }, camLook: { x: 2, y: 1, z: 5 } },
            { narration: true, text: 'You tell Graypaw and Ravenpaw about the shimmering, shining Moonstone — how it blazed with light, how Bluestar slept beside it, how you heard the prophecy in your mind.',
              camPos: { x: 3, y: 2, z: 5 }, camLook: { x: 1, y: 1, z: 3 } },
            { speaker: 'Graypaw', text: '"That sounds INCREDIBLE. I wish I could have seen it... but I\'m glad you did, ' + pName + '."',
              camPos: { x: 3, y: 2, z: 4 }, camLook: { x: 2, y: 1, z: 5 } },
            { narration: true, text: 'Tigerclaw says nothing. He watches Bluestar being carried into the medicine den. His amber eyes are unreadable.',
              camPos: { x: 5, y: 2.5, z: -3 }, camLook: { x: 6, y: 1.2, z: -4 } },
            // ShadowClan attack as you arrive!
            { narration: true, text: 'But as you catch your breath, yowls of alarm ring through the camp! Dark shapes are pouring through the entrance!',
              camPos: { x: 0, y: 5, z: 10 }, camLook: { x: 0, y: 1, z: 0 } },
            { speaker: 'Whitestorm', text: '"ShadowClan! They\'re raiding the camp while Bluestar is wounded! Warriors, FIGHT!"',
              camPos: { x: 3, y: 2, z: 2 }, camLook: { x: 4, y: 1, z: 1 } },
            { narration: true, text: 'Brokenstar\'s warriors have chosen the worst possible moment to attack — with Bluestar barely alive in the medicine den! You must defend the camp!',
              camPos: { x: 0, y: 4, z: 8 }, camLook: { x: 0, y: 1, z: -2 } },
          ];
          startCutscene(postBattleScenes, () => {
            mothermouthTriggered = true;
            setDayMode();
            if (bs) { bs.group.position.set(-9, 0, 5); }
            if (tc) { tc.group.position.set(6, 0, -3); }
            if (gp) { gp.group.position.set(3, 0, 4); }
            if (rp) { rp.group.position.set(4, 0, 5); }
            player.position = { x: 2, y: 0, z: 3 };
            catGroup.position.set(2, 0, 3);

            // Launch the ShadowClan patrol battle — pick which cat to fight!
            const scEnemies = [
              { name: 'Clawface', hp: 55, maxHP: 55, atk: 11, def: 3, fur: 0x6b5b3a, eye: 0xddcc00, stripes: true, stripeColor: 0x3a2a1a, defeated: false },
              { name: 'Blackfoot', hp: 60, maxHP: 60, atk: 13, def: 4, fur: 0x222222, eye: 0xffcc33, stripes: false, stripeColor: 0, defeated: false },
              { name: 'Boulder', hp: 50, maxHP: 50, atk: 10, def: 5, fur: 0x888888, eye: 0xaacc44, stripes: false, stripeColor: 0, defeated: false },
              { name: 'Russetfur', hp: 45, maxHP: 45, atk: 12, def: 3, fur: 0x994422, eye: 0xddaa33, stripes: false, stripeColor: 0, defeated: false },
            ];

            startPatrolBattle({
              clan: 'ShadowClan',
              enemies: scEnemies,
              expReward: 50,
              retreatOnFirstWin: true, // beat ONE cat and they ALL retreat!
              onWin: function () {
                gameState = 'cutscene';
                const victoryScenes = [
                  { narration: true, text: 'The ShadowClan raiders see their warrior fall and panic! They flee into the forest, leaving ThunderClan\'s camp behind!',
                    camPos: { x: 0, y: 6, z: 8 }, camLook: { x: 0, y: 1, z: -10 } },
                  { narration: true, text: 'Yellowfang fought alongside ThunderClan, proving her loyalty. The Clan is shaken but safe.',
                    camPos: { x: -9, y: 2, z: 4 }, camLook: { x: -8, y: 1, z: 3 } },
                  { narration: true, text: '<em>Fire alone will save our Clan.</em> The prophecy burns in your mind. Bluestar grows weaker. ShadowClan grows bolder. The Clan needs you now more than ever.',
                    camPos: { x: 0, y: 6, z: 5 }, camLook: { x: 0, y: 2, z: 0 } },
                ];
                startCutscene(victoryScenes, () => {
                  gameState = 'playing';
                  placeCatsInCamp(); saveGame();
                  queueMessage('Narrator', 'ShadowClan has been driven off! Bluestar rests in the medicine den. Explore freely, and press "Next Chapter" when ready.');
                  showNextChapterButton();
                });
              },
              onLose: function () {
                player.health = Math.floor(player.maxHealth * 0.4);
                gameState = 'cutscene';
                const loseScenes = [
                  { narration: true, text: 'You are knocked down, but your Clanmates rally and drive ShadowClan away! The camp is saved.',
                    camPos: { x: 0, y: 4, z: 5 }, camLook: { x: 0, y: 1, z: 0 } },
                ];
                startCutscene(loseScenes, () => {
                  gameState = 'playing';
                  placeCatsInCamp(); saveGame();
                  queueMessage('Narrator', 'The ShadowClan raiders have retreated. You are bruised but alive. Explore freely!');
                  showNextChapterButton();
                });
              },
            });
          });
        },
        onLose: function () {
          // You can't really lose with 4 allies — but just in case, heal and retry
          player.health = player.maxHealth;
          queueMessage('Narrator', 'The rats overwhelm you momentarily, but your allies drag you to safety. You shake it off and fight again!');
          // Re-trigger the battle
          triggerMothermouthJourney();
        },
      });
    });
  }

  /* ====================================================
     YELLOWFANG ENCOUNTER (Chapter 3)
     The player finds an injured rogue cat near the border.
     ==================================================== */
  let yellowfangEncounterTriggered = false;

  function triggerYellowfangEncounter () {
    gameState = 'cutscene';
    yellowfangEncounterTriggered = true;
    hideNextChapterButton();

    // Make Yellowfang visible and position her near the ShadowClan border
    const yf = npcCats.find(c => c.name === 'Yellowfang');
    if (yf) {
      yf.group.visible = true;
      yf.group.position.set(-42, 0, 15);
    }

    // Position Bluestar in camp
    const bs = npcCats.find(c => c.name === 'Bluestar');
    if (bs) { bs.group.visible = true; bs.group.position.set(-3, 3.3, -4); }

    // Position the player near the border
    player.position = { x: -38, y: 0, z: 15 };
    catGroup.position.set(-38, 0, 15);

    const pName = player.name;

    const preScenes = [
      { narration: true, text: 'While hunting near the ShadowClan border, you catch a strange scent — not ThunderClan, not ShadowClan either...',
        camPos: { x: -36, y: 3, z: 18 }, camLook: { x: -42, y: 1, z: 15 } },

      { narration: true, text: 'You push through the undergrowth and find a scraggly, battle-scarred she-cat crouching in the shadows. Her dark gray fur is matted and her eyes burn with fury.',
        camPos: { x: -40, y: 2, z: 17 }, camLook: { x: -42, y: 0.5, z: 15 } },

      { speaker: '???', text: '"What are you staring at, kittypet? Get away from me before I claw your ears off!"',
        camPos: { x: -41, y: 1.5, z: 16 }, camLook: { x: -42, y: 0.8, z: 15 } },

      { speaker: pName, text: '"I\'m not a kittypet! I\'m ' + pName + ' of ThunderClan. Who are you?"',
        camPos: { x: -39, y: 1.5, z: 16 }, camLook: { x: -38, y: 1, z: 15 } },

      { speaker: '???', text: '"ThunderClan?! You\'re trespassing near ShadowClan territory! I\'ll teach you to sneak up on a warrior!"',
        camPos: { x: -41, y: 1.5, z: 14 }, camLook: { x: -42, y: 0.8, z: 15 } },

      { narration: true, text: 'The she-cat lunges at you, claws unsheathed! Despite her injuries, she fights with the ferocity of a cat twice her size!',
        camPos: { x: -40, y: 2, z: 16 }, camLook: { x: -41, y: 1, z: 15 } },
    ];

    startCutscene(preScenes, () => {
      // Battle against Yellowfang!
      startBattle({
        enemyName: '??? (Rogue She-cat)',
        enemyHP: 40,
        enemyMaxHP: 40,
        enemyAttack: 9,
        enemyDefense: 2,
        enemyFurColor: 0x666666,
        enemyEyeColor: 0xffaa00,
        enemyStripes: false,
        expReward: 25,
        onWin: function () {
          // After winning, the story continues — she reveals who she is
          gameState = 'cutscene';
          const postScenes = [
            { narration: true, text: 'The old she-cat collapses, panting heavily. Her wounds from before have reopened. She can barely stand.',
              camPos: { x: -40, y: 2, z: 17 }, camLook: { x: -42, y: 0.5, z: 15 } },

            { speaker: '???', text: '"...Alright, you win, kit. You fight well... for a kittypet."',
              camPos: { x: -41, y: 1.5, z: 16 }, camLook: { x: -42, y: 0.8, z: 15 } },

            { speaker: pName, text: '"I\'m NOT a kittypet! But you\'re hurt badly. Let me help you."',
              camPos: { x: -39, y: 1.5, z: 15 }, camLook: { x: -42, y: 0.8, z: 15 } },

            { speaker: '???', text: '"...Fine. I suppose even a ThunderClan cat has some sense. The name is <strong>Yellowfang</strong>. I was a ShadowClan medicine cat... before Brokenstar drove me out."',
              camPos: { x: -41, y: 1.5, z: 16 }, camLook: { x: -42, y: 0.8, z: 15 } },

            { narration: true, text: 'Yellowfang! A ShadowClan medicine cat, cast out by her own leader. Her eyes burn with a fierce intelligence despite her wounds.',
              camPos: { x: -42, y: 2.5, z: 16 }, camLook: { x: -42, y: 0.8, z: 15 } },

            { speaker: 'Yellowfang', text: '"Brokenstar is a tyrant. He trains kits as warriors before they\'re six moons old. He drove out the elders. ShadowClan is not what it once was."',
              camPos: { x: -41, y: 1.5, z: 14 }, camLook: { x: -42, y: 0.8, z: 15 } },

            { speaker: pName, text: '"That\'s terrible! Come with me — Bluestar will want to hear about this."',
              camPos: { x: -39, y: 1.5, z: 15 }, camLook: { x: -42, y: 0.8, z: 15 } },

            { speaker: 'Yellowfang', text: '"Hmph. Take me to your leader then, kit. But I warn you — I don\'t suffer fools."',
              camPos: { x: -41, y: 1.5, z: 16 }, camLook: { x: -42, y: 0.8, z: 15 } },

            // Scene at camp
            { narration: true, text: 'You bring Yellowfang back to ThunderClan camp. The Clan watches warily as the old she-cat limps through the entrance...',
              camPos: { x: 0, y: 5, z: 10 }, camLook: { x: 0, y: 1, z: 0 } },

            { speaker: 'Bluestar', text: '"' + pName + ', who is this? A ShadowClan cat in our camp?"',
              camPos: { x: -2, y: 3.5, z: 0 }, camLook: { x: -3, y: 3.3, z: -4 } },

            { speaker: pName, text: '"This is Yellowfang. She attacked me near the border, but I defeated her. She\'s a former ShadowClan medicine cat — Brokenstar drove her out."',
              camPos: { x: 1, y: 1.5, z: 2 }, camLook: { x: -3, y: 3.3, z: -4 } },

            { speaker: 'Bluestar', text: '"A medicine cat... exiled by Brokenstar? This is troubling news. But she is still a ShadowClan cat. She will stay in the <strong>prisoner den</strong> until we can be sure of her loyalty."',
              camPos: { x: -2, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.3, z: -4 } },

            { speaker: 'Bluestar', text: '"' + pName + ', you captured her — so you are responsible for her. Make sure she is fed and her wounds are tended. But she stays in the prisoner den."',
              camPos: { x: -2, y: 3.5, z: -2 }, camLook: { x: -3, y: 3.3, z: -4 } },

            { speaker: 'Yellowfang', text: '"A prisoner, am I? Hmph. I\'ve been through worse. At least your camp is drier than sleeping under a bush."',
              camPos: { x: 10, y: 2, z: 7 }, camLook: { x: 10, y: 1, z: 6 } },

            { narration: true, text: 'Yellowfang is led to the prisoner den — a small, bramble-walled den at the edge of camp. She curls up inside, her eyes watchful but weary.',
              camPos: { x: 11, y: 3, z: 8 }, camLook: { x: 10, y: 0.5, z: 6 } },

            { narration: true, text: '<em>Yellowfang is being held in the prisoner den. You are responsible for feeding her and caring for her wounds. Visit her often — she may have valuable information about ShadowClan.</em>',
              camPos: { x: 0, y: 8, z: 12 }, camLook: { x: 0, y: 2, z: 0 } },
          ];

          revealCatName('Yellowfang');

          startCutscene(postScenes, () => {
            gameState = 'playing';
            // Yellowfang stays in the prisoner den at first
            if (yf) {
              yf.group.visible = true;
              yf.group.position.set(10, 0, 6);
              if (yf.ai) {
                yf.ai.role = 'elder'; // stays put, doesn't wander far
                yf.ai.task = 'idle';
                yf.ai.timer = 5;
                yf.ai.home = { x: 10, z: 6 };
              }
            }
            placeCatsInCamp();
            saveGame();
            queueMessage('Narrator', 'Yellowfang is in the prisoner den. Visit her to feed her and learn about ShadowClan. Keep exploring the territory!');
            if (storyChapter < STORY_CHAPTERS.length) {
              showNextChapterButton();
            }
          });
        },
        onLose: function () {
          // If you lose, Yellowfang is too exhausted to keep fighting — story continues anyway
          player.health = Math.floor(player.maxHealth * 0.4);
          gameState = 'cutscene';
          const loseScenes = [
            { narration: true, text: 'The old she-cat pins you down — but then stumbles, too exhausted to continue. You both lie panting in the dirt.',
              camPos: { x: -40, y: 2, z: 16 }, camLook: { x: -41, y: 0.5, z: 15 } },
            { speaker: '???', text: '"Hmph... you\'re tougher than you look, kit. I\'m too injured to finish this fight anyway."',
              camPos: { x: -41, y: 1.5, z: 16 }, camLook: { x: -42, y: 0.8, z: 15 } },
            { speaker: '???', text: '"...The name is <strong>Yellowfang</strong>. I was a ShadowClan medicine cat... before Brokenstar drove me out. I\'ve got nowhere left to go."',
              camPos: { x: -41, y: 1.5, z: 16 }, camLook: { x: -42, y: 0.8, z: 15 } },
            { speaker: pName, text: '"Come with me to ThunderClan. Bluestar will want to hear about Brokenstar."',
              camPos: { x: -39, y: 1.5, z: 15 }, camLook: { x: -42, y: 0.8, z: 15 } },
            { narration: true, text: 'You bring Yellowfang back to ThunderClan camp. Bluestar orders her held in the prisoner den until her loyalty can be proven.',
              camPos: { x: 0, y: 5, z: 10 }, camLook: { x: 0, y: 1, z: 0 } },
            { narration: true, text: '<em>Yellowfang is being held in the prisoner den. You are responsible for caring for her.</em>',
              camPos: { x: 11, y: 3, z: 8 }, camLook: { x: 10, y: 0.5, z: 6 } },
          ];

          revealCatName('Yellowfang');

          startCutscene(loseScenes, () => {
            gameState = 'playing';
            if (yf) {
              yf.group.visible = true;
              yf.group.position.set(10, 0, 6);
              if (yf.ai) {
                yf.ai.role = 'elder';
                yf.ai.task = 'idle';
                yf.ai.timer = 5;
                yf.ai.home = { x: 10, z: 6 };
              }
            }
            placeCatsInCamp();
            saveGame();
            queueMessage('Narrator', 'Yellowfang is in the prisoner den. Visit her to feed her. Keep exploring!');
            if (storyChapter < STORY_CHAPTERS.length) {
              showNextChapterButton();
            }
          });
        },
      });
    });
  }

  /* ====================================================
     CHAPTER 4: SHADOWCLAN ATTACKS
     ==================================================== */
  function triggerDrivingOutBrokenstar () {
    gameState = 'cutscene';
    const pName = player.name || 'apprentice';
    const bs = npcCats.find(c => c.name === 'Bluestar');
    const yf = npcCats.find(c => c.name === 'Yellowfang');
    if (bs) { bs.group.visible = true; bs.group.position.set(-3, 3.3, -4); }

    const preScenes = [
      { speaker: 'Bluestar', text: '"Brokenstar has attacked us one too many times. We march on ShadowClan today. ThunderClan will end his reign of terror!"',
        camPos: { x: -1, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.3, z: -4 } },
      { speaker: 'Yellowfang', text: '"I know Brokenstar\'s weaknesses. He was my leader once — I know how he fights. Let me guide you."',
        camPos: { x: -9, y: 2, z: 4 }, camLook: { x: -8, y: 1, z: 3 } },
      { narration: true, text: 'ThunderClan crosses the border into ShadowClan territory! With Yellowfang leading the way, you storm into ShadowClan\'s camp!',
        camPos: { x: -50, y: 6, z: -20 }, camLook: { x: -60, y: 1, z: -25 } },
      { narration: true, text: 'Brokenstar\'s loyal warriors rush to defend him! But many ShadowClan cats are tired of Brokenstar\'s cruelty — they refuse to fight for him!',
        camPos: { x: -55, y: 4, z: -22 }, camLook: { x: -58, y: 1, z: -25 } },
    ];

    startCutscene(preScenes, () => {
      // Boss battle against Brokenstar with your Clanmates!
      startBattle({
        enemyName: 'Brokenstar',
        enemyHP: 85,
        enemyMaxHP: 85,
        enemyAttack: 14,
        enemyDefense: 5,
        enemyFurColor: 0x4a3520,
        enemyEyeColor: 0xffaa00,
        enemyStripes: true,
        enemyStripeColor: 0x221100,
        expReward: 50,
        allies: [
          { name: 'Yellowfang', attack: 11, phrases: ['Your cruelty ends today, Brokenstar!', 'I should have stopped you long ago!', 'ShadowClan deserves better!'] },
          { name: 'Whitestorm', attack: 12, phrases: ['For ThunderClan!', 'Stand down, Brokenstar!', 'Your time is over!'] },
          { name: 'Graypaw', attack: 8, phrases: ['We\'re taking you DOWN!', 'You can\'t bully the Clans anymore!', 'For the kits you stole!'] },
        ],
        onWin: function () {
          gameState = 'cutscene';
          const postScenes = [
            { narration: true, text: 'Brokenstar is defeated! Yellowfang rakes her claws across his eyes, blinding him! He yowls in agony and rage!',
              camPos: { x: -56, y: 2, z: -24 }, camLook: { x: -58, y: 0.5, z: -25 } },
            { speaker: 'Yellowfang', text: '"You will never lead again, Brokenstar. Your cruelty has earned you nothing but suffering."',
              camPos: { x: -57, y: 2, z: -24 }, camLook: { x: -58, y: 0.8, z: -25 } },
            { narration: true, text: 'Brokenstar is driven into exile, blind and broken. ShadowClan\'s remaining warriors thank ThunderClan for freeing them from his tyranny.',
              camPos: { x: -55, y: 5, z: -22 }, camLook: { x: -58, y: 1, z: -25 } },
            { speaker: 'Bluestar', text: '"Brokenstar is gone. ShadowClan is free. And ' + pName + ', you proved yourself a true warrior today."',
              camPos: { x: -1, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.3, z: -4 } },
            { speaker: 'Bluestar', text: '"Yellowfang — you have proven your loyalty to ThunderClan beyond any doubt. You fought against your own Clan to do what was right."',
              camPos: { x: -2, y: 3.5, z: -2 }, camLook: { x: -3, y: 3.3, z: -4 } },
            { speaker: 'Bluestar', text: '"You are no longer a prisoner. From this day forward, you are ThunderClan\'s <strong>medicine cat</strong>. The medicine den is yours."',
              camPos: { x: -1, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.3, z: -4 } },
            { speaker: 'Yellowfang', text: '"...Thank you, Bluestar. I won\'t let ThunderClan down. I may be grumpy, but I know my herbs."',
              camPos: { x: -9, y: 2, z: 4 }, camLook: { x: -10, y: 1, z: 3 } },
            { narration: true, text: '<em>Yellowfang has been freed from the prisoner den and is now ThunderClan\'s official medicine cat! Brokenstar is exiled, but Tigerclaw watches everything with hungry, ambitious eyes...</em>',
              camPos: { x: 0, y: 8, z: 5 }, camLook: { x: 0, y: 2, z: 0 } },
          ];
          startCutscene(postScenes, () => {
            gameState = 'playing';
            // Move Yellowfang from prisoner den to medicine den!
            if (yf) {
              yf.group.position.set(-10, 0, 3);
              if (yf.ai) {
                yf.ai.role = 'medicine';
                yf.ai.task = 'idle';
                yf.ai.timer = 5;
                yf.ai.home = { x: -10, z: 3 };
              }
            }
            placeCatsInCamp(); saveGame();
            queueMessage('Narrator', 'Yellowfang is now ThunderClan\'s medicine cat! She has moved from the prisoner den to the medicine den. Visit her for healing!');
            showNextChapterButton();
          });
        },
        onLose: function () {
          player.health = Math.floor(player.maxHealth * 0.5);
          gameState = 'cutscene';
          const loseScenes = [
            { narration: true, text: 'You stumble, but Yellowfang and Whitestorm finish the fight! Brokenstar is driven out!',
              camPos: { x: -55, y: 3, z: -22 }, camLook: { x: -58, y: 1, z: -25 } },
          ];
          startCutscene(loseScenes, () => {
            gameState = 'playing';
            // Move Yellowfang to medicine den after proving loyalty
            if (yf) {
              yf.group.position.set(-10, 0, 3);
              if (yf.ai) {
                yf.ai.role = 'medicine';
                yf.ai.task = 'idle';
                yf.ai.timer = 5;
                yf.ai.home = { x: -10, z: 3 };
              }
            }
            placeCatsInCamp(); saveGame();
            queueMessage('Narrator', 'Brokenstar is defeated! Yellowfang is now ThunderClan\'s medicine cat!');
            showNextChapterButton();
          });
        },
      });
    });
  }

  /* ====================================================
     CHAPTER 5: SPOTTEDLEAF'S WARNING
     ==================================================== */
  function triggerSpottedleafWarning () {
    gameState = 'cutscene';
    const pName = player.name || 'apprentice';
    const scenes = [
      { narration: true, text: 'Late one night, you dream of walking through a misty forest. The stars above shine brighter than you\'ve ever seen...',
        camPos: { x: 0, y: 3, z: 0 }, camLook: { x: 5, y: 2, z: -5 },
        onShow: function () { setNightMode(); } },
      { speaker: 'Spottedleaf', text: '"' + pName + '... can you hear me? I need to warn you."',
        camPos: { x: -8, y: 2, z: 4 }, camLook: { x: -10, y: 1, z: 3 } },
      { speaker: 'Spottedleaf', text: '"Beware a warrior you think you can trust. There is darkness in the heart of ThunderClan... a darkness that has already killed."',
        camPos: { x: -9, y: 2, z: 5 }, camLook: { x: -10, y: 1.5, z: 3 } },
      { speaker: 'Spottedleaf', text: '"Trust Ravenpaw. He saw the truth at Sunningrocks. Listen to what he has to tell you, ' + pName + '."',
        camPos: { x: -7, y: 2.5, z: 4 }, camLook: { x: -10, y: 1, z: 3 } },
      { narration: true, text: 'The dream fades. You wake in the apprentices\' den, heart pounding. Spottedleaf\'s warning echoes in your mind...',
        camPos: { x: 6, y: 2, z: 5 }, camLook: { x: 7, y: 1, z: 6 },
        onShow: function () { setDayMode(); } },
      { narration: true, text: '<em>Spottedleaf has spoken from StarClan. You must find Ravenpaw and learn what really happened at Sunningrocks...</em>',
        camPos: { x: 0, y: 6, z: 5 }, camLook: { x: 0, y: 2, z: 0 } },
    ];
    startCutscene(scenes, () => {
      gameState = 'playing'; setDayMode();
      saveGame();
      queueMessage('Narrator', 'Spottedleaf has warned you from StarClan. Talk to Ravenpaw when you can — he knows the truth about what happened at Sunningrocks.');
      showNextChapterButton();
    });
  }

  /* ====================================================
     CHAPTER 6: RAVENPAW'S SECRET
     ==================================================== */
  function triggerRavenpawSecret () {
    gameState = 'cutscene';
    const pName = player.name || 'apprentice';
    const rp = npcCats.find(c => c.name === 'Ravenpaw');
    const gp = npcCats.find(c => c.name === 'Graypaw');
    if (rp) { rp.group.visible = true; rp.group.position.set(8, 0, 8); }
    if (gp) { gp.group.visible = true; gp.group.position.set(player.position.x + 2, 0, player.position.z); }

    const scenes = [
      { narration: true, text: 'You find Ravenpaw alone near the edge of camp. He looks more nervous than usual, glancing around fearfully.',
        camPos: { x: 10, y: 2, z: 9 }, camLook: { x: 8, y: 1, z: 8 } },
      { speaker: pName, text: '"Ravenpaw, I need to talk to you. What really happened at Sunningrocks? What did you see?"',
        camPos: { x: 9, y: 2, z: 8 }, camLook: { x: 8, y: 1, z: 8 } },
      { speaker: 'Ravenpaw', text: '"I-I... ' + pName + ', you have to promise not to tell anyone. Especially not Tigerclaw."',
        camPos: { x: 9, y: 1.8, z: 9 }, camLook: { x: 8, y: 1, z: 8 } },
      { speaker: 'Ravenpaw', text: '"At Sunningrocks... Oakheart didn\'t kill Redtail. They were fighting, but then rocks fell and crushed Oakheart."',
        camPos: { x: 8.5, y: 1.5, z: 8.5 }, camLook: { x: 8, y: 1, z: 8 } },
      { speaker: 'Ravenpaw', text: '"Redtail was alive after that. He was standing there, looking at Oakheart\'s body... and then..."',
        camPos: { x: 8, y: 1.5, z: 9 }, camLook: { x: 8, y: 1, z: 8 } },
      { speaker: 'Ravenpaw', text: '"...Tigerclaw killed Redtail. I SAW it, ' + pName + '! Tigerclaw murdered Redtail and claimed Oakheart did it!"',
        camPos: { x: 8, y: 1.8, z: 8.5 }, camLook: { x: 8, y: 1.2, z: 8 } },
      { speaker: 'Graypaw', text: '"WHAT?! Tigerclaw killed Redtail?! But... but he\'s our own Clanmate! That\'s... that\'s murder!"',
        camPos: { x: player.position.x + 3, y: 2, z: player.position.z }, camLook: { x: player.position.x + 2, y: 1, z: player.position.z } },
      { speaker: 'Ravenpaw', text: '"He did it so HE could become deputy. And now he\'s deputy... and I\'m the only witness. He\'ll kill me too if he finds out I told you!"',
        camPos: { x: 8, y: 1.5, z: 8 }, camLook: { x: 8, y: 1, z: 8 } },
      { narration: true, text: '<em>The terrible truth is revealed. Tigerclaw murdered Redtail to become deputy. Ravenpaw is in danger — you must protect him.</em>',
        camPos: { x: 0, y: 6, z: 5 }, camLook: { x: 0, y: 2, z: 0 } },
    ];
    startCutscene(scenes, () => {
      gameState = 'playing'; placeCatsInCamp(); saveGame();
      queueMessage('Narrator', 'Ravenpaw has told you the terrible truth — Tigerclaw murdered Redtail. You need to get Ravenpaw somewhere safe before Tigerclaw silences him.');
      showNextChapterButton();
    });
  }

  /* ====================================================
     CHAPTER 7: RAVENPAW LEAVES
     ==================================================== */
  function triggerRavenpawLeaves () {
    gameState = 'cutscene';
    const pName = player.name || 'apprentice';
    const rp = npcCats.find(c => c.name === 'Ravenpaw');
    const gp = npcCats.find(c => c.name === 'Graypaw');

    const scenes = [
      { narration: true, text: 'Under cover of darkness, you and Graypaw sneak Ravenpaw out of camp. Tigerclaw must not know he is leaving.',
        camPos: { x: 0, y: 4, z: 15 }, camLook: { x: 0, y: 1, z: 25 },
        onShow: function () { setNightMode(); } },
      { speaker: 'Graypaw', text: '"Where will he go? He can\'t stay in the forest — Tigerclaw will find him."',
        camPos: { x: 2, y: 2, z: 18 }, camLook: { x: 1, y: 1, z: 20 } },
      { speaker: pName, text: '"Remember the barn cat who helped us fight the rats on the way to Mothermouth? Barley! Ravenpaw can live with him."',
        camPos: { x: 0, y: 2, z: 20 }, camLook: { x: -1, y: 1, z: 22 } },
      { speaker: 'Ravenpaw', text: '"Thank you, ' + pName + '. Thank you, Graypaw. I\'ll miss ThunderClan... but I\'ll be safe with Barley."',
        camPos: { x: -1, y: 2, z: 22 }, camLook: { x: 0, y: 1, z: 24 } },
      { narration: true, text: 'You escort Ravenpaw through the forest and across the moor until you reach the old Twoleg barn. Barley is there, and he welcomes Ravenpaw warmly.',
        camPos: { x: -55, y: 5, z: -70 }, camLook: { x: -50, y: 2, z: -68 } },
      { speaker: 'Ravenpaw', text: '"Goodbye, friends. Expose Tigerclaw for what he is. The Clan deserves to know the truth."',
        camPos: { x: -52, y: 2, z: -69 }, camLook: { x: -50, y: 1, z: -68 } },
      { narration: true, text: 'You and Graypaw make the long journey back to ThunderClan territory as dawn breaks.',
        camPos: { x: -15, y: 8, z: -30 }, camLook: { x: 0, y: 2, z: 0 },
        onShow: function () { setDayMode(); } },
      { narration: true, text: '<em>Ravenpaw is safe with Barley at the barn. But Tigerclaw remains in camp, deputy of ThunderClan, his terrible secret still hidden...</em>',
        camPos: { x: 0, y: 6, z: 5 }, camLook: { x: 0, y: 2, z: 0 } },
    ];
    startCutscene(scenes, () => {
      gameState = 'playing'; setDayMode();
      if (rp) { rp.group.visible = false; rp.group.position.set(-50, 0, -68); }
      placeCatsInCamp(); saveGame();
      queueMessage('Narrator', 'Ravenpaw is safe at Barley\'s barn. Now you must find a way to expose Tigerclaw\'s treachery to the Clan.');
      showNextChapterButton();
    });
  }

  /* ====================================================
     CHAPTER 8: FIRE AND ICE
     ==================================================== */
  function triggerFireAndIce () {
    gameState = 'cutscene';
    const pName = player.name || 'apprentice';
    const bs = npcCats.find(c => c.name === 'Bluestar');
    if (bs) { bs.group.visible = true; bs.group.position.set(-3, 3.3, -4); }

    const scenes = [
      { speaker: 'Bluestar', text: '"' + pName + ', I have an important mission for you. WindClan was driven from their territory by ShadowClan moons ago."',
        camPos: { x: -1, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.3, z: -4 } },
      { speaker: 'Bluestar', text: '"The forest needs four Clans. Without WindClan, the balance is broken. You and Graypaw must find them and bring them home."',
        camPos: { x: -2, y: 3, z: -2 }, camLook: { x: -3, y: 3.3, z: -4 } },
      { speaker: 'Bluestar', text: '"Tigerclaw will not approve of this mission. Do it quietly and quickly. The Clans are counting on you."',
        camPos: { x: 0, y: 3.5, z: 0 }, camLook: { x: -3, y: 3.3, z: -4 } },
      { narration: true, text: '<em>Bluestar has given you your most important mission yet — find WindClan and bring them back to the forest!</em>',
        camPos: { x: 0, y: 8, z: 5 }, camLook: { x: 0, y: 2, z: 0 } },
    ];
    startCutscene(scenes, () => {
      gameState = 'playing'; placeCatsInCamp(); saveGame();
      queueMessage('Narrator', 'Bluestar has sent you on a mission to find and rescue WindClan. The journey will be dangerous, but the forest needs all four Clans.');
      showNextChapterButton();
    });
  }

  /* ====================================================
     CHAPTER 9: BRING BACK WINDCLAN
     ==================================================== */
  function triggerWindClanRescue () {
    gameState = 'cutscene';
    const pName = player.name || 'apprentice';
    const gp = npcCats.find(c => c.name === 'Graypaw');
    if (gp) { gp.group.visible = true; gp.group.position.set(player.position.x + 2, 0, player.position.z); }

    const scenes = [
      { narration: true, text: 'You and Graypaw travel far beyond the Clan territories, following the faintest traces of WindClan scent.',
        camPos: { x: -30, y: 8, z: -70 }, camLook: { x: -50, y: 3, z: -90 } },
      { narration: true, text: 'After a long and exhausting journey, you find WindClan huddled in an abandoned Twoleg tunnel — starving, cold, and afraid.',
        camPos: { x: -50, y: 4, z: -85 }, camLook: { x: -55, y: 2, z: -88 } },
      { speaker: 'Graypaw', text: '"We found them, ' + pName + '! Look at them — they\'re so thin. We have to convince them to come home."',
        camPos: { x: -48, y: 2, z: -83 }, camLook: { x: -50, y: 1, z: -85 } },
      { narration: true, text: 'After much persuading, Tallstar, WindClan\'s leader, agrees. WindClan follows you home across the moors.',
        camPos: { x: -40, y: 10, z: -75 }, camLook: { x: -30, y: 2, z: -60 } },
      { narration: true, text: 'WindClan returns to their territory at last! Tallstar dips his head to you in gratitude.',
        camPos: { x: -35, y: 6, z: -55 }, camLook: { x: -30, y: 2, z: -50 } },
      { narration: true, text: '"ThunderClan has earned WindClan\'s friendship this day," Tallstar declares. "We will not forget this kindness."',
        camPos: { x: -32, y: 3, z: -52 }, camLook: { x: -35, y: 1.5, z: -55 } },
      { narration: true, text: '<em>WindClan has returned! The forest has four Clans once more. You and Graypaw are heroes.</em>',
        camPos: { x: 0, y: 8, z: 5 }, camLook: { x: 0, y: 2, z: 0 } },
    ];
    startCutscene(scenes, () => {
      gameState = 'playing'; placeCatsInCamp(); saveGame();
      queueMessage('Narrator', 'WindClan has returned to the forest! You\'ve earned the friendship of another Clan. But Tigerclaw\'s ambition still threatens ThunderClan from within.');
      showNextChapterButton();
    });
  }

  /* ====================================================
     CHAPTER 10: TIGERCLAW'S TREACHERY
     ==================================================== */
  function triggerTigerclawTreachery () {
    gameState = 'cutscene';
    const pName = player.name || 'apprentice';
    const tc = npcCats.find(c => c.name === 'Tigerclaw');
    const bs = npcCats.find(c => c.name === 'Bluestar');
    if (tc) { tc.group.visible = true; tc.group.position.set(5, 0, -2); }
    if (bs) { bs.group.visible = true; bs.group.position.set(-3, 3.3, -4); }

    const preScenes = [
      { narration: true, text: 'You discover that Tigerclaw has been plotting in secret. He has been leading rogues into ThunderClan territory, planning to overthrow Bluestar!',
        camPos: { x: 0, y: 5, z: 8 }, camLook: { x: 0, y: 1, z: 0 } },
      { narration: true, text: 'One night, Tigerclaw leads a band of rogues directly into the ThunderClan camp! Cats scatter in terror!',
        camPos: { x: 0, y: 4, z: 12 }, camLook: { x: 0, y: 1, z: 0 },
        onShow: function () { setNightMode(); } },
      { speaker: 'Tigerclaw', text: '"It\'s time, Bluestar! I should have been leader long ago. ThunderClan needs a STRONG leader — not a weak old she-cat!"',
        camPos: { x: 6, y: 2.5, z: -1 }, camLook: { x: 5, y: 1.2, z: -2 } },
      { narration: true, text: 'Tigerclaw lunges at Bluestar! You throw yourself between them to defend your leader!',
        camPos: { x: 2, y: 2, z: -3 }, camLook: { x: 0, y: 1, z: -4 } },
    ];

    startCutscene(preScenes, () => {
      // Battle against Tigerclaw with your Clanmates!
      startBattle({
        enemyName: 'Tigerclaw',
        enemyHP: 100,
        enemyMaxHP: 100,
        enemyAttack: 18,
        enemyDefense: 6,
        enemyFurColor: 0x5a3a1a,
        enemyEyeColor: 0xffaa11,
        enemyStripes: true,
        enemyStripeColor: 0x221100,
        expReward: 60,
        allies: [
          { name: 'Whitestorm', attack: 12, phrases: ['Traitor!', 'You won\'t touch Bluestar!', 'ThunderClan stands together!'] },
          { name: 'Graypaw', attack: 9, phrases: ['How COULD you, Tigerclaw?!', 'We trusted you!', 'For ThunderClan!'] },
          { name: 'Mousefur', attack: 10, phrases: ['You\'ll pay for this betrayal!', 'ThunderClan, fight!', 'Drive him out!'] },
        ],
        onWin: function () {
          gameState = 'cutscene';
          const postScenes = [
            { narration: true, text: 'Tigerclaw and his rogues are defeated! He stands surrounded by ThunderClan warriors, his treachery exposed for all to see.',
              camPos: { x: 0, y: 4, z: 2 }, camLook: { x: 3, y: 1, z: -2 } },
          ];
          startCutscene(postScenes, () => {
            gameState = 'playing'; setDayMode();
            placeCatsInCamp(); saveGame();
            queueMessage('Narrator', 'Tigerclaw\'s treachery has been exposed! He tried to kill Bluestar and take over ThunderClan. His fate is in Bluestar\'s paws now.');
            showNextChapterButton();
          });
        },
        onLose: function () {
          // Can't really lose this — story continues regardless
          player.health = Math.floor(player.maxHealth * 0.5);
          gameState = 'playing'; setDayMode();
          placeCatsInCamp(); saveGame();
          queueMessage('Narrator', 'You are wounded, but your Clanmates subdue Tigerclaw. His treachery is exposed!');
          showNextChapterButton();
        },
      });
    });
  }

  /* ====================================================
     CHAPTER 11: TIGERCLAW'S EXILE
     ==================================================== */
  function triggerTigerclawExile () {
    gameState = 'cutscene';
    const pName = player.name || 'apprentice';
    const tc = npcCats.find(c => c.name === 'Tigerclaw');
    const bs = npcCats.find(c => c.name === 'Bluestar');
    if (tc) { tc.group.visible = true; tc.group.position.set(3, 0, 2); }
    if (bs) { bs.group.visible = true; bs.group.position.set(-3, 3.3, -4); }

    const scenes = [
      { speaker: 'Bluestar', text: '"Tigerclaw, you have betrayed ThunderClan in the worst way possible. You murdered Redtail. You tried to murder me."',
        camPos: { x: -1, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.3, z: -4 } },
      { speaker: 'Bluestar', text: '"I exile you from ThunderClan! If any warrior sees you on our territory after today, they have my permission to kill you."',
        camPos: { x: -2, y: 3.5, z: -2 }, camLook: { x: -3, y: 3.3, z: -4 } },
      { speaker: 'Tigerclaw', text: '"You\'ll regret this, Bluestar. ALL of you will regret this! I will have my revenge — and I will be leader. Of a Clan far more powerful than ThunderClan!"',
        camPos: { x: 4, y: 2, z: 3 }, camLook: { x: 3, y: 1.2, z: 2 } },
      { narration: true, text: 'Tigerclaw turns and stalks out of camp, his tail lashing. Several cats — Darkstripe among them — follow him into exile.',
        camPos: { x: 0, y: 4, z: 10 }, camLook: { x: 0, y: 1, z: 20 } },
      { speaker: 'Bluestar', text: '"' + pName + '... you have saved my life and exposed a traitor. ThunderClan owes you everything."',
        camPos: { x: -1, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.3, z: -4 } },
      { narration: true, text: '<em>Tigerclaw has been exiled from ThunderClan! But his threat of revenge hangs in the air like storm clouds...</em>',
        camPos: { x: 0, y: 8, z: 5 }, camLook: { x: 0, y: 2, z: 0 } },
    ];
    startCutscene(scenes, () => {
      gameState = 'playing';
      if (tc) { tc.group.visible = false; tc.group.position.set(-200, 0, -200); }
      placeCatsInCamp(); saveGame();
      queueMessage('Narrator', 'Tigerclaw has been exiled! He swore revenge. But for now, ThunderClan is safe — and Bluestar says you deserve a reward...');
      showNextChapterButton();
    });
  }

  /* ====================================================
     CHAPTER 12: WARRIOR CEREMONY
     ==================================================== */
  function triggerWarriorCeremony () {
    gameState = 'cutscene';
    const pName = player.name || 'apprentice';
    const warName = pName.replace(/paw$/, 'heart');
    const bs = npcCats.find(c => c.name === 'Bluestar');
    if (bs) { bs.group.visible = true; bs.group.position.set(-3, 3.3, -4); }

    const scenes = [
      { narration: true, text: 'Bluestar calls a Clan meeting from the Highrock. All of ThunderClan gathers, their eyes shining.',
        camPos: { x: 0, y: 4, z: 3 }, camLook: { x: -3, y: 3.5, z: -4 } },
      { speaker: 'Bluestar', text: '"I call upon my warrior ancestors to look down on this apprentice. ' + pName + ' has trained hard to understand the ways of your noble code, and I commend them to you as a warrior in return."',
        camPos: { x: -1, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.5, z: -4 } },
      { speaker: 'Bluestar', text: '"' + pName + ', do you promise to uphold the warrior code and to protect and defend this Clan, even at the cost of your life?"',
        camPos: { x: -2, y: 3.5, z: -2 }, camLook: { x: 0, y: 1.2, z: 2 } },
      { speaker: pName, text: '"I do."',
        camPos: { x: 1, y: 2, z: 3 }, camLook: { x: -3, y: 3.3, z: -4 } },
      { speaker: 'Bluestar', text: '"Then by the powers of StarClan, I give you your warrior name. ' + pName + ', from this moment on you will be known as <strong>' + warName + '</strong>."',
        camPos: { x: -1, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.5, z: -4 } },
      { speaker: 'Bluestar', text: '"StarClan honors your courage and your loyalty, and we welcome you as a full warrior of ThunderClan."',
        camPos: { x: -2, y: 3.5, z: -2 }, camLook: { x: -3, y: 3.5, z: -4 } },
      { narration: true, text: '"' + warName.toUpperCase() + '! ' + warName.toUpperCase() + '!" The Clan chants your new name! You are a WARRIOR at last!',
        camPos: { x: 0, y: 5, z: 5 }, camLook: { x: 0, y: 2, z: 0 } },
      { speaker: 'Graypaw', text: '"YES! ' + warName + '! That\'s the best name EVER! I hope I get my warrior name soon too!"',
        camPos: { x: 3, y: 2, z: 4 }, camLook: { x: 2, y: 1, z: 5 } },
      { narration: true, text: '<em>You are ' + warName + ' now — a full warrior of ThunderClan! Your apprenticeship is over. But the challenges ahead will be greater than ever...</em>',
        camPos: { x: 0, y: 8, z: 5 }, camLook: { x: 0, y: 2, z: 0 } },
    ];
    playSound('ceremony');
    startCutscene(scenes, () => {
      gameState = 'playing';
      // Update player name to warrior name
      player.name = warName;
      playerNameEl.textContent = warName;
      player.level = (player.level || 1) + 2;
      placeCatsInCamp(); saveGame();
      queueMessage('Narrator', 'You are ' + warName + ', warrior of ThunderClan! But Tigerclaw is still out there, and danger lurks on every path...');
      showNextChapterButton();
    });
  }

  /* ====================================================
     CHAPTER 13: A DANGEROUS PATH
     ==================================================== */
  function triggerDangerousPath () {
    gameState = 'cutscene';
    const pName = player.name || 'warrior';
    const scenes = [
      { narration: true, text: 'Dark times fall upon the forest. A pack of savage dogs has been sighted in ThunderClan territory — huge, vicious beasts that kill without mercy.',
        camPos: { x: 0, y: 6, z: 10 }, camLook: { x: 0, y: 1, z: -5 } },
      { narration: true, text: 'Worse still, you discover a trail of dead rabbits leading from ShadowClan territory straight to the ThunderClan camp — someone is LURING the dogs here!',
        camPos: { x: 15, y: 3, z: 20 }, camLook: { x: 10, y: 0.5, z: 15 } },
      { narration: true, text: '<em>Tigerclaw.</em> Even in exile, he plots to destroy ThunderClan. He is leading the dog pack right to your camp!',
        camPos: { x: 30, y: 4, z: -25 }, camLook: { x: 25, y: 1, z: -30 } },
      { speaker: 'Bluestar', text: '"We must lead the dogs away from camp. ' + pName + ', organize a relay of cats to lure them toward the gorge!"',
        camPos: { x: -1, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.3, z: -4 } },
      { narration: true, text: '<em>You must save the Clan from Tigerclaw\'s terrible plan. The dog pack must be stopped!</em>',
        camPos: { x: 0, y: 10, z: 5 }, camLook: { x: 0, y: 2, z: 0 } },
    ];
    startCutscene(scenes, () => {
      gameState = 'playing'; placeCatsInCamp(); saveGame();
      queueMessage('Narrator', 'Tigerclaw is luring a dog pack to ThunderClan\'s camp! You must organize a plan to lead them away. The Clan\'s survival depends on it.');
      showNextChapterButton();
    });
  }

  /* ====================================================
     CHAPTER 14: THE DOG PACK
     ==================================================== */
  function triggerDogPack () {
    gameState = 'cutscene';
    const pName = player.name || 'warrior';
    const scenes = [
      { narration: true, text: 'The plan is set! A relay of ThunderClan\'s fastest cats will lure the dog pack along a trail, one by one, leading them toward the river gorge!',
        camPos: { x: 0, y: 6, z: 10 }, camLook: { x: 20, y: 1, z: 30 } },
      { narration: true, text: 'The howling of dogs echoes through the forest! The pack charges toward camp — but the relay cats spring into action!',
        camPos: { x: 15, y: 4, z: 20 }, camLook: { x: 20, y: 1, z: 25 } },
      { narration: true, text: 'One by one, each cat runs as fast as they can before the next takes over. The dogs follow, snarling and snapping at every tail!',
        camPos: { x: 30, y: 5, z: 10 }, camLook: { x: 40, y: 1, z: 5 } },
      { narration: true, text: 'You are the last cat in the relay — the anchor! The dogs barrel toward you, their eyes wild with bloodlust!',
        camPos: { x: 60, y: 3, z: -5 }, camLook: { x: 65, y: 1, z: -8 } },
      { narration: true, text: 'You run with everything you have! The gorge is just ahead — you can hear the river roaring below!',
        camPos: { x: 68, y: 3, z: -10 }, camLook: { x: 72, y: 1, z: -12 } },
      { narration: true, text: 'At the very last moment, you leap aside! The lead dog tries to stop — but the pack behind pushes them over the edge! The dogs tumble into the gorge!',
        camPos: { x: 73, y: 5, z: -10 }, camLook: { x: 75, y: -2, z: -12 } },
      { narration: true, text: 'The dog pack is gone! But as you catch your breath, you see Bluestar standing at the edge of the gorge — she pushed the last dog off, but she\'s slipping!',
        camPos: { x: 74, y: 3, z: -11 }, camLook: { x: 75, y: 0, z: -12 } },
    ];
    startCutscene(scenes, () => {
      gameState = 'playing'; placeCatsInCamp(); saveGame();
      queueMessage('Narrator', 'The dog pack has been defeated! But Bluestar is in danger at the gorge edge...');
      showNextChapterButton();
    });
  }

  /* ====================================================
     CHAPTER 15: BLUESTAR'S LAST LIFE
     ==================================================== */
  function triggerBluestarLastLife () {
    gameState = 'cutscene';
    const pName = player.name || 'warrior';
    const bs = npcCats.find(c => c.name === 'Bluestar');

    const scenes = [
      { narration: true, text: 'Bluestar clings to the edge of the gorge! The river rages far below! You rush to help her — but she\'s already falling!',
        camPos: { x: 74, y: 2, z: -11 }, camLook: { x: 75, y: -1, z: -12 } },
      { narration: true, text: 'Bluestar plunges into the freezing water! You dive in after her, swimming with all your strength to pull her to shore!',
        camPos: { x: 75, y: 1, z: -11 }, camLook: { x: 75, y: -3, z: -12 } },
      { narration: true, text: 'You drag Bluestar onto the riverbank. She coughs weakly. Her eyes are fading...',
        camPos: { x: 76, y: 1.5, z: -10 }, camLook: { x: 75, y: 0.3, z: -11 } },
      { speaker: 'Bluestar', text: '"' + pName + '... you saved the Clan. You are the fire that StarClan promised. I always knew."',
        camPos: { x: 75, y: 1, z: -10.5 }, camLook: { x: 75, y: 0.3, z: -11 } },
      { speaker: 'Bluestar', text: '"Tell ThunderClan... I am proud of every one of them. You will lead them well... Firestar."',
        camPos: { x: 75.5, y: 1, z: -10.5 }, camLook: { x: 75, y: 0.3, z: -11 } },
      { narration: true, text: 'Bluestar closes her eyes for the last time. StarClan comes to take her home. The greatest leader ThunderClan has ever known is gone.',
        camPos: { x: 75, y: 3, z: -10 }, camLook: { x: 75, y: 0, z: -11 } },
      { narration: true, text: '<em>Bluestar is dead. She used her last life to save her Clan. ThunderClan needs a new leader — and she chose you.</em>',
        camPos: { x: 0, y: 10, z: 5 }, camLook: { x: 0, y: 2, z: 0 } },
    ];
    startCutscene(scenes, () => {
      gameState = 'playing';
      if (bs) { bs.group.visible = false; }
      placeCatsInCamp(); saveGame();
      queueMessage('Narrator', 'Bluestar has died saving her Clan. She named you as the next leader of ThunderClan. You must travel to the Moonstone to receive your nine lives.');
      showNextChapterButton();
    });
  }

  /* ====================================================
     CHAPTER 16: FIRESTAR'S LEADERSHIP
     ==================================================== */
  function triggerFirestarLeadership () {
    gameState = 'cutscene';
    const pName = player.name || 'warrior';
    const leaderName = pName.replace(/heart$|paw$/, 'star');

    const scenes = [
      { narration: true, text: 'You travel to the Moonstone one final time — but this time, you go as ThunderClan\'s leader.',
        camPos: { x: -65, y: 8, z: -85 }, camLook: { x: -80, y: 5, z: -97 },
        onShow: function () { setNightMode(); } },
      { narration: true, text: 'You press your nose to the shimmering stone and fall into a deep dream. Nine starry cats appear before you — the spirits of StarClan.',
        camPos: { x: -80, y: 2, z: -96.5 }, camLook: { x: -80, y: 1.5, z: -97 } },
      { narration: true, text: 'One by one, they touch their nose to yours and give you a life. Courage. Loyalty. Compassion. Strength. Justice. Wisdom. Love. Endurance. Hope.',
        camPos: { x: -80, y: 3, z: -96 }, camLook: { x: -80, y: 1.5, z: -97 } },
      { narration: true, text: 'Bluestar is the last. She steps forward, her starry fur gleaming with pride.',
        camPos: { x: -80, y: 2, z: -96 }, camLook: { x: -80, y: 1, z: -97 } },
      { speaker: 'Bluestar', text: '"With this life I give you nobility, certainty, and faith. Use it well as you lead your Clan through the hardest battles yet to come."',
        camPos: { x: -81, y: 1.5, z: -96 }, camLook: { x: -80, y: 0.8, z: -97 } },
      { speaker: 'Bluestar', text: '"I hail you by your new name, <strong>' + leaderName + '</strong>. Your old life is no more. You have received the nine lives of a leader."',
        camPos: { x: -80, y: 2, z: -96 }, camLook: { x: -80, y: 1, z: -97 } },
      { narration: true, text: '"' + leaderName.toUpperCase() + '! ' + leaderName.toUpperCase() + '!" The voices of StarClan ring through the cavern like thunder!',
        camPos: { x: -80, y: 4, z: -95 }, camLook: { x: -80, y: 1.5, z: -97 } },
      { narration: true, text: '<em>You are ' + leaderName + ' now — leader of ThunderClan, with nine lives granted by StarClan. But the greatest battle is still to come...</em>',
        camPos: { x: 0, y: 8, z: 5 }, camLook: { x: 0, y: 2, z: 0 },
        onShow: function () { setDayMode(); } },
    ];
    playSound('ceremony');
    startCutscene(scenes, () => {
      gameState = 'playing'; setDayMode();
      player.name = leaderName;
      playerNameEl.textContent = leaderName;
      player.level = (player.level || 1) + 3;
      player.maxHealth = 200; player.health = 200;
      placeCatsInCamp(); saveGame();
      queueMessage('Narrator', 'You are ' + leaderName + ', leader of ThunderClan with nine lives! But Tigerclaw — now called Tigerstar — is building an army...');
      showNextChapterButton();
    });
  }

  /* ====================================================
     CHAPTER 17: TIGERCLAN RISES
     ==================================================== */
  function triggerTigerClanRises () {
    gameState = 'cutscene';
    const pName = player.name || 'leader';
    const scenes = [
      { narration: true, text: 'Terrible news reaches ThunderClan. Tigerclaw has become <strong>Tigerstar</strong>, leader of ShadowClan! He received nine lives from StarClan\'s darkest spirits.',
        camPos: { x: 0, y: 6, z: 5 }, camLook: { x: 0, y: 2, z: 0 } },
      { narration: true, text: 'Tigerstar has united ShadowClan and RiverClan under his rule, calling his empire <strong>TigerClan</strong>. He demands that ThunderClan and WindClan join — or be destroyed.',
        camPos: { x: -60, y: 8, z: -10 }, camLook: { x: -78, y: 2, z: 0 } },
      { narration: true, text: 'At a Gathering at Fourtrees, Tigerstar reveals his plan. He wants to rule the entire forest under one Clan — HIS Clan.',
        camPos: { x: -43, y: 4, z: -43 }, camLook: { x: -45, y: 1.5, z: -45 } },
      { narration: true, text: 'You refuse. "The forest needs four Clans," you declare. "We will NEVER join TigerClan!"',
        camPos: { x: -44, y: 2.5, z: -44 }, camLook: { x: -45, y: 2, z: -45 } },
      { narration: true, text: 'Tigerstar\'s eyes narrow with rage. "Then you have chosen to die, ' + pName + '. I will bring a force so powerful that not even StarClan can save you."',
        camPos: { x: -46, y: 2.5, z: -46 }, camLook: { x: -45, y: 1.5, z: -45 } },
      { narration: true, text: '<em>Tigerstar has threatened all-out war. He speaks of bringing cats from beyond the forest — a terrifying Clan of rogues called BloodClan...</em>',
        camPos: { x: 0, y: 10, z: 5 }, camLook: { x: 0, y: 2, z: 0 } },
    ];
    startCutscene(scenes, () => {
      gameState = 'playing'; placeCatsInCamp(); saveGame();
      queueMessage('Narrator', 'Tigerstar has formed TigerClan and threatens to destroy you. He\'s bringing a force called BloodClan from Twolegplace. Prepare for the biggest battle the forest has ever seen.');
      showNextChapterButton();
    });
  }

  /* ====================================================
     CHAPTER 18: BLOODCLAN ARRIVES
     ==================================================== */
  function triggerBloodClanArrives () {
    gameState = 'cutscene';
    const pName = player.name || 'leader';
    const scenes = [
      { narration: true, text: 'At Fourtrees, Tigerstar presents his secret weapon: <strong>BloodClan</strong>, a vicious group of Twolegplace cats led by a small but terrifying cat named <strong>Scourge</strong>.',
        camPos: { x: -43, y: 5, z: -43 }, camLook: { x: -45, y: 1.5, z: -45 } },
      { narration: true, text: 'Scourge is small and black with one white paw. His collar is studded with the teeth and claws of the cats he has killed. His ice-blue eyes show no mercy.',
        camPos: { x: -46, y: 2, z: -44 }, camLook: { x: -47, y: 0.8, z: -45 } },
      { narration: true, text: 'Tigerstar commands Scourge to attack ThunderClan. But Scourge does not take orders.',
        camPos: { x: -46, y: 2.5, z: -45 }, camLook: { x: -47, y: 1, z: -45 } },
      { narration: true, text: 'With a single blow of his reinforced claws, <strong>Scourge kills Tigerstar</strong> — ripping through all nine of his lives at once! The forest has never seen anything like it.',
        camPos: { x: -45, y: 2, z: -44.5 }, camLook: { x: -45, y: 0.3, z: -45 } },
      { narration: true, text: 'Scourge turns his cold gaze on the four Clans. "I am the leader here now. You have three days to leave the forest — or BloodClan will take it by force."',
        camPos: { x: -47, y: 2, z: -44 }, camLook: { x: -46, y: 1, z: -45 } },
      { narration: true, text: '<em>Tigerstar is dead, killed by the very monster he unleashed. Now BloodClan threatens to destroy ALL the Clans. The forest\'s only hope is for every Clan to unite as one — under your leadership.</em>',
        camPos: { x: 0, y: 10, z: 5 }, camLook: { x: 0, y: 2, z: 0 } },
    ];
    startCutscene(scenes, () => {
      gameState = 'playing'; placeCatsInCamp(); saveGame();
      queueMessage('Narrator', 'Scourge has killed Tigerstar and threatens to take the forest. You must unite ALL four Clans — ThunderClan, WindClan, RiverClan, and ShadowClan — to fight BloodClan together. This is the final battle.');
      showNextChapterButton();
    });
  }

  /* ====================================================
     CHAPTER 19: THE FINAL BATTLE — SCOURGE
     ==================================================== */
  function triggerScourge () {
    gameState = 'cutscene';
    const pName = player.name || 'leader';
    const scenes = [
      { narration: true, text: 'The day has come. All four Clans stand together at Fourtrees — ThunderClan, WindClan, RiverClan, and ShadowClan, united against BloodClan.',
        camPos: { x: -43, y: 8, z: -43 }, camLook: { x: -45, y: 1, z: -45 } },
      { narration: true, text: 'Hundreds of BloodClan cats pour out of the undergrowth. They are vicious, scarred, and fearless. Their reinforced claws glint in the sunlight.',
        camPos: { x: -50, y: 4, z: -40 }, camLook: { x: -48, y: 1, z: -42 } },
      { narration: true, text: '"LionClan, ATTACK!" you yowl. The united Clans charge! The biggest battle the forest has ever known has begun!',
        camPos: { x: -45, y: 3, z: -43 }, camLook: { x: -47, y: 1, z: -45 } },
      { narration: true, text: 'Cats clash on every side! The forest rings with yowls and shrieks! BloodClan fights dirty, but the Clan cats fight with the courage of StarClan!',
        camPos: { x: -44, y: 5, z: -44 }, camLook: { x: -46, y: 1, z: -46 } },
      { narration: true, text: 'You fight your way through the chaos until you stand face to face with Scourge himself. His ice-blue eyes burn with hatred.',
        camPos: { x: -46, y: 2, z: -45.5 }, camLook: { x: -47, y: 0.8, z: -45 } },
      { speaker: 'Scourge', text: '"I killed Tigerstar with one blow. You will be no different."',
        camPos: { x: -47, y: 1.5, z: -45 }, camLook: { x: -47, y: 0.8, z: -45 } },
      { narration: true, text: 'Scourge strikes! His dog-tooth claws tear through your flesh — you lose a life! But you get back up. You have nine lives. He only has one.',
        camPos: { x: -46, y: 1.5, z: -45 }, camLook: { x: -46.5, y: 0.5, z: -45 } },
    ];
    startCutscene(scenes, () => {
      // Start the final boss battle against Scourge!
      startBattle({
        enemyName: 'Scourge',
        enemyHP: 150,
        enemyMaxHP: 150,
        enemyAttack: 25,
        enemyDefense: 8,
        enemyFurColor: 0x111111,
        enemyEyeColor: 0x66ccff,
        enemyStripes: false,
        expReward: 500,
        onWin: function () {
          // VICTORY!
          gameState = 'cutscene';
          const finalScenes = [
            { narration: true, text: 'With a final, mighty blow, you strike Scourge down! He crumples to the ground — defeated! Without their leader, BloodClan panics!',
              camPos: { x: -46, y: 2, z: -45 }, camLook: { x: -47, y: 0.3, z: -45 } },
            { narration: true, text: '"BloodClan, RETREAT!" the remaining BloodClan cats yowl. They scatter and flee! The battle is over!',
              camPos: { x: -44, y: 5, z: -43 }, camLook: { x: -48, y: 1, z: -46 } },
            { narration: true, text: '"' + pName.toUpperCase() + '! ' + pName.toUpperCase() + '!" All four Clans chant your name! You have saved the forest!',
              camPos: { x: -45, y: 6, z: -45 }, camLook: { x: -45, y: 2, z: -45 } },
            { narration: true, text: 'The Clans celebrate together. For the first time in moons, the forest is at peace. Four Clans, standing side by side.',
              camPos: { x: -45, y: 10, z: -45 }, camLook: { x: -45, y: 2, z: -45 } },
            { narration: true, text: '<strong>You did it.</strong> From a kittypet named Rusty to the leader who saved the entire forest. The prophecy has been fulfilled.',
              camPos: { x: 0, y: 15, z: 20 }, camLook: { x: 0, y: 2, z: 0 } },
            { narration: true, text: '<span class="prophecy">"Fire alone will save our Clan."</span><br><br>And you did.',
              camPos: { x: 0, y: 25, z: 40 }, camLook: { x: 0, y: 5, z: 0 } },
            { narration: true, text: '<strong>CONGRATULATIONS!</strong><br><br><em>You have completed Warrior Cats: Into the Wild — The Prophecy Begins!</em><br><br>Thank you for playing!',
              camPos: { x: 0, y: 30, z: 55 }, camLook: { x: 0, y: 0, z: 0 } },
          ];
          startCutscene(finalScenes, () => {
            gameState = 'playing';
            placeCatsInCamp(); saveGame();
            queueMessage('Narrator', 'Congratulations! You have defeated Scourge and saved the forest! The prophecy is fulfilled. You can continue to explore and enjoy the territory as ' + pName + ', leader of ThunderClan!');
          });
        },
        onLose: function () {
          // If you lose, you still win story-wise (you have 9 lives!)
          gameState = 'cutscene';
          const retryScenes = [
            { narration: true, text: 'You fall... but StarClan is with you. Energy surges through your body as one of your nine lives is restored! You leap back to your paws!',
              camPos: { x: -46, y: 2, z: -45 }, camLook: { x: -46, y: 1, z: -45 } },
          ];
          player.health = player.maxHealth;
          startCutscene(retryScenes, () => {
            // Let them fight Scourge again
            triggerScourge();
          });
        },
      });
    });
  }

  /* ====================================================
     SMUDGE & PRINCESS FENCE WARNING
     ==================================================== */
  function triggerFenceWarning () {
    gameState = 'cutscene';

    const smudge = npcCats.find(c => c.name === 'Smudge');
    const princess = npcCats.find(c => c.name === 'Princess');

    // Place Smudge and Princess to the SIDES of the fence opening (not blocking!)
    if (smudge) { smudge.group.visible = true; smudge.group.position.set(3, 0, 71); smudge.group.lookAt(0, 0, 73); }
    if (princess) { princess.group.visible = true; princess.group.position.set(-3, 0, 71); princess.group.lookAt(0, 0, 73); }

    // Push player back a little so they're facing their friends
    player.position.z = 73;
    catGroup.position.set(player.position.x, 0, 73);

    const scenes = [
      { narration: true, text: '<strong>Smudge</strong> and <strong>Princess</strong> come running up to the fence opening, blocking your path!',
        camPos: { x: 3, y: 2, z: 74 }, camLook: { x: 0, y: 0.8, z: 71 } },

      { speaker: 'Smudge', text: '"Rusty, WAIT! Where do you think you\'re going?! You can\'t go out there!"',
        camPos: { x: 2, y: 1.5, z: 72 }, camLook: { x: 1, y: 0.8, z: 70.5 } },

      { speaker: 'Princess', text: '"Rusty, please! The forest is DANGEROUS! Henry went in there once and he barely made it back!"',
        camPos: { x: -2, y: 1.5, z: 72 }, camLook: { x: -1, y: 0.8, z: 70.5 } },

      { speaker: 'Smudge', text: '"There are HUGE wild cats in there! They have massive claws and they EAT kittypets like us!"',
        camPos: { x: 1, y: 1.5, z: 71.5 }, camLook: { x: 1, y: 0.8, z: 70.5 } },

      { speaker: 'Princess', text: '"And foxes! Big red foxes with sharp teeth! And badgers that are even BIGGER!"',
        camPos: { x: -1, y: 1.5, z: 71.5 }, camLook: { x: -1, y: 0.8, z: 70.5 } },

      { speaker: 'Smudge', text: '"I heard there are OWLS that swoop down and carry cats away! And dogs that chase you through the trees!"',
        camPos: { x: 2, y: 1.5, z: 72 }, camLook: { x: 1, y: 0.8, z: 70.5 } },

      { speaker: 'Princess', text: '"And the Thunderpath — the monsters on it are SO fast, they\'ll squash you flat! You won\'t even see them coming!"',
        camPos: { x: -2, y: 1.5, z: 72 }, camLook: { x: -1, y: 0.8, z: 70.5 } },

      { speaker: 'Smudge', text: '"Rusty, PLEASE. It\'s nice here! We have food bowls and warm beds and the Twolegs pet us. Why would you want to leave?"',
        camPos: { x: 0, y: 2, z: 73 }, camLook: { x: 0, y: 0.8, z: 70.5 } },

      { speaker: 'Princess', text: '"We just don\'t want you to get hurt, Rusty. You\'re our brother... our friend... please think about this."',
        camPos: { x: -1, y: 1.5, z: 72 }, camLook: { x: -1, y: 0.8, z: 70.5 } },

      { narration: true, text: 'Smudge and Princess stare at you with wide, worried eyes. The dark forest looms beyond the fence...',
        camPos: { x: 0, y: 2, z: 74 }, camLook: { x: 0, y: 1, z: 68 } },
    ];

    startCutscene(scenes, () => {
      // Move Smudge and Princess BACK to the house immediately so they never block
      const sm = npcCats.find(c => c.name === 'Smudge');
      const pr = npcCats.find(c => c.name === 'Princess');
      if (sm) { sm.group.position.set(3, 0, 83); }
      if (pr) { pr.group.position.set(-3, 0, 84); }
      // Show the choice screen
      showForestChoice();
    });
  }

  function showForestChoice () {
    gameState = 'choice';
    forestChoiceScreen.classList.remove('hidden');
  }

  function playerChoseForest () {
    forestChoiceScreen.classList.add('hidden');
    forestConfirmScreen.classList.add('hidden');
    gameState = 'cutscene';

    // Change story phase IMMEDIATELY so fence walls stop blocking
    storyPhase = 'forest';

    const smudge = npcCats.find(c => c.name === 'Smudge');
    const princess = npcCats.find(c => c.name === 'Princess');

    // Make sure they're at the house already (not blocking)
    if (smudge) { smudge.group.position.set(3, 0, 83); }
    if (princess) { princess.group.position.set(-3, 0, 84); }

    const scenes = [
      { narration: true, text: 'Smudge and Princess watch sadly from the house as you walk toward the fence...',
        camPos: { x: 0, y: 3, z: 73 }, camLook: { x: 0, y: 1, z: 65 } },

      { narration: true, text: 'You take a deep breath and step through the fence. The forest smells wild — earth, leaves, and something else... something exciting.',
        camPos: { x: 0, y: 2, z: 68 }, camLook: { x: 0, y: 1, z: 55 } },
    ];

    startCutscene(scenes, () => {
      // Player is now in the forest
      gameState = 'playing';
      player.position = { x: 0, y: 0, z: 64 };
      catGroup.position.set(0, 0, 64);
      saveGame();
      queueMessage('Narrator', 'You\'ve entered the forest! The trees tower above you. ' +
        (isMobile ? 'Use the joystick to explore.' : 'Use WASD to explore deeper into the forest...'));
    });
  }

  function playerStayedHome () {
    forestChoiceScreen.classList.add('hidden');
    forestConfirmScreen.classList.add('hidden');

    // Move Smudge and Princess back to house immediately
    const smudge = npcCats.find(c => c.name === 'Smudge');
    const princess = npcCats.find(c => c.name === 'Princess');
    if (smudge) { smudge.group.position.set(3, 0, 83); }
    if (princess) { princess.group.position.set(-3, 0, 84); }

    // Put player back in the garden near the cat flap — no cutscene needed, just go
    gameState = 'playing';
    player.position = { x: 0, y: 0, z: 79 };
    catGroup.position.set(0, 0, 79);
    fenceWarningTriggered = false; // allow re-triggering when they approach again
    queueMessage('Narrator', 'You went back... but the forest still calls. Walk to the fence again when you\'re ready.');
  }

  /* ====================================================
     GRAYPAW ENCOUNTER + FIGHT
     ==================================================== */
  function triggerGraypawEncounter () {
    gameState = 'cutscene';

    // Place Graypaw in front of the player
    const gp = npcCats.find(c => c.name === 'Graypaw');
    if (gp) {
      gp.group.position.set(player.position.x + 2, 0, player.position.z - 4);
      gp.group.visible = true;
      gp.group.lookAt(player.position.x, 0, player.position.z);
    }

    const scenes = [
      { narration: true, text: 'You creep through the undergrowth. The forest is bigger and darker than you imagined. Suddenly - a rustle in the bushes!',
        camPos: { x: player.position.x + 4, y: 3, z: player.position.z - 2 },
        camLook: { x: player.position.x, y: 1, z: player.position.z - 3 } },
      { narration: true, text: 'A gray cat leaps out of the ferns and lands right in front of you! Who is this stranger?',
        camPos: { x: player.position.x + 3, y: 2, z: player.position.z - 3 },
        camLook: { x: player.position.x + 1, y: 1, z: player.position.z - 4 } },
      { speaker: '???', text: '"Hey! What are you doing here, kittypet? This is ThunderClan territory!"' },
      { speaker: '???', text: '"You smell like Twoleg food! You don\'t belong here! Let\'s see if you can fight like a real cat!"' },
    ];
    startCutscene(scenes, () => {
      // After dialogue → start the fight! (name stays ??? during fight)
      startGraypawFight();
    });
  }

  /* ====================================================
     BATTLE SYSTEM (Turn-based battle screen)
     ==================================================== */
  let currentBattle = null; // active battle state

  /**
   * Draw a simple cat sprite on a canvas for the battle screen.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} furColor - hex color e.g. 0xff8800
   * @param {number} eyeColor - hex color
   * @param {boolean} flipX - if true, face left
   * @param {boolean} stripes - draw stripes
   */
  function drawBattleCat (ctx, furColor, eyeColor, flipX, hasStripes, stripeColor) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    if (flipX) { ctx.translate(w, 0); ctx.scale(-1, 1); }

    const fur = '#' + furColor.toString(16).padStart(6, '0');
    const eye = '#' + eyeColor.toString(16).padStart(6, '0');
    const stripe = stripeColor ? '#' + stripeColor.toString(16).padStart(6, '0') : '#333';

    // Body
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.ellipse(100, 130, 55, 35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.beginPath();
    ctx.ellipse(145, 95, 30, 28, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.beginPath();
    ctx.moveTo(130, 72); ctx.lineTo(122, 50); ctx.lineTo(140, 68);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(155, 68); ctx.lineTo(163, 48); ctx.lineTo(170, 65);
    ctx.fill();

    // Ear insides
    ctx.fillStyle = '#ffaaaa';
    ctx.beginPath();
    ctx.moveTo(132, 72); ctx.lineTo(126, 56); ctx.lineTo(138, 70);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(157, 68); ctx.lineTo(162, 53); ctx.lineTo(167, 66);
    ctx.fill();

    // Legs
    ctx.fillStyle = fur;
    ctx.fillRect(62, 152, 16, 30);
    ctx.fillRect(82, 155, 16, 27);
    ctx.fillRect(118, 155, 16, 27);
    ctx.fillRect(130, 152, 16, 30);

    // Paws
    ctx.fillStyle = '#ddd';
    ctx.beginPath(); ctx.ellipse(70, 183, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(90, 183, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(126, 183, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(138, 183, 10, 5, 0, 0, Math.PI * 2); ctx.fill();

    // Tail
    ctx.strokeStyle = fur;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(48, 125);
    ctx.quadraticCurveTo(20, 100, 25, 70);
    ctx.stroke();

    // Stripes
    if (hasStripes) {
      ctx.strokeStyle = stripe;
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(75 + i * 18, 108);
        ctx.lineTo(80 + i * 18, 148);
        ctx.stroke();
      }
    }

    // Eyes
    ctx.fillStyle = eye;
    ctx.beginPath(); ctx.ellipse(138, 92, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(158, 90, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
    // Pupils
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(138, 92, 3, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(158, 90, 3, 7, 0, 0, Math.PI * 2); ctx.fill();
    // Highlights
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(140, 89, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(160, 87, 2, 0, Math.PI * 2); ctx.fill();

    // Nose
    ctx.fillStyle = '#ff8899';
    ctx.beginPath();
    ctx.moveTo(165, 96); ctx.lineTo(162, 100); ctx.lineTo(168, 100);
    ctx.fill();

    // Mouth
    ctx.strokeStyle = '#553333';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(165, 100); ctx.lineTo(165, 104);
    ctx.moveTo(165, 104); ctx.lineTo(160, 107);
    ctx.moveTo(165, 104); ctx.lineTo(170, 107);
    ctx.stroke();

    // Whiskers
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(168, 98); ctx.lineTo(195, 92);
    ctx.moveTo(168, 101); ctx.lineTo(196, 100);
    ctx.moveTo(168, 104); ctx.lineTo(194, 108);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Start a turn-based battle.
   * @param {object} opts - Battle configuration
   * @param {string} opts.enemyName - Display name of enemy (can be '???' if unknown)
   * @param {number} opts.enemyHP - Starting HP
   * @param {number} opts.enemyMaxHP - Max HP
   * @param {number} opts.enemyAttack - Base attack damage
   * @param {number} opts.enemyDefense - Reduces player damage
   * @param {number} opts.enemyFurColor - Hex fur color
   * @param {number} opts.enemyEyeColor - Hex eye color
   * @param {boolean} opts.enemyStripes - Has stripes
   * @param {number} opts.enemyStripeColor - Stripe color
   * @param {number} opts.playerMinHP - Don't let player go below this (tutorial safety)
   * @param {number} opts.expReward - XP given on win
   * @param {function} opts.onWin - Callback when player wins
   * @param {function} opts.onLose - Callback when player loses (if null, can't lose)
   */
  function startBattle (opts) {
    gameState = 'battle';
    currentBattle = {
      enemyName: opts.enemyName || '???',
      enemyHP: opts.enemyHP || 60,
      enemyMaxHP: opts.enemyMaxHP || opts.enemyHP || 60,
      enemyAttack: opts.enemyAttack || 10,
      enemyDefense: opts.enemyDefense || 3,
      enemyFurColor: opts.enemyFurColor || 0x888888,
      enemyEyeColor: opts.enemyEyeColor || 0xffaa00,
      enemyStripes: opts.enemyStripes || false,
      enemyStripeColor: opts.enemyStripeColor || 0x333333,
      playerHP: player.health,
      playerMaxHP: player.maxHealth,
      playerMinHP: opts.playerMinHP != null ? opts.playerMinHP : 0,
      expReward: opts.expReward || 30,
      onWin: opts.onWin || null,
      onLose: opts.onLose || null,
      playerTurn: true,
      dodging: false,
      round: 0,
      allies: opts.allies || null, // Array of { name, attack, phrases }
    };

    // Show the battle screen (hide patrol enemy selector if it was open)
    battleScreen.classList.remove('hidden');
    document.getElementById('battle-enemy-selector').classList.add('hidden');
    patrolBattleData = null; // clear any patrol battle data
    battleLog.innerHTML = '';
    battleHeader.textContent = currentBattle.allies ? 'TEAM BATTLE!' : 'BATTLE!';
    battlePlayerName.textContent = player.name || 'Rusty';
    battleEnemyName.textContent = currentBattle.enemyName;

    // Draw cat sprites
    const pCtx = battlePlayerCanvas.getContext('2d');
    drawBattleCat(pCtx, 0xff8833, 0x44cc44, false, false, 0);

    const eCtx = battleEnemyCanvas.getContext('2d');
    drawBattleCat(eCtx, currentBattle.enemyFurColor, currentBattle.enemyEyeColor,
      true, currentBattle.enemyStripes, currentBattle.enemyStripeColor);

    updateBattleHP();
    enableBattleButtons(true);

    if (currentBattle.allies && currentBattle.allies.length > 0) {
      const allyNames = currentBattle.allies.map(a => a.name).join(', ');
      addBattleLog('The battle begins! <strong>' + allyNames + '</strong> fight alongside you!', 'battle-log-fierce');
    } else {
      addBattleLog('The battle begins!', 'battle-log-fierce');
    }
    playSound('battle');
  }

  function updateBattleHP () {
    if (!currentBattle) return;
    const b = currentBattle;
    battlePlayerHP.style.width = Math.max(0, b.playerHP / b.playerMaxHP * 100) + '%';
    battleEnemyHP.style.width = Math.max(0, b.enemyHP / b.enemyMaxHP * 100) + '%';
    battlePlayerHPText.textContent = Math.max(0, b.playerHP) + '/' + b.playerMaxHP;
    battleEnemyHPText.textContent = Math.max(0, b.enemyHP) + '/' + b.enemyMaxHP;
  }

  function addBattleLog (text, cls) {
    const div = document.createElement('div');
    div.className = cls || '';
    div.innerHTML = text;
    battleLog.appendChild(div);
    battleLog.scrollTop = battleLog.scrollHeight;
  }

  function enableBattleButtons (on) {
    battleAttackBtn.disabled = !on;
    battleDodgeBtn.disabled = !on;
    battleFierceBtn.disabled = !on;
    battleSurrenderBtn.disabled = !on;
  }

  function battlePlayerAction (action) {
    if (!currentBattle || !currentBattle.playerTurn) return;
    const b = currentBattle;
    b.playerTurn = false;
    enableBattleButtons(false);
    b.round++;

    if (action === 'attack') {
      const baseDmg = 8 + player.level * 2;
      const dmg = Math.max(1, baseDmg + Math.floor(Math.random() * 8) - b.enemyDefense);
      b.enemyHP = Math.max(0, b.enemyHP - dmg);
      addBattleLog('You swipe at ' + b.enemyName + '! <strong>-' + dmg + '</strong> damage', 'battle-log-player');
      // Shake enemy
      const eSide = document.querySelector('.battle-enemy-side');
      if (eSide) { eSide.classList.add('battle-shake'); setTimeout(() => eSide.classList.remove('battle-shake'), 300); }
      playSound('hit');
    } else if (action === 'dodge') {
      b.dodging = true;
      addBattleLog('You prepare to dodge the next attack!', 'battle-log-dodge');
      playSound('swoosh');
    } else if (action === 'fierce') {
      // Fierce attack: higher damage but you take more damage next turn
      const baseDmg = 14 + player.level * 3;
      const dmg = Math.max(2, baseDmg + Math.floor(Math.random() * 12) - Math.floor(b.enemyDefense / 2));
      b.enemyHP = Math.max(0, b.enemyHP - dmg);
      addBattleLog('You unleash a fierce attack! <strong>-' + dmg + '</strong> damage!', 'battle-log-fierce');
      const eSide = document.querySelector('.battle-enemy-side');
      if (eSide) { eSide.classList.add('battle-shake'); setTimeout(() => eSide.classList.remove('battle-shake'), 300); }
      b._fierceVulnerable = true;
      playSound('hit');
    }

    updateBattleHP();

    // Check if enemy is defeated
    if (b.enemyHP <= 0) {
      setTimeout(() => endBattle(true), 600);
      return;
    }

    // Allies attack after the player (if any)
    if (b.allies && b.allies.length > 0) {
      setTimeout(() => battleAllyTurns(), 600);
    } else {
      // Enemy turn after delay
      setTimeout(() => battleEnemyTurn(), 800);
    }
  }

  /** Each ally takes a turn attacking the enemy */
  function battleAllyTurns () {
    if (!currentBattle) return;
    const b = currentBattle;
    if (!b.allies || b.allies.length === 0) { battleEnemyTurn(); return; }

    let idx = 0;
    function nextAlly () {
      if (idx >= b.allies.length || b.enemyHP <= 0) {
        updateBattleHP();
        if (b.enemyHP <= 0) {
          setTimeout(() => endBattle(true), 600);
        } else {
          setTimeout(() => battleEnemyTurn(), 500);
        }
        return;
      }
      const ally = b.allies[idx];
      idx++;
      const baseDmg = ally.attack || 6;
      const dmg = Math.max(1, baseDmg + Math.floor(Math.random() * 6) - (b.enemyDefense || 0));
      b.enemyHP = Math.max(0, b.enemyHP - dmg);
      // Pick a random phrase or use a default
      let phrase = '';
      if (ally.phrases && ally.phrases.length > 0) {
        phrase = ' <em>"' + ally.phrases[Math.floor(Math.random() * ally.phrases.length)] + '"</em>';
      }
      addBattleLog('<strong>' + ally.name + '</strong> attacks! <strong>-' + dmg + '</strong>' + phrase, 'battle-log-ally');
      playSound('hit');
      // Shake enemy
      const eSide = document.querySelector('.battle-enemy-side');
      if (eSide) { eSide.classList.add('battle-shake'); setTimeout(() => eSide.classList.remove('battle-shake'), 300); }
      updateBattleHP();
      setTimeout(nextAlly, 500);
    }
    nextAlly();
  }

  function battleEnemyTurn () {
    if (!currentBattle) return;
    const b = currentBattle;

    let dmg = b.enemyAttack + Math.floor(Math.random() * 6);
    if (b.dodging) {
      if (Math.random() < 0.6) {
        addBattleLog('You dodge the attack!', 'battle-log-dodge');
        dmg = 0;
      } else {
        dmg = Math.floor(dmg * 0.4);
        addBattleLog(b.enemyName + ' partially hits you! <strong>-' + dmg + '</strong>', 'battle-log-hit');
      }
      b.dodging = false;
    } else if (b._fierceVulnerable) {
      dmg = Math.floor(dmg * 1.5);
      addBattleLog(b.enemyName + ' strikes while you\'re open! <strong>-' + dmg + '</strong>', 'battle-log-hit');
      b._fierceVulnerable = false;
    } else {
      addBattleLog(b.enemyName + ' attacks! <strong>-' + dmg + '</strong> damage', 'battle-log-hit');
    }

    if (dmg > 0) {
      b.playerHP = Math.max(b.playerMinHP, b.playerHP - dmg);
      player.health = b.playerHP;
      // Shake player
      const pSide = document.querySelector('.battle-player-side');
      if (pSide) { pSide.classList.add('battle-shake'); setTimeout(() => pSide.classList.remove('battle-shake'), 300); }
      if (dmg > 0) playSound('hurt');
    }

    updateBattleHP();

    // Check if player is defeated
    if (b.playerHP <= 0 || (b.playerMinHP > 0 && b.playerHP <= b.playerMinHP)) {
      if (b.onLose) {
        setTimeout(() => endBattle(false), 600);
      } else {
        // Can't lose (tutorial) - just keep going
        b.playerTurn = true;
        enableBattleButtons(true);
      }
      return;
    }

    // Player's turn again
    setTimeout(() => {
      b.playerTurn = true;
      enableBattleButtons(true);
    }, 400);
  }

  function endBattle (won) {
    if (!currentBattle) return;
    const b = currentBattle;

    // Check if this is part of a patrol battle (multi-cat fight)
    const isPatrolBattle = !!patrolBattleData;

    if (won) {
      if (!isPatrolBattle) {
        // Normal single-cat battle: award XP and heal
        addBattleLog('<strong>You won the battle!</strong>', 'battle-log-player');
        player = GameLogic.addExperience(player, b.expReward);
        player.battlesWon = (player.battlesWon || 0) + 1;
        player.health = Math.min(player.maxHealth, player.health + Math.floor(player.maxHealth * 0.3));
        addBattleLog('+' + b.expReward + ' experience! Level ' + player.level, 'battle-log-player');
        if (player.health < player.maxHealth) {
          addBattleLog('You rest and recover some health.', 'battle-log-dodge');
        }
      }
      // For patrol battles, the onWin callback handles XP/healing per-cat
    } else {
      addBattleLog('<strong>You lost the battle...</strong>', 'battle-log-hit');
    }

    updateBattleHP();
    enableBattleButtons(false);

    // For patrol battles: DON'T hide the battle screen if there are more cats
    // Let the onWin callback handle showing the enemy selector
    if (isPatrolBattle && won && b.onWin) {
      setTimeout(() => {
        currentBattle = null;
        b.onWin(); // this shows enemy selector or finishes the patrol battle
      }, 1200);
      return;
    }

    // Normal battle / patrol loss: close battle screen
    setTimeout(() => {
      battleScreen.classList.add('hidden');
      document.getElementById('battle-enemy-selector').classList.add('hidden');
      currentBattle = null;
      if (won && b.onWin) b.onWin();
      else if (!won && b.onLose) b.onLose();
      else if (!won) {
        // Default loss: respawn at medicine cat den with Spottedleaf healing you
        respawnAtMedicineDen();
      } else {
        gameState = 'playing';
      }
      saveGame();
    }, 1800);
  }

  /**
   * Respawn the player at the Medicine Cat den after losing a battle.
   * Spottedleaf heals you and gives reassuring words.
   */
  function respawnAtMedicineDen () {
    gameState = 'playing';

    // Restore some health (Spottedleaf healed you)
    player.health = Math.max(Math.floor(player.maxHealth * 0.5), player.health);

    // Teleport player to the Medicine Den
    const medDen = DEN_SPOTS['Medicine'];
    if (catGroup) {
      catGroup.position.set(medDen.x, 0, medDen.z);
    }
    // Reset camera direction to face out of the den
    playerYaw = 0;
    playerPitch = 0;

    // Make sure Spottedleaf is visible and near the player
    const spottedleaf = npcCats.find(c => c.name === 'Spottedleaf');
    if (spottedleaf) {
      spottedleaf.group.visible = true;
      spottedleaf.group.position.set(medDen.x + 1.5, 0, medDen.z + 1);
    }

    // Spottedleaf speaks to the player
    setTimeout(() => {
      queueMessage('Spottedleaf', 'You\'re alright, thank StarClan! Be a little more careful out there, okay?', () => {
        queueMessage('Spottedleaf', 'I\'ve treated your wounds with herbs. Rest a moment before you head out again.', () => {
          // Fully restore after the dialogue
          player.health = player.maxHealth;
          saveGame();
        });
      });
    }, 300);
  }

  // Wire up battle buttons
  battleAttackBtn.addEventListener('click', () => battlePlayerAction('attack'));
  battleDodgeBtn.addEventListener('click', () => battlePlayerAction('dodge'));
  battleFierceBtn.addEventListener('click', () => battlePlayerAction('fierce'));
  battleSurrenderBtn.addEventListener('click', () => {
    if (!currentBattle || !currentBattle.playerTurn) return;
    enableBattleButtons(false);
    addBattleLog('<strong>You surrender and back away...</strong>', 'battle-log-hit');
    playSound('hurt');
    // Treat surrender as a loss — player keeps remaining HP (not killed)
    setTimeout(() => endBattle(false), 800);
  });

  /* ====================================================
     GRAYPAW FIGHT (uses new battle system)
     ==================================================== */
  function startGraypawFight () {
    startBattle({
      enemyName: '???',
      enemyHP: 50,
      enemyMaxHP: 50,
      enemyAttack: 6,
      enemyDefense: 2,
      enemyFurColor: 0x888899,
      enemyEyeColor: 0xffcc00,
      enemyStripes: false,
      playerMinHP: 15,  // can't die in tutorial
      expReward: 25,
      onWin: function () {
        // Graypaw gives up and introduces himself → reveal name!
        const scenes = [
          { speaker: '???', text: '"Okay, okay! You\'re pretty good for a kittypet! I give up!"' },
          { speaker: '???', text: '"I\'m <strong>Graypaw</strong>, by the way. You know, you fight pretty well. Most kittypets just run away screaming."' },
          { narration: true, text: 'The gray cat introduces himself as Graypaw. He shakes his thick fur, looking at you with new respect.' },
          { speaker: 'Graypaw', text: '"Hey, do you want to see something cool? Follow me deeper into the forest - but be careful, there might be a patrol around."' },
        ];
        revealCatName('Graypaw');
        startCutscene(scenes, () => {
          storyPhase = 'fought_graypaw';
          gameState = 'playing';
          const gp = npcCats.find(c => c.name === 'Graypaw');
          if (gp) {
            gp.group.position.set(player.position.x + 1.5, 0, player.position.z - 1);
          }
          queueMessage('Narrator', 'Graypaw seems friendly now. Keep walking deeper into the forest...');
          saveGame(); // Auto-save after story event
        });
      },
    });
  }

  /* ====================================================
     BLUESTAR ENCOUNTER
     ==================================================== */
  function triggerBluestarEncounter () {
    gameState = 'cutscene';

    // Place Bluestar and Lionheart
    const bs = npcCats.find(c => c.name === 'Bluestar');
    const lh = npcCats.find(c => c.name === 'Lionheart');
    const gp = npcCats.find(c => c.name === 'Graypaw');

    if (bs) { bs.group.position.set(player.position.x - 3, 0, player.position.z - 5); bs.group.visible = true; }
    if (lh) { lh.group.position.set(player.position.x - 1, 0, player.position.z - 6); lh.group.visible = true; }
    if (gp) { gp.group.position.set(player.position.x + 2, 0, player.position.z - 2); }

    const scenes = [
      { narration: true, text: 'Two more cats emerge from the shadows - a large golden tabby and a blue-gray she-cat with piercing blue eyes.',
        camPos: { x: player.position.x + 4, y: 3, z: player.position.z - 3 },
        camLook: { x: player.position.x - 2, y: 1, z: player.position.z - 5 } },
      { speaker: '???', text: '"Graypaw! What is going on here? Who is this kittypet?"' },
      { speaker: 'Graypaw', text: '"We were just... um... he\'s actually a pretty good fighter!"' },
      { speaker: '???', text: '"Wait. Look at this young cat. There is fire in his eyes... something the forest needs."',
        camPos: { x: player.position.x - 1, y: 2.5, z: player.position.z - 2 },
        camLook: { x: player.position.x - 3, y: 1.2, z: player.position.z - 5 } },
      { speaker: '???', text: '"I am <strong>Bluestar</strong>, leader of ThunderClan. And this is <strong>Lionheart</strong>, one of our warriors. I have been watching you."' },
      { speaker: 'Bluestar', text: '"You showed courage coming into the forest, and skill in your fight. I would like to offer you a place in our Clan."' },
      { speaker: 'Lionheart', text: '"Are you sure, Bluestar? He\'s a kittypet..."' },
      { speaker: 'Bluestar', text: '"I am sure. StarClan has shown me a prophecy: <em>Fire alone will save our Clan.</em> This cat may be the one."' },
      { speaker: 'Graypaw', text: '"Wow! You\'re going to join ThunderClan? That\'s awesome!"' },
      { narration: true, text: 'Your heart pounds with excitement. A real warrior clan! But first, every clan cat needs a warrior name...' },
    ];
    // Reveal Bluestar and Lionheart's names when they introduce themselves
    revealCatNames(['Bluestar', 'Lionheart']);
    startCutscene(scenes, () => {
      storyPhase = 'met_bluestar';
      saveGame(); // Auto-save after meeting Bluestar
      showNameScreen();
    });
  }

  /* ====================================================
     NAME PICKING
     ==================================================== */
  function showNameScreen () {
    gameState = 'naming';
    nameScreen.classList.remove('hidden');
    nameInput.value = '';
    namePreview.textContent = '___paw';
    nameSubmitBtn.disabled = true;
    nameError.textContent = '';
    setTimeout(() => nameInput.focus(), 100);
  }

  function submitName () {
    const raw = nameInput.value.trim();
    const formatted = GameLogic.formatNamePrefix(raw);
    if (!formatted || !GameLogic.validateNamePrefix(formatted)) return;
    player = GameLogic.createPlayer(formatted);
    nameScreen.classList.add('hidden');
    startNamingCeremony();
  }

  /* ====================================================
     NAMING CEREMONY (Clan Meeting at Highrock)
     ==================================================== */
  const KITTYPET_NAMES = ['Smudge', 'Princess'];
  // Cats that should be hidden until their story arc triggers
  // Yellowfang is ShadowClan — she only appears later when Firepaw finds her injured
  const HIDDEN_UNTIL_STORY = ['Yellowfang'];

  /** Check if a cat should NOT be at clan events (kittypets + story-locked cats) */
  function shouldHideFromClan (name) {
    return KITTYPET_NAMES.includes(name) || HIDDEN_UNTIL_STORY.includes(name);
  }

  function startNamingCeremony () {
    // Show ThunderClan cats sitting around Highrock (NOT kittypets or story-locked cats!)
    npcCats.forEach(c => {
      if (shouldHideFromClan(c.name)) {
        c.group.visible = false;
      } else {
        c.group.visible = true;
      }
    });
    // Position Bluestar on Highrock
    const bluestarCat = npcCats.find(c => c.name === 'Bluestar');
    if (bluestarCat) bluestarCat.group.position.set(-3, 3.3, -4);

    // Arrange clan cats in a semicircle facing highrock
    const clanCats = npcCats.filter(c => !shouldHideFromClan(c.name) && c.name !== 'Bluestar');
    clanCats.forEach((c, i) => {
      const angle = -0.8 + (i / (clanCats.length - 1)) * 1.6;
      const dist = 5 + Math.random();
      c.group.position.set(-3 + Math.sin(angle) * dist, 0, -4 + Math.cos(angle) * dist);
      c.group.lookAt(-3, 1, -4);
    });

    const pName = player.name;
    const scenes = [
      { narration: true, text: 'The cats of ThunderClan gather beneath the Highrock. Bluestar leaps to the top and gazes down at her Clan.',
        camPos: { x: 3, y: 4, z: 2 }, camLook: { x: -3, y: 3.5, z: -4 } },
      { speaker: 'Bluestar', text: '"Let all cats old enough to catch their own prey gather beneath the Highrock for a Clan meeting!"',
        camPos: { x: -1, y: 4, z: 0 }, camLook: { x: -3, y: 3.5, z: -4 } },
      { speaker: 'Bluestar', text: '"Today I have great news. A new cat has chosen to join ThunderClan. He has shown the courage and spirit of a true warrior."',
        camPos: { x: -6, y: 3, z: -1 }, camLook: { x: -3, y: 3.5, z: -4 } },
      { speaker: 'Bluestar', text: '"From this day forward, until you have earned your warrior name, you shall be known as <strong>' + pName + '</strong>."',
        camPos: { x: 0, y: 3, z: 1 }, camLook: { x: -3, y: 3.5, z: -4 } },
      { speaker: 'ThunderClan', text: '"<strong>' + pName + '! ' + pName + '! ' + pName + '!</strong>"' },
      { speaker: 'Bluestar', text: '"Lionheart, you will be mentor to ' + pName + '. Teach him the ways of the warrior code and help him become a great warrior."' },
      { speaker: 'Lionheart', text: '"I will train him well, Bluestar. Welcome to ThunderClan, ' + pName + '."' },
      { narration: true, text: 'The Clan cheers your new name. Graypaw bounds over to you, his eyes bright with excitement.' },
      { speaker: 'Graypaw', text: '"Hey, ' + pName + '! That\'s awesome! I\'m Graypaw - we\'re going to be denmates! Come on, I\'ll show you around camp!"' },
    ];

    playSound('ceremony');
    startCutscene(scenes, () => {
      // After ceremony → start training with Lionheart!
      // Show clan cats but keep kittypets and story-locked cats hidden
      npcCats.forEach(c => { c.group.visible = !shouldHideFromClan(c.name); });
      saveGame();
      startTraining();
    });
  }

  /* ====================================================
     TRAINING SYSTEM (Lionheart teaches the new apprentice)
     ==================================================== */
  let trainingStep = 0;
  let trainingTarget = null;  // { x, z } where to walk next
  let trainingLionheart = null;
  let trainingPrey = null;     // { group, position, alive, runAngle, runTimer }
  let trainingHuntComplete = false;
  let trainingFightComplete = false;

  function startTraining () {
    gameState = 'playing';
    storyPhase = 'training';
    catGroup.visible = true;
    saveGame(); // Auto-save after naming ceremony

    // Place player in camp
    player.position = { x: 2, y: 0, z: 3 };
    catGroup.position.set(2, 0, 3);

    // Reveal cats you've met
    revealCatNames(['Bluestar', 'Lionheart', 'Graypaw']);

    // Place only a few cats visible in camp
    npcCats.forEach(c => { c.group.visible = false; });
    trainingLionheart = npcCats.find(c => c.name === 'Lionheart');
    const gp = npcCats.find(c => c.name === 'Graypaw');
    if (trainingLionheart) { trainingLionheart.group.position.set(3, 0, 2); trainingLionheart.group.visible = true; }
    if (gp) { gp.group.position.set(4, 0, 4); gp.group.visible = true; }

    gameHud.classList.add('visible');
    playerNameEl.textContent = player.name;
    if (!isMobile) $('emote-bar').classList.remove('hidden');
    if (isMobile) mobileControls.classList.add('visible');
    startForestAmbience();

    trainingStep = 0;
    advanceTraining();
  }

  function advanceTraining () {
    const pName = player.name;
    const isMob = isMobile;
    const moveKey = isMob ? 'the joystick' : 'WASD or Arrow keys';
    const sprintKey = isMob ? 'the RUN button' : 'SHIFT';
    const lookKey = isMob ? 'dragging on the right side of the screen' : 'clicking the screen and moving your mouse';

    switch (trainingStep) {
      case 0:
        // Intro to training
        queueMessage('Lionheart', 'Welcome, ' + pName + '! As your mentor, it is my duty to teach you the ways of the warrior.', () => {
          queueMessage('Lionheart', 'First, let me show you around camp. Follow me!', () => {
            queueMessage('Narrator', 'CONTROLS: Move with ' + moveKey + '. Look around with ' + lookKey + '.', () => {
              trainingStep = 1;
              // Lionheart walks to the Apprentices' Den
              trainingTarget = { x: 6, z: 5 };
              moveLionheartTo(6, 5);
              queueMessage('Lionheart', 'Come, follow me to the Apprentices\' Den! This is where you will sleep.');
            });
          });
        });
        break;

      case 1:
        // At Apprentices' Den
        revealCatNames(['Dustpaw', 'Sandpaw', 'Ravenpaw']);
        // Show some apprentice cats
        ['Dustpaw', 'Sandpaw', 'Ravenpaw'].forEach(n => {
          const c = npcCats.find(cc => cc.name === n);
          if (c) { c.group.visible = true; c.group.position.set(5 + Math.random()*2, 0, 5 + Math.random()*2); }
        });
        queueMessage('Lionheart', 'This is the Apprentices\' Den. You\'ll share it with Graypaw, Dustpaw, Sandpaw, and Ravenpaw.', () => {
          queueMessage('Lionheart', 'Now let me show you the Warriors\' Den and the Leader\'s Den.', () => {
            trainingStep = 2;
            trainingTarget = { x: 8, z: -2 };
            moveLionheartTo(8, -2);
          });
        });
        break;

      case 2:
        // At Warriors' Den
        revealCatNames(['Whitestorm', 'Mousefur', 'Darkstripe', 'Tigerclaw']);
        ['Whitestorm', 'Mousefur', 'Darkstripe', 'Tigerclaw'].forEach(n => {
          const c = npcCats.find(cc => cc.name === n);
          if (c) { c.group.visible = true; c.group.position.set(7 + Math.random()*3, 0, -2 + Math.random()*2); }
        });
        queueMessage('Lionheart', 'This is the Warriors\' Den. One day, when you earn your warrior name, you\'ll sleep here.', () => {
          queueMessage('Lionheart', 'The Leader\'s Den is right by Highrock, where Bluestar lives. Now let me show you the Medicine Den.', () => {
            trainingStep = 3;
            trainingTarget = { x: -10, z: 3 };
            moveLionheartTo(-10, 3);
          });
        });
        break;

      case 3:
        // At Medicine Den
        revealCatName('Spottedleaf');
        const sp = npcCats.find(c => c.name === 'Spottedleaf');
        if (sp) { sp.group.visible = true; sp.group.position.set(-9, 0, 4); }
        queueMessage('Lionheart', 'This is the Medicine Den, where Spottedleaf heals wounded cats. If you get hurt, come here.', () => {
          queueMessage('Spottedleaf', 'Welcome, ' + pName + '. May StarClan light your path. Come see me if you ever need help.', () => {
            queueMessage('Lionheart', 'Good. Now follow me to the fresh-kill pile. You need to learn about hunting!', () => {
              trainingStep = 4;
              trainingTarget = { x: 2, z: 0 };
              moveLionheartTo(2, 0);
            });
          });
        });
        break;

      case 4:
        // Fresh-kill pile - hunting lesson with REAL prey
        queueMessage('Lionheart', 'This is the fresh-kill pile. Warriors bring prey here to feed the Clan.', () => {
          queueMessage('Lionheart', 'Hunting is one of your most important duties. When you\'re out in the forest, ' +
            'crouch low and stay downwind of your prey.', () => {
            queueMessage('Lionheart', 'Let me teach you. Follow me to the hunting grounds — I\'ll find us something to practice on!', () => {
              trainingStep = 41; // sub-step: walk to hunting ground
              trainingTarget = { x: 20, z: 20 };
              moveLionheartTo(20, 20);
            });
          });
        });
        break;

      case 41:
        // Arrived at hunting ground — spawn a practice mouse
        queueMessage('Lionheart', 'Shh! Look — there\'s a mouse over there! Crouch low and sneak up on it...', () => {
          queueMessage('Lionheart', 'HUNTING: ' + (isMob
            ? 'Walk close to the mouse and press ACT to catch it!'
            : 'Walk close to the mouse and press E to catch it!'), () => {
            // Spawn the training prey
            spawnTrainingPrey(25, 22);
            trainingStep = 42; // waiting for player to catch the mouse
          });
        });
        break;

      case 42:
        // Player caught the mouse!
        queueMessage('Lionheart', 'Excellent catch, ' + pName + '! You\'re a natural hunter! That mouse will feed the Clan.', () => {
          queueMessage('Lionheart', 'Remember — always bring your prey back to the fresh-kill pile. The Clan eats together.', () => {
            queueMessage('Lionheart', 'Now, let me teach you about water. Follow me to the stream.', () => {
              trainingStep = 5;
              trainingTarget = { x: 20, z: -15 };
              moveLionheartTo(20, -15);
            });
          });
        });
        break;

      case 5:
        // Water lesson
        queueMessage('Lionheart', 'You can drink from streams and puddles to restore your energy. Look for water in the territory.', () => {
          queueMessage('Lionheart', 'WATER: ' + (isMob
            ? 'Walk near water and press ACT to drink and restore energy.'
            : 'Walk near water and press E to drink and restore your energy.'), () => {
            queueMessage('Lionheart', 'Now, the most important lesson - fighting! Follow me.', () => {
              trainingStep = 6;
              trainingTarget = { x: 15, z: -25 };
              moveLionheartTo(15, -25);
            });
          });
        });
        break;

      case 6:
        // Fighting lesson — real sparring match!
        queueMessage('Lionheart', 'A warrior must know how to fight. You showed spirit against Graypaw, but you need proper training!', () => {
          queueMessage('Lionheart', 'I\'m going to spar with you, ' + pName + '. Don\'t worry — I\'ll go easy on you. But fight hard!', () => {
            queueMessage('Lionheart', 'FIGHTING: You can Attack, Dodge, or use a Fierce Attack! Dodging reduces the next hit you take. Fierce Attack deals big damage but is risky!', () => {
              queueMessage('Lionheart', 'Ready? Let\'s go! Show me what you\'ve got, apprentice!', () => {
                // Start sparring match with Lionheart
                startBattle({
                  enemyName: 'Lionheart (Sparring)',
                  enemyHP: 45,
                  enemyMaxHP: 45,
                  enemyAttack: 5,     // goes easy
                  enemyDefense: 2,
                  enemyFurColor: 0xddaa44,
                  enemyEyeColor: 0xcc8800,
                  enemyStripes: false,
                  playerMinHP: 10,    // can't die in training
                  expReward: 20,
                  onWin: function () {
                    trainingFightComplete = true;
                    queueMessage('Lionheart', 'Ha! Well fought, ' + pName + '! You\'re stronger than I expected!', () => {
                      queueMessage('Lionheart', 'Remember — a true warrior fights to protect, not to destroy. Use your claws wisely.', () => {
                        queueMessage('Lionheart', 'SPRINTING: Hold ' + sprintKey + ' to run fast, but it uses your energy. ' +
                          'Use it to escape danger or chase prey!', () => {
                          queueMessage('Lionheart', 'Now, the MOST important part of being a warrior — knowing our borders! Follow me to the ShadowClan border!', () => {
                            trainingStep = 7;
                            trainingTarget = { x: -48, z: -10 };
                            moveLionheartTo(-48, -10);
                          });
                        });
                      });
                    });
                  },
                  onLose: function () {
                    // Can't really lose (playerMinHP = 10), but just in case
                    queueMessage('Lionheart', 'Not bad for your first real sparring match! You\'ll get stronger with practice.', () => {
                      trainingFightComplete = true;
                      player.health = player.maxHealth; // heal up
                      queueMessage('Lionheart', 'Let me teach you about sprinting and borders now. Follow me!', () => {
                        trainingStep = 7;
                        trainingTarget = { x: -48, z: -10 };
                        moveLionheartTo(-48, -10);
                      });
                    });
                  }
                });
              });
            });
          });
        });
        break;

      case 7:
        // ShadowClan border
        queueMessage('Lionheart', 'Stop here, ' + pName + '. Do you see those scent markers? This is the ShadowClan border.', () => {
          queueMessage('Lionheart', 'Beyond those markers is the Thunderpath - a hard black path where monsters roar past. It\'s very dangerous!', () => {
            queueMessage('Lionheart', 'Past the Thunderpath lies ShadowClan territory. Their cats are cunning and dangerous. NEVER cross into their land unless the Clan sends you.', () => {
              queueMessage('Lionheart', 'If you cross into another Clan\'s territory, their warriors WILL chase you out - or worse!', () => {
                queueMessage('Lionheart', 'Now follow me south. I want to show you Fourtrees - the sacred meeting place.', () => {
                  trainingStep = 8;
                  trainingTarget = { x: -42, z: -42 };
                  moveLionheartTo(-42, -42);
                });
              });
            });
          });
        });
        break;

      case 8:
        // Fourtrees
        queueMessage('Lionheart', 'This is Fourtrees - where all four Clans meet every full moon for a Gathering.', () => {
          queueMessage('Lionheart', 'See the four great oaks? And the Great Rock in the center - that\'s where the Clan leaders stand to speak.', () => {
            queueMessage('Lionheart', 'During a Gathering, there is a truce. No Clan may attack another. It is sacred law.', () => {
              queueMessage('Lionheart', 'WindClan territory is to the north - open moorland with few trees. They are fast runners.', () => {
                queueMessage('Lionheart', 'Now let me show you the RiverClan border and Sunningrocks. Follow me east!', () => {
                  trainingStep = 9;
                  trainingTarget = { x: 60, z: 0 };
                  moveLionheartTo(60, 0);
                });
              });
            });
          });
        });
        break;

      case 9:
        // Sunningrocks & RiverClan border
        queueMessage('Lionheart', 'These are Sunningrocks - the warm rocks where cats love to bask in the sun.', () => {
          queueMessage('Lionheart', 'RiverClan claims these rocks belong to them, but they are OURS. ThunderClan has fought many battles here.', () => {
            queueMessage('Lionheart', 'See the river beyond? That\'s the border with RiverClan. Their warriors swim and fish - don\'t try to cross the water!', () => {
              queueMessage('Lionheart', 'If you enter another Clan\'s territory, their border patrols will attack you. Be careful!', () => {
                queueMessage('Lionheart', 'Now, let me show you the WindClan border to the north, then we\'ll head back to camp.', () => {
                  trainingStep = 10;
                  trainingTarget = { x: 10, z: -52 };
                  moveLionheartTo(10, -52);
                });
              });
            });
          });
        });
        break;

      case 10:
        // WindClan border
        queueMessage('Lionheart', 'This is the WindClan border. See how the trees thin out and the land becomes open moorland?', () => {
          queueMessage('Lionheart', 'WindClan cats are the fastest in all the forest. Don\'t chase them - you won\'t catch them!', () => {
            queueMessage('Lionheart', 'Remember: respect ALL borders. The scent markers tell you where each territory ends.', () => {
              queueMessage('Lionheart', 'That covers the full border tour, ' + pName + '! Let\'s head back to camp. You\'re ready to start your life as an apprentice!', () => {
                trainingStep = 11;
                trainingTarget = { x: 0, z: 0 };
                moveLionheartTo(0, 0);
              });
            });
          });
        });
        break;

      case 11:
        // Training complete!
        revealCatNames([
          'Bluestar', 'Lionheart', 'Graypaw', 'Whitestorm',
          'Dustpaw', 'Sandpaw', 'Mousefur', 'Darkstripe',
          'Ravenpaw', 'Spottedleaf', 'Tigerclaw',
          'Frostfur', 'Brindleface', 'Goldenflower',
          'Cinderkit', 'Brackenkit', 'Brightkit', 'Thornkit', 'Ashkit', 'Fernkit'
        ]);
        // Show clan cats, hide story-locked cats (Yellowfang not yet in ThunderClan)
        npcCats.forEach(c => { c.group.visible = !HIDDEN_UNTIL_STORY.includes(c.name); });
        placeCatsInCamp();
        initNPCAI(); // cats start living their lives (kittypets stay at house)

        queueMessage('Lionheart', 'Your training tour is complete, ' + pName + '! You are now free to explore the territory on your own.', () => {
          queueMessage('Graypaw', 'Hey ' + pName + '! Want to go explore? There\'s so much to see!', () => {
            storyPhase = 'playing';
            storyChapter = 0; // ready for first chapter
            saveGame();
            queueMessage('Narrator', 'You are now free to explore! ' +
              (isMob ? 'Use the joystick to move. RUN to sprint. ACT to interact.'
                     : 'WASD to move. SHIFT to sprint. E to interact.') +
              ' When you\'re ready, tap the "Next Chapter" button at the top to continue the story.');
            showNextChapterButton();
          });
        });
        break;
    }
  }

  /** Set Lionheart's walk target (he walks there smoothly, doesn't teleport) */
  function moveLionheartTo (tx, tz) {
    if (trainingLionheart) {
      trainingTarget = { x: tx, z: tz };
      trainingLionheart._waiting = false;
    }
  }

  let waitingMessageShown = false;
  let waitingMessageTimer = 0;

  /** Check if the player is near the training target */
  function checkTrainingProximity () {
    if (storyPhase !== 'training' || !trainingTarget || !player) return;

    // Distance from player to the training target destination
    const dx = player.position.x - trainingTarget.x;
    const dz = player.position.z - trainingTarget.z;
    const distToTarget = Math.sqrt(dx * dx + dz * dz);

    // Distance from player to Lionheart
    let distToLion = 999;
    if (trainingLionheart && trainingLionheart.group.visible) {
      const lx = trainingLionheart.group.position.x - player.position.x;
      const lz = trainingLionheart.group.position.z - player.position.z;
      distToLion = Math.sqrt(lx * lx + lz * lz);
    }

    // If the player is too far from Lionheart, he stops and waits
    const MAX_FOLLOW_DIST = 15;
    if (distToLion > MAX_FOLLOW_DIST && trainingLionheart) {
      trainingLionheart._waiting = true;
      // Show a hint every few seconds
      waitingMessageTimer++;
      if (!waitingMessageShown || waitingMessageTimer > 300) {
        waitingMessageTimer = 0;
        waitingMessageShown = true;
        if (!messageBox.classList.contains('visible')) {
          queueMessage('Lionheart', 'Come on, ' + (player.name || 'young one') + '! Keep up! Follow me!');
        }
      }
    } else {
      if (trainingLionheart) trainingLionheart._waiting = false;
      waitingMessageShown = false;
      waitingMessageTimer = 0;
    }

    // Player arrived near the target?
    if (distToTarget < 6) {
      trainingTarget = null; // clear so we don't trigger again
      advanceTraining();
    }
  }

  /* ====================================================
     TRAINING PREY (hunting practice)
     ==================================================== */
  function spawnTrainingPrey (px, pz) {
    if (trainingPrey && trainingPrey.group) {
      scene.remove(trainingPrey.group);
    }
    const g = new THREE.Group();

    // Mouse body - small brown oval
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x8B6914, shininess: 3 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), bodyMat);
    body.scale.set(1, 0.7, 1.5);
    body.position.y = 0.12;
    g.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), bodyMat);
    head.position.set(0, 0.12, 0.2);
    g.add(head);

    // Ears
    const earMat = new THREE.MeshPhongMaterial({ color: 0xcc9966 });
    const earL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 4), earMat);
    earL.position.set(-0.05, 0.2, 0.2); g.add(earL);
    const earR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 4), earMat);
    earR.position.set(0.05, 0.2, 0.2); g.add(earR);

    // Eyes (tiny black)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.015, 4, 4), eyeMat);
    eyeL.position.set(-0.03, 0.14, 0.27); g.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.015, 4, 4), eyeMat);
    eyeR.position.set(0.03, 0.14, 0.27); g.add(eyeR);

    // Tail - thin cylinder
    const tailMat = new THREE.MeshPhongMaterial({ color: 0x997744 });
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, 0.3, 4), tailMat);
    tail.position.set(0, 0.1, -0.3);
    tail.rotation.x = Math.PI / 4;
    g.add(tail);

    // Name label
    const label = makeNameLabel('Mouse', 0.8);
    label.position.y = 0.4;
    g.add(label);

    g.position.set(px, 0, pz);
    scene.add(g);

    trainingPrey = {
      group: g,
      position: { x: px, z: pz },
      alive: true,
      runAngle: Math.random() * Math.PI * 2,
      runTimer: 0,
      scaredOf: null, // set when player gets close
    };
    trainingHuntComplete = false;
  }

  /** Update training prey — mouse runs away from player when they get close */
  function updateTrainingPrey (dt) {
    if (!trainingPrey || !trainingPrey.alive || !player) return;

    const p = trainingPrey;
    const ddx = player.position.x - p.position.x;
    const ddz = player.position.z - p.position.z;
    const dist = Math.sqrt(ddx * ddx + ddz * ddz);

    // Mouse runs when player is within 4 units
    if (dist < 4) {
      // Run away from player
      const fleeAngle = Math.atan2(-ddx, -ddz);
      p.runAngle = fleeAngle + (Math.random() - 0.5) * 0.8; // slightly random
      const spd = 3.5 * dt;
      p.position.x += Math.sin(p.runAngle) * spd;
      p.position.z += Math.cos(p.runAngle) * spd;
      // Keep in bounds
      p.position.x = Math.max(-40, Math.min(60, p.position.x));
      p.position.z = Math.max(-40, Math.min(60, p.position.z));
      // Face the direction it's running
      p.group.rotation.y = p.runAngle;
    } else {
      // Idle — small random movements
      p.runTimer -= dt;
      if (p.runTimer <= 0) {
        p.runAngle = Math.random() * Math.PI * 2;
        p.runTimer = 1 + Math.random() * 3;
      }
      const idleSpd = 0.5 * dt;
      p.position.x += Math.sin(p.runAngle) * idleSpd;
      p.position.z += Math.cos(p.runAngle) * idleSpd;
      p.group.rotation.y = p.runAngle;
    }

    p.group.position.set(p.position.x, 0, p.position.z);
  }

  /** Try to catch the training prey — called when player presses E / ACT near it */
  function tryToCatchPrey () {
    if (!trainingPrey || !trainingPrey.alive || !player) return false;

    const ddx = player.position.x - trainingPrey.position.x;
    const ddz = player.position.z - trainingPrey.position.z;
    const dist = Math.sqrt(ddx * ddx + ddz * ddz);

    if (dist < 2.0) {
      // Caught it!
      trainingPrey.alive = false;
      trainingPrey.group.visible = false;
      trainingHuntComplete = true;
      playPreyCatch();
      playSound('eat');

      // Advance training
      if (trainingStep === 42) {
        advanceTraining();
      }
      return true;
    }
    return false;
  }

  /** Place all cats in their camp positions */
  function placeCatsInCamp () {
    const campPositions = [
      { name: 'Bluestar', x: DEN_SPOTS['Leader'].x, z: DEN_SPOTS['Leader'].z }, // In Leader's Den
      { name: 'Lionheart', x: -1, z: 1 },
      { name: 'Graypaw', x: DEN_SPOTS['Apprentices'].x + 1, z: DEN_SPOTS['Apprentices'].z },
      { name: 'Whitestorm', x: DEN_SPOTS['Warriors'].x, z: DEN_SPOTS['Warriors'].z },
      { name: 'Dustpaw', x: DEN_SPOTS['Apprentices'].x - 1, z: DEN_SPOTS['Apprentices'].z + 1 },
      { name: 'Sandpaw', x: DEN_SPOTS['Apprentices'].x, z: DEN_SPOTS['Apprentices'].z + 1 },
      { name: 'Mousefur', x: DEN_SPOTS['Warriors'].x + 1, z: DEN_SPOTS['Warriors'].z + 1 },
      { name: 'Darkstripe', x: DEN_SPOTS['Warriors'].x - 1, z: DEN_SPOTS['Warriors'].z - 1 },
      { name: 'Ravenpaw', x: DEN_SPOTS['Apprentices'].x + 2, z: DEN_SPOTS['Apprentices'].z - 1 },
      { name: 'Spottedleaf', x: DEN_SPOTS['Medicine'].x, z: DEN_SPOTS['Medicine'].z }, // In Medicine Den
      { name: 'Tigerclaw', x: DEN_SPOTS['Warriors'].x + 2, z: DEN_SPOTS['Warriors'].z },
      // Yellowfang NOT placed — she's ShadowClan and hasn't been found yet
      { name: 'Longtail', x: DEN_SPOTS['Warriors'].x - 2, z: DEN_SPOTS['Warriors'].z + 1 },
      // Queens in the Nursery
      { name: 'Frostfur', x: DEN_SPOTS['Nursery'].x, z: DEN_SPOTS['Nursery'].z },
      { name: 'Brindleface', x: DEN_SPOTS['Nursery'].x - 1, z: DEN_SPOTS['Nursery'].z + 0.5 },
      { name: 'Goldenflower', x: DEN_SPOTS['Nursery'].x + 1, z: DEN_SPOTS['Nursery'].z + 0.5 },
      // Kits tumbling around the Nursery
      { name: 'Cinderkit', x: DEN_SPOTS['Nursery'].x - 0.5, z: DEN_SPOTS['Nursery'].z - 0.5 },
      { name: 'Brackenkit', x: DEN_SPOTS['Nursery'].x + 0.5, z: DEN_SPOTS['Nursery'].z - 0.8 },
      { name: 'Brightkit', x: DEN_SPOTS['Nursery'].x - 0.8, z: DEN_SPOTS['Nursery'].z + 0.5 },
      { name: 'Thornkit', x: DEN_SPOTS['Nursery'].x + 0.8, z: DEN_SPOTS['Nursery'].z + 0.8 },
      { name: 'Ashkit', x: DEN_SPOTS['Nursery'].x - 1.3, z: DEN_SPOTS['Nursery'].z - 0.2 },
      { name: 'Fernkit', x: DEN_SPOTS['Nursery'].x - 1, z: DEN_SPOTS['Nursery'].z + 1 },
    ];
    campPositions.forEach(cp => {
      const cat = npcCats.find(c => c.name === cp.name);
      if (cat) { cat.group.position.set(cp.x, 0, cp.z); cat.group.visible = true; }
    });

    // Smudge & Princess always hang out by the Twoleg house - they're kittypets!
    const smudge = npcCats.find(c => c.name === 'Smudge');
    const princess = npcCats.find(c => c.name === 'Princess');
    if (smudge) { smudge.group.position.set(3, 0, 83); smudge.group.visible = true; }
    if (princess) { princess.group.position.set(-3, 0, 84); princess.group.visible = true; }
    // Player already knows them from being a kittypet
    revealCatNames(['Smudge', 'Princess']);
  }

  /* ====================================================
     START PLAYING (free roam after training or loading save)
     ==================================================== */
  function startPlaying () {
    gameState = 'playing';
    storyPhase = storyPhase || 'playing';
    catGroup.visible = true;

    // Restore saved position or default to camp
    const px = (player.position && player.position.x) || 2;
    const pz = (player.position && player.position.z) || 3;
    player.position = { x: px, y: 0, z: pz };
    catGroup.position.set(px, 0, pz);

    // Reveal ThunderClan cat names
    const knownNames = [
      'Bluestar', 'Lionheart', 'Graypaw', 'Whitestorm',
      'Dustpaw', 'Sandpaw', 'Mousefur', 'Darkstripe',
      'Ravenpaw', 'Spottedleaf', 'Tigerclaw'
    ];
    // If Yellowfang has been encountered, reveal her name too
    if (yellowfangEncounterTriggered) knownNames.push('Yellowfang');
    revealCatNames(knownNames);

    // Show NPC cats — hide story-locked cats unless they've been encountered
    npcCats.forEach(c => {
      if (c.name === 'Yellowfang') {
        // Yellowfang is only visible after her encounter
        c.group.visible = !!yellowfangEncounterTriggered;
        if (yellowfangEncounterTriggered) {
          // She starts in the prisoner den; moves to medicine den after proving loyalty
          const yfHome = (c.ai && c.ai.home) || DEN_SPOTS['Prisoner'];
          c.group.position.set(yfHome.x, 0, yfHome.z);
        }
      } else if (HIDDEN_UNTIL_STORY.includes(c.name)) {
        c.group.visible = false;
      } else {
        c.group.visible = true;
      }
    });
    placeCatsInCamp();

    // Start NPC AI - cats walk around, hunt, drink, rest
    initNPCAI();

    gameHud.classList.add('visible');
    playerNameEl.textContent = player.name;
    if (!isMobile) $('emote-bar').classList.remove('hidden');

    if (isMobile) mobileControls.classList.add('visible');

    // Start forest sounds
    startForestAmbience();

    // Welcome message
    queueMessage('Narrator',
      'Welcome back, ' + player.name + '! Explore the territory. ' +
      (isMobile ? 'Use the joystick to move. RUN to sprint. ACT to interact.'
                : 'WASD to move. SHIFT to sprint. E to interact. Click to look around.'));

    // Show Next Chapter button if there are more chapters
    if (storyPhase === 'playing' && storyChapter < STORY_CHAPTERS.length) {
      showNextChapterButton();
    }
  }

  /* ====================================================
     MESSAGE QUEUE (in-game dialog)
     ==================================================== */
  function queueMessage (speaker, text, callback) {
    messageQueue.push({ speaker, text, callback });
    if (!messageBox.classList.contains('visible')) showNextMessage();
  }

  function showNextMessage () {
    if (messageQueue.length === 0) { messageBox.classList.remove('visible'); return; }
    const m = messageQueue[0];
    messageSpeaker.textContent = m.speaker;
    messageTextEl.textContent = m.text;
    messageCallback = m.callback || null;
    messageBox.classList.add('visible');
    // Play appropriate sound for speaker
    if (m.speaker && m.speaker !== 'Narrator') {
      playCatVoice(m.speaker);
    } else if (m.speaker === 'Narrator') {
      // Narrator gets a soft chime
      try {
        if (audioCtx) {
          const t = audioCtx.currentTime;
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.connect(g); g.connect(_out());
          o.type = 'sine';
          o.frequency.setValueAtTime(880, t);
          o.frequency.linearRampToValueAtTime(1100, t + 0.1);
          g.gain.setValueAtTime(0.08, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          o.start(t); o.stop(t + 0.35);
        }
      } catch (e) {}
    }
  }

  function advanceMessage () {
    if (!messageBox.classList.contains('visible')) return;
    messageBox.classList.remove('visible');
    const cb = messageCallback; messageCallback = null;
    messageQueue.shift();
    if (cb) cb();
    else if (messageQueue.length > 0) setTimeout(showNextMessage, 150);
  }

  /* ====================================================
     SAVE / LOAD  (full game state, not just player)
     ==================================================== */
  let saveIndicatorTimeout = null;
  function saveGame () {
    if (!player || !activeSaveSlot) return;
    const saveData = {
      player: player,
      storyPhase: storyPhase,
      knownCats: Array.from(knownCats),
      redtailEventTriggered: redtailEventTriggered,
      fenceWarningTriggered: fenceWarningTriggered,
      graypawEncounterTriggered: graypawEncounterTriggered,
      bluestarEncounterTriggered: bluestarEncounterTriggered,
      mothermouthTriggered: mothermouthTriggered,
      mothermouthTimer: mothermouthTimer,
      yellowfangEncounterTriggered: yellowfangEncounterTriggered,
      storyChapter: storyChapter,
      scentMarkerWarned: scentMarkerWarned,
      playingTimer: playingTimer,
      gameTime: gameTime,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem('warriors-save-' + activeSaveSlot, JSON.stringify(saveData));
      // Show save indicator briefly
      const ind = $('save-indicator');
      if (ind) {
        ind.classList.remove('hidden');
        ind.classList.add('show');
        clearTimeout(saveIndicatorTimeout);
        saveIndicatorTimeout = setTimeout(() => {
          ind.classList.remove('show');
          setTimeout(() => ind.classList.add('hidden'), 400);
        }, 1500);
      }
    } catch (e) { /* storage full, silently fail */ }
  }

  function loadGame (slot) {
    const raw = localStorage.getItem('warriors-save-' + slot);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      // Support old format (just player object) and new format (full state)
      if (data && data.player) {
        return data; // new format
      } else if (data && typeof data.health === 'number') {
        // Old format: just a player object
        return { player: data, storyPhase: 'playing', knownCats: [], redtailEventTriggered: true,
          graypawEncounterTriggered: true, bluestarEncounterTriggered: true, mothermouthTriggered: true,
          yellowfangEncounterTriggered: false, storyChapter: 2,
          mothermouthTimer: 9999, playingTimer: 9999, gameTime: 0, savedAt: 0 };
      }
    } catch (e) {}
    return null;
  }

  // Save when leaving the page / switching tabs
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && player && activeSaveSlot) saveGame();
  });
  window.addEventListener('beforeunload', () => {
    if (player && activeSaveSlot) saveGame();
  });

  /* ====================================================
     ANIMATION
     ==================================================== */
  let walkCycle = 0, stepTimer = 0, autoSaveTimer = 0;

  function animateCatLegs (dt, moving, spd) {
    if (!catGroup || !catGroup.legs) return;
    if (moving) {
      walkCycle += dt * spd * 2; stepTimer += dt;
      const sw = Math.sin(walkCycle * 3) * 0.35;
      catGroup.legs[0].rotation.x = sw;  catGroup.legs[1].rotation.x = -sw;
      catGroup.legs[2].rotation.x = -sw; catGroup.legs[3].rotation.x = sw;
      catGroup.children[0].position.y = 0.60 + Math.sin(walkCycle * 6) * 0.02;
      if (stepTimer > 0.3 / spd) { stepTimer = 0; playSound('step'); }
    } else {
      catGroup.legs.forEach(l => { l.rotation.x *= 0.9; });
      walkCycle = 0; stepTimer = 0;
    }
  }

  function animateTail (time) {
    if (!catGroup || !catGroup.tailSegs) return;
    catGroup.tailSegs.forEach((s, i) => {
      // gentle sway, increases toward the tip
      s.position.x = Math.sin(time * 2.5 + i * 0.4) * 0.02 * i;
    });
  }

  function animateNPCTails (time) {
    npcCats.forEach((c, ci) => {
      if (!c.group.visible || !c.group.tailSegs) return;
      c.group.tailSegs.forEach((s, i) => {
        s.position.x = Math.sin(time * 1.8 + ci * 2 + i * 0.4) * 0.018 * i;
      });
    });
  }

  /** Animate water surface — gentle ripple effect */
  function animateWater (time) {
    const riverMesh = scene.getObjectByName('river');
    if (!riverMesh) return;
    const pos = riverMesh.geometry.attributes.position;
    if (!riverMesh._origY) {
      riverMesh._origY = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        riverMesh._origY[i] = pos.getY(i);
      }
    }
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const wave = Math.sin(x * 2 + time * 1.5) * 0.03 + Math.sin(z * 0.5 + time * 0.8) * 0.02;
      pos.setY(i, riverMesh._origY[i] + wave);
    }
    pos.needsUpdate = true;
  }

  function animateFireflies (time) {
    const f = scene.getObjectByName('fireflies');
    if (!f) return;
    const p = f.geometry.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      p[i]   += Math.sin(time + i) * 0.008;
      p[i+1] += Math.cos(time * 0.7 + i * 0.5) * 0.004;
      p[i+2] += Math.sin(time * 0.5 + i * 0.3) * 0.008;
    }
    f.geometry.attributes.position.needsUpdate = true;
    f.material.opacity = 0.5 + Math.sin(time * 2) * 0.3;
  }

  /* ====================================================
     NPC FOLLOW (story followers)
     ==================================================== */
  function updateFollowers (dt) {
    // Graypaw follows during the forest walk
    if (storyPhase === 'fought_graypaw') {
      walkNPCToward(npcCats.find(c => c.name === 'Graypaw'), player.position.x, player.position.z, 3, 4, dt);
    }

    // During training, Lionheart walks toward his target — but stops if player is too far
    if (storyPhase === 'training' && trainingLionheart && trainingTarget) {
      if (trainingLionheart._waiting) {
        // Lionheart stops and faces the player, waiting
        trainingLionheart._walking = false;
        trainingLionheart.group.lookAt(player.position.x, 0, player.position.z);
      } else {
        // Lionheart walks toward the target at a pace the player can follow
        // Walk a bit slower than normal, and stay ahead of the player but not too far
        const lPos = trainingLionheart.group.position;
        const plx = player.position.x - lPos.x;
        const plz = player.position.z - lPos.z;
        const playerDist = Math.sqrt(plx * plx + plz * plz);

        // If player is close, walk at normal pace. If player is medium distance, slow down
        let speed = 4;
        if (playerDist > 10) speed = 2;
        else if (playerDist > 6) speed = 3;

        walkNPCToward(trainingLionheart, trainingTarget.x, trainingTarget.z, 1.5, speed, dt);
      }
    }
    // Graypaw follows the player during training
    if (storyPhase === 'training') {
      walkNPCToward(npcCats.find(c => c.name === 'Graypaw'), player.position.x, player.position.z, 3.5, 4.5, dt);
    }
  }

  /** Helper: walk an NPC cat toward (tx, tz), stop within minDist */
  function walkNPCToward (npc, tx, tz, minDist, speed, dt) {
    if (!npc || !npc.group.visible) return;
    const pos = npc.group.position;
    const dx = tx - pos.x, dz = tz - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > minDist) {
      const spd = speed * dt;
      pos.x += (dx / dist) * spd;
      pos.z += (dz / dist) * spd;
      npc.group.lookAt(tx, 0, tz);
      npc._walking = true;
    } else {
      npc._walking = false;
    }
  }

  /* ====================================================
     NPC AI - Cats living their lives in camp & territory
     ==================================================== */
  // Each NPC gets an AI state: idle, walking, hunting, carrying, drinking, resting
  // They pick tasks, walk to locations, do them, and return to camp

  const NPC_TASKS = ['idle', 'patrol', 'hunt', 'drink', 'rest', 'eat'];
  const FRESH_KILL = { x: 2, z: 0 };   // fresh-kill pile
  const WATER_SPOT = { x: 20, z: -15 }; // stream location
  const DEN_SPOTS = {
    'Apprentices': { x: 6, z: 5 },
    'Warriors': { x: 8, z: -2 },
    'Leader': { x: -3, z: -1.5 },
    'Medicine': { x: -10, z: 3 },
    'Nursery': { x: -8, z: 5 },
    'Elders': { x: -6, z: -7 },
    'Prisoner': { x: 10, z: 6 },
  };

  // Den info for interior view — descriptions, detection radius, display names
  const DEN_INFO = {
    'Warriors': {
      label: "Warriors' Den",
      r: 4.0,
      desc: "A large den woven from brambles and branches. Moss-lined nests cover the sandy floor, each one carrying the familiar scent of a different warrior. It's warm and cozy inside."
    },
    'Apprentices': {
      label: "Apprentices' Den",
      r: 3.2,
      desc: "A smaller den for apprentice cats. The nests are fresh with moss and bracken. Paw prints mark the sandy floor, and the air buzzes with youthful energy."
    },
    'Leader': {
      label: "Leader's Den",
      r: 3.0,
      desc: "A sheltered cave beneath the Highrock, hidden behind a curtain of hanging lichen. The leader's nest sits at the back, lined with the softest moss in camp."
    },
    'Medicine': {
      label: "Medicine Den",
      r: 3.5,
      desc: "The air is thick with the scent of herbs. Bundles of catmint, tansy, cobwebs, and borage line the rocky walls. Herb stores and patient nests fill the back of the den."
    },
    'Nursery': {
      label: "Nursery",
      r: 3.5,
      desc: "The warmest den in camp. Thick walls of woven bramble keep out the cold wind, and soft moss nests cradle the queens and their kits. It smells of milk and warm fur."
    },
    'Elders': {
      label: "Elders' Den",
      r: 3.5,
      desc: "A sheltered den where the elders rest and share stories. It smells of old memories and warm pelts. Moss nests are arranged near the entrance for easy access."
    },
    'Prisoner': {
      label: "Prisoner Den",
      r: 2.5,
      desc: "A cramped den surrounded by thick bramble walls and thorns. Dark and uncomfortable — meant to hold cats who aren't trusted by the Clan... yet."
    }
  };

  // Cat fur colors for den interior display
  const CAT_DISPLAY_COLORS = {
    'Bluestar': '#6688aa', 'Lionheart': '#ccaa33', 'Graypaw': '#778899',
    'Whitestorm': '#cccccc', 'Dustpaw': '#7a5533', 'Sandpaw': '#ddbb88',
    'Mousefur': '#8b6b4a', 'Darkstripe': '#555566', 'Ravenpaw': '#2a2a2a',
    'Spottedleaf': '#aa6633', 'Tigerclaw': '#5a3a1a', 'Yellowfang': '#555555',
    'Longtail': '#ccbb99', 'Smudge': '#333333', 'Princess': '#ccaa77',
    // Queens
    'Frostfur': '#dddddd', 'Brindleface': '#999999', 'Goldenflower': '#ddaa55',
    // Kits
    'Cinderkit': '#666677', 'Brackenkit': '#bb8833', 'Brightkit': '#dddddd',
    'Thornkit': '#bb9944', 'Ashkit': '#aaaaaa', 'Fernkit': '#bbbbaa',
  };

  // Den interior state
  let denOpen = false;

  function getNearestDen () {
    if (!player) return null;
    const px = player.position.x, pz = player.position.z;
    let closest = null, closestDist = Infinity;
    for (const [name, info] of Object.entries(DEN_INFO)) {
      const spot = DEN_SPOTS[name];
      if (!spot) continue;
      const dx = px - spot.x, dz = pz - spot.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < info.r && dist < closestDist) {
        closest = name;
        closestDist = dist;
      }
    }
    return closest;
  }

  function getCatsInDen (denName) {
    const spot = DEN_SPOTS[denName];
    const info = DEN_INFO[denName];
    if (!spot || !info) return [];
    const cats = [];
    for (const npc of npcCats) {
      if (!npc.group.visible) continue;
      const dx = npc.group.position.x - spot.x;
      const dz = npc.group.position.z - spot.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < info.r + 1.5) {
        cats.push(npc);
      }
    }
    return cats;
  }

  function getAIStatusText (npc) {
    if (!npc.ai) return 'Resting';
    const role = npc.ai.role || '';
    const state = npc.ai.state || npc.ai.task || 'idle';
    // Role-specific status overrides
    if (role === 'kit') {
      switch (state) {
        case 'rest':   return 'Napping \uD83D\uDCA4';
        case 'eat':    return 'Eating \uD83C\uDF56';
        case 'drink':  return 'Drinking \uD83D\uDCA7';
        case 'patrol': return 'Playing \uD83C\uDFBE';
        case 'hunt':   return 'Play-pouncing \uD83D\uDC3E';
        case 'idle':   return 'Sitting around';
        default:       return 'Playing';
      }
    }
    if (role === 'queen') {
      switch (state) {
        case 'rest':   return 'Resting with kits \uD83D\uDCA4';
        case 'eat':    return 'Eating \uD83C\uDF56';
        case 'drink':  return 'Drinking \uD83D\uDCA7';
        case 'patrol': return 'Watching over kits \uD83D\uDC41\uFE0F';
        case 'idle':   return 'Grooming kits';
        default:       return 'In the nursery';
      }
    }
    switch (state) {
      case 'rest':  return 'Sleeping \uD83D\uDCA4';
      case 'eat':   return 'Eating \uD83C\uDF56';
      case 'drink': return 'Drinking \uD83D\uDCA7';
      case 'patrol': return 'On patrol';
      case 'hunt':  return 'Hunting';
      case 'idle':  return 'Resting';
      case 'intruder_patrol': return 'Chasing intruders \u2694\uFE0F';
      default:      return 'Resting';
    }
  }

  function enterDen (denName) {
    const info = DEN_INFO[denName];
    if (!info) return;
    denOpen = true;

    const cats = getCatsInDen(denName);

    // Populate overlay
    $('den-interior-title').textContent = info.label;
    $('den-interior-desc').textContent = info.desc;

    const grid = $('den-cat-grid');
    grid.innerHTML = '';

    if (cats.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'den-empty';
      empty.textContent = 'The den is empty right now. Everyone must be out in camp or the territory.';
      grid.appendChild(empty);
    } else {
      cats.forEach(npc => {
        const card = document.createElement('div');
        card.className = 'den-cat-card';
        const displayName = knownCats.has(npc.name) ? npc.name : '???';
        const color = CAT_DISPLAY_COLORS[npc.name] || '#888866';
        const status = getAIStatusText(npc);

        card.innerHTML =
          '<div class="den-cat-icon" style="background:' + color + '">\uD83D\uDC31</div>' +
          '<div class="den-cat-name">' + displayName + '</div>' +
          '<div class="den-cat-status">' + status + '</div>' +
          '<div class="den-cat-talk">' + (isMobile ? 'Tap to talk' : 'Click to talk') + '</div>';

        card.addEventListener('click', function () {
          leaveDen();
          setTimeout(function () { talkToCat(npc); }, 100);
        });
        card.addEventListener('touchstart', function (ev) {
          ev.preventDefault();
          leaveDen();
          setTimeout(function () { talkToCat(npc); }, 100);
        });
        grid.appendChild(card);
      });
    }

    $('den-interior').classList.remove('hidden');
    // Play a soft ambient sound
    if (audioCtx) {
      try {
        playSound('ambient');
      } catch (e) {}
    }
  }

  function leaveDen () {
    denOpen = false;
    $('den-interior').classList.add('hidden');
  }

  // Assign rank-based dens (kittypets get the Twoleg house as their "den")
  const TWOLEG_HOUSE_SPOT = { x: 0, z: 83 };

  const QUEEN_NAMES = ['Frostfur', 'Brindleface', 'Goldenflower'];
  const KIT_NAMES = ['Cinderkit', 'Brackenkit', 'Brightkit', 'Thornkit', 'Ashkit', 'Fernkit'];

  function getDenForCat (name) {
    if (KITTYPET_NAMES.includes(name)) return TWOLEG_HOUSE_SPOT;
    const apprentices = ['Graypaw', 'Dustpaw', 'Sandpaw', 'Ravenpaw'];
    if (apprentices.includes(name)) return DEN_SPOTS['Apprentices'];
    if (name === 'Bluestar') return DEN_SPOTS['Leader'];
    if (name === 'Spottedleaf') return DEN_SPOTS['Medicine'];
    if (name === 'Yellowfang') return DEN_SPOTS['Prisoner'];
    if (QUEEN_NAMES.includes(name) || KIT_NAMES.includes(name)) return DEN_SPOTS['Nursery'];
    return DEN_SPOTS['Warriors'];
  }

  /**
   * Cat behavior roles:
   * - 'leader':      stays in den mostly, walks around camp to talk, NEVER leaves camp
   * - 'medicine':    stays in medicine den mostly, walks around camp, NEVER leaves camp
   * - 'warrior':     hunts, patrols borders, drinks, eats, rests — goes far out
   * - 'apprentice':  hunts, patrols (shorter range), drinks, eats, trains
   * - 'elder':       stays near camp, eats, drinks, rests
   * - 'queen':       stays in/near nursery, protective, rarely leaves camp
   * - 'kit':         plays near nursery, never leaves camp, tiny and energetic
   * - 'kittypet':    stays near Twoleg house
   */
  function getCatRole (name) {
    if (name === 'Bluestar') return 'leader';
    if (name === 'Spottedleaf') return 'medicine';
    if (name === 'Yellowfang') return 'elder';
    if (name === 'Smudge' || name === 'Princess') return 'kittypet';
    if (['Graypaw', 'Dustpaw', 'Sandpaw', 'Ravenpaw'].includes(name)) return 'apprentice';
    if (QUEEN_NAMES.includes(name)) return 'queen';
    if (KIT_NAMES.includes(name)) return 'kit';
    return 'warrior'; // Lionheart, Whitestorm, Tigerclaw, Mousefur, Darkstripe, Longtail
  }

  function initNPCAI () {
    npcCats.forEach(c => {
      const role = getCatRole(c.name);
      let walkSpeed = 2.5 + Math.random() * 1.5;
      if (role === 'apprentice') walkSpeed = 3.0 + Math.random();
      else if (role === 'elder') walkSpeed = 1.8;
      else if (role === 'queen') walkSpeed = 2.0 + Math.random() * 0.5;
      else if (role === 'kit') walkSpeed = 3.5 + Math.random() * 1.5; // kits are fast and energetic!
      c.ai = {
        task: 'idle',
        target: null,
        timer: Math.random() * 6 + 2,
        carryingPrey: false,
        walkSpeed: walkSpeed,
        role: role,
        homePos: null,  // where they return to
      };
      // Set home position based on role
      const den = getDenForCat(c.name);
      c.ai.homePos = { x: den.x, z: den.z };
    });
  }

  /** Pick next task for a cat based on its role */
  function pickNextTask (c) {
    const ai = c.ai;
    const role = ai.role;
    const roll = Math.random();

    // If intruders are active and this cat is assigned to help, keep patrolling
    if (intruderActive && intruderArea && clanPatrollers.includes(c.name)) {
      ai.task = 'intruder_patrol';
      const angle = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * 6;
      ai.target = {
        x: intruderArea.x + Math.cos(angle) * dist,
        z: intruderArea.z + Math.sin(angle) * dist
      };
      ai.timer = 8 + Math.random() * 8;
      return;
    }

    // --- LEADER (Bluestar): ALWAYS stays in camp — never leaves! ---
    if (role === 'leader') {
      if (roll < 0.40) {
        // Rest in Leader's Den
        ai.task = 'rest';
        ai.target = { x: DEN_SPOTS['Leader'].x + (Math.random()-0.5)*1.5, z: DEN_SPOTS['Leader'].z + (Math.random()-0.5)*1.5 };
        ai.timer = 15 + Math.random() * 20;
      } else if (roll < 0.70) {
        // Walk around camp (talk to cats) — ONLY within camp clearing
        ai.task = 'patrol';
        const angle = Math.random() * Math.PI * 2;
        const dist = 2 + Math.random() * 6; // max 8 units from center — stays inside camp
        ai.target = { x: Math.sin(angle) * dist, z: Math.cos(angle) * dist };
        ai.timer = 10 + Math.random() * 10;
      } else if (roll < 0.85) {
        // Stand on Highrock
        ai.task = 'patrol';
        ai.target = { x: -3, z: -3.5 };
        ai.timer = 8 + Math.random() * 8;
      } else {
        // Eat at fresh-kill pile (in camp — no drinking at the stream)
        ai.task = 'eat';
        ai.target = { x: FRESH_KILL.x + (Math.random()-0.5)*2, z: FRESH_KILL.z + (Math.random()-0.5)*1 };
        ai.timer = 8;
      }
      return;
    }

    // --- MEDICINE CAT (Spottedleaf): ALWAYS stays in camp — mostly in medicine den ---
    if (role === 'medicine') {
      if (roll < 0.55) {
        // Stay in Medicine Den (her main spot)
        ai.task = 'rest';
        ai.target = { x: DEN_SPOTS['Medicine'].x + (Math.random()-0.5)*2, z: DEN_SPOTS['Medicine'].z + (Math.random()-0.5)*2 };
        ai.timer = 20 + Math.random() * 25;
      } else if (roll < 0.80) {
        // Walk around camp (checking on cats) — ONLY within camp clearing
        ai.task = 'patrol';
        const angle = Math.random() * Math.PI * 2;
        const dist = 2 + Math.random() * 5; // max 7 units — stays inside camp
        ai.target = { x: Math.sin(angle) * dist, z: Math.cos(angle) * dist };
        ai.timer = 8 + Math.random() * 8;
      } else {
        // Eat at fresh-kill pile (no drinking at the stream — stays in camp)
        ai.task = 'eat';
        ai.target = { x: FRESH_KILL.x + (Math.random()-0.5)*2, z: FRESH_KILL.z + (Math.random()-0.5)*1 };
        ai.timer = 8;
      }
      return;
    }

    // --- ELDER (Yellowfang): stays in camp ALWAYS, eats, rests, walks around camp ---
    if (role === 'elder') {
      if (roll < 0.40) {
        ai.task = 'rest';
        ai.target = { x: DEN_SPOTS['Elders'].x + (Math.random()-0.5)*2, z: DEN_SPOTS['Elders'].z + (Math.random()-0.5)*2 };
        ai.timer = 15 + Math.random() * 15;
      } else if (roll < 0.60) {
        ai.task = 'eat';
        ai.target = { x: FRESH_KILL.x + (Math.random()-0.5)*2, z: FRESH_KILL.z + (Math.random()-0.5)*1 };
        ai.timer = 10;
      } else if (roll < 0.85) {
        // Walk around camp slowly — ONLY within camp clearing
        ai.task = 'patrol';
        const angle = Math.random() * Math.PI * 2;
        const dist = 2 + Math.random() * 5; // max 7 units from center — stays inside camp
        ai.target = { x: Math.sin(angle) * dist, z: Math.cos(angle) * dist };
        ai.timer = 10;
      } else {
        // Idle near den
        ai.task = 'idle';
        ai.target = { x: DEN_SPOTS['Elders'].x + (Math.random()-0.5)*3, z: DEN_SPOTS['Elders'].z + (Math.random()-0.5)*3 };
        ai.timer = 8 + Math.random() * 10;
      }
      return;
    }

    // --- QUEEN: stays in/near the nursery, occasionally walks around camp ---
    if (role === 'queen') {
      const nx = DEN_SPOTS['Nursery'].x, nz = DEN_SPOTS['Nursery'].z;
      if (roll < 0.45) {
        // Rest in nursery
        ai.task = 'rest';
        ai.target = { x: nx + (Math.random()-0.5)*2, z: nz + (Math.random()-0.5)*2 };
        ai.timer = 15 + Math.random() * 20;
      } else if (roll < 0.65) {
        // Walk nearby in camp (stretch legs, check on camp)
        ai.task = 'patrol';
        const angle = Math.random() * Math.PI * 2;
        const dist = 2 + Math.random() * 4;
        ai.target = { x: nx + Math.sin(angle) * dist, z: nz + Math.cos(angle) * dist };
        ai.timer = 8 + Math.random() * 8;
      } else if (roll < 0.80) {
        // Eat from the fresh-kill pile
        ai.task = 'eat';
        ai.target = { x: 0 + (Math.random()-0.5)*2, z: 0 + (Math.random()-0.5)*2 };
        ai.timer = 10 + Math.random() * 5;
      } else if (roll < 0.90) {
        // Drink
        ai.task = 'drink';
        ai.target = { x: -15, z: -10 };
        ai.timer = 12;
      } else {
        // Idle near nursery
        ai.task = 'idle';
        ai.target = { x: nx + (Math.random()-0.5)*3, z: nz + (Math.random()-0.5)*3 };
        ai.timer = 5 + Math.random() * 8;
      }
      return;
    }

    // --- KIT: plays near the nursery, chases other kits, never leaves camp ---
    if (role === 'kit') {
      const nx = DEN_SPOTS['Nursery'].x, nz = DEN_SPOTS['Nursery'].z;
      if (roll < 0.25) {
        // Play-chase (dart around the nursery area quickly)
        ai.task = 'patrol';
        const angle = Math.random() * Math.PI * 2;
        const dist = 1.5 + Math.random() * 3;
        ai.target = { x: nx + Math.sin(angle) * dist, z: nz + Math.cos(angle) * dist };
        ai.timer = 3 + Math.random() * 4;
      } else if (roll < 0.45) {
        // Play-pounce (short quick movement, like practicing hunting)
        ai.task = 'hunt';
        ai.target = { x: nx + (Math.random()-0.5)*4, z: nz + (Math.random()-0.5)*4 };
        ai.timer = 2 + Math.random() * 3;
      } else if (roll < 0.60) {
        // Explore around camp (but not too far)
        ai.task = 'patrol';
        const angle = Math.random() * Math.PI * 2;
        const dist = 3 + Math.random() * 4;
        ai.target = { x: Math.sin(angle) * dist, z: Math.cos(angle) * dist };
        ai.timer = 4 + Math.random() * 5;
      } else if (roll < 0.75) {
        // Rest/sleep in nursery (kits nap often)
        ai.task = 'rest';
        ai.target = { x: nx + (Math.random()-0.5)*1.5, z: nz + (Math.random()-0.5)*1.5 };
        ai.timer = 8 + Math.random() * 12;
      } else if (roll < 0.85) {
        // Eat
        ai.task = 'eat';
        ai.target = { x: 0 + (Math.random()-0.5)*1, z: 0 + (Math.random()-0.5)*1 };
        ai.timer = 5 + Math.random() * 4;
      } else {
        // Idle — sitting near nursery
        ai.task = 'idle';
        ai.target = { x: nx + (Math.random()-0.5)*2, z: nz + (Math.random()-0.5)*2 };
        ai.timer = 4 + Math.random() * 6;
      }
      return;
    }

    // --- KITTYPET (Smudge, Princess): stay near Twoleg house ---
    if (role === 'kittypet') {
      if (roll < 0.50) {
        ai.task = 'rest';
        ai.target = { x: (Math.random()-0.5)*6, z: 82 + Math.random()*6 };
        ai.timer = 12 + Math.random() * 10;
      } else {
        ai.task = 'patrol';
        ai.target = { x: (Math.random()-0.5)*8, z: 78 + Math.random()*10 };
        ai.timer = 8 + Math.random() * 8;
      }
      return;
    }

    // --- WARRIOR: hunts, patrols territory borders, drinks, eats, rests ---
    if (role === 'warrior') {
      if (roll < 0.30) {
        // Hunt (walk far into territory, come back with prey)
        ai.task = 'hunt';
        const angle = Math.random() * Math.PI * 2;
        const dist = 25 + Math.random() * 35;
        ai.target = { x: Math.sin(angle) * dist, z: Math.cos(angle) * dist };
        ai.timer = 35;
        ai.carryingPrey = false;
      } else if (roll < 0.55) {
        // Patrol borders
        ai.task = 'patrol';
        const angle = Math.random() * Math.PI * 2;
        const dist = 20 + Math.random() * 30;
        ai.target = { x: Math.sin(angle) * dist, z: Math.cos(angle) * dist };
        ai.timer = 20 + Math.random() * 15;
      } else if (roll < 0.70) {
        // Rest in Warriors' Den
        ai.task = 'rest';
        const den = getDenForCat(c.name);
        ai.target = { x: den.x + (Math.random()-0.5)*2, z: den.z + (Math.random()-0.5)*2 };
        ai.timer = 12 + Math.random() * 10;
      } else if (roll < 0.85) {
        // Eat
        ai.task = 'eat';
        ai.target = { x: FRESH_KILL.x + (Math.random()-0.5)*2, z: FRESH_KILL.z + (Math.random()-0.5)*1 };
        ai.timer = 8;
      } else {
        // Drink
        ai.task = 'drink';
        ai.target = { x: WATER_SPOT.x + (Math.random()-0.5)*4, z: WATER_SPOT.z + (Math.random()-0.5)*4 };
        ai.timer = 15;
      }
      return;
    }

    // --- APPRENTICE: hunts (closer range), patrols, trains, eats, drinks ---
    if (roll < 0.30) {
      // Hunt (shorter range than warriors)
      ai.task = 'hunt';
      const angle = Math.random() * Math.PI * 2;
      const dist = 15 + Math.random() * 25;
      ai.target = { x: Math.sin(angle) * dist, z: Math.cos(angle) * dist };
      ai.timer = 25;
      ai.carryingPrey = false;
    } else if (roll < 0.50) {
      // Patrol (shorter range)
      ai.task = 'patrol';
      const angle = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * 20;
      ai.target = { x: Math.sin(angle) * dist, z: Math.cos(angle) * dist };
      ai.timer = 15 + Math.random() * 10;
    } else if (roll < 0.65) {
      // Rest in Apprentices' Den
      ai.task = 'rest';
      ai.target = { x: DEN_SPOTS['Apprentices'].x + (Math.random()-0.5)*2, z: DEN_SPOTS['Apprentices'].z + (Math.random()-0.5)*2 };
      ai.timer = 10 + Math.random() * 8;
    } else if (roll < 0.80) {
      // Eat
      ai.task = 'eat';
      ai.target = { x: FRESH_KILL.x + (Math.random()-0.5)*2, z: FRESH_KILL.z + (Math.random()-0.5)*1 };
      ai.timer = 8;
    } else {
      // Drink
      ai.task = 'drink';
      ai.target = { x: WATER_SPOT.x + (Math.random()-0.5)*4, z: WATER_SPOT.z + (Math.random()-0.5)*4 };
      ai.timer = 12;
    }
  }

  function updateNPCAI (dt) {
    if (storyPhase !== 'playing') return; // only during free roam

    npcCats.forEach(c => {
      if (!c.group.visible || !c.ai) return;
      const ai = c.ai;
      const pos = c.group.position;

      // Count down timer
      ai.timer -= dt;

      switch (ai.task) {
        case 'idle':
          c._walking = false;
          if (ai.timer <= 0) {
            pickNextTask(c);
          }
          break;

        case 'patrol':
          // Walk to patrol point then go idle
          if (ai.target) {
            walkNPCToTarget(c, dt);
            if (isNPCNearTarget(c, 2)) {
              ai.task = 'idle';
              ai.timer = 3 + Math.random() * 5;
              ai.target = null;
            }
          }
          if (ai.timer <= 0) { ai.task = 'idle'; ai.timer = 2; ai.target = null; }
          break;

        case 'hunt':
          if (!ai.carryingPrey) {
            // Walk to hunting spot
            if (ai.target) {
              walkNPCToTarget(c, dt);
              if (isNPCNearTarget(c, 2)) {
                // "Caught prey" - now carry it back
                ai.carryingPrey = true;
                // Play prey catch sound if player is nearby
                const dToPlayer = Math.sqrt((c.group.position.x - player.position.x)**2 + (c.group.position.z - player.position.z)**2);
                if (dToPlayer < 30) playPreyCatch();
                ai.target = { x: FRESH_KILL.x + (Math.random()-0.5)*2, z: FRESH_KILL.z + (Math.random()-0.5)*1 };
              }
            }
          } else {
            // Carry prey back to fresh-kill pile
            if (ai.target) {
              walkNPCToTarget(c, dt);
              if (isNPCNearTarget(c, 2)) {
                ai.carryingPrey = false;
                ai.task = 'idle';
                ai.timer = 4 + Math.random() * 6;
                ai.target = null;
              }
            }
          }
          if (ai.timer <= 0) { ai.task = 'idle'; ai.timer = 2; ai.target = null; ai.carryingPrey = false; }
          break;

        case 'drink':
          if (ai.target) {
            walkNPCToTarget(c, dt);
            if (isNPCNearTarget(c, 2)) {
              // Drinking for a moment
              c._walking = false;
              // Play drinking sound occasionally
              if (Math.random() < 0.02) {
                const dToPlayer = Math.sqrt((c.group.position.x - player.position.x)**2 + (c.group.position.z - player.position.z)**2);
                if (dToPlayer < 20) playDrinkSound();
              }
              ai.timer -= dt;
              if (ai.timer <= 16) { // drank for ~4 seconds
                ai.task = 'idle';
                ai.timer = 3 + Math.random() * 5;
                // Walk back toward camp
                ai.task = 'patrol';
                ai.target = { x: (Math.random()-0.5)*10, z: (Math.random()-0.5)*10 };
                ai.timer = 15;
              }
            }
          }
          if (ai.timer <= 0) { ai.task = 'idle'; ai.timer = 2; ai.target = null; }
          break;

        case 'rest':
          if (ai.target) {
            walkNPCToTarget(c, dt);
            if (isNPCNearTarget(c, 2)) {
              c._walking = false;
              ai.target = null;
              // Rest for a while
            }
          }
          if (ai.timer <= 0) { ai.task = 'idle'; ai.timer = 2 + Math.random() * 4; ai.target = null; }
          break;

        case 'eat':
          if (ai.target) {
            walkNPCToTarget(c, dt);
            if (isNPCNearTarget(c, 2)) {
              c._walking = false;
              ai.target = null;
              // Play eating sound once when they arrive
              const dToP = Math.sqrt((c.group.position.x - player.position.x)**2 + (c.group.position.z - player.position.z)**2);
              if (dToP < 15) playSound('eat');
            }
          }
          // Occasional purring while eating
          if (!ai.target && Math.random() < 0.01) {
            const dToP2 = Math.sqrt((c.group.position.x - player.position.x)**2 + (c.group.position.z - player.position.z)**2);
            if (dToP2 < 12) playPurr();
          }
          if (ai.timer <= 0) { ai.task = 'idle'; ai.timer = 3 + Math.random() * 5; ai.target = null; }
          break;

        case 'intruder_patrol':
          // Clan cats heading toward intruder area to help defend
          if (!intruderActive) {
            // Intruders gone — head back to normal duties
            ai.task = 'patrol';
            ai.target = { x: (Math.random()-0.5) * 10, z: (Math.random()-0.5) * 10 };
            ai.timer = 10 + Math.random() * 8;
            break;
          }
          if (ai.target) {
            walkNPCToTarget(c, dt);
            if (isNPCNearTarget(c, 3)) {
              // Arrived near intruder area — patrol around it
              c._walking = false;
              ai.target = null;
              ai.timer = 5 + Math.random() * 5;
            }
          } else {
            // Circle around the intruder area on guard
            if (ai.timer <= 0 && intruderArea) {
              const angle = Math.random() * Math.PI * 2;
              const dist = 4 + Math.random() * 6;
              ai.target = {
                x: intruderArea.x + Math.cos(angle) * dist,
                z: intruderArea.z + Math.sin(angle) * dist
              };
              ai.timer = 6 + Math.random() * 6;
            }
          }
          break;
      }
    });
  }

  function walkNPCToTarget (npc, dt) {
    if (!npc.ai.target) return;
    const pos = npc.group.position;
    const tx = npc.ai.target.x, tz = npc.ai.target.z;
    const dx = tx - pos.x, dz = tz - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 1) {
      const spd = npc.ai.walkSpeed * dt;
      pos.x += (dx / dist) * spd;
      pos.z += (dz / dist) * spd;
      npc.group.lookAt(tx, 0, tz);
      npc._walking = true;
    } else {
      npc._walking = false;
    }
  }

  function isNPCNearTarget (npc, dist) {
    if (!npc.ai.target) return true;
    const pos = npc.group.position;
    const dx = npc.ai.target.x - pos.x, dz = npc.ai.target.z - pos.z;
    return Math.sqrt(dx * dx + dz * dz) < dist;
  }

  /** Animate NPC legs when walking */
  function animateNPCLegs (dt) {
    npcCats.forEach(c => {
      if (!c.group.visible || !c.group.legs) return;
      if (c._walking) {
        if (!c._walkCycle) c._walkCycle = 0;
        c._walkCycle += dt * (c.ai ? c.ai.walkSpeed : 3) * 2;
        const sw = Math.sin(c._walkCycle * 3) * 0.3;
        c.group.legs[0].rotation.x = sw;  c.group.legs[1].rotation.x = -sw;
        c.group.legs[2].rotation.x = -sw; c.group.legs[3].rotation.x = sw;
      } else {
        if (c.group.legs) c.group.legs.forEach(l => { l.rotation.x *= 0.85; });
        c._walkCycle = 0;
      }
    });
  }

  /* ====================================================
     MAIN LOOP
     ==================================================== */
  function animate () {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    const time = clock.getElapsedTime();

    // Always animate tails, legs, fireflies, water regardless of state
    animateFireflies(time);
    animateTail(time);
    animateNPCTails(time);
    animateNPCLegs(dt);
    animateWater(time);

    if (gameState === 'playing') {
      updatePlayer(dt);
      updateCamera();
      updateHUD();
      updateNPCAI(dt);
      updateBorderPatrols(dt);
      updateIntruders(dt);
      checkIntruderSpawn(dt);
      updateTwolegs(dt);
      updateMonsters(dt);
      checkStoryTriggers();
      checkTrainingProximity();
      updateTrainingPrey(dt);
      updateFollowers(dt);
      gameTime += dt;
      // autosave every 15 seconds during gameplay
      autoSaveTimer += dt;
      if (autoSaveTimer >= 15) {
        autoSaveTimer = 0;
        saveGame();
      }
      // Ambient sounds — play much more often!
      if (Math.random() < 0.015) playSound('ambient');
      // Location-based sounds
      if (player.position) {
        const territory = GameLogic.getTerritory(player.position);
        // Near water — play river/splash sounds
        const dRiver = Math.abs(player.position.x - 75);
        if (dRiver < 15 && Math.random() < 0.008) playRiverSound();
        if (dRiver < 8 && Math.random() < 0.003) playWaterSplash();
        // Near Thunderpath — car whooshes
        if (territory === 'Thunderpath' && Math.random() < 0.01) playSound('danger');
        // WindClan — more wind
        if (territory === 'WindClan' && Math.random() < 0.01) playWindRustle();
        // Near stream
        const dStream = Math.sqrt((player.position.x - WATER_SPOT.x) ** 2 + (player.position.z - WATER_SPOT.z) ** 2);
        if (dStream < 10 && Math.random() < 0.006) playRiverSound();
        // In camp — purring cats, rustling
        const dCamp = Math.sqrt(player.position.x ** 2 + player.position.z ** 2);
        if (dCamp < 15 && Math.random() < 0.004) playPurr();
        // In house — bell jingle
        if (player.position.z > 81 && Math.abs(player.position.x) < 6 && Math.random() < 0.005) playBellJingle();
      }
    }

    if (gameState === 'cutscene') {
      updateCutsceneCamera(dt);
    }

    if (gameState === 'title' || gameState === 'saves') {
      // Pan between the house and the forest for a nice title view
      camera.position.x = Math.sin(time * 0.06) * 20;
      camera.position.z = 50 + Math.cos(time * 0.06) * 30;
      camera.position.y = 10;
      camera.lookAt(0, 2, 60);
    }

    renderer.render(scene, camera);
  }

  /** Check if position is in water (river or stream). */
  function isInWater (pos) {
    const px = pos.x, pz = pos.z;
    // River: centered at x=75, width 8 (x from 71 to 79), full z range
    if (px > 71 && px < 79 && pz > -100 && pz < 100) return 'river';
    // Stream near camp: circular area around WATER_SPOT
    const sdx = px - WATER_SPOT.x, sdz = pz - WATER_SPOT.z;
    if (Math.sqrt(sdx * sdx + sdz * sdz) < 5) return 'stream';
    return false;
  }

  /** Check if position collides with a rock (circle check).
   *  Only blocks if the player is at ground level (not jumping over the rock). */
  function checkRockCollision (pos) {
    if (playerY > 0.5) return false; // jumping over it
    const px = pos.x, pz = pos.z;
    const pr = 0.4;
    for (const ro of rockObjects) {
      const rx = ro.mesh.position.x, rz = ro.mesh.position.z;
      const rs = (ro.data.scale || 1) * 0.8; // collision radius based on scale
      const ddx = px - rx, ddz = pz - rz;
      if (ddx * ddx + ddz * ddz < (pr + rs) * (pr + rs)) {
        return true;
      }
    }
    // Highrock collision
    if (highrock) {
      const hx = highrock.position.x, hz = highrock.position.z;
      const ddx = px - hx, ddz = pz - hz;
      if (ddx * ddx + ddz * ddz < (pr + 1.8) * (pr + 1.8) && playerY < 2.0) {
        return true;
      }
    }
    return false;
  }

  /** Check if position collides with walls (AABB box check).
   *  Garden fence walls only block in 'house' phase.
   *  House walls ALWAYS block (you enter through the cat flap gap). */
  function checkWallCollision (pos) {
    const px = pos.x, pz = pos.z;
    const r = 0.4; // player radius

    function hitsWall (walls) {
      for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        if (!w) continue;
        const wx = w.position.x, wz = w.position.z;
        const g = w.geometry.parameters;
        const hx = g.width / 2, hz = g.depth / 2;
        if (px + r > wx - hx && px - r < wx + hx &&
            pz + r > wz - hz && pz - r < wz + hz) {
          return true;
        }
      }
      return false;
    }

    // House walls always block (only the cat flap gap is open)
    if (hitsWall(houseWalls)) return true;

    // Garden fence walls only block while still in the 'house' phase
    if (storyPhase === 'house' && hitsWall(gardenWalls)) return true;

    return false;
  }

  /* ====================================================
     PLAYER UPDATE
     ==================================================== */
  let outOfBoundsWarningTimer = 0; // cooldown so we don't spam the warning

  function updatePlayer (dt) {
    if (!player) return;

    // FREEZE player movement while a message box or den interior is showing
    if (messageBox.classList.contains('visible') || denOpen) {
      animateCatLegs(dt, false, 0);
      return;
    }

    let dx = 0, dz = 0;
    if (isMobile) { dx = joystickInput.x; dz = joystickInput.z; }
    else {
      if (keys['w'] || keys['arrowup'])    dz = -1;
      if (keys['s'] || keys['arrowdown'])  dz = 1;
      if (keys['a'] || keys['arrowleft'])  dx = -1;
      if (keys['d'] || keys['arrowright']) dx = 1;
      player.isSprinting = keys['shift'] || keys['ShiftLeft'];
    }

    const moving = Math.abs(dx) > 0.1 || Math.abs(dz) > 0.1;

    // Moving cancels sit/sleep emote
    if (moving && (currentEmote === 'sit' || currentEmote === 'sleep')) {
      cancelEmote();
    }

    // If still sitting/sleeping (no input), freeze movement
    if ((currentEmote === 'sit' || currentEmote === 'sleep') && !moving) {
      animateCatLegs(dt, false, 0);
      if (emoteBubbleTimer > 0) { emoteBubbleTimer -= dt; if (emoteBubbleTimer <= 0) $('emote-bubble').classList.add('hidden'); }
      catGroup.position.set(player.position.x, playerY, player.position.z);
      return;
    }

    // First-person: cat always faces where camera looks (cameraAngleY)
    catGroup.rotation.y = cameraAngleY + Math.PI;

    // Check if player is in water
    const waterZone = isInWater(player.position);
    const wasSwimming = isSwimming;
    isSwimming = !!waterZone;

    // Entering/exiting water feedback
    if (isSwimming && !wasSwimming) {
      playWaterSplash();
      $('swim-indicator').classList.remove('hidden');
      // Only show the message on the first time entering each water body
      if (waterZone === 'river' && !player._swamRiver) {
        player._swamRiver = true;
        queueMessage('Narrator', '"You wade into the river! The current pulls at your paws. Swimming is slower than running — be careful!"');
      } else if (waterZone === 'stream' && !player._swamStream) {
        player._swamStream = true;
        queueMessage('Narrator', '"You step into the cool stream water. You can swim around!"');
      }
    }
    if (!isSwimming && wasSwimming) {
      playLeafCrunch();
      $('swim-indicator').classList.add('hidden');
    }

    if (moving) {
      const angle = Math.atan2(dx, dz) + cameraAngleY;
      const dir = GameLogic.normalizeDirection({ x: Math.sin(angle), z: Math.cos(angle) });
      let spd = player.speed;
      if (player.isSprinting && player.energy > 0) {
        spd = player.sprintSpeed;
        player = GameLogic.useEnergy(player, dt * 15);
      }
      // Swimming slows you down
      if (isSwimming) {
        spd *= SWIM_SPEED_MULT;
        // Use energy while swimming
        player = GameLogic.useEnergy(player, dt * 8);
      }
      const np = GameLogic.calculateMovement(player.position, dir, spd, dt);
      const cp = GameLogic.clampPosition(np, GameLogic.getForestBounds());
      if ((playerY > 1.5 || !GameLogic.checkCollisions(cp, trees, 1.2)) && !checkWallCollision(cp) && !checkRockCollision(cp)) {
        player.position = cp;
      }
      // Swimming leg animation is slower
      animateCatLegs(dt, true, isSwimming ? 0.4 : spd / player.speed);
    } else {
      animateCatLegs(dt, false, 1);
    }

    // Swimming splash sounds
    if (isSwimming && moving) {
      swimSplashTimer -= dt;
      if (swimSplashTimer <= 0) {
        swimSplashTimer = 0.6 + Math.random() * 0.4;
        playSwimSplash();
      }
    }

    // Out of bounds warning
    if (outOfBoundsWarningTimer > 0) outOfBoundsWarningTimer -= dt;
    if (GameLogic.isOutOfBounds(player.position) && outOfBoundsWarningTimer <= 0) {
      outOfBoundsWarningTimer = 8; // only warn every 8 seconds
      queueMessage('Narrator', '"You\'ve reached the edge of the known territories. There\'s nothing but empty land beyond here. Be careful — if you wander too far, you might never find your way back! Turn around and head home."');
    }

    if (!player.isSprinting) player = GameLogic.recoverEnergy(player, dt * 5);

    // --- JUMPING PHYSICS ---
    if (isJumping || !isOnGround) {
      playerVY += GRAVITY * dt;
      playerY += playerVY * dt;

      // Check landing on objects (rocks, dens, highrock, etc.)
      let landHeight = 0; // default ground
      // Check rocks
      for (const ro of rockObjects) {
        const rx = ro.mesh.position.x, rz = ro.mesh.position.z;
        const rs = ro.data.scale;
        const ddx = player.position.x - rx, ddz = player.position.z - rz;
        const dist = Math.sqrt(ddx * ddx + ddz * ddz);
        if (dist < rs * 1.2) {
          const topY = rs * 0.8; // approximate top of rock
          if (playerY <= topY && playerY >= topY - 0.5) {
            landHeight = Math.max(landHeight, topY);
          }
        }
      }
      // Check highrock
      if (highrock) {
        const hx = highrock.position.x, hz = highrock.position.z;
        const ddx = player.position.x - hx, ddz = player.position.z - hz;
        const dist = Math.sqrt(ddx * ddx + ddz * ddz);
        if (dist < 2.5) {
          landHeight = Math.max(landHeight, 2.5);
        }
      }
      // Check tree branches
      for (const bp of branchPlatforms) {
        const ddx = player.position.x - bp.x, ddz = player.position.z - bp.z;
        const dist = Math.sqrt(ddx * ddx + ddz * ddz);
        if (dist < bp.radius && playerY >= bp.y - 0.4 && playerY <= bp.y + 0.8 && playerVY <= 0) {
          landHeight = Math.max(landHeight, bp.y);
        }
      }

      if (playerY <= landHeight) {
        playerY = landHeight;
        playerVY = 0;
        isJumping = false;
        isOnGround = true;
        // Landing sound
        playLeafCrunch();
      }
    }

    // If player walks off a raised surface, start falling
    if (isOnGround && playerY > 0) {
      let shouldFall = true;
      // Check if still on a rock
      for (const ro of rockObjects) {
        const rx = ro.mesh.position.x, rz = ro.mesh.position.z;
        const rs = ro.data.scale;
        const ddx = player.position.x - rx, ddz = player.position.z - rz;
        const dist = Math.sqrt(ddx * ddx + ddz * ddz);
        if (dist < rs * 1.2 && Math.abs(playerY - rs * 0.8) < 0.3) {
          shouldFall = false;
          break;
        }
      }
      // Check highrock
      if (highrock) {
        const hx = highrock.position.x, hz = highrock.position.z;
        const ddx = player.position.x - hx, ddz = player.position.z - hz;
        if (Math.sqrt(ddx * ddx + ddz * ddz) < 2.5 && Math.abs(playerY - 2.5) < 0.5) {
          shouldFall = false;
        }
      }
      // Check tree branches
      for (const bp of branchPlatforms) {
        const ddx = player.position.x - bp.x, ddz = player.position.z - bp.z;
        const dist = Math.sqrt(ddx * ddx + ddz * ddz);
        if (dist < bp.radius && Math.abs(playerY - bp.y) < 0.4) {
          shouldFall = false;
          break;
        }
      }
      if (shouldFall) {
        isOnGround = false;
      }
    }

    // --- SWIMMING Y OFFSET ---
    if (isSwimming && !isJumping) {
      swimBobTime += dt * SWIM_BOB_FREQ;
      // Sink down into the water + gentle bob
      const targetY = SWIM_Y + Math.sin(swimBobTime) * SWIM_BOB_AMP;
      playerY += (targetY - playerY) * Math.min(1, dt * 6);
      // Can't jump while swimming (reset)
      isOnGround = true;
    } else if (!isJumping && isOnGround && playerY < 0) {
      // Rising back out of water to ground level
      playerY += dt * 2;
      if (playerY > 0) playerY = 0;
    }

    // --- EMOTE EFFECTS ---
    if (currentEmote === 'sit' || currentEmote === 'sleep') {
      // Can't move while sitting/sleeping — freeze movement but keep camera
      // Just skip the position update (already handled above)
    }
    if (emoteBubbleTimer > 0) {
      emoteBubbleTimer -= dt;
      if (emoteBubbleTimer <= 0) {
        $('emote-bubble').classList.add('hidden');
      }
    }

    catGroup.position.set(player.position.x, playerY, player.position.z);
  }

  /* ====================================================
     JUMPING
     ==================================================== */
  function playerJump () {
    if (!isOnGround || isJumping) return;
    // Cancel sit/sleep emote on jump
    if (currentEmote === 'sit' || currentEmote === 'sleep') {
      cancelEmote();
    }
    isJumping = true;
    isOnGround = false;
    playerVY = JUMP_FORCE;
    // Jump sound
    try {
      if (audioCtx) {
        const t = audioCtx.currentTime;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(_out());
        o.type = 'sine';
        o.frequency.setValueAtTime(250, t);
        o.frequency.linearRampToValueAtTime(400, t + 0.12);
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        o.start(t); o.stop(t + 0.18);
      }
    } catch (e) {}
  }

  /* ====================================================
     EMOTES
     ==================================================== */
  function triggerEmote (emote) {
    // If same emote, toggle off
    if (currentEmote === emote) {
      cancelEmote();
      return;
    }

    currentEmote = emote;
    emoteTimer = 0;

    // Show bubble
    const bubble = $('emote-bubble');
    bubble.textContent = EMOTE_ICONS[emote] || '';
    bubble.classList.remove('hidden');
    emoteBubbleTimer = 3; // show for 3 seconds

    // Highlight the active button
    document.querySelectorAll('.emote-btn').forEach(btn => {
      btn.classList.toggle('active-emote', btn.dataset.emote === emote);
    });

    // Play appropriate sound
    switch (emote) {
      case 'happy': playPurr(); break;
      case 'sad':
        try {
          if (audioCtx) {
            const t = audioCtx.currentTime;
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.connect(g); g.connect(_out());
            o.type = 'sine';
            o.frequency.setValueAtTime(400, t);
            o.frequency.linearRampToValueAtTime(250, t + 0.5);
            g.gain.setValueAtTime(0.12, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
            o.start(t); o.stop(t + 0.65);
          }
        } catch (e) {}
        break;
      case 'angry': playHiss(); break;
      case 'nervous': playHeartbeat(); break;
      case 'sit': playLeafCrunch(); break;
      case 'sleep': playPurr(); break;
    }

    // For non-persistent emotes, auto-cancel after a few seconds
    if (emote !== 'sit' && emote !== 'sleep') {
      setTimeout(() => {
        if (currentEmote === emote) cancelEmote();
      }, 5000);
    }
  }

  function cancelEmote () {
    currentEmote = null;
    $('emote-bubble').classList.add('hidden');
    emoteBubbleTimer = 0;
    document.querySelectorAll('.emote-btn').forEach(btn => btn.classList.remove('active-emote'));
  }

  function lerpAngle (a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  /** Show full cat model (for cutscenes) or hide body for first-person */
  function setCatFirstPerson (firstPerson) {
    if (!catGroup) return;
    // Determine if collar should be visible (only when kittypet)
    const showCollar = storyPhase === 'house';

    catGroup.children.forEach(child => {
      const isCollar = catGroup.collarParts && catGroup.collarParts.includes(child);

      if (firstPerson) {
        const isLeg = catGroup.legs && catGroup.legs.includes(child);
        const isTail = catGroup.tailSegs && catGroup.tailSegs.includes(child);
        if (isCollar) {
          child.visible = false; // collar not visible in first person (it's on your neck)
        } else {
          child.visible = isLeg || isTail; // only paws + tail visible
        }
      } else {
        // Show everything — but collar only when kittypet
        if (isCollar) {
          child.visible = showCollar;
        } else {
          child.visible = true;
        }
      }
    });
  }

  function updateCamera () {
    // FIRST-PERSON: camera at cat's eye level, looking forward
    const eyeHeight = 0.9; // cat's eye height
    const px = player.position.x;
    const pz = player.position.z;

    // Camera sits at the cat's eye position, slightly forward
    const headForwardX = -Math.sin(cameraAngleY) * 0.35;
    const headForwardZ = -Math.cos(cameraAngleY) * 0.35;
    const camX = px + headForwardX;
    const camZ = pz + headForwardZ;
    const camY = eyeHeight + playerY + (isSwimming ? Math.sin(swimBobTime) * SWIM_BOB_AMP : 0); // add jump height + swim bob

    // Look direction: forward based on cameraAngleY, pitch from cameraAngleX
    const lookDist = 10;
    const pitch = -cameraAngleX; // negative cameraAngleX = look up
    const lookX = camX - Math.sin(cameraAngleY) * Math.cos(pitch) * lookDist;
    const lookZ = camZ - Math.cos(cameraAngleY) * Math.cos(pitch) * lookDist;
    const lookY = camY + Math.sin(pitch) * lookDist;

    camera.position.set(camX, camY, camZ);
    camera.lookAt(lookX, lookY, lookZ);

    // First-person: hide body, show paws and tail only
    setCatFirstPerson(true);
  }

  /* ====================================================
     TERRITORY MAP
     ==================================================== */
  let mapOpen = false;
  let mapAnimFrame = null;

  function openMap () {
    mapOpen = true;
    $('map-overlay').classList.remove('hidden');
    renderMap();
  }

  function closeMap () {
    mapOpen = false;
    $('map-overlay').classList.add('hidden');
    if (mapAnimFrame) { cancelAnimationFrame(mapAnimFrame); mapAnimFrame = null; }
  }

  function renderMap () {
    if (!mapOpen) return;
    const canvas = $('map-canvas');
    const ctx = canvas.getContext('2d');

    // High-DPI support
    const dpr = Math.min(window.devicePixelRatio, 2);
    const dispW = canvas.clientWidth;
    const dispH = canvas.clientHeight;
    canvas.width = dispW * dpr;
    canvas.height = dispH * dpr;
    ctx.scale(dpr, dpr);

    const W = dispW, H = dispH;
    ctx.clearRect(0, 0, W, H);

    // World bounds for mapping
    const worldMinX = -110, worldMaxX = 110;
    const worldMinZ = -120, worldMaxZ = 100;
    const worldW = worldMaxX - worldMinX;
    const worldH = worldMaxZ - worldMinZ;

    // Convert world coords to canvas coords
    function toMap (wx, wz) {
      return {
        x: ((wx - worldMinX) / worldW) * W,
        y: ((wz - worldMinZ) / worldH) * H
      };
    }

    // --- TERRITORY BACKGROUNDS ---
    // ThunderClan (main forest — dark green)
    ctx.fillStyle = '#2a5a28';
    ctx.fillRect(0, 0, W, H);

    // ShadowClan territory (dark, past x=-62)
    const scLeft = toMap(-110, 0).x;
    const scRight = toMap(-62, 0).x;
    ctx.fillStyle = '#1a3a1a';
    ctx.fillRect(scLeft, 0, scRight - scLeft, H);

    // Thunderpath (road, x=-62 to -55)
    const tpLeft = toMap(-62, 0).x;
    const tpRight = toMap(-55, 0).x;
    ctx.fillStyle = '#444444';
    ctx.fillRect(tpLeft, 0, tpRight - tpLeft, H);
    // Center yellow line
    ctx.strokeStyle = '#cccc00';
    ctx.lineWidth = 2;
    const tpCenter = (tpLeft + tpRight) / 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(tpCenter, 0); ctx.lineTo(tpCenter, H); ctx.stroke();
    ctx.setLineDash([]);

    // RiverClan territory (past x=79)
    const rcLeft = toMap(79, 0).x;
    ctx.fillStyle = '#1a4a3a';
    ctx.fillRect(rcLeft, 0, W - rcLeft, H);

    // WindClan territory (past z=-60, which is bottom of map since z goes down)
    const wcTop = toMap(0, -60).y;
    ctx.fillStyle = '#4a5a2a';
    ctx.fillRect(0, 0, W, wcTop);

    // Fourtrees (neutral, circle)
    const ft = toMap(-45, -45);
    ctx.fillStyle = '#3a6a2a';
    ctx.beginPath(); ctx.arc(ft.x, ft.y, 12, 0, Math.PI * 2); ctx.fill();

    // Highstones area
    const hs = toMap(-80, -95);
    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath(); ctx.arc(hs.x, hs.y, 10, 0, Math.PI * 2); ctx.fill();

    // River (blue line at x=75)
    const rivL = toMap(71, -100);
    const rivR = toMap(79, 100);
    ctx.fillStyle = 'rgba(68, 170, 220, 0.6)';
    ctx.fillRect(rivL.x, rivL.y, rivR.x - rivL.x, rivR.y - rivL.y);

    // Camp clearing (circle at 0,0)
    const camp = toMap(0, 0);
    ctx.fillStyle = '#6a5a40';
    ctx.beginPath(); ctx.arc(camp.x, camp.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,100,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Garden / Twoleg house area
    const house = toMap(0, 85);
    ctx.fillStyle = '#5a4a3a';
    ctx.fillRect(house.x - 10, house.y - 6, 20, 12);
    ctx.strokeStyle = '#8a7a5a';
    ctx.lineWidth = 1;
    ctx.strokeRect(house.x - 10, house.y - 6, 20, 12);

    // --- TERRITORY LABELS ---
    ctx.font = 'bold ' + Math.max(10, W * 0.018) + 'px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    function drawLabel (text, wx, wz, color) {
      const p = toMap(wx, wz);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(text, p.x + 1, p.y + 1);
      ctx.fillStyle = color || '#ccbb88';
      ctx.fillText(text, p.x, p.y);
    }

    drawLabel('ThunderClan', 0, -20, '#88cc66');
    drawLabel('ShadowClan', -86, 0, '#aaaaaa');
    drawLabel('RiverClan', 94, 0, '#66bbdd');
    drawLabel('WindClan', 0, -85, '#bbaa66');
    drawLabel('Fourtrees', -45, -50, '#66aa44');
    drawLabel('Highstones', -80, -105, '#999999');
    drawLabel('Camp', 0, 8, '#ffcc66');
    drawLabel('Twoleg House', 0, 95, '#aa8866');

    ctx.font = Math.max(8, W * 0.013) + 'px Georgia, serif';
    drawLabel('Thunderpath', -58.5, -20, '#888888');
    drawLabel('River', 75, -20, '#66aacc');
    drawLabel('Sunningrocks', 64, 0, '#bbaa88');

    // --- SCENT MARKERS (yellow squares) ---
    ctx.fillStyle = 'rgba(255, 200, 0, 0.7)';
    scentMarkerZones.forEach(sm => {
      const p = toMap(sm.x, sm.z);
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    });

    // --- WATER SPOTS ---
    ctx.fillStyle = '#44aadd';
    // Stream near camp
    const ws = toMap(WATER_SPOT.x, WATER_SPOT.z);
    ctx.beginPath(); ctx.arc(ws.x, ws.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.font = Math.max(7, W * 0.011) + 'px sans-serif';
    ctx.fillStyle = '#88ccee';
    ctx.fillText('Stream', ws.x, ws.y + 10);

    // --- HUNTING ZONES (areas where warriors go to hunt) ---
    ctx.strokeStyle = 'rgba(180, 130, 70, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const huntZones = [
      { x: 25, z: 25, r: 15, label: 'Hunting Ground' },
      { x: -25, z: 20, r: 12, label: 'Hunting Ground' },
      { x: 15, z: -30, r: 12, label: 'Hunting Ground' },
      { x: -20, z: -25, r: 10, label: 'Hunting Ground' },
    ];
    huntZones.forEach(hz => {
      const p = toMap(hz.x, hz.z);
      const r = (hz.r / worldW) * W;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      // Prey icons inside
      ctx.font = Math.max(7, W * 0.01) + 'px sans-serif';
      ctx.fillStyle = 'rgba(180, 130, 70, 0.7)';
      ctx.fillText('🐿', p.x - 6, p.y);
      ctx.fillText('🐁', p.x + 6, p.y);
    });
    ctx.setLineDash([]);

    // --- DENS (labeled squares in camp) ---
    ctx.font = Math.max(7, W * 0.01) + 'px sans-serif';
    const dens = [
      { name: 'Leader', ...DEN_SPOTS['Leader'] },
      { name: 'Medicine', ...DEN_SPOTS['Medicine'] },
      { name: 'Warriors', ...DEN_SPOTS['Warriors'] },
      { name: 'Apprentices', ...DEN_SPOTS['Apprentices'] },
      { name: 'Nursery', x: -8, z: 5 },
      { name: 'Elders', ...DEN_SPOTS['Elders'] },
      { name: 'Prisoner', ...DEN_SPOTS['Prisoner'] },
    ];
    dens.forEach(d => {
      const p = toMap(d.x, d.z);
      ctx.fillStyle = 'rgba(120, 100, 70, 0.6)';
      ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
      ctx.fillStyle = '#ddcc99';
      ctx.fillText(d.name, p.x, p.y + 11);
    });

    // --- FRESH-KILL PILE ---
    const fk = toMap(FRESH_KILL.x, FRESH_KILL.z);
    ctx.fillStyle = '#8a6a4a';
    ctx.fillRect(fk.x - 4, fk.y - 3, 8, 6);
    ctx.fillStyle = '#ccaa77';
    ctx.font = Math.max(7, W * 0.01) + 'px sans-serif';
    ctx.fillText('Prey Pile', fk.x, fk.y + 11);

    // --- BORDER PATROL CATS (enemy - red dots) ---
    if (borderPatrols) {
      borderPatrols.forEach(bp => {
        bp.cats.forEach(catObj => {
          if (!catObj.group.visible) return;
          const p = toMap(catObj.group.position.x, catObj.group.position.z);
          ctx.fillStyle = '#ff4444';
          ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#880000';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      });
    }

    // --- CLAN CATS (blue dots) ---
    const thunderClanNames = ['Bluestar','Lionheart','Graypaw','Whitestorm','Dustpaw','Sandpaw',
      'Mousefur','Darkstripe','Ravenpaw','Spottedleaf','Tigerclaw','Yellowfang','Longtail'];
    npcCats.forEach(npc => {
      if (!npc.group.visible) return;
      const p = toMap(npc.group.position.x, npc.group.position.z);
      const isClan = thunderClanNames.includes(npc.name);
      const isKittypet = (npc.name === 'Smudge' || npc.name === 'Princess');

      if (isKittypet) {
        ctx.fillStyle = '#cc88cc'; // purple for kittypets
      } else if (isClan) {
        ctx.fillStyle = '#66bbff'; // blue for clan
      } else {
        ctx.fillStyle = '#ff4444'; // red for enemy
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Show name if known
      if (knownCats.has(npc.name)) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = Math.max(7, W * 0.01) + 'px sans-serif';
        ctx.fillText(npc.name, p.x, p.y - 7);
      }
    });

    // --- PLAYER (big orange dot with pulsing ring) ---
    const pp = toMap(player.position.x, player.position.z);
    // Pulsing ring
    const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.3;
    ctx.strokeStyle = 'rgba(255, 140, 0, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pp.x, pp.y, 8 * pulse, 0, Math.PI * 2); ctx.stroke();
    // Direction arrow
    const dirAngle = cameraAngleY + Math.PI;
    ctx.strokeStyle = '#ffcc44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pp.x, pp.y);
    ctx.lineTo(pp.x + Math.sin(dirAngle) * 12, pp.y + Math.cos(dirAngle) * 12);
    ctx.stroke();
    // Dot
    ctx.fillStyle = '#ff8c00';
    ctx.beginPath(); ctx.arc(pp.x, pp.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // "You" label
    ctx.fillStyle = '#ffcc66';
    ctx.font = 'bold ' + Math.max(9, W * 0.014) + 'px sans-serif';
    ctx.fillText(player.name || 'You', pp.x, pp.y - 12);

    // Refresh the map every frame while open for real-time updates
    mapAnimFrame = requestAnimationFrame(renderMap);
  }

  function updateHUD () {
    healthBar.style.width = (player.health / player.maxHealth * 100) + '%';
    energyBar.style.width = (player.energy / player.maxEnergy * 100) + '%';
    locationText.textContent = GameLogic.getLocationName(player.position);
    updateInteractHint();
  }

  function updateInteractHint () {
    if (!player || gameState !== 'playing' || messageBox.classList.contains('visible') || denOpen) {
      interactHint.classList.add('hidden');
      return;
    }

    // Check if near a den entrance FIRST (takes priority)
    const nearDen = getNearestDen();
    if (nearDen) {
      const info = DEN_INFO[nearDen];
      const cats = getCatsInDen(nearDen);
      const countText = cats.length > 0 ? ' (' + cats.length + ' cat' + (cats.length > 1 ? 's' : '') + ' inside)' : ' (empty)';
      interactHintText.textContent = isMobile
        ? 'Tap ACT to enter ' + info.label + countText
        : 'Press E to enter ' + info.label + countText;
      interactHint.classList.remove('hidden');
      return;
    }

    // Find nearest visible cat
    let nearest = null, nearestDist = TALK_RANGE;
    for (const npc of npcCats) {
      if (!npc.group.visible) continue;
      const dx = npc.group.position.x - player.position.x;
      const dz = npc.group.position.z - player.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = npc;
      }
    }
    if (nearest) {
      const displayName = knownCats.has(nearest.name) ? nearest.name : '???';
      interactHintText.textContent = isMobile
        ? 'Tap ACT to talk to ' + displayName
        : 'Press E to talk to ' + displayName;
      interactHint.classList.remove('hidden');
    } else {
      // Check for Twolegs nearby
      let nearTwoleg = null;
      if (twolegs && twolegs.length) {
        for (const tl of twolegs) {
          const dx = tl.group.position.x - player.position.x;
          const dz = tl.group.position.z - player.position.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < 3) { nearTwoleg = tl; break; }
        }
      }
      if (nearTwoleg) {
        interactHintText.textContent = isMobile
          ? 'Tap ACT to ask Twoleg for food'
          : 'Press E to ask Twoleg for food';
        interactHint.classList.remove('hidden');
      } else if (trainingPrey && trainingPrey.alive) {
        // Check distance to training prey
        const pdx = trainingPrey.position.x - player.position.x;
        const pdz = trainingPrey.position.z - player.position.z;
        const pDist = Math.sqrt(pdx * pdx + pdz * pdz);
        if (pDist < 3) {
          interactHintText.textContent = isMobile
            ? 'Tap ACT to catch the mouse!'
            : 'Press E to catch the mouse!';
          interactHint.classList.remove('hidden');
        } else {
          interactHint.classList.add('hidden');
        }
      } else {
        interactHint.classList.add('hidden');
      }
    }
  }

  /* ====================================================
     BOOTSTRAP
     ==================================================== */
  let loadProg = 0;
  const loadInt = setInterval(() => {
    loadProg += Math.random() * 25 + 10;
    if (loadProg >= 100) {
      loadProg = 100;
      clearInterval(loadInt);
      loadingBarFill.style.width = '100%';
      setTimeout(init, 200);
    } else {
      loadingBarFill.style.width = loadProg + '%';
    }
  }, 80);

})();
