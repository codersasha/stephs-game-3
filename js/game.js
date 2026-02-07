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

  /* ---------- known cats ---------- */
  const knownCats = new Set(); // names of cats the player has been introduced to

  /* ---------- input ---------- */
  const keys = {};
  let cameraAngleY = 0, cameraAngleX = 0; // 0 = level, negative = look up, positive = look down
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
    'ShadowClan Patrol':  { base: 190, end: 140, dur: 0.48, type: 'sawtooth', vol: 0.11, vibrato: 2 }, // deep, menacing
    'RiverClan Warrior':  { base: 250, end: 190, dur: 0.40, type: 'triangle', vol: 0.10, vibrato: 3 }, // smooth, strong
    'RiverClan Patrol':   { base: 240, end: 180, dur: 0.42, type: 'triangle', vol: 0.10, vibrato: 3 }, // smooth, strong
    'WindClan Warrior':   { base: 350, end: 280, dur: 0.30, type: 'sine',     vol: 0.11, vibrato: 5 }, // quick, sharp
    'WindClan Patrol':    { base: 340, end: 270, dur: 0.32, type: 'sine',     vol: 0.11, vibrato: 5 }, // quick, sharp
    'WindClan Runner':    { base: 360, end: 290, dur: 0.28, type: 'sine',     vol: 0.10, vibrato: 6 }, // very quick
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
        case 'eat':
          // Happy munching sound
          osc.frequency.setValueAtTime(300, t); osc.type = 'triangle';
          osc.frequency.linearRampToValueAtTime(450, t + 0.1);
          osc.frequency.linearRampToValueAtTime(350, t + 0.2);
          osc.frequency.linearRampToValueAtTime(500, t + 0.3);
          gain.gain.setValueAtTime(0.08, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
          osc.start(); osc.stop(t + 0.35); break;
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
    // Bright, warm sky — Little Kitty Big City style
    scene.background = new THREE.Color(0.55, 0.78, 0.95);
    // Soft warm fog that fades into the sky (not oppressive dark fog)
    scene.fog = new THREE.Fog(0x8dc0e8, 60, 200);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 250);
    camera.position.set(0, 8, 14);
    camera.lookAt(0, 1, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Warm tone mapping for that cozy cartoon look
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.outputEncoding = THREE.sRGBEncoding;
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
    const groundMat = new THREE.MeshPhongMaterial({ color: 0x5aaa48, shininess: 3 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);

    /* camp clearing */
    const campGeo = new THREE.CircleGeometry(14, 32);
    const campMat = new THREE.MeshPhongMaterial({ color: 0x8a7a60, shininess: 2 });
    const camp = new THREE.Mesh(campGeo, campMat);
    camp.rotation.x = -Math.PI / 2; camp.position.y = 0.01;
    scene.add(camp);

    /* path */
    const pathGeo = new THREE.PlaneGeometry(3, 30);
    const pathMat = new THREE.MeshPhongMaterial({ color: 0x9a8a6a, shininess: 2 });
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
    const grassMat = new THREE.MeshPhongMaterial({ color: 0x5cb849, side: THREE.DoubleSide, shininess: 2 });
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
      const fc = fColors[Math.floor(Math.random() * fColors.length)];
      const fm = new THREE.MeshPhongMaterial({ color: fc, emissive: fc, emissiveIntensity: 0.08, shininess: 10 });
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), fm);
      f.position.set(fx, 0.15, fz);
      scene.add(f);
    }

    /* river */
    const riverGeo = new THREE.PlaneGeometry(8, 200, 1, 20);
    const riverMat = new THREE.MeshPhongMaterial({ color: 0x44aadd, transparent: true, opacity: 0.75, shininess: 60 });
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
    const denMat  = new THREE.MeshPhongMaterial({ color: 0x7c6a4e, shininess: 3 });
    const leafMat = new THREE.MeshPhongMaterial({ color: 0x3e7c2e, shininess: 5 });
    const mossMat = new THREE.MeshPhongMaterial({ color: 0x5a9a4a, shininess: 4 });
    const brambleMat = new THREE.MeshPhongMaterial({ color: 0x8b7a5a, shininess: 3 });

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
    // Cat flap (bigger and more visible so player can find it)
    const flapFrame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.08), trimMat);
    flapFrame.position.set(0, 0.7, -3.63); house.add(flapFrame);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.75, 0.03),
      new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 30 }));
    flap.position.set(0, 0.65, -3.66); house.add(flap);
    // Glowing indicator around cat flap so player can see it
    const flapGlow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.02),
      new THREE.MeshPhongMaterial({ color: 0xffcc44, emissive: 0xffaa00, emissiveIntensity: 0.4, transparent: true, opacity: 0.5 }));
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
    const bushMat = new THREE.MeshPhongMaterial({ color: 0x2d6b1e });
    [[-6, -3], [-6, 0], [-6, 2], [6, -3], [6, 0], [6, 2]].forEach(([bx, bz]) => {
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.8 + Math.random() * 0.3, 8, 6), bushMat);
      bush.position.set(bx, 0.6, bz); bush.scale.set(1, 0.7, 1);
      bush.castShadow = true; house.add(bush);
    });

    /* --- HOUSE INTERIOR (visible through the cat flap!) --- */
    const floorMat = new THREE.MeshPhongMaterial({ color: 0xc4a87a, shininess: 15 });
    const interiorWallMat = new THREE.MeshPhongMaterial({ color: 0xf5efe0, shininess: 5 });
    const carpetMat = new THREE.MeshPhongMaterial({ color: 0x884444, shininess: 3 });

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
    const counterMat = new THREE.MeshPhongMaterial({ color: 0x8B7355, shininess: 20 });
    const counterTopMat = new THREE.MeshPhongMaterial({ color: 0xd4d0c8, shininess: 40 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 0.8), counterMat);
    counter.position.set(-3.5, 1.25, 2.5); counter.castShadow = true; house.add(counter);
    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.08, 0.9), counterTopMat);
    counterTop.position.set(-3.5, 2.04, 2.5); house.add(counterTop);

    // Kitchen sink
    const sinkMat = new THREE.MeshPhongMaterial({ color: 0xcccccc, shininess: 60 });
    const sink = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.5), sinkMat);
    sink.position.set(-3.5, 2.08, 2.5); house.add(sink);
    // Faucet
    const faucetMat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, shininess: 80 });
    const faucetBase = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.4, 6), faucetMat);
    faucetBase.position.set(-3.5, 2.28, 2.2); house.add(faucetBase);
    const faucetSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 4), faucetMat);
    faucetSpout.position.set(-3.5, 2.48, 2.35); faucetSpout.rotation.z = Math.PI / 2; house.add(faucetSpout);

    // Fridge (tall white box)
    const fridgeMat = new THREE.MeshPhongMaterial({ color: 0xf0f0f0, shininess: 30 });
    const fridge = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3, 0.8), fridgeMat);
    fridge.position.set(-4.5, 2, 2.5); fridge.castShadow = true; house.add(fridge);
    const fridgeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.06), sinkMat);
    fridgeHandle.position.set(-4.1, 2.5, 2.1); house.add(fridgeHandle);

    // Kitchen cabinets on wall
    const cabinetMat = new THREE.MeshPhongMaterial({ color: 0x9B8465, shininess: 10 });
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
    const tableMat = new THREE.MeshPhongMaterial({ color: 0x6b4226, shininess: 15 });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.8), tableMat);
    tableTop.position.set(3.5, 0.75, 0.8); house.add(tableTop);
    // Table legs
    for (const [tx, tz] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 4), tableMat);
      leg.position.set(3.5 + tx, 0.4, 0.8 + tz); house.add(leg);
    }

    // TV / screen on front wall
    const tvMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 50 });
    const tv = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 0.08), tvMat);
    tv.position.set(3, 3.2, -3.0); house.add(tv);
    // TV screen glow
    const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.85),
      new THREE.MeshPhongMaterial({ color: 0x223355, emissive: 0x112233, emissiveIntensity: 0.4 }));
    tvScreen.position.set(3, 3.2, -2.95); house.add(tvScreen);

    // Bookshelf on left interior wall
    const shelfMat = new THREE.MeshPhongMaterial({ color: 0x7a5a38, shininess: 10 });
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
      new THREE.MeshPhongMaterial({ color: 0xee5533, shininess: 30 }));
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
    const bodyMat = new THREE.MeshPhongMaterial({ color: color, shininess: 40 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 4.0), bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    g.add(body);

    // Cabin / roof
    const cabinMat = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 60, opacity: 0.7, transparent: true });
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
    const lightMat = new THREE.MeshPhongMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.5 });
    const hlGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const hl1 = new THREE.Mesh(hlGeo, lightMat);
    hl1.position.set(-0.7, 0.7, 2.0 * dir);
    g.add(hl1);
    const hl2 = new THREE.Mesh(hlGeo, lightMat);
    hl2.position.set(0.7, 0.7, 2.0 * dir);
    g.add(hl2);

    // Taillights
    const tailMat = new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.3 });
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
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.type = 'sawtooth';
      const vol = Math.max(0.02, 0.12 - dist * 0.01);
      // Engine rumble → doppler whoosh
      osc.frequency.setValueAtTime(80, t);
      osc.frequency.linearRampToValueAtTime(120, t + 0.3);
      osc.frequency.linearRampToValueAtTime(60, t + 0.8);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.linearRampToValueAtTime(vol * 1.5, t + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      osc.start(); osc.stop(t + 1.0);
    } catch (e) {}
  }

  function playerHitByMonster (m) {
    // Take damage
    player.hp = Math.max(0, player.hp - 25);
    playSound('hurt');
    playSound('danger');

    // Knock player off the road (push them sideways)
    const knockDir = player.position.x > ROAD_X ? 1 : -1;
    player.position.x += knockDir * 5; // push 5 units off the road
    catGroup.position.x = player.position.x;

    // Flash screen red
    const flash = document.createElement('div');
    flash.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(255,0,0,0.5);z-index:9999;pointer-events:none;';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 300);

    if (player.hp <= 0) {
      // Player died!
      queueMessage('Narrator', 'A monster hit you on the Thunderpath! Everything goes dark...', () => {
        // Respawn at ThunderClan camp
        player.hp = player.maxHp;
        player.position = { x: 0, y: 0, z: 0 };
        catGroup.position.set(0, 0, 0);
        saveGame();
        queueMessage('Narrator', 'You wake up in camp. One of your nine lives has been used up...');
      });
    } else {
      queueMessage('Narrator', 'A MONSTER nearly crushed you! You scramble off the Thunderpath, battered and bruised. (-25 HP)');
    }
  }

  /* ====================================================
     TWOLEGS (humans in the house)
     ==================================================== */
  let twolegs = [];

  function createTwolegModel (color, height) {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshPhongMaterial({ color: 0xffcc99, shininess: 10 });
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
    const shoeMat = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 15 });
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
    const roadMat = new THREE.MeshPhongMaterial({ color: 0x555555, shininess: 5 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(7, 200), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(-58.5, 0.06, 0);
    scene.add(road);
    // Yellow center line
    const lineMat = new THREE.MeshPhongMaterial({ color: 0xcccc00 });
    const centerLine = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 200), lineMat);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(-58.5, 0.07, 0);
    scene.add(centerLine);
    // Dashed white edge lines
    for (let z = -95; z < 95; z += 6) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 3), new THREE.MeshPhongMaterial({ color: 0xffffff }));
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(-55.2, 0.07, z);
      scene.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 3), new THREE.MeshPhongMaterial({ color: 0xffffff }));
      dash2.rotation.x = -Math.PI / 2;
      dash2.position.set(-61.8, 0.07, z);
      scene.add(dash2);
    }
    const tpLabel = makeNameLabel('Thunderpath', 3.0);
    tpLabel.position.set(-58.5, 0, -10);
    scene.add(tpLabel);

    /* --- SUNNINGROCKS (large flat rocks near river) --- */
    const srMat = new THREE.MeshPhongMaterial({ color: 0xbbaa88 });
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
    const ftMat = new THREE.MeshPhongMaterial({ color: 0x4a3018 });
    const ftLeafMat = new THREE.MeshPhongMaterial({ color: 0x1a4a0e });
    const ftPositions = [[-42, -42], [-42, -48], [-48, -42], [-48, -48]];
    ftPositions.forEach(([fx, fz]) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 8, 8), ftMat);
      trunk.position.set(fx, 4, fz); trunk.castShadow = true; scene.add(trunk);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), ftLeafMat);
      canopy.position.set(fx, 9, fz); canopy.castShadow = true; scene.add(canopy);
    });
    // Hollow ground (slightly sunken)
    const hollowGeo = new THREE.CircleGeometry(8, 16);
    const hollowMat = new THREE.MeshPhongMaterial({ color: 0x4a3a28 });
    const hollow = new THREE.Mesh(hollowGeo, hollowMat);
    hollow.rotation.x = -Math.PI / 2; hollow.position.set(-45, 0.02, -45);
    scene.add(hollow);
    // Great Rock in the center
    const greatRock = new THREE.Mesh(new THREE.DodecahedronGeometry(2, 0),
      new THREE.MeshPhongMaterial({ color: 0x888888 }));
    greatRock.position.set(-45, 1, -45); greatRock.scale.set(1, 0.6, 1);
    greatRock.castShadow = true; scene.add(greatRock);
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
      color: 0xbbccff, emissive: 0x334488, specular: 0xffffff, shininess: 100,
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
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3*s, 0.5*s, 4*s, 8), new THREE.MeshPhongMaterial({ color: 0x7c5a3e, shininess: 3 }));
    trunk.position.y = 2*s; trunk.castShadow = true; g.add(trunk);
    // Vibrant, warm greens for leaves (cartoon style)
    const lc = new THREE.Color(0.20+Math.random()*0.12, 0.55+Math.random()*0.15, 0.15+Math.random()*0.1);
    const lm = new THREE.MeshPhongMaterial({ color: lc, shininess: 5 });
    [[0,5.5*s,0,2.5*s],[s,5*s,0.5*s,1.8*s],[-0.8*s,5*s,-0.5*s,1.6*s],[0.3*s,6*s,-0.4*s,1.5*s]].forEach(([x,y,z,r])=>{
      const l = new THREE.Mesh(new THREE.SphereGeometry(r,8,6), lm);
      l.position.set(x,y,z); l.castShadow = true; g.add(l);
    });
    return g;
  }

  function makePine (d) {
    const g = new THREE.Group(); const s = d.scale;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2*s, 0.35*s, 3*s, 6), new THREE.MeshPhongMaterial({ color: 0x6a4e34, shininess: 3 }));
    trunk.position.y = 1.5*s; trunk.castShadow = true; g.add(trunk);
    // Deep but vibrant greens for pine needles
    const lc = new THREE.Color(0.12+Math.random()*0.06, 0.40+Math.random()*0.12, 0.10+Math.random()*0.06);
    const lm = new THREE.MeshPhongMaterial({ color: lc, shininess: 4 });
    [[2.2*s,2.5*s,3*s],[1.7*s,2*s,5*s],[1.2*s,1.8*s,6.5*s]].forEach(([r,h,y])=>{
      const c = new THREE.Mesh(new THREE.ConeGeometry(r,h,8), lm);
      c.position.y = y; c.castShadow = true; g.add(c);
    });
    return g;
  }

  function makeRock (d) {
    const g = new THREE.Group(); const s = d.scale;
    const rm = new THREE.MeshPhongMaterial({ color: new THREE.Color(0.5+Math.random()*0.1, 0.48+Math.random()*0.1, 0.45), shininess: 5 });
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
    const rockMat = new THREE.MeshPhongMaterial({ color: 0x777777 });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.scale.set(1, 1.4, 0.9);
    rock.position.y = 1.5;
    rock.castShadow = true;
    highrock.add(rock);
    // flat top
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.3, 12), new THREE.MeshPhongMaterial({ color: 0x888888 }));
    top.position.y = 3.2;
    highrock.add(top);
    // steps
    const step = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), new THREE.MeshPhongMaterial({ color: 0x666666 }));
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

    /* --- body (capsule oriented head-to-tail along Z axis) --- */
    const bodyMat = new THREE.MeshPhongMaterial({ color: orange, shininess: 15 });
    const bodyMain = makeCapsuleMesh(0.20, 0.90, 12, 16, bodyMat);
    bodyMain.rotation.x = Math.PI / 2; // round ends face head (front) and tail (back)
    bodyMain.position.set(0, 0.58, 0); bodyMain.castShadow = true;
    catGroup.add(bodyMain);
    // belly (lighter, slightly below)
    const bellyMat = new THREE.MeshPhongMaterial({ color: cream, shininess: 10 });
    const belly = makeCapsuleMesh(0.15, 0.60, 8, 12, bellyMat);
    belly.rotation.x = Math.PI / 2; // same orientation as body
    belly.position.set(0, 0.49, 0.04);
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

    /* --- eyes (BIG cute eyes — Little Kitty Big City style!) --- */
    [[-1, 1],[1, 1]].forEach(([side]) => {
      const x = side * 0.13;
      // sclera (white of eye) — much bigger for cute cartoon look
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.10, 14, 12), new THREE.MeshPhongMaterial({ color: 0xf5fffa, shininess: 40 }));
      sclera.position.set(x, 0.90, 0.82); sclera.scale.set(1.15, 1.0, 0.55);
      catGroup.add(sclera);
      // iris (bright green, Rusty's signature eyes) — big and round
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.082, 14, 12), new THREE.MeshPhongMaterial({ color: 0x33dd44, shininess: 90, emissive: 0x0a1a0a }));
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
    const collarMat = new THREE.MeshPhongMaterial({ color: 0xcc2222, shininess: 40 });
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 20), collarMat);
    collar.position.set(0, 0.72, 0.45);
    collar.rotation.x = Math.PI / 2.2; // angled slightly to sit on neck
    catGroup.add(collar);
    // Bell on the collar
    const bellMat = new THREE.MeshPhongMaterial({ color: 0xffdd00, shininess: 90 });
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

    /* eyes (BIG cute cartoon eyes — LKBC style) */
    [[-1,1],[1,1]].forEach(([s]) => {
      const x = s * 0.12 * sz;
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.085 * sz, 10, 8), new THREE.MeshPhongMaterial({ color: 0xf5fffa, shininess: 40 }));
      sclera.position.set(x, 0.86 * sz, 0.72 * sz); sclera.scale.set(1.1, 0.95, 0.5); g.add(sclera);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.068 * sz, 10, 8), new THREE.MeshPhongMaterial({ color: eyeC, shininess: 70, emissive: 0x0a0a0a }));
      iris.position.set(x, 0.86 * sz, 0.74 * sz); iris.scale.set(0.95, 0.9, 0.42); g.add(iris);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035 * sz, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      pupil.position.set(x, 0.86 * sz, 0.76 * sz); pupil.scale.set(0.35, 0.85, 0.3); g.add(pupil);
      // Big white highlight
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.020 * sz, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl.position.set(x - s * 0.02 * sz, 0.89 * sz, 0.77 * sz); g.add(hl);
      // Small secondary highlight
      const hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.010 * sz, 4, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl2.position.set(x + s * 0.015 * sz, 0.84 * sz, 0.77 * sz); g.add(hl2);
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
  function createLighting () {
    // Bright warm ambient — like a sunny cartoon day
    scene.add(new THREE.AmbientLight(0xfff5e6, 0.65));

    // Main sun — warm golden light, high in the sky
    const sun = new THREE.DirectionalLight(0xffeedd, 1.1);
    sun.position.set(30, 50, 25); sun.castShadow = true;
    sun.shadow.mapSize.width = 2048; sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;  sun.shadow.camera.bottom = -40;
    sun.shadow.bias = -0.001;
    scene.add(sun);

    // Hemisphere light — bright sky blue above, warm grass green below
    // This is a huge part of the LKBC look: fills in shadows with color
    scene.add(new THREE.HemisphereLight(0x88ccff, 0x44aa44, 0.55));

    // Soft fill light from the other side (removes harsh shadows)
    const fill = new THREE.DirectionalLight(0xaaccff, 0.3);
    fill.position.set(-20, 15, -10);
    scene.add(fill);

    // Rim/back light — subtle warm glow to outline characters
    const rim = new THREE.DirectionalLight(0xffddaa, 0.2);
    rim.position.set(-10, 10, -30);
    scene.add(rim);
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

    // Left click: talk to cats (no pointer lock — cursor is always visible)
    renderer.domElement.addEventListener('click', (e) => {
      if (gameState === 'playing' && !isMobile) {
        tryTalkByRaycast(e.clientX, e.clientY);
      }
    });

    // Right-click drag: look around (camera control without hiding cursor)
    let isRightDragging = false;
    renderer.domElement.addEventListener('mousedown', (e) => {
      if (e.button === 2 && gameState === 'playing') { isRightDragging = true; }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 2) { isRightDragging = false; }
    });
    renderer.domElement.addEventListener('contextmenu', (e) => { e.preventDefault(); }); // prevent right-click menu
    document.addEventListener('mousemove', e => {
      if (isRightDragging) {
        cameraAngleY -= e.movementX * 0.003;
        cameraAngleX = Math.max(-1.2, Math.min(1.3, cameraAngleX + e.movementY * 0.003));
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

    // Touch camera — drag anywhere on the right side of the screen to look around
    // Uses right 60% of screen so tablets have plenty of room
    let touchCamId = null, ltx = 0, lty = 0;
    const camSensitivity = 0.004;

    renderer.domElement.addEventListener('touchstart', e => {
      if (gameState !== 'playing') return;
      for (const t of e.changedTouches) {
        // Try to talk to a cat by tapping on them
        if (tryTalkByRaycast(t.clientX, t.clientY)) return;
        // Right 60% of screen = camera drag zone (more room on tablet)
        if (t.clientX > window.innerWidth * 0.4) {
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
    // Bigger max joystick distance on tablets
    const joyMax = (window.innerWidth > 768) ? 60 : 40;

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

    // Dynamic dialogue for Smudge and Princess
    let line;
    if (npc.name === 'Smudge' || npc.name === 'Princess') {
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
    const data = loadGame(slot);
    if (data && data.player) {
      player = data.player;
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
          osc.connect(g); g.connect(audioCtx.destination);
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
      // --- PROLOGUE: The Battle ---
      { narration: true, text: '<strong>WARRIOR CATS: INTO THE WILD</strong><br><br><em>The Prophecy Begins...</em>',
        camPos: { x: 0, y: 25, z: 55 }, camLook: { x: 0, y: 0, z: 0 } },

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
    { id: 1, name: "Redtail's Death",        trigger: 'triggerRedtailEvent' },
    { id: 2, name: 'Journey to Mothermouth', trigger: 'triggerMothermouthJourney' },
    { id: 3, name: 'Yellowfang',             trigger: 'triggerYellowfangEncounter' },
    // Future chapters go here...
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
    switch (chapter.trigger) {
      case 'triggerRedtailEvent':           triggerRedtailEvent(); break;
      case 'triggerMothermouthJourney':      triggerMothermouthJourney(); break;
      case 'triggerYellowfangEncounter':     triggerYellowfangEncounter(); break;
      default: break;
    }
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
          player.position = { x: 0, y: 0, z: 0 };
          catGroup.position.set(0, 0, 0);
          player.health = Math.max(15, Math.floor(player.maxHealth * 0.3));
          startCutscene(s2, () => {
            gameState = 'playing';
            bp.spotted = false;
            bp.spotCooldown = 45;
            queueMessage('Narrator', 'You wake up back at ThunderClan camp, bruised but alive. Stay away from enemy borders!');
          });
        },
      });
    });
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

        // Check if all enemies are defeated
        const allDefeated = patrolBattleData.enemies.every(en => en.defeated);
        if (allDefeated) {
          // Won the entire patrol fight!
          addBattleLog('<strong>All ' + patrolBattleData.clan + ' patrol cats are defeated!</strong>', 'battle-log-fierce');
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

    // Position cats for the scene
    if (bs) { bs.group.visible = true; bs.group.position.set(-3, 3.3, -4); }
    if (tc) { tc.group.visible = true; tc.group.position.set(4, 0, -2); }
    if (gp) { gp.group.visible = true; gp.group.position.set(player.position.x + 2, 0, player.position.z); }

    const pName = player.name || 'apprentice';

    const scenes = [
      // Bluestar summons the player
      { speaker: 'Bluestar', text: '"' + pName + ', come here. I need to speak with you."',
        camPos: { x: -1, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.3, z: -4 } },

      { speaker: 'Bluestar', text: '"It is time for me to travel to Highstones and share tongues with StarClan at the Moonstone. I must seek their guidance."',
        camPos: { x: -2, y: 3, z: -2 }, camLook: { x: -3, y: 3.3, z: -4 } },

      { speaker: 'Bluestar', text: '"I have chosen you to come with me, ' + pName + '. It is a long journey — beyond WindClan\'s moorland to the cave called Mothermouth."',
        camPos: { x: 0, y: 3, z: -1 }, camLook: { x: -3, y: 3.3, z: -4 } },

      { speaker: 'Tigerclaw', text: '"Bluestar, I will join you. The moors are dangerous — WindClan has been driven out by ShadowClan. Who knows what lurks out there now."',
        camPos: { x: 5, y: 2, z: -1 }, camLook: { x: 4, y: 1, z: -2 } },

      { speaker: 'Bluestar', text: '"Very well, Tigerclaw. We leave at once. ' + pName + ', stay close and keep your eyes open."',
        camPos: { x: -1, y: 3, z: 0 }, camLook: { x: -3, y: 3, z: -4 } },

      // The journey begins — crossing the territory
      { narration: true, text: 'You set out from camp with Bluestar and Tigerclaw. The three of you slip through the forest, heading northwest toward WindClan territory.',
        camPos: { x: -20, y: 8, z: -20 }, camLook: { x: -40, y: 2, z: -50 } },

      { narration: true, text: 'The trees thin as you reach the edge of ThunderClan\'s forest. Ahead stretches the open moorland of WindClan — but it feels eerily empty.',
        camPos: { x: -30, y: 6, z: -55 }, camLook: { x: -50, y: 3, z: -70 } },

      { speaker: 'Tigerclaw', text: '"This territory stinks of ShadowClan. Brokenstar has driven WindClan out. Stay alert."',
        camPos: { x: -35, y: 3, z: -60 }, camLook: { x: -40, y: 2, z: -65 } },

      { narration: true, text: 'The wind howls across the barren moor. Without WindClan\'s patrols, the empty hills feel dangerous and exposed. You press on.',
        camPos: { x: -50, y: 10, z: -70 }, camLook: { x: -70, y: 3, z: -85 } },

      { speaker: 'Bluestar', text: '"The Moonstone lies deep inside Mothermouth, a cave in Highstones. Medicine cats and leaders come here to share tongues with StarClan."',
        camPos: { x: -60, y: 5, z: -80 }, camLook: { x: -80, y: 5, z: -90 } },

      // Arriving at Highstones
      { narration: true, text: 'At last, the rocky peaks of <strong>Highstones</strong> rise before you — jagged grey mountains cutting against the darkening sky.',
        camPos: { x: -65, y: 10, z: -85 }, camLook: { x: -80, y: 7, z: -97 } },

      { narration: true, text: 'A dark opening yawns in the rock face. This is <strong>Mothermouth</strong> — the entrance to the cave where the Moonstone lies.',
        camPos: { x: -78, y: 4, z: -90 }, camLook: { x: -80, y: 2, z: -94 } },

      { speaker: 'Bluestar', text: '"We must wait for moonrise. When the moon shines into the cave, the Moonstone glows with StarClan\'s light. You must not speak inside."',
        camPos: { x: -76, y: 3, z: -91 }, camLook: { x: -80, y: 2, z: -93 } },

      { speaker: 'Tigerclaw', text: '"I will stand guard here. Go. I have no need to enter."',
        camPos: { x: -75, y: 2.5, z: -90 }, camLook: { x: -76, y: 1, z: -92 } },

      // Inside the cave
      { narration: true, text: 'You follow Bluestar into the pitch-black tunnel. The stone is cold beneath your paws. The darkness presses in from all sides.',
        camPos: { x: -80, y: 2, z: -94 }, camLook: { x: -80, y: 1.5, z: -97 } },

      { narration: true, text: 'The tunnel opens into a vast underground cavern. In the center stands a great rock — the <strong>Moonstone</strong>.',
        camPos: { x: -80, y: 3, z: -95.5 }, camLook: { x: -80, y: 1.5, z: -97 } },

      { narration: true, text: 'A shaft of moonlight pierces through a hole in the roof. It strikes the Moonstone — and the crystal erupts in blazing silver-white light!',
        camPos: { x: -79, y: 2.5, z: -96 }, camLook: { x: -80, y: 1.5, z: -97 } },

      { narration: true, text: 'The light is blinding — like a frozen star fallen to earth. You can feel a strange power humming through your paws. This is the bridge between the living and the dead.',
        camPos: { x: -80, y: 2, z: -96.5 }, camLook: { x: -80, y: 1.5, z: -97 } },

      { narration: true, text: 'Bluestar crouches and presses her nose to the glowing stone. Her eyes close. She is sharing tongues with StarClan — the warrior ancestors.',
        camPos: { x: -81, y: 1.5, z: -96 }, camLook: { x: -80, y: 0.8, z: -97 } },

      { narration: true, text: 'You watch in awe. The silence is absolute. The Moonstone pulses gently, casting blue-white light across the cavern walls.',
        camPos: { x: -80, y: 3, z: -96 }, camLook: { x: -80, y: 1.5, z: -97 } },

      { narration: true, text: '<em>Fire alone will save our Clan...</em> The words drift through your mind unbidden. Is StarClan speaking to you too?',
        camPos: { x: -80, y: 2, z: -96.5 }, camLook: { x: -80, y: 1.5, z: -97 } },

      // Bluestar wakes
      { narration: true, text: 'After what feels like an eternity, Bluestar stirs. The moonlight fades. The Moonstone dims to ordinary grey rock.',
        camPos: { x: -79, y: 2.5, z: -96 }, camLook: { x: -80, y: 1, z: -97 } },

      { speaker: 'Bluestar', text: '"It is done. StarClan has spoken to me... but their message was unclear. They showed me fire and shadow, locked in battle."',
        camPos: { x: -81, y: 2, z: -95 }, camLook: { x: -80, y: 1.5, z: -96 } },

      { speaker: 'Bluestar', text: '"Come, ' + pName + '. We must return before dawn."',
        camPos: { x: -80, y: 2, z: -94 }, camLook: { x: -80, y: 1.5, z: -93 } },

      // The return — the rat attack
      { narration: true, text: 'You emerge from Mothermouth into the cold night air. Tigerclaw is waiting, his amber eyes gleaming.',
        camPos: { x: -77, y: 3, z: -91 }, camLook: { x: -76, y: 1, z: -92 } },

      { narration: true, text: 'On the return journey, you pass near an old Twoleg barn. A musty, foul smell hangs in the air.',
        camPos: { x: -60, y: 5, z: -75 }, camLook: { x: -55, y: 2, z: -70 } },

      { speaker: 'Tigerclaw', text: '"Rats! Be on your guard!"',
        camPos: { x: -55, y: 3, z: -72 }, camLook: { x: -50, y: 1, z: -70 } },

      { narration: true, text: 'A swarm of rats pours from the barn! Dozens of them, their eyes gleaming red in the darkness. They attack without fear!',
        camPos: { x: -52, y: 3, z: -70 }, camLook: { x: -50, y: 1, z: -68 } },

      { narration: true, text: 'You fight desperately alongside Bluestar and Tigerclaw. The rats bite and scratch, coming in wave after wave. There are too many!',
        camPos: { x: -50, y: 4, z: -69 }, camLook: { x: -52, y: 1, z: -71 } },

      { narration: true, text: 'A huge rat sinks its teeth into Bluestar\'s shoulder. She yowls in pain and stumbles! Tigerclaw tears it away with a vicious swipe.',
        camPos: { x: -53, y: 2, z: -70 }, camLook: { x: -55, y: 0.8, z: -71 } },

      { narration: true, text: 'A tabby barn cat suddenly appears from the shadows, helping to drive the rats back. "Run! Get out of here!" he yowls.',
        camPos: { x: -48, y: 3, z: -68 }, camLook: { x: -50, y: 1.5, z: -70 } },

      { narration: true, text: 'The three of you break free and flee. Bluestar is badly wounded — she staggers, her breathing labored.',
        camPos: { x: -40, y: 4, z: -60 }, camLook: { x: -45, y: 1, z: -65 } },

      { speaker: 'Tigerclaw', text: '"Bluestar! Can you walk? We must keep moving."',
        camPos: { x: -38, y: 2.5, z: -58 }, camLook: { x: -40, y: 1.5, z: -60 } },

      { narration: true, text: 'Bluestar stumbles and falls. Her body goes still... then, after a terrible moment, she draws a shuddering breath. She\'s alive — but barely.',
        camPos: { x: -38, y: 2, z: -57 }, camLook: { x: -40, y: 0.5, z: -59 } },

      { narration: true, text: '<em>You realize with horror: Bluestar just lost a life.</em> Leaders have nine lives given by StarClan — but they are not limitless.',
        camPos: { x: -35, y: 3, z: -55 }, camLook: { x: -38, y: 1, z: -58 } },

      { speaker: 'Bluestar', text: '"I... I am alright, ' + pName + '. StarClan has returned me. But I have fewer lives now. We must be more careful."',
        camPos: { x: -37, y: 2, z: -56 }, camLook: { x: -40, y: 1, z: -58 } },

      // Return to camp
      { narration: true, text: 'Slowly, painfully, you help Bluestar back through WindClan\'s empty territory and into ThunderClan\'s forest. Dawn is breaking.',
        camPos: { x: -15, y: 8, z: -30 }, camLook: { x: 0, y: 2, z: 0 } },

      { narration: true, text: 'You reach ThunderClan camp just as the sun rises. Spottedleaf rushes to tend Bluestar\'s wounds.',
        camPos: { x: 2, y: 4, z: 10 }, camLook: { x: 0, y: 1, z: 0 } },

      { speaker: 'Spottedleaf', text: '"Bluestar! What happened? These wounds..."',
        camPos: { x: -9, y: 2, z: 5 }, camLook: { x: -10, y: 1, z: 3 } },

      { speaker: 'Bluestar', text: '"Rats... near the barn on the way back from Highstones. We were outnumbered."',
        camPos: { x: -8, y: 2, z: 4 }, camLook: { x: -10, y: 1.5, z: 3 } },

      { speaker: 'Graypaw', text: '"' + pName + '! You went to the Moonstone?! What was it like? Tell me everything!"',
        camPos: { x: 3, y: 2, z: 4 }, camLook: { x: 2, y: 1, z: 5 } },

      { narration: true, text: 'You tell Graypaw about the shining Moonstone, the dark tunnels, and the terrible rat attack. His eyes grow wide.',
        camPos: { x: 3, y: 2, z: 5 }, camLook: { x: 1, y: 1, z: 3 } },

      { speaker: 'Graypaw', text: '"Wow... you\'re so brave, ' + pName + '! I can\'t believe Bluestar lost a life though... that\'s really scary."',
        camPos: { x: 3, y: 2, z: 4 }, camLook: { x: 2, y: 1, z: 5 } },

      { narration: true, text: 'Tigerclaw says nothing. He watches Bluestar being carried into the medicine den. His amber eyes are unreadable.',
        camPos: { x: 5, y: 2.5, z: -3 }, camLook: { x: 6, y: 1.2, z: -4 } },

      { narration: true, text: '<em>Fire alone will save our Clan.</em> The prophecy burns in your mind. Bluestar grows weaker. ShadowClan grows bolder. The Clan needs you now more than ever.',
        camPos: { x: 0, y: 6, z: 5 }, camLook: { x: 0, y: 2, z: 0 } },
    ];

    startCutscene(scenes, () => {
      gameState = 'playing';
      mothermouthTriggered = true;
      // Bluestar rests in medicine den
      if (bs) { bs.group.position.set(-9, 0, 5); }
      if (tc) { tc.group.position.set(6, 0, -3); }
      if (gp) { gp.group.position.set(3, 0, 4); }
      player.position = { x: 2, y: 0, z: 3 };
      catGroup.position.set(2, 0, 3);
      placeCatsInCamp();
      saveGame();
      queueMessage('Narrator', 'Bluestar rests in the medicine den. The journey to Mothermouth has changed you. You\'ve seen the Moonstone — and witnessed a leader\'s mortality. Explore freely, and press "Next Chapter" when you\'re ready.');
      showNextChapterButton();
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

    const scenes = [
      { narration: true, text: 'While hunting near the ShadowClan border, you catch a strange scent — not ThunderClan, not ShadowClan either...',
        camPos: { x: -36, y: 3, z: 18 }, camLook: { x: -42, y: 1, z: 15 } },

      { narration: true, text: 'You push through the undergrowth and find a scraggly, battle-scarred she-cat lying on the ground. Her dark gray fur is matted and she looks exhausted.',
        camPos: { x: -40, y: 2, z: 17 }, camLook: { x: -42, y: 0.5, z: 15 } },

      { speaker: '???', text: '"What are you staring at, kittypet? Never seen a real warrior before?"',
        camPos: { x: -41, y: 1.5, z: 16 }, camLook: { x: -42, y: 0.8, z: 15 } },

      { speaker: pName, text: '"I\'m not a kittypet! I\'m ' + pName + ' of ThunderClan. Who are you? You\'re injured..."',
        camPos: { x: -39, y: 1.5, z: 16 }, camLook: { x: -38, y: 1, z: 15 } },

      { speaker: '???', text: '"Hmph. ThunderClan. I don\'t need your help, youngster. Leave me be."',
        camPos: { x: -41, y: 1.5, z: 14 }, camLook: { x: -42, y: 0.8, z: 15 } },

      { narration: true, text: 'But you can see she\'s badly hurt. Her flank has deep claw marks, and she hasn\'t eaten in days. Something about her feels... important.',
        camPos: { x: -40, y: 2, z: 13 }, camLook: { x: -42, y: 0.5, z: 15 } },

      { speaker: pName, text: '"You need help. At least let me bring you some prey."',
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

      { speaker: pName, text: '"This is Yellowfang, a former ShadowClan medicine cat. Brokenstar drove her out. She\'s hurt and needs help."',
        camPos: { x: 1, y: 1.5, z: 2 }, camLook: { x: -3, y: 3.3, z: -4 } },

      { speaker: 'Bluestar', text: '"A medicine cat... exiled by Brokenstar? This is troubling news indeed. Very well — Yellowfang may stay, for now. ' + pName + ', you are responsible for her. Make sure she is fed and her wounds are tended."',
        camPos: { x: -2, y: 3.5, z: -1 }, camLook: { x: -3, y: 3.3, z: -4 } },

      { speaker: 'Yellowfang', text: '"Don\'t expect me to be grateful, kit. But... thank you."',
        camPos: { x: -8, y: 1.5, z: 4 }, camLook: { x: -9, y: 1, z: 3 } },

      { narration: true, text: 'Yellowfang settles into the medicine den. Though grumpy, she begins to share her vast knowledge of herbs and healing. The Clan watches her carefully, but ' + pName + ' senses she can be trusted.',
        camPos: { x: -7, y: 3, z: 6 }, camLook: { x: -9, y: 1, z: 3 } },

      { narration: true, text: '<em>Yellowfang has joined ThunderClan as your responsibility. She stays in the medicine den and will help with healing. Explore the territory freely!</em>',
        camPos: { x: 0, y: 8, z: 12 }, camLook: { x: 0, y: 2, z: 0 } },
    ];

    revealCatName('Yellowfang');

    startCutscene(scenes, () => {
      gameState = 'playing';
      // Yellowfang now stays in medicine den
      if (yf) {
        yf.group.visible = true;
        yf.group.position.set(-9, 0, 3);
        // Set her AI to medicine cat role
        if (yf.ai) {
          yf.ai.role = 'medicine';
          yf.ai.task = 'idle';
          yf.ai.timer = 5;
          yf.ai.home = { x: -9, z: 3 };
        }
      }
      // Remove Yellowfang from HIDDEN_UNTIL_STORY
      placeCatsInCamp();
      saveGame();
      queueMessage('Narrator', 'Yellowfang has settled into the medicine den. You can talk to her anytime. Keep exploring the territory!');
      // Show next chapter if there is one
      if (storyChapter < STORY_CHAPTERS.length) {
        showNextChapterButton();
      }
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
    };

    // Show the battle screen (hide patrol enemy selector if it was open)
    battleScreen.classList.remove('hidden');
    document.getElementById('battle-enemy-selector').classList.add('hidden');
    patrolBattleData = null; // clear any patrol battle data
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
      else {
        gameState = 'playing';
      }
      saveGame();
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
          'Ravenpaw', 'Spottedleaf', 'Tigerclaw'
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
          c.group.position.set(-9, 0, 3); // medicine den
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
  };

  // Assign rank-based dens (kittypets get the Twoleg house as their "den")
  const TWOLEG_HOUSE_SPOT = { x: 0, z: 83 };

  function getDenForCat (name) {
    if (KITTYPET_NAMES.includes(name)) return TWOLEG_HOUSE_SPOT;
    const apprentices = ['Graypaw', 'Dustpaw', 'Sandpaw', 'Ravenpaw'];
    if (apprentices.includes(name)) return DEN_SPOTS['Apprentices'];
    if (name === 'Bluestar') return DEN_SPOTS['Leader'];
    if (name === 'Spottedleaf') return DEN_SPOTS['Medicine'];
    if (name === 'Yellowfang') return DEN_SPOTS['Elders'];
    return DEN_SPOTS['Warriors'];
  }

  /**
   * Cat behavior roles:
   * - 'leader':      stays in den mostly, walks around camp to talk, NEVER leaves camp
   * - 'medicine':    stays in medicine den mostly, walks around camp, NEVER leaves camp
   * - 'warrior':     hunts, patrols borders, drinks, eats, rests — goes far out
   * - 'apprentice':  hunts, patrols (shorter range), drinks, eats, trains
   * - 'elder':       stays near camp, eats, drinks, rests
   * - 'kittypet':    stays near Twoleg house
   */
  function getCatRole (name) {
    if (name === 'Bluestar') return 'leader';
    if (name === 'Spottedleaf') return 'medicine';
    if (name === 'Yellowfang') return 'elder';
    if (name === 'Smudge' || name === 'Princess') return 'kittypet';
    if (['Graypaw', 'Dustpaw', 'Sandpaw', 'Ravenpaw'].includes(name)) return 'apprentice';
    return 'warrior'; // Lionheart, Whitestorm, Tigerclaw, Mousefur, Darkstripe, Longtail
  }

  function initNPCAI () {
    npcCats.forEach(c => {
      const role = getCatRole(c.name);
      c.ai = {
        task: 'idle',
        target: null,
        timer: Math.random() * 6 + 2,
        carryingPrey: false,
        walkSpeed: role === 'apprentice' ? 3.0 + Math.random() : (role === 'elder' ? 1.8 : 2.5 + Math.random() * 1.5),
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

    // --- ELDER (Yellowfang): stays in camp, eats, drinks, rests ---
    if (role === 'elder') {
      if (roll < 0.40) {
        ai.task = 'rest';
        ai.target = { x: DEN_SPOTS['Elders'].x + (Math.random()-0.5)*2, z: DEN_SPOTS['Elders'].z + (Math.random()-0.5)*2 };
        ai.timer = 15 + Math.random() * 15;
      } else if (roll < 0.60) {
        ai.task = 'eat';
        ai.target = { x: FRESH_KILL.x + (Math.random()-0.5)*2, z: FRESH_KILL.z + (Math.random()-0.5)*1 };
        ai.timer = 10;
      } else if (roll < 0.80) {
        // Walk around camp slowly
        ai.task = 'patrol';
        const angle = Math.random() * Math.PI * 2;
        const dist = 3 + Math.random() * 6;
        ai.target = { x: Math.sin(angle) * dist, z: Math.cos(angle) * dist };
        ai.timer = 10;
      } else {
        ai.task = 'drink';
        ai.target = { x: WATER_SPOT.x + (Math.random()-0.5)*4, z: WATER_SPOT.z + (Math.random()-0.5)*4 };
        ai.timer = 15;
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
      updateBorderPatrols(dt);
      updateTwolegs(dt);
      updateMonsters(dt);
      checkStoryTriggers();
      checkTrainingProximity();
      updateFollowers(dt);
      gameTime += dt;
      // autosave every 15 seconds during gameplay
      autoSaveTimer += dt;
      if (autoSaveTimer >= 15) {
        autoSaveTimer = 0;
        saveGame();
      }
      if (Math.random() < 0.004) playSound('ambient');
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

    // First-person: cat always faces where camera looks (cameraAngleY)
    catGroup.rotation.y = cameraAngleY + Math.PI;

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
      if (!GameLogic.checkCollisions(cp, trees, 1.2) && !checkWallCollision(cp)) {
        player.position = cp;
      }
      animateCatLegs(dt, true, spd / player.speed);
    } else {
      animateCatLegs(dt, false, 1);
    }

    // Out of bounds warning
    if (outOfBoundsWarningTimer > 0) outOfBoundsWarningTimer -= dt;
    if (GameLogic.isOutOfBounds(player.position) && outOfBoundsWarningTimer <= 0) {
      outOfBoundsWarningTimer = 8; // only warn every 8 seconds
      queueMessage('Narrator', '"You\'ve reached the edge of the known territories. There\'s nothing but empty land beyond here. Be careful — if you wander too far, you might never find your way back! Turn around and head home."');
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
    const camY = eyeHeight;

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
