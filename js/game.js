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
  let trees = [], rocks = [];
  let treeObjects = [], rockObjects = [];

  /* ---------- known cats ---------- */
  const knownCats = new Set(); // names of cats the player has been introduced to

  /* ---------- input ---------- */
  const keys = {};
  let isPointerLocked = false;
  let cameraAngleY = 0, cameraAngleX = 0.3;
  let joystickInput = { x: 0, z: 0 };
  let isMobile = false;

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

  function initAudio () {
    if (audioCtx) return;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* silent */ }
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
    'RiverClan Warrior':  { base: 250, end: 190, dur: 0.40, type: 'triangle', vol: 0.10, vibrato: 3 }, // smooth, strong
    'WindClan Warrior':   { base: 350, end: 280, dur: 0.30, type: 'sine',     vol: 0.11, vibrato: 5 }, // quick, sharp
    '???':         { base: 350, end: 280, dur: 0.30, type: 'triangle', vol: 0.10, vibrato: 3 },   // unknown cat
  };

  /** Play a cat "speaking" sound — unique voice per character */
  function playCatVoice (speakerName) {
    if (!audioCtx) return;
    const voice = catVoices[speakerName];
    if (!voice || voice.base === 0) return; // narrator = no sound
    try {
      const t = audioCtx.currentTime;

      if (speakerName === 'ThunderClan') {
        // Crowd cheer: several overlapping meows
        for (let i = 0; i < 5; i++) {
          const delay = i * 0.08;
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.connect(g); g.connect(audioCtx.destination);
          o.type = 'sine';
          const pitch = 280 + Math.random() * 300;
          o.frequency.setValueAtTime(pitch, t + delay);
          o.frequency.linearRampToValueAtTime(pitch * 0.7, t + delay + 0.35);
          g.gain.setValueAtTime(0.06, t + delay);
          g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.4);
          o.start(t + delay); o.stop(t + delay + 0.45);
        }
        return;
      }

      // Main voice tone
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.type = voice.type;
      osc.frequency.setValueAtTime(voice.base, t);
      osc.frequency.linearRampToValueAtTime(voice.end, t + voice.dur * 0.7);
      osc.frequency.linearRampToValueAtTime(voice.base * 0.9, t + voice.dur);
      gain.gain.setValueAtTime(voice.vol, t);
      gain.gain.setValueAtTime(voice.vol, t + voice.dur * 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, t + voice.dur);
      osc.start(t); osc.stop(t + voice.dur + 0.05);

      // Vibrato / warble (gives each voice character)
      if (voice.vibrato > 0) {
        const lfo = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        lfo.frequency.value = voice.vibrato;
        lfoGain.gain.value = voice.base * 0.04;
        lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
        lfo.start(t); lfo.stop(t + voice.dur + 0.05);
      }

      // Second harmonic for richness
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.connect(gain2); gain2.connect(audioCtx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(voice.base * 1.5, t);
      osc2.frequency.linearRampToValueAtTime(voice.end * 1.5, t + voice.dur);
      gain2.gain.setValueAtTime(voice.vol * 0.25, t);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + voice.dur);
      osc2.start(t); osc2.stop(t + voice.dur + 0.05);
    } catch (e) { /* silent */ }
  }

  /** Bird tweet — short high chirpy sound */
  function playBirdTweet () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      // 2-3 quick chirps
      const chirps = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < chirps; i++) {
        const delay = i * (0.1 + Math.random() * 0.08);
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = 'sine';
        const pitch = 1800 + Math.random() * 1200;
        o.frequency.setValueAtTime(pitch, t + delay);
        o.frequency.linearRampToValueAtTime(pitch * (0.8 + Math.random() * 0.4), t + delay + 0.06);
        o.frequency.linearRampToValueAtTime(pitch * 1.1, t + delay + 0.10);
        g.gain.setValueAtTime(0.04 + Math.random() * 0.02, t + delay);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.12);
        o.start(t + delay); o.stop(t + delay + 0.15);
      }
    } catch (e) { /* silent */ }
  }

  /** Wind rustling through trees — soft filtered noise */
  function playWindRustle () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const bufferSize = audioCtx.sampleRate * 2;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 400 + Math.random() * 200;
      const g = audioCtx.createGain();
      noise.connect(filter); filter.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.025, t + 0.5);
      g.gain.linearRampToValueAtTime(0.015, t + 1.5);
      g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
      noise.start(t); noise.stop(t + 2.5);
    } catch (e) { /* silent */ }
  }

  /** Cricket chirps — nighttime ambient */
  function playCricket () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      for (let i = 0; i < 4; i++) {
        const delay = i * 0.07;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = 'square';
        o.frequency.value = 4200 + Math.random() * 800;
        g.gain.setValueAtTime(0.012, t + delay);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.04);
        o.start(t + delay); o.stop(t + delay + 0.05);
      }
    } catch (e) { /* silent */ }
  }

  /** Water / river flowing — gentle filtered noise */
  function playRiverSound () {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const bufferSize = audioCtx.sampleRate;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = 600; filter.Q.value = 0.5;
      const g = audioCtx.createGain();
      noise.connect(filter); filter.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.015, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
      noise.start(t); noise.stop(t + 1.5);
    } catch (e) { /* silent */ }
  }

  function playSound (type) {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      switch (type) {
        case 'step':
          osc.frequency.value = 80 + Math.random() * 40; osc.type = 'triangle';
          gain.gain.value = 0.04; gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          osc.start(); osc.stop(t + 0.08); break;
        case 'meow':
          osc.frequency.setValueAtTime(650, t); osc.type = 'sine';
          osc.frequency.linearRampToValueAtTime(500, t + 0.15);
          osc.frequency.linearRampToValueAtTime(420, t + 0.35);
          gain.gain.setValueAtTime(0.14, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
          osc.start(); osc.stop(t + 0.42); break;
        case 'ceremony':
          // Dramatic rising tone
          osc.frequency.setValueAtTime(330, t); osc.type = 'sine';
          osc.frequency.linearRampToValueAtTime(550, t + 0.4);
          osc.frequency.linearRampToValueAtTime(660, t + 0.8);
          gain.gain.setValueAtTime(0.10, t);
          gain.gain.setValueAtTime(0.12, t + 0.4);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
          osc.start(); osc.stop(t + 1.0); break;
        case 'hit':
          osc.frequency.setValueAtTime(200, t); osc.type = 'sawtooth';
          osc.frequency.linearRampToValueAtTime(80, t + 0.12);
          gain.gain.setValueAtTime(0.12, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          osc.start(); osc.stop(t + 0.15); break;
        case 'hurt':
          osc.frequency.setValueAtTime(300, t); osc.type = 'sawtooth';
          osc.frequency.linearRampToValueAtTime(100, t + 0.2);
          gain.gain.setValueAtTime(0.10, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
          osc.start(); osc.stop(t + 0.25); break;
        case 'swoosh':
          osc.frequency.setValueAtTime(800, t); osc.type = 'sine';
          osc.frequency.linearRampToValueAtTime(200, t + 0.15);
          gain.gain.setValueAtTime(0.06, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          osc.start(); osc.stop(t + 0.18); break;
        case 'battle':
          // Dramatic battle start sound
          osc.frequency.setValueAtTime(150, t); osc.type = 'sawtooth';
          osc.frequency.linearRampToValueAtTime(400, t + 0.2);
          osc.frequency.linearRampToValueAtTime(200, t + 0.5);
          gain.gain.setValueAtTime(0.12, t);
          gain.gain.setValueAtTime(0.14, t + 0.2);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
          osc.start(); osc.stop(t + 0.6); break;
        case 'danger':
          // Warning buzzer
          osc.frequency.setValueAtTime(440, t); osc.type = 'square';
          osc.frequency.setValueAtTime(0, t + 0.15);
          osc.frequency.setValueAtTime(440, t + 0.3);
          gain.gain.setValueAtTime(0.08, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
          osc.start(); osc.stop(t + 0.5); break;
        case 'ambient':
          // Randomly pick a forest ambient sound
          gain.gain.value = 0; osc.start(); osc.stop(t + 0.01); // dummy, we use the functions below
          const r = Math.random();
          if (r < 0.35)      playBirdTweet();
          else if (r < 0.55) playWindRustle();
          else if (r < 0.70) playCricket();
          else if (r < 0.80) playRiverSound();
          // else silence — natural pause
          break;
        default:
          osc.frequency.value = 200; osc.type = 'sine'; gain.gain.value = 0.05;
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
          osc.start(); osc.stop(t + 0.2);
      }
    } catch (e) { /* silent */ }
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
    scene.background = new THREE.Color(0.30, 0.48, 0.30);
    scene.fog = new THREE.FogExp2(0x2d4a2d, 0.010);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 250);
    camera.position.set(0, 8, 14);
    camera.lookAt(0, 1, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    /* ground */
    const groundGeo = new THREE.PlaneGeometry(200, 200, 30, 30);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x3a6b35 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);

    /* camp clearing */
    const campGeo = new THREE.CircleGeometry(14, 32);
    const campMat = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
    const camp = new THREE.Mesh(campGeo, campMat);
    camp.rotation.x = -Math.PI / 2; camp.position.y = 0.01;
    scene.add(camp);

    /* path */
    const pathGeo = new THREE.PlaneGeometry(3, 30);
    const pathMat = new THREE.MeshLambertMaterial({ color: 0x6b5b4a });
    const path = new THREE.Mesh(pathGeo, pathMat);
    path.rotation.x = -Math.PI / 2; path.position.set(0, 0.02, 22);
    scene.add(path);

    /* trees */
    trees = GameLogic.generateTreePositions(200, 42, bounds);
    trees.forEach(t => {
      const obj = t.type === 'oak' ? makeOak(t) : makePine(t);
      obj.position.set(t.x, 0, t.z);
      scene.add(obj);
      treeObjects.push({ mesh: obj, data: t });
    });

    /* rocks */
    rocks = GameLogic.generateRockPositions(60, 42, bounds);
    rocks.forEach(r => {
      const obj = makeRock(r);
      obj.position.set(r.x, 0, r.z);
      scene.add(obj);
    });

    /* grass */
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x4a8b3f, side: THREE.DoubleSide });
    for (let i = 0; i < 400; i++) {
      const gx = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const gz = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      const g = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.4 + Math.random() * 0.5), grassMat);
      g.position.set(gx, 0.2, gz); g.rotation.y = Math.random() * Math.PI;
      scene.add(g);
    }

    /* flowers */
    const fColors = [0xff6b9d, 0xffd93d, 0xff8c42, 0xc084fc, 0x6dd5ed];
    for (let i = 0; i < 100; i++) {
      const fx = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const fz = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      const fm = new THREE.MeshLambertMaterial({ color: fColors[Math.floor(Math.random() * fColors.length)] });
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), fm);
      f.position.set(fx, 0.15, fz);
      scene.add(f);
    }

    /* river */
    const riverGeo = new THREE.PlaneGeometry(8, 200, 1, 20);
    const riverMat = new THREE.MeshLambertMaterial({ color: 0x3388aa, transparent: true, opacity: 0.7 });
    const river = new THREE.Mesh(riverGeo, riverMat);
    river.rotation.x = -Math.PI / 2; river.position.set(75, 0.05, 0);
    scene.add(river);

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
    const denMat  = new THREE.MeshLambertMaterial({ color: 0x5c4a2e });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e5c1e });
    const mossMat = new THREE.MeshLambertMaterial({ color: 0x4a7a3a });
    const brambleMat = new THREE.MeshLambertMaterial({ color: 0x6b5a3a });

    // Helper: build a den (dome of branches + leaf cover + name label)
    function makeDen (name, x, z, radius, height) {
      const g = new THREE.Group();
      // dome frame (half sphere of sticks)
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        brambleMat
      );
      dome.position.y = 0; dome.castShadow = true;
      g.add(dome);
      // leaf/moss cover
      const cover = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.05, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
        leafMat
      );
      cover.position.y = 0.05; cover.castShadow = true;
      g.add(cover);
      // entrance hole (dark opening)
      const entrance = new THREE.Mesh(
        new THREE.CircleGeometry(radius * 0.4, 8),
        new THREE.MeshBasicMaterial({ color: 0x111111 })
      );
      entrance.position.set(0, radius * 0.35, radius * 0.92);
      g.add(entrance);
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
      new THREE.MeshLambertMaterial({ color: 0x666666 })
    );
    overhang.position.y = 0;
    leaderDen.add(overhang);
    // lichen curtain (thin green strips)
    for (let i = 0; i < 6; i++) {
      const lichen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, 1.2),
        new THREE.MeshLambertMaterial({ color: 0x4a8a3a, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
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
    const medRock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.0, 1), new THREE.MeshLambertMaterial({ color: 0x777766 }));
    medRock.scale.set(1.2, 0.8, 1); medRock.position.y = 0.8; medRock.castShadow = true;
    medDen.add(medRock);
    // cave opening
    const medOpening = new THREE.Mesh(new THREE.CircleGeometry(0.8, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    medOpening.position.set(0, 0.5, 1.8);
    medDen.add(medOpening);
    // herbs (small colored dots)
    [0x66aa44, 0xaaaa22, 0x8844aa, 0x44aa88].forEach((c, i) => {
      const herb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 4, 4), new THREE.MeshLambertMaterial({ color: c }));
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

    // Fresh-kill pile (center of camp)
    const killPile = new THREE.Group();
    const pileMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
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
    const wallMat = new THREE.MeshPhongMaterial({ color: 0xe8dbc8, shininess: 5 });
    const trimMat = new THREE.MeshPhongMaterial({ color: 0xfaf5ee, shininess: 10 });
    const roofMat = new THREE.MeshPhongMaterial({ color: 0x7a3a1a, shininess: 8 });
    const doorMat = new THREE.MeshPhongMaterial({ color: 0x5a3318, shininess: 20 });
    const winGlassMat = new THREE.MeshPhongMaterial({ color: 0x99ccee, emissive: 0x223344, shininess: 80, transparent: true, opacity: 0.85 });
    const winFrameMat = new THREE.MeshPhongMaterial({ color: 0xf5f0e8, shininess: 15 });
    const brickMat = new THREE.MeshPhongMaterial({ color: 0xcc8866, shininess: 3 });
    const concreteMat = new THREE.MeshPhongMaterial({ color: 0xbbbbaa, shininess: 5 });

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
    const panelMat = new THREE.MeshPhongMaterial({ color: 0x4a2a12, shininess: 15 });
    [[-0, 3.2], [0, 1.5]].forEach(([x, y]) => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.02), panelMat);
      panel.position.set(x, y, -3.62); house.add(panel);
    });
    // Door handle (brass knob)
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshPhongMaterial({ color: 0xddaa44, shininess: 80 }));
    knob.position.set(0.55, 2.2, -3.65); house.add(knob);
    // Door step
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.15, 0.8), concreteMat);
    step.position.set(0, 0.55, -3.7); house.add(step);
    // Cat flap
    const flapFrame = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.05), trimMat);
    flapFrame.position.set(0, 0.8, -3.63); house.add(flapFrame);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.03),
      new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 30 }));
    flap.position.set(0, 0.75, -3.66); house.add(flap);

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
    const awningMat = new THREE.MeshPhongMaterial({ color: 0x6a3015, shininess: 10 });
    const awning = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 1.5), awningMat);
    awning.position.set(0, 4.2, -4); awning.rotation.x = 0.15; house.add(awning);
    // Porch supports
    const supportMat = new THREE.MeshPhongMaterial({ color: 0xf0e8d8, shininess: 10 });
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
      new THREE.MeshLambertMaterial({ color: 0x55aa44 })
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
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x338822 });
    [[-4.5, -3.8], [-3.5, -3.8], [-2.5, -3.8], [2.5, -3.8], [3.5, -3.8], [4.5, -3.8]].forEach(([fx, fz], i) => {
      // Stem
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.6, 4), stemMat);
      stem.position.set(fx + (Math.random() - 0.5) * 0.3, 0.8, fz); house.add(stem);
      // Flower head
      const flowerMat = new THREE.MeshPhongMaterial({ color: flowerColors[i % flowerColors.length], shininess: 15 });
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
    const bowlMat = new THREE.MeshPhongMaterial({ color: 0x4488cc, shininess: 40 });
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
      new THREE.MeshPhongMaterial({ color: 0xcc2222, shininess: 30 }));
    mailBox.position.set(5.5, 1.35, -8); house.add(mailBox);
    // Mail flag
    const mailFlag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.15),
      new THREE.MeshPhongMaterial({ color: 0xcc2222 }));
    mailFlag.position.set(5.72, 1.45, -7.8); house.add(mailFlag);

    /* --- OUTDOOR LIGHT by door --- */
    const lightFixture = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 0.15),
      new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 20 }));
    lightFixture.position.set(1.2, 3.8, -3.55); house.add(lightFixture);
    const lightBulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshPhongMaterial({ color: 0xffffaa, emissive: 0xffdd66, emissiveIntensity: 0.5 }));
    lightBulb.position.set(1.2, 3.6, -3.6); house.add(lightBulb);
    // Warm glow from porch light
    const porchLight = new THREE.PointLight(0xffdd88, 0.4, 8);
    porchLight.position.set(1.2, 3.5, -4); house.add(porchLight);

    /* --- GARDEN BUSH/HEDGE along sides --- */
    const bushMat = new THREE.MeshLambertMaterial({ color: 0x2d6b1e });
    [[-6, -3], [-6, 0], [-6, 2], [6, -3], [6, 0], [6, 2]].forEach(([bx, bz]) => {
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.8 + Math.random() * 0.3, 8, 6), bushMat);
      bush.position.set(bx, 0.6, bz); bush.scale.set(1, 0.7, 1);
      bush.castShadow = true; house.add(bush);
    });

    // Label
    const hLabel = makeNameLabel('Twoleg House', 6.5);
    house.add(hLabel);

    house.position.set(0, 0, 85);
    scene.add(house);
  }

  /* ====================================================
     GARDEN FENCE (between Twoleg house and forest)
     ==================================================== */
  function createGardenFence () {
    const fenceMat = new THREE.MeshLambertMaterial({ color: 0x997755 });
    const fenceGroup = new THREE.Group();

    // Fence spans across at z~70, with a gap in the middle to walk through
    for (let x = -20; x <= 20; x += 1.5) {
      // Gap in the middle for the cat to walk through
      if (Math.abs(x) < 2) continue;
      // Fence post
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.15), fenceMat);
      post.position.set(x, 0.6, 70);
      post.castShadow = true;
      fenceGroup.add(post);
      // Pointed top
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 4), fenceMat);
      top.position.set(x, 1.3, 70);
      fenceGroup.add(top);
    }
    // Horizontal rails
    [-0.3, 0.7].forEach(y => {
      // Left section
      const railL = new THREE.Mesh(new THREE.BoxGeometry(18, 0.08, 0.08), fenceMat);
      railL.position.set(-11, y + 0.3, 70);
      fenceGroup.add(railL);
      // Right section
      const railR = new THREE.Mesh(new THREE.BoxGeometry(18, 0.08, 0.08), fenceMat);
      railR.position.set(11, y + 0.3, 70);
      fenceGroup.add(railR);
    });

    const fLabel = makeNameLabel('Garden Fence', 2.0);
    fLabel.position.set(0, 0, 70);
    scene.add(fLabel);

    scene.add(fenceGroup);
  }

  /* ====================================================
     TERRITORY LANDMARKS (book-accurate borders & landmarks)
     ==================================================== */
  function createTerritoryLandmarks () {
    /* --- THUNDERPATH (road between ThunderClan & ShadowClan) --- */
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(7, 200), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(-58.5, 0.03, 0);
    scene.add(road);
    // Yellow center line
    const lineMat = new THREE.MeshLambertMaterial({ color: 0xcccc00 });
    const centerLine = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 200), lineMat);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(-58.5, 0.04, 0);
    scene.add(centerLine);
    // Dashed white edge lines
    for (let z = -95; z < 95; z += 6) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 3), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(-55.2, 0.04, z);
      scene.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 3), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      dash2.rotation.x = -Math.PI / 2;
      dash2.position.set(-61.8, 0.04, z);
      scene.add(dash2);
    }
    const tpLabel = makeNameLabel('Thunderpath', 3.0);
    tpLabel.position.set(-58.5, 0, -10);
    scene.add(tpLabel);

    /* --- SUNNINGROCKS (large flat rocks near river) --- */
    const srMat = new THREE.MeshLambertMaterial({ color: 0xbbaa88 });
    for (let i = 0; i < 8; i++) {
      const rx = 58 + Math.random() * 12;
      const rz = -12 + Math.random() * 24;
      const rs = 1.5 + Math.random() * 2;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rs, 0), srMat);
      rock.position.set(rx, rs * 0.3, rz);
      rock.scale.set(1, 0.35, 1);
      rock.rotation.y = Math.random() * Math.PI;
      rock.castShadow = true;
      scene.add(rock);
    }
    const srLabel = makeNameLabel('Sunningrocks', 3.0);
    srLabel.position.set(63, 0, 0);
    scene.add(srLabel);

    /* --- FOURTREES (sacred meeting place of all clans) --- */
    // Four large oaks in a hollow
    const ftMat = new THREE.MeshLambertMaterial({ color: 0x4a3018 });
    const ftLeafMat = new THREE.MeshLambertMaterial({ color: 0x1a4a0e });
    const ftPositions = [[-42, -42], [-42, -48], [-48, -42], [-48, -48]];
    ftPositions.forEach(([fx, fz]) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 8, 8), ftMat);
      trunk.position.set(fx, 4, fz); trunk.castShadow = true; scene.add(trunk);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), ftLeafMat);
      canopy.position.set(fx, 9, fz); canopy.castShadow = true; scene.add(canopy);
    });
    // Hollow ground (slightly sunken)
    const hollowGeo = new THREE.CircleGeometry(8, 16);
    const hollowMat = new THREE.MeshLambertMaterial({ color: 0x4a3a28 });
    const hollow = new THREE.Mesh(hollowGeo, hollowMat);
    hollow.rotation.x = -Math.PI / 2; hollow.position.set(-45, 0.02, -45);
    scene.add(hollow);
    // Great Rock in the center
    const greatRock = new THREE.Mesh(new THREE.DodecahedronGeometry(2, 0),
      new THREE.MeshLambertMaterial({ color: 0x888888 }));
    greatRock.position.set(-45, 1, -45); greatRock.scale.set(1, 0.6, 1);
    greatRock.castShadow = true; scene.add(greatRock);
    const ftLabel = makeNameLabel('Fourtrees', 3.0);
    ftLabel.position.set(-45, 0, -45);
    scene.add(ftLabel);

    /* --- SHADOWCLAN TERRITORY (dark pine forest, past Thunderpath) --- */
    const scGroundMat = new THREE.MeshLambertMaterial({ color: 0x2a3a20 });
    const scGround = new THREE.Mesh(new THREE.PlaneGeometry(33, 200), scGroundMat);
    scGround.rotation.x = -Math.PI / 2; scGround.position.set(-78.5, 0.015, 0);
    scene.add(scGround);
    const scLabel = makeNameLabel('ShadowClan Territory', 3.5);
    scLabel.position.set(-78, 0, 0);
    scene.add(scLabel);

    /* --- RIVERCLAN TERRITORY (past the river, marshy) --- */
    const rcGroundMat = new THREE.MeshLambertMaterial({ color: 0x3a6a45 });
    const rcGround = new THREE.Mesh(new THREE.PlaneGeometry(16, 200), rcGroundMat);
    rcGround.rotation.x = -Math.PI / 2; rcGround.position.set(87, 0.015, 0);
    scene.add(rcGround);
    // Reeds near water
    const reedMat = new THREE.MeshLambertMaterial({ color: 0x5a7a3a });
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
    const wcGroundMat = new THREE.MeshLambertMaterial({ color: 0x7a8a55 });
    const wcGround = new THREE.Mesh(new THREE.PlaneGeometry(200, 35), wcGroundMat);
    wcGround.rotation.x = -Math.PI / 2; wcGround.position.set(0, 0.015, -77.5);
    scene.add(wcGround);
    // Rolling hills
    for (let i = 0; i < 12; i++) {
      const hx = -60 + Math.random() * 120;
      const hz = -65 - Math.random() * 25;
      const hs = 3 + Math.random() * 5;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(hs, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x6a7a45 }));
      hill.position.set(hx, 0, hz); hill.scale.set(1, 0.3, 1);
      scene.add(hill);
    }
    const wcLabel = makeNameLabel('WindClan Territory', 3.5);
    wcLabel.position.set(0, 0, -75);
    scene.add(wcLabel);

    /* --- BORDER SCENT MARKERS (small stones/sticks at territory edges) --- */
    const markerMat = new THREE.MeshLambertMaterial({ color: 0x888866 });
    // ShadowClan border markers (along x = -50)
    for (let z = -80; z <= 80; z += 12) {
      const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.6, 5), markerMat);
      marker.position.set(-50, 0.3, z); scene.add(marker);
      const markerTop = new THREE.Mesh(new THREE.SphereGeometry(0.12, 4, 4),
        new THREE.MeshLambertMaterial({ color: 0xaaaa44 }));
      markerTop.position.set(-50, 0.65, z); scene.add(markerTop);
    }
    // RiverClan border markers (along x = 70)
    for (let z = -80; z <= 80; z += 12) {
      const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.6, 5), markerMat);
      marker.position.set(70, 0.3, z); scene.add(marker);
      const markerTop = new THREE.Mesh(new THREE.SphereGeometry(0.12, 4, 4),
        new THREE.MeshLambertMaterial({ color: 0x44aaaa }));
      markerTop.position.set(70, 0.65, z); scene.add(markerTop);
    }
    // WindClan border markers (along z = -55)
    for (let x = -50; x <= 70; x += 12) {
      const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.6, 5), markerMat);
      marker.position.set(x, 0.3, -55); scene.add(marker);
      const markerTop = new THREE.Mesh(new THREE.SphereGeometry(0.12, 4, 4),
        new THREE.MeshLambertMaterial({ color: 0xaa8844 }));
      markerTop.position.set(x, 0.65, -55); scene.add(markerTop);
    }

    // Border labels
    const sbLabel = makeNameLabel('ShadowClan Border', 2.5);
    sbLabel.position.set(-50, 0, 20); scene.add(sbLabel);
    const rbLabel = makeNameLabel('RiverClan Border', 2.5);
    rbLabel.position.set(70, 0, 20); scene.add(rbLabel);
    const wbLabel = makeNameLabel('WindClan Border', 2.5);
    wbLabel.position.set(20, 0, -55); scene.add(wbLabel);
  }

  function makeOak (d) {
    const g = new THREE.Group(); const s = d.scale;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3*s, 0.5*s, 4*s, 8), new THREE.MeshLambertMaterial({ color: 0x5c3a1e }));
    trunk.position.y = 2*s; trunk.castShadow = true; g.add(trunk);
    const lc = new THREE.Color(0.15+Math.random()*0.1, 0.35+Math.random()*0.15, 0.1+Math.random()*0.1);
    const lm = new THREE.MeshLambertMaterial({ color: lc });
    [[0,5.5*s,0,2.5*s],[s,5*s,0.5*s,1.8*s],[-0.8*s,5*s,-0.5*s,1.6*s],[0.3*s,6*s,-0.4*s,1.5*s]].forEach(([x,y,z,r])=>{
      const l = new THREE.Mesh(new THREE.SphereGeometry(r,8,6), lm);
      l.position.set(x,y,z); l.castShadow = true; g.add(l);
    });
    return g;
  }

  function makePine (d) {
    const g = new THREE.Group(); const s = d.scale;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2*s, 0.35*s, 3*s, 6), new THREE.MeshLambertMaterial({ color: 0x4a2e14 }));
    trunk.position.y = 1.5*s; trunk.castShadow = true; g.add(trunk);
    const lc = new THREE.Color(0.1+Math.random()*0.05, 0.25+Math.random()*0.1, 0.08+Math.random()*0.05);
    const lm = new THREE.MeshLambertMaterial({ color: lc });
    [[2.2*s,2.5*s,3*s],[1.7*s,2*s,5*s],[1.2*s,1.8*s,6.5*s]].forEach(([r,h,y])=>{
      const c = new THREE.Mesh(new THREE.ConeGeometry(r,h,8), lm);
      c.position.y = y; c.castShadow = true; g.add(c);
    });
    return g;
  }

  function makeRock (d) {
    const g = new THREE.Group(); const s = d.scale;
    const rm = new THREE.MeshLambertMaterial({ color: new THREE.Color(0.4+Math.random()*0.1, 0.38+Math.random()*0.1, 0.35) });
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rm);
    r.position.y = s*0.4; r.rotation.set(Math.random(), Math.random(), Math.random());
    r.scale.set(1, 0.6, 0.8+Math.random()*0.4); r.castShadow = true;
    g.add(r); return g;
  }

  /* ====================================================
     HIGHROCK  (in camp centre, slightly offset)
     ==================================================== */
  function createHighrock () {
    highrock = new THREE.Group();
    // big rock
    const rockGeo = new THREE.DodecahedronGeometry(2.2, 1);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x777777 });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.scale.set(1, 1.4, 0.9);
    rock.position.y = 1.5;
    rock.castShadow = true;
    highrock.add(rock);
    // flat top
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.3, 12), new THREE.MeshLambertMaterial({ color: 0x888888 }));
    top.position.y = 3.2;
    highrock.add(top);
    // steps
    const step = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), new THREE.MeshLambertMaterial({ color: 0x666666 }));
    step.position.set(1.2, 0.25, 0.8); step.castShadow = true;
    highrock.add(step);
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

    /* --- body (two overlapping capsules for smooth shape) --- */
    const bodyMat = new THREE.MeshPhongMaterial({ color: orange, shininess: 15 });
    const bodyMain = makeCapsuleMesh(0.22, 0.95, 12, 16, bodyMat);
    bodyMain.rotation.z = Math.PI / 2; bodyMain.position.set(0, 0.58, 0); bodyMain.castShadow = true;
    catGroup.add(bodyMain);
    // belly (lighter, slightly below)
    const bellyMat = new THREE.MeshPhongMaterial({ color: cream, shininess: 10 });
    const belly = makeCapsuleMesh(0.17, 0.65, 8, 12, bellyMat);
    belly.rotation.z = Math.PI / 2; belly.position.set(0, 0.49, 0.04);
    catGroup.add(belly);

    /* --- head --- */
    const headMat = new THREE.MeshPhongMaterial({ color: orange, shininess: 20 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.30, 14, 12), headMat);
    head.position.set(0, 0.86, 0.60); head.scale.set(1, 0.92, 1.08); head.castShadow = true;
    catGroup.add(head);
    // cheeks
    const cheekMat = new THREE.MeshPhongMaterial({ color: lightOrange, shininess: 10 });
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

    /* --- eyes (detailed: sclera, iris, pupil, highlight, eyelid) --- */
    [[-1, 1],[1, 1]].forEach(([side]) => {
      const x = side * 0.12;
      // sclera (white of eye) - bigger, more visible
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshPhongMaterial({ color: 0xf0fff0, shininess: 30 }));
      sclera.position.set(x, 0.90, 0.85); sclera.scale.set(1.1, 0.9, 0.55);
      catGroup.add(sclera);
      // iris (bright green, Rusty's signature eyes)
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 10), new THREE.MeshPhongMaterial({ color: 0x22cc22, shininess: 80 }));
      iris.position.set(x, 0.90, 0.88); iris.scale.set(1.0, 0.9, 0.45);
      catGroup.add(iris);
      // pupil (vertical slit - cat eye!)
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.030, 8, 8), new THREE.MeshBasicMaterial({ color: 0x050505 }));
      pupil.position.set(x, 0.90, 0.90); pupil.scale.set(0.4, 0.85, 0.3);
      catGroup.add(pupil);
      // specular highlights (two - big and small)
      const hl1 = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl1.position.set(x - side * 0.02, 0.93, 0.91);
      catGroup.add(hl1);
      const hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.009, 4, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl2.position.set(x + side * 0.01, 0.88, 0.91);
      catGroup.add(hl2);
      // dark eyelid line above eye
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.35), new THREE.MeshPhongMaterial({ color: darkOrange }));
      lid.position.set(x, 0.91, 0.85); lid.scale.set(1.1, 0.5, 0.55);
      catGroup.add(lid);
    });

    /* --- nose (triangle-shaped, pink, more prominent) --- */
    const noseMat = new THREE.MeshPhongMaterial({ color: pink, shininess: 60 });
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

    /* --- tail (curved upward, tight segments) --- */
    const tailMat = new THREE.MeshPhongMaterial({ color: orange });
    catGroup.tailSegs = [];
    const tailSegs = 10;
    for (let i = 0; i < tailSegs; i++) {
      const t = i / (tailSegs - 1); // 0 to 1
      const radius = 0.06 - t * 0.035; // tapers from 0.06 to 0.025
      const seg = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.02, radius), 6, 5), tailMat);
      // tail curves upward and back in a gentle arc
      const zOff = -0.40 - t * 0.45; // goes back
      const yOff = 0.52 + t * 0.35;  // curves up
      seg.position.set(0, yOff, zOff);
      catGroup.add(seg);
      catGroup.tailSegs.push(seg);
    }
    // tail tip (darker)
    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), new THREE.MeshPhongMaterial({ color: darkOrange }));
    tailTip.position.set(0, 0.87, -0.85);
    catGroup.add(tailTip);
    catGroup.tailSegs.push(tailTip);

    /* --- chest patch --- */
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.20, 10, 8), new THREE.MeshPhongMaterial({ color: cream }));
    chest.position.set(0, 0.55, 0.36); chest.scale.set(0.6, 0.7, 0.45);
    catGroup.add(chest);

    /* --- tabby stripes --- */
    const stripeMat = new THREE.MeshPhongMaterial({ color: darkOrange });
    for (let i = 0; i < 5; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.015, 0.05), stripeMat);
      stripe.position.set(0, 0.88, 0.12 - i * 0.13);
      catGroup.add(stripe);
    }
    // forehead M marking
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
    const furMat  = new THREE.MeshPhongMaterial({ color: desc.fur, shininess: 12 });
    const bellyC  = desc.belly || desc.fur;
    const bellyMat = new THREE.MeshPhongMaterial({ color: bellyC, shininess: 8 });
    const earInC  = desc.earInner || 0xff9999;
    const noseC   = desc.noseColor || 0xff7799;
    const eyeC    = desc.eyeColor || 0xffdd44;
    const pawC    = desc.whitePaws ? 0xffeedd : desc.fur;

    /* body */
    const bodyR = 0.34 * sz, bodyL = 0.7 * sz;
    const body = makeCapsuleMesh(bodyR, bodyL, 10, 14, furMat);
    body.rotation.z = Math.PI / 2; body.position.y = 0.58 * sz; body.castShadow = true;
    g.add(body);
    // belly
    const bellyM = makeCapsuleMesh(bodyR * 0.78, bodyL * 0.65, 8, 10, bellyMat);
    bellyM.rotation.z = Math.PI / 2; bellyM.position.set(0, 0.48 * sz, 0.04);
    g.add(bellyM);

    /* mane / thick neck fur (for Lionheart etc.) */
    if (desc.maneColor) {
      const maneMat = new THREE.MeshPhongMaterial({ color: desc.maneColor, shininess: 8 });
      const mane = new THREE.Mesh(new THREE.SphereGeometry(0.38 * sz, 10, 8), maneMat);
      mane.position.set(0, 0.7 * sz, 0.25 * sz); mane.scale.set(1.3, 1.1, 1.0);
      g.add(mane);
    }

    /* head */
    const headR = 0.30 * sz;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 12, 10), furMat);
    head.position.set(0, 0.82 * sz, 0.52 * sz); head.scale.set(1, 0.92, 1.06);
    head.castShadow = true; g.add(head);
    // cheeks
    const cheekMat = new THREE.MeshPhongMaterial({ color: desc.belly || desc.fur, shininess: 8 });
    [[-1,1],[1,1]].forEach(([s]) => {
      const ch = new THREE.Mesh(new THREE.SphereGeometry(0.12 * sz, 8, 6), cheekMat);
      ch.position.set(s * 0.16 * sz, 0.76 * sz, 0.62 * sz); g.add(ch);
    });
    // muzzle
    const mzlMat = new THREE.MeshPhongMaterial({ color: bellyC });
    const mzl = new THREE.Mesh(new THREE.SphereGeometry(0.11 * sz, 8, 6), mzlMat);
    mzl.position.set(0, 0.76 * sz, 0.72 * sz); mzl.scale.set(1.1, 0.65, 0.7);
    g.add(mzl);
    // chin
    if (desc.whiteChest) {
      const chin = new THREE.Mesh(new THREE.SphereGeometry(0.09 * sz, 6, 5), new THREE.MeshPhongMaterial({ color: 0xffeedd }));
      chin.position.set(0, 0.70 * sz, 0.62 * sz); g.add(chin);
    }

    /* ears */
    const earMat = new THREE.MeshPhongMaterial({ color: desc.fur });
    const earIn  = new THREE.MeshPhongMaterial({ color: earInC });
    [[-1,1],[1,1]].forEach(([s]) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11 * sz, 0.22 * sz, 4), earMat);
      ear.position.set(s * 0.15 * sz, 1.06 * sz, 0.50 * sz); ear.rotation.z = s * 0.22;
      g.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.06 * sz, 0.14 * sz, 4), earIn);
      inner.position.set(s * 0.15 * sz, 1.04 * sz, 0.52 * sz); inner.rotation.z = s * 0.22;
      g.add(inner);
    });
    // long-fur ear tufts
    if (desc.longFur) {
      const tuftMat = new THREE.MeshPhongMaterial({ color: desc.fur });
      [[-1,1],[1,1]].forEach(([s]) => {
        const tf = new THREE.Mesh(new THREE.ConeGeometry(0.04 * sz, 0.10 * sz, 3), tuftMat);
        tf.position.set(s * 0.15 * sz, 1.18 * sz, 0.50 * sz); g.add(tf);
      });
    }

    /* eyes (sclera, iris, pupil, highlight) */
    [[-1,1],[1,1]].forEach(([s]) => {
      const x = s * 0.11 * sz;
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.06 * sz, 8, 6), new THREE.MeshPhongMaterial({ color: 0xeeeedd }));
      sclera.position.set(x, 0.86 * sz, 0.74 * sz); sclera.scale.set(1, 0.85, 0.5); g.add(sclera);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.048 * sz, 8, 6), new THREE.MeshPhongMaterial({ color: eyeC, shininess: 50 }));
      iris.position.set(x, 0.86 * sz, 0.76 * sz); iris.scale.set(1, 0.85, 0.4); g.add(iris);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.024 * sz, 6, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      pupil.position.set(x, 0.86 * sz, 0.78 * sz); g.add(pupil);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.012 * sz, 4, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl.position.set(x - s * 0.015 * sz, 0.88 * sz, 0.79 * sz); g.add(hl);
    });

    /* nose */
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.038 * sz, 6, 5), new THREE.MeshPhongMaterial({ color: noseC, shininess: 40 }));
    nose.position.set(0, 0.79 * sz, 0.80 * sz); nose.scale.set(1.2, 0.65, 0.6); g.add(nose);

    /* whiskers */
    const whMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
    [[-1,1],[1,1]].forEach(([s]) => {
      for (let w = 0; w < 3; w++) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.001, 0.32 * sz, 3), whMat);
        wh.rotation.z = s * (0.15 + w * 0.12); wh.rotation.x = -0.1 + w * 0.1;
        wh.position.set(s * 0.20 * sz, 0.76 * sz - w * 0.015, 0.72 * sz);
        g.add(wh);
      }
    });

    /* legs & paws */
    const legMat = new THREE.MeshPhongMaterial({ color: desc.fur });
    const pawMat = new THREE.MeshPhongMaterial({ color: pawC });
    const padMat = new THREE.MeshPhongMaterial({ color: 0xff8899 });
    const legPos = [
      [-0.18*sz, 0.18*sz, 0.28*sz], [0.18*sz, 0.18*sz, 0.28*sz],
      [-0.18*sz, 0.18*sz, -0.28*sz],[0.18*sz, 0.18*sz, -0.28*sz]
    ];
    g.legs = [];
    legPos.forEach(([x,y,z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08*sz, 0.06*sz, 0.38*sz, 7), legMat);
      leg.position.set(x,y,z); leg.castShadow = true; g.add(leg); g.legs.push(leg);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.07*sz, 7, 5), pawMat);
      paw.position.set(x, 0.02, z); paw.scale.set(1, 0.5, 1.2); g.add(paw);
      // toe beans
      for (let t = 0; t < 3; t++) {
        const bean = new THREE.Mesh(new THREE.SphereGeometry(0.015*sz, 4, 4), padMat);
        bean.position.set(x+(t-1)*0.025*sz, 0.008, z+0.03*sz); g.add(bean);
      }
    });

    /* tail */
    g.tailSegs = [];
    for (let i = 0; i < 6; i++) {
      const r = (0.055 - i * 0.006) * sz;
      const seg = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.015, r), 5, 4), furMat);
      seg.position.set(0, (0.45 + i * 0.09) * sz, (-0.38 - i * 0.09) * sz);
      g.add(seg); g.tailSegs.push(seg);
    }

    /* chest patch */
    if (desc.whiteChest) {
      const cp = new THREE.Mesh(new THREE.SphereGeometry(0.20*sz, 8, 6), new THREE.MeshPhongMaterial({ color: 0xffeedd }));
      cp.position.set(0, 0.52*sz, 0.32*sz); cp.scale.set(0.65, 0.7, 0.45); g.add(cp);
    }

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
    ];
  }

  /* ====================================================
     LIGHTING
     ==================================================== */
  function createLighting () {
    scene.add(new THREE.AmbientLight(0x6b8f6b, 0.6));
    const sun = new THREE.DirectionalLight(0xffe4b5, 0.9);
    sun.position.set(30, 40, 20); sun.castShadow = true;
    sun.shadow.mapSize.width = 2048; sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 100;
    sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;  sun.shadow.camera.bottom = -30;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x87ceeb, 0x3a6b35, 0.4));
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
      if ((e.key === 'e' || e.key === 'E') && gameState === 'playing') {
        talkToNearestCat();
      }
    });
    window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; keys[e.code] = false; });

    renderer.domElement.addEventListener('click', (e) => {
      if (gameState === 'playing' && !isMobile) {
        if (!isPointerLocked) {
          // First click: try talking to a cat, if not, lock pointer
          if (!tryTalkByRaycast(e.clientX, e.clientY)) {
            renderer.domElement.requestPointerLock();
          }
        }
      }
    });
    document.addEventListener('pointerlockchange', () => { isPointerLocked = document.pointerLockElement === renderer.domElement; });
    document.addEventListener('mousemove', e => {
      if (isPointerLocked) {
        cameraAngleY -= e.movementX * 0.003;
        cameraAngleX = Math.max(0.1, Math.min(0.8, cameraAngleX + e.movementY * 0.003));
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

    // mobile
    setupMobileControls();

    // touch camera
    let touchCamId = null, ltx = 0, lty = 0;
    renderer.domElement.addEventListener('touchstart', e => {
      if (gameState !== 'playing') return;
      for (const t of e.changedTouches) {
        // Try to talk to cat by tapping on them
        if (tryTalkByRaycast(t.clientX, t.clientY)) return;
        // Otherwise use right half for camera
        if (t.clientX > window.innerWidth * 0.5) { touchCamId = t.identifier; ltx = t.clientX; lty = t.clientY; }
      }
    });
    renderer.domElement.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === touchCamId) {
          cameraAngleY -= (t.clientX - ltx) * 0.005;
          cameraAngleX = Math.max(0.1, Math.min(0.8, cameraAngleX + (t.clientY - lty) * 0.005));
          ltx = t.clientX; lty = t.clientY;
        }
      }
    });
    renderer.domElement.addEventListener('touchend', e => { for (const t of e.changedTouches) if (t.identifier === touchCamId) touchCamId = null; });
  }

  function setupMobileControls () {
    const jArea = $('joystick-area'), jStick = $('joystick-stick');
    const bSprint = $('btn-sprint'), bAction = $('btn-action');
    let jTid = null, jCenter = { x: 0, y: 0 };
    jArea.addEventListener('touchstart', e => {
      e.preventDefault(); const t = e.changedTouches[0]; jTid = t.identifier;
      const r = jArea.getBoundingClientRect(); jCenter = { x: r.left+r.width/2, y: r.top+r.height/2 };
    });
    jArea.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === jTid) {
          let dx = t.clientX - jCenter.x, dy = t.clientY - jCenter.y;
          const d = Math.sqrt(dx*dx+dy*dy), mx = 40;
          if (d > mx) { dx = dx/d*mx; dy = dy/d*mx; }
          jStick.style.transform = `translate(${dx}px,${dy}px)`;
          joystickInput.x = dx/mx; joystickInput.z = dy/mx;
        }
      }
    });
    const resetJ = e => { for (const t of e.changedTouches) if (t.identifier === jTid) { jTid = null; jStick.style.transform = 'translate(0,0)'; joystickInput.x = 0; joystickInput.z = 0; } };
    jArea.addEventListener('touchend', resetJ); jArea.addEventListener('touchcancel', resetJ);
    bSprint.addEventListener('touchstart', e => { e.preventDefault(); if (player) player.isSprinting = true; });
    bSprint.addEventListener('touchend', e => { e.preventDefault(); if (player) player.isSprinting = false; });
    bAction.addEventListener('touchstart', e => { e.preventDefault(); initAudio(); talkToNearestCat(); });
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
      '"I saw something terrible... but I can\'t talk about it here."',
      '"Tigerclaw scares me... don\'t tell anyone I said that!"',
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
  };

  let lastTalkTime = 0;
  const TALK_COOLDOWN = 2000; // ms between talks
  const TALK_RANGE = 5; // distance to talk

  function talkToNearestCat () {
    if (gameState !== 'playing' || !player) return;
    if (messageBox.classList.contains('visible')) return; // already in conversation
    if (Date.now() - lastTalkTime < TALK_COOLDOWN) return;

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
    const lines = catDialogue[npc.name] || ['"..."'];
    const line = lines[Math.floor(Math.random() * lines.length)];

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
  function goToSaveScreen () {
    gameState = 'saves';
    titleScreen.classList.add('hidden');
    saveScreen.classList.remove('hidden');
    refreshSaveSlots();
  }

  function refreshSaveSlots () {
    for (let i = 1; i <= 3; i++) {
      const raw = localStorage.getItem('warriors-save-' + i);
      const el = $('save-slot-' + i);
      const delBtn = document.querySelector(`.save-delete-btn[data-slot="${i}"]`);
      if (raw) {
        const data = GameLogic.deserializeState(raw);
        if (data) {
          el.querySelector('.save-slot-label').textContent = 'Save ' + i + ' - Continue';
          el.querySelector('.save-slot-info').innerHTML =
            '<span class="save-name">' + (data.name || 'Firepaw') + '</span><br>' +
            '<span class="save-detail">Level ' + (data.level || 1) + ' &bull; ' + (data.clan || 'ThunderClan') + '</span>';
          delBtn.classList.remove('hidden');
          continue;
        }
      }
      el.querySelector('.save-slot-label').textContent = 'Save ' + i;
      el.querySelector('.save-slot-info').textContent = '- New Game -';
      delBtn.classList.add('hidden');
    }
  }

  function pickSaveSlot (slot) {
    activeSaveSlot = slot;
    const raw = localStorage.getItem('warriors-save-' + slot);
    if (raw) {
      const data = GameLogic.deserializeState(raw);
      if (data) {
        player = data;
        saveScreen.classList.add('hidden');
        storyPhase = 'playing';
        graypawEncounterTriggered = true;
        bluestarEncounterTriggered = true;
        startPlaying();
        return;
      }
    }
    // New game → opening cutscene
    player = GameLogic.createPlayer('Fire');
    saveScreen.classList.add('hidden');
    startOpeningCutscene();
  }

  /* ====================================================
     CUTSCENE SYSTEM
     ==================================================== */
  function startCutscene (scenes, onDone) {
    gameState = 'cutscene';
    cutsceneQueue = scenes.slice();
    cutsceneOverlay.classList.remove('hidden');
    cutsceneOverlay._onDone = onDone;
    showCutsceneSlide();
  }

  function showCutsceneSlide () {
    if (cutsceneQueue.length === 0) {
      cutsceneOverlay.classList.add('hidden');
      if (cutsceneOverlay._onDone) cutsceneOverlay._onDone();
      return;
    }
    const slide = cutsceneQueue[0];
    let html = '';
    if (slide.speaker) html += '<span class="speaker">' + slide.speaker + '</span>';
    if (slide.narration) html += '<span class="narration">' + slide.text + '</span>';
    else html += slide.text;
    cutsceneText.innerHTML = html;
    // camera move
    if (slide.camPos) {
      camera.position.set(slide.camPos.x, slide.camPos.y, slide.camPos.z);
    }
    if (slide.camLook) {
      camera.lookAt(new THREE.Vector3(slide.camLook.x, slide.camLook.y, slide.camLook.z));
    }
    // Play cat voice for speaker
    if (slide.speaker) {
      playCatVoice(slide.speaker);
    } else if (slide.narration) {
      // Soft ambient sound for narration
      playWindRustle();
    }
  }

  let lastCutsceneAdvance = 0;
  function advanceCutscene () {
    // Prevent rapid clicks from skipping entire cutscene
    const now = Date.now();
    if (now - lastCutsceneAdvance < 400) return;
    lastCutsceneAdvance = now;
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
      // --- PROLOGUE: The Battle ---
      { narration: true, text: '<strong>WARRIOR CATS: INTO THE WILD</strong><br><em>The Prophecy Begins...</em>',
        camPos: { x: 0, y: 20, z: 50 }, camLook: { x: 0, y: 0, z: 0 } },

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

      { speaker: 'Spottedleaf', text: '"<em><strong>Fire alone will save our Clan.</strong></em>"',
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
      // Hide all NPCs and start the exploring phase
      npcCats.forEach(c => { c.group.visible = false; });
      startExploring();
    });
  }

  /* ====================================================
     EXPLORING PHASE (Rusty leaves the house)
     ==================================================== */
  let storyPhase = 'house'; // house | forest | met_graypaw | fought_graypaw | met_bluestar | named | playing
  let graypawEncounterTriggered = false;
  let bluestarEncounterTriggered = false;

  function startExploring () {
    gameState = 'playing';
    catGroup.visible = true;
    // Place Rusty at the Twoleg house
    player.position = { x: 0, y: 0, z: 82 };
    catGroup.position.set(0, 0, 82);
    storyPhase = 'house';
    graypawEncounterTriggered = false;
    bluestarEncounterTriggered = false;

    // Hide all NPC cats initially
    npcCats.forEach(c => { c.group.visible = false; });

    gameHud.classList.add('visible');
    playerNameEl.textContent = 'Rusty';

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

    // TRIGGER 1: Player crosses the fence (z < 68) → encounter Graypaw
    if (storyPhase === 'house' && pz < 65 && !graypawEncounterTriggered) {
      graypawEncounterTriggered = true;
      storyPhase = 'forest';
      triggerGraypawEncounter();
    }

    // TRIGGER 2: After fighting Graypaw, walk further (z < 45) → meet Bluestar
    if (storyPhase === 'fought_graypaw' && pz < 45 && !bluestarEncounterTriggered) {
      bluestarEncounterTriggered = true;
      triggerBluestarEncounter();
    }

    // TRIGGER: Territory trespassing (only when free-roaming, not training)
    if (storyPhase === 'playing') {
      checkTerritoryTrespass();
    }
  }

  /* ====================================================
     TERRITORY TRESPASSING SYSTEM
     ==================================================== */
  let trespassCooldown = 0; // prevent spamming
  let trespassWarned = false; // first time just a warning
  let lastTerritory = 'ThunderClan';

  function checkTerritoryTrespass () {
    if (!player || gameState !== 'playing') return;
    if (trespassCooldown > 0) { trespassCooldown--; return; }

    const territory = GameLogic.getTerritory(player.position);

    // Thunderpath - danger warning
    if (territory === 'Thunderpath' && lastTerritory !== 'Thunderpath') {
      lastTerritory = 'Thunderpath';
      trespassCooldown = 300; // ~5 seconds at 60fps
      queueMessage('Narrator', 'DANGER! You are on the Thunderpath! Monsters (cars) race past here. Get off quickly!');
      playSound('danger');
      return;
    }

    // Entering enemy territory
    if (territory !== 'ThunderClan' && territory !== 'Thunderpath' && territory !== 'neutral') {
      if (lastTerritory === 'ThunderClan' || lastTerritory === 'Thunderpath' || lastTerritory === 'neutral') {
        lastTerritory = territory;
        trespassCooldown = 600; // ~10 seconds

        if (!trespassWarned) {
          // First time: just a warning
          trespassWarned = true;
          queueMessage('Narrator', 'WARNING! You have crossed into ' + territory + ' territory! Their warriors will not be happy about this.', () => {
            queueMessage('Narrator', 'You can still explore, but be ready to fight or run!');
          });
        } else {
          // Subsequent times: hostile patrol encounter
          triggerTrespassEncounter(territory);
        }
      }
    }

    if (territory === 'ThunderClan' || territory === 'neutral') {
      lastTerritory = territory;
    }
  }

  function triggerTrespassEncounter (clanName) {
    gameState = 'cutscene';

    const clanData = {
      'ShadowClan': {
        warrior: 'ShadowClan Warrior',
        furColor: 0x333333, eyeColor: 0xffcc00, stripes: false,
        hp: 70 + player.level * 10,
        attack: 12 + player.level * 2,
        defense: 5 + player.level,
        exp: 50 + player.level * 10,
        dialogue: [
          '"What is a ThunderClan cat doing on ShadowClan territory?!"',
          '"You dare trespass here? I\'ll shred your ears, kittypet!"',
          '"ShadowClan will teach you a lesson you\'ll never forget!"',
        ],
      },
      'RiverClan': {
        warrior: 'RiverClan Warrior',
        furColor: 0x6688aa, eyeColor: 0x44cccc, stripes: false,
        hp: 65 + player.level * 10,
        attack: 10 + player.level * 2,
        defense: 6 + player.level,
        exp: 50 + player.level * 10,
        dialogue: [
          '"A ThunderClan cat?! This is RiverClan territory! Get out!"',
          '"You smell like the forest. You don\'t belong near our river!"',
          '"I\'ll drag you back across the border myself!"',
        ],
      },
      'WindClan': {
        warrior: 'WindClan Warrior',
        furColor: 0xbbaa77, eyeColor: 0xddbb33, stripes: true,
        hp: 55 + player.level * 10,
        attack: 14 + player.level * 2,
        defense: 3 + player.level,
        exp: 50 + player.level * 10,
        dialogue: [
          '"ThunderClan! What are you doing on our moor?!"',
          '"You\'re trespassing! WindClan doesn\'t tolerate intruders!"',
          '"Turn back now, or face the consequences!"',
        ],
      },
    };

    const data = clanData[clanName] || clanData['ShadowClan'];
    const line = data.dialogue[Math.floor(Math.random() * data.dialogue.length)];

    const scenes = [
      { narration: true, text: 'A patrol of ' + clanName + ' warriors appears! They look furious that you\'re on their territory!' },
      { speaker: data.warrior, text: line },
    ];

    startCutscene(scenes, () => {
      // Start the battle!
      startBattle({
        enemyName: data.warrior,
        enemyHP: data.hp,
        enemyMaxHP: data.hp,
        enemyAttack: data.attack,
        enemyDefense: data.defense,
        enemyFurColor: data.furColor,
        enemyEyeColor: data.eyeColor,
        enemyStripes: data.stripes,
        enemyStripeColor: 0x444433,
        playerMinHP: 5,
        expReward: data.exp,
        onWin: function () {
          const scenes2 = [
            { narration: true, text: 'The ' + clanName + ' warrior staggers back, defeated.' },
            { speaker: data.warrior, text: '"This isn\'t over, ThunderClan! Next time there will be more of us!"' },
            { narration: true, text: 'The warrior retreats into their territory. You should head back to ThunderClan land before more arrive.' },
          ];
          startCutscene(scenes2, () => {
            gameState = 'playing';
            // Push player back toward ThunderClan territory
            queueMessage('Narrator', 'You won the fight! But you should return to ThunderClan territory before another patrol comes.');
          });
        },
        onLose: function () {
          // Player gets chased back
          const scenes2 = [
            { narration: true, text: 'The ' + clanName + ' warrior overpowers you and chases you back to the border!' },
            { speaker: data.warrior, text: '"And STAY OUT! Next time, I won\'t be so merciful!"' },
          ];
          // Teleport player back to safety
          player.position = { x: 0, y: 0, z: 0 };
          catGroup.position.set(0, 0, 0);
          player.health = Math.max(15, Math.floor(player.maxHealth * 0.3));
          startCutscene(scenes2, () => {
            gameState = 'playing';
            queueMessage('Narrator', 'You wake up back at ThunderClan camp, bruised but alive. Don\'t trespass without being prepared!');
          });
        },
      });
    });
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
    };

    // Show the battle screen
    battleScreen.classList.remove('hidden');
    battleLog.innerHTML = '';
    battleHeader.textContent = 'BATTLE!';
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

    addBattleLog('The battle begins!', 'battle-log-fierce');
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

    // Enemy turn after delay
    setTimeout(() => battleEnemyTurn(), 800);
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

    if (won) {
      addBattleLog('<strong>You won the battle!</strong>', 'battle-log-player');
      // Award XP
      player = GameLogic.addExperience(player, b.expReward);
      player.battlesWon = (player.battlesWon || 0) + 1;
      // Heal a bit after winning
      player.health = Math.min(player.maxHealth, player.health + Math.floor(player.maxHealth * 0.3));
      addBattleLog('+' + b.expReward + ' experience! Level ' + player.level, 'battle-log-player');
      if (player.health < player.maxHealth) {
        addBattleLog('You rest and recover some health.', 'battle-log-dodge');
      }
    } else {
      addBattleLog('<strong>You lost the battle...</strong>', 'battle-log-hit');
    }

    updateBattleHP();
    enableBattleButtons(false);

    // Close battle screen after a moment
    setTimeout(() => {
      battleScreen.classList.add('hidden');
      currentBattle = null;
      if (won && b.onWin) b.onWin();
      else if (!won && b.onLose) b.onLose();
      else {
        gameState = 'playing';
      }
    }, 1800);
  }

  // Wire up battle buttons
  battleAttackBtn.addEventListener('click', () => battlePlayerAction('attack'));
  battleDodgeBtn.addEventListener('click', () => battlePlayerAction('dodge'));
  battleFierceBtn.addEventListener('click', () => battlePlayerAction('fierce'));

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
      { speaker: '???', text: '"I am <strong>Bluestar</strong>, leader of ThunderClan. And this is <strong>Lionheart</strong>, my deputy. I have been watching you."' },
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
  function startNamingCeremony () {
    // Show NPC cats sitting around Highrock
    npcCats.forEach(c => { c.group.visible = true; });
    // Position Bluestar on Highrock
    npcCats[0].group.position.set(-3, 3.3, -4); // on top of highrock

    // Arrange other cats in a semicircle facing highrock
    const others = npcCats.slice(1);
    others.forEach((c, i) => {
      const angle = -0.8 + (i / (others.length - 1)) * 1.6;
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
      npcCats.forEach(c => { c.group.visible = true; });
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

  function startTraining () {
    gameState = 'playing';
    storyPhase = 'training';
    catGroup.visible = true;

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
        // Fresh-kill pile - hunting lesson
        queueMessage('Lionheart', 'This is the fresh-kill pile. Warriors bring prey here to feed the Clan.', () => {
          queueMessage('Lionheart', 'Hunting is one of your most important duties. When you\'re out in the forest, ' +
            'crouch low and stay downwind of your prey.', () => {
            queueMessage('Lionheart', 'HUNTING: ' + (isMob
              ? 'Press the ACT button when near prey to catch it.'
              : 'Press E or click ACT when you see prey in the forest to try to catch it.'), () => {
              queueMessage('Lionheart', 'Now, let me teach you about water. Follow me to the stream.', () => {
                trainingStep = 5;
                trainingTarget = { x: 20, z: -15 };
                moveLionheartTo(20, -15);
              });
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
        // Fighting lesson
        queueMessage('Lionheart', 'A warrior must know how to fight. You already showed skill against Graypaw!', () => {
          queueMessage('Lionheart', 'FIGHTING: When you encounter an enemy, a battle screen will open. ' +
            'You can Attack, Dodge, or use a Fierce Attack!', () => {
            queueMessage('Lionheart', 'SPRINTING: Hold ' + sprintKey + ' to run fast, but it uses your energy. ' +
              'Use it to escape danger or chase prey!', () => {
              queueMessage('Lionheart', 'Now, the MOST important part of being a warrior - knowing our borders! Follow me to the ShadowClan border!', () => {
                trainingStep = 7;
                trainingTarget = { x: -48, z: -10 };
                moveLionheartTo(-48, -10);
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
          'Ravenpaw', 'Spottedleaf', 'Tigerclaw', 'Yellowfang'
        ]);
        npcCats.forEach(c => { c.group.visible = true; });
        placeCatsInCamp();
        initNPCAI(); // cats start living their lives

        queueMessage('Lionheart', 'Your training tour is complete, ' + pName + '! You are now free to explore the territory on your own.', () => {
          queueMessage('Graypaw', 'Hey ' + pName + '! Want to go explore? There\'s so much to see!', () => {
            storyPhase = 'playing';
            saveGame();
            queueMessage('Narrator', 'You are now free to explore! ' +
              (isMob ? 'Use the joystick to move. RUN to sprint. ACT to interact.'
                     : 'WASD to move. SHIFT to sprint. E to interact. Click to look around.'));
          });
        });
        break;
    }
  }

  /** Move Lionheart to a target position (he walks there) */
  function moveLionheartTo (tx, tz) {
    if (trainingLionheart) {
      trainingLionheart.group.position.set(tx, 0, tz);
    }
  }

  /** Check if the player is near the training target */
  function checkTrainingProximity () {
    if (storyPhase !== 'training' || !trainingTarget) return;
    const dx = player.position.x - trainingTarget.x;
    const dz = player.position.z - trainingTarget.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 5) {
      const target = trainingTarget;
      trainingTarget = null; // clear so we don't trigger again
      advanceTraining();
    }
  }

  /** Place all cats in their camp positions */
  function placeCatsInCamp () {
    const campPositions = [
      { name: 'Bluestar', x: -4, z: -2 },
      { name: 'Lionheart', x: -1, z: 1 },
      { name: 'Graypaw', x: 5, z: 4 },
      { name: 'Whitestorm', x: 7, z: -1 },
      { name: 'Dustpaw', x: 5, z: 6 },
      { name: 'Sandpaw', x: 4, z: 7 },
      { name: 'Mousefur', x: 9, z: -3 },
      { name: 'Darkstripe', x: -5, z: -6 },
      { name: 'Ravenpaw', x: 3, z: 5 },
      { name: 'Spottedleaf', x: -9, z: 4 },
      { name: 'Tigerclaw', x: 6, z: -4 },
      { name: 'Yellowfang', x: -7, z: 6 },
    ];
    campPositions.forEach(cp => {
      const cat = npcCats.find(c => c.name === cp.name);
      if (cat) { cat.group.position.set(cp.x, 0, cp.z); cat.group.visible = true; }
    });
  }

  /* ====================================================
     START PLAYING (free roam after training or loading save)
     ==================================================== */
  function startPlaying () {
    gameState = 'playing';
    storyPhase = 'playing';
    catGroup.visible = true;

    // Place player in camp
    player.position = { x: 2, y: 0, z: 3 };
    catGroup.position.set(2, 0, 3);

    // Reveal all cats
    revealCatNames([
      'Bluestar', 'Lionheart', 'Graypaw', 'Whitestorm',
      'Dustpaw', 'Sandpaw', 'Mousefur', 'Darkstripe',
      'Ravenpaw', 'Spottedleaf', 'Tigerclaw', 'Yellowfang'
    ]);

    // show NPC cats in camp
    npcCats.forEach(c => { c.group.visible = true; });
    placeCatsInCamp();

    // Start NPC AI - cats walk around, hunt, drink, rest
    initNPCAI();

    gameHud.classList.add('visible');
    playerNameEl.textContent = player.name;

    if (isMobile) mobileControls.classList.add('visible');

    // Start forest sounds
    startForestAmbience();

    // Welcome message
    queueMessage('Narrator',
      'Welcome back, ' + player.name + '! Explore the territory. ' +
      (isMobile ? 'Use the joystick to move. RUN to sprint. ACT to interact.'
                : 'WASD to move. SHIFT to sprint. E to interact. Click to look around.'));
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
    // Play cat voice for speaker
    if (m.speaker && m.speaker !== 'Narrator') {
      playCatVoice(m.speaker);
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
     SAVE / LOAD
     ==================================================== */
  function saveGame () {
    if (!player || !activeSaveSlot) return;
    localStorage.setItem('warriors-save-' + activeSaveSlot, GameLogic.serializeState(player));
  }

  /* ====================================================
     ANIMATION
     ==================================================== */
  let walkCycle = 0, stepTimer = 0;

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

    // During training, Lionheart walks toward his target and Graypaw follows player
    if (storyPhase === 'training' && trainingLionheart && trainingTarget) {
      walkNPCToward(trainingLionheart, trainingTarget.x, trainingTarget.z, 1, 5, dt);
    }
    if (storyPhase === 'training') {
      walkNPCToward(npcCats.find(c => c.name === 'Graypaw'), player.position.x, player.position.z, 4, 4.5, dt);
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
  };

  // Assign rank-based dens
  function getDenForCat (name) {
    const apprentices = ['Graypaw', 'Dustpaw', 'Sandpaw', 'Ravenpaw'];
    if (apprentices.includes(name)) return DEN_SPOTS['Apprentices'];
    if (name === 'Bluestar') return DEN_SPOTS['Leader'];
    if (name === 'Spottedleaf') return DEN_SPOTS['Medicine'];
    if (name === 'Yellowfang') return DEN_SPOTS['Elders'];
    return DEN_SPOTS['Warriors'];
  }

  function initNPCAI () {
    npcCats.forEach(c => {
      c.ai = {
        task: 'idle',
        target: null,      // { x, z }
        timer: Math.random() * 8 + 2, // time before picking next task
        carryingPrey: false,
        walkSpeed: 2.5 + Math.random() * 1.5,
      };
    });
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
            // Pick a random task
            const roll = Math.random();
            if (roll < 0.25) {
              // Go patrol / walk around territory
              ai.task = 'patrol';
              const angle = Math.random() * Math.PI * 2;
              const dist = 15 + Math.random() * 30;
              ai.target = { x: Math.sin(angle) * dist, z: Math.cos(angle) * dist };
              ai.timer = 15 + Math.random() * 20;
            } else if (roll < 0.45) {
              // Go hunt (walk out, come back with prey)
              ai.task = 'hunt';
              const angle = Math.random() * Math.PI * 2;
              const dist = 25 + Math.random() * 40;
              ai.target = { x: Math.sin(angle) * dist, z: Math.cos(angle) * dist };
              ai.timer = 30;
              ai.carryingPrey = false;
            } else if (roll < 0.60) {
              // Go drink water
              ai.task = 'drink';
              ai.target = { x: WATER_SPOT.x + (Math.random()-0.5)*4, z: WATER_SPOT.z + (Math.random()-0.5)*4 };
              ai.timer = 20;
            } else if (roll < 0.75) {
              // Go rest in den
              ai.task = 'rest';
              const den = getDenForCat(c.name);
              ai.target = { x: den.x + (Math.random()-0.5)*2, z: den.z + (Math.random()-0.5)*2 };
              ai.timer = 12 + Math.random() * 10;
            } else {
              // Go eat at fresh-kill pile
              ai.task = 'eat';
              ai.target = { x: FRESH_KILL.x + (Math.random()-0.5)*2, z: FRESH_KILL.z + (Math.random()-0.5)*2 };
              ai.timer = 10;
            }
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
            }
          }
          if (ai.timer <= 0) { ai.task = 'idle'; ai.timer = 3 + Math.random() * 5; ai.target = null; }
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

    // Always animate tails, legs, fireflies regardless of state
    animateFireflies(time);
    animateTail(time);
    animateNPCTails(time);
    animateNPCLegs(dt);

    if (gameState === 'playing') {
      updatePlayer(dt);
      updateCamera();
      updateHUD();
      updateNPCAI(dt);
      checkStoryTriggers();
      checkTrainingProximity();
      updateFollowers(dt);
      gameTime += dt;
      // autosave every 15s
      if (Math.floor(time * 10) % 150 === 0 && storyPhase === 'playing') saveGame();
      if (Math.random() < 0.004) playSound('ambient');
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

  /* ====================================================
     PLAYER UPDATE
     ==================================================== */
  function updatePlayer (dt) {
    if (!player) return;
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
    if (moving) {
      const angle = Math.atan2(dx, dz) + cameraAngleY;
      const dir = GameLogic.normalizeDirection({ x: Math.sin(angle), z: Math.cos(angle) });
      let spd = player.speed;
      if (player.isSprinting && player.energy > 0) {
        spd = player.sprintSpeed;
        player = GameLogic.useEnergy(player, dt * 15);
      }
      const np = GameLogic.calculateMovement(player.position, dir, spd, dt);
      const cp = GameLogic.clampPosition(np, GameLogic.getForestBounds());
      if (!GameLogic.checkCollisions(cp, trees, 1.2)) {
        player.position = cp;
        const tr = Math.atan2(dir.x, dir.z);
        catGroup.rotation.y = lerpAngle(catGroup.rotation.y, tr, 0.15);
      }
      animateCatLegs(dt, true, spd / player.speed);
    } else {
      animateCatLegs(dt, false, 1);
    }

    if (!player.isSprinting) player = GameLogic.recoverEnergy(player, dt * 5);
    catGroup.position.set(player.position.x, 0, player.position.z);
  }

  function lerpAngle (a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function updateCamera () {
    const dist = 8, h = 3 + cameraAngleX * 5;
    const cx = player.position.x + Math.sin(cameraAngleY) * dist;
    const cz = player.position.z + Math.cos(cameraAngleY) * dist;
    camera.position.lerp(new THREE.Vector3(cx, h, cz), 0.08);
    camera.lookAt(new THREE.Vector3(player.position.x, 1.2, player.position.z));
  }

  function updateHUD () {
    healthBar.style.width = (player.health / player.maxHealth * 100) + '%';
    energyBar.style.width = (player.energy / player.maxEnergy * 100) + '%';
    locationText.textContent = GameLogic.getLocationName(player.position);
    updateInteractHint();
  }

  function updateInteractHint () {
    if (!player || gameState !== 'playing' || messageBox.classList.contains('visible')) {
      interactHint.classList.add('hidden');
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
      interactHint.classList.add('hidden');
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
