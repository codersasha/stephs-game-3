/* ========================================
   Warrior Cats: Into the Wild - Main Game
   ======================================== */
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

  /* ---------- state ---------- */
  // loading | title | saves | cutscene | naming | ceremony | playing
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
  let npcCats = [];             // { group, data }
  let trees = [], rocks = [];
  let treeObjects = [], rockObjects = [];

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
    setTimeout(() => {
      loadingScreen.classList.add('hidden');
      titleScreen.classList.remove('hidden');
      gameState = 'title';
      addTitleFireflies();
    }, 400);

    clock = new THREE.Clock();
    animate();
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

    // Walls
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xddccaa });
    const wallFront = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.3), wallMat);
    wallFront.position.set(0, 2.5, -3); wallFront.castShadow = true;
    house.add(wallFront);
    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.3), wallMat);
    wallBack.position.set(0, 2.5, 3); wallBack.castShadow = true;
    house.add(wallBack);
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 6), wallMat);
    wallLeft.position.set(-5, 2.5, 0); wallLeft.castShadow = true;
    house.add(wallLeft);
    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 6), wallMat);
    wallRight.position.set(5, 2.5, 0); wallRight.castShadow = true;
    house.add(wallRight);

    // Roof
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x884422 });
    const roofLeft = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 11), roofMat);
    roofLeft.position.set(-2.5, 6.2, 0); roofLeft.rotation.z = 0.6; roofLeft.castShadow = true;
    house.add(roofLeft);
    const roofRight = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 11), roofMat);
    roofRight.position.set(2.5, 6.2, 0); roofRight.rotation.z = -0.6; roofRight.castShadow = true;
    house.add(roofRight);

    // Door (dark rectangle)
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3), new THREE.MeshLambertMaterial({ color: 0x553311 }));
    door.position.set(0, 1.5, -3.01);
    house.add(door);

    // Windows (light blue)
    const winMat = new THREE.MeshLambertMaterial({ color: 0xaaddff, emissive: 0x334455 });
    const win1 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.2), winMat);
    win1.position.set(-3, 3.2, -3.01);
    house.add(win1);
    const win2 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.2), winMat);
    win2.position.set(3, 3.2, -3.01);
    house.add(win2);

    // Cat flap at the bottom of the door
    const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4), new THREE.MeshLambertMaterial({ color: 0x332211 }));
    flap.position.set(0, 0.25, -3.02);
    house.add(flap);

    // Garden (lighter green ground)
    const garden = new THREE.Mesh(
      new THREE.CircleGeometry(8, 16),
      new THREE.MeshLambertMaterial({ color: 0x55aa44 })
    );
    garden.rotation.x = -Math.PI / 2; garden.position.set(0, 0.01, -5);
    house.add(garden);

    // Cat bed (cozy circle)
    const bed = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.2, 8, 12),
      new THREE.MeshLambertMaterial({ color: 0xcc4444 })
    );
    bed.rotation.x = -Math.PI / 2; bed.position.set(2, 0.1, -2);
    house.add(bed);
    // bed cushion
    const cushion = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 8),
      new THREE.MeshLambertMaterial({ color: 0xddaa88 })
    );
    cushion.rotation.x = -Math.PI / 2; cushion.position.set(2, 0.12, -2);
    house.add(cushion);

    // Food bowl
    const bowl = new THREE.Mesh(
      new THREE.TorusGeometry(0.25, 0.08, 8, 10),
      new THREE.MeshLambertMaterial({ color: 0x4488cc })
    );
    bowl.rotation.x = -Math.PI / 2; bowl.position.set(-2, 0.08, -1);
    house.add(bowl);

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
    const bodyMain = makeCapsuleMesh(0.38, 0.85, 12, 16, bodyMat);
    bodyMain.rotation.z = Math.PI / 2; bodyMain.position.set(0, 0.65, 0); bodyMain.castShadow = true;
    catGroup.add(bodyMain);
    // belly (lighter, slightly below)
    const bellyMat = new THREE.MeshPhongMaterial({ color: cream, shininess: 10 });
    const belly = makeCapsuleMesh(0.30, 0.6, 8, 12, bellyMat);
    belly.rotation.z = Math.PI / 2; belly.position.set(0, 0.52, 0.05);
    catGroup.add(belly);

    /* --- head --- */
    const headMat = new THREE.MeshPhongMaterial({ color: orange, shininess: 20 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), headMat);
    head.position.set(0, 0.88, 0.60); head.scale.set(1, 0.92, 1.08); head.castShadow = true;
    catGroup.add(head);
    // cheeks
    const cheekMat = new THREE.MeshPhongMaterial({ color: lightOrange, shininess: 10 });
    [[-0.18, 0.82, 0.72],[0.18, 0.82, 0.72]].forEach(([x,y,z])=>{
      const ch = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), cheekMat);
      ch.position.set(x,y,z); catGroup.add(ch);
    });
    // chin
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshPhongMaterial({ color: white }));
    chin.position.set(0, 0.74, 0.72); catGroup.add(chin);
    // muzzle
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshPhongMaterial({ color: cream }));
    muzzle.position.set(0, 0.80, 0.82); muzzle.scale.set(1.1, 0.7, 0.8); catGroup.add(muzzle);

    /* --- ears (triangular with inner pink) --- */
    const earMat = new THREE.MeshPhongMaterial({ color: orange });
    const earInnerMat = new THREE.MeshPhongMaterial({ color: pink });
    [[-1, 1],[1, 1]].forEach(([side]) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.24, 4), earMat);
      ear.position.set(side * 0.17, 1.15, 0.58); ear.rotation.z = side * 0.25; ear.castShadow = true;
      catGroup.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 4), earInnerMat);
      inner.position.set(side * 0.17, 1.13, 0.60); inner.rotation.z = side * 0.25;
      catGroup.add(inner);
      // fur tuft
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 3), new THREE.MeshPhongMaterial({ color: lightOrange }));
      tuft.position.set(side * 0.17, 1.27, 0.58);
      catGroup.add(tuft);
    });

    /* --- eyes (detailed: sclera, iris, pupil, highlight) --- */
    [[-1, 1],[1, 1]].forEach(([side]) => {
      const x = side * 0.13;
      // sclera
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 8), new THREE.MeshPhongMaterial({ color: 0xeeffee }));
      sclera.position.set(x, 0.92, 0.84); sclera.scale.set(1, 0.85, 0.6);
      catGroup.add(sclera);
      // iris (bright green)
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), new THREE.MeshPhongMaterial({ color: 0x33dd33, shininess: 60 }));
      iris.position.set(x, 0.92, 0.87); iris.scale.set(1, 0.85, 0.5);
      catGroup.add(iris);
      // pupil
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      pupil.position.set(x, 0.92, 0.90);
      catGroup.add(pupil);
      // specular highlight
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl.position.set(x - side * 0.02, 0.94, 0.91);
      catGroup.add(hl);
    });

    /* --- nose --- */
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshPhongMaterial({ color: pink, shininess: 50 }));
    nose.position.set(0, 0.84, 0.92); nose.scale.set(1.3, 0.7, 0.7);
    catGroup.add(nose);

    /* --- whiskers (thin cylinders) --- */
    const whiskerMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
    [[-1,1],[1,1]].forEach(([side])=>{
      for (let w = 0; w < 3; w++) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, 0.4, 3), whiskerMat);
        wh.rotation.z = side * (0.15 + w * 0.12);
        wh.rotation.x = -0.1 + w * 0.1;
        wh.position.set(side * 0.25, 0.82 - w * 0.02, 0.82);
        catGroup.add(wh);
      }
    });

    /* --- legs (four, with joints and paws) --- */
    const legMat = new THREE.MeshPhongMaterial({ color: orange });
    const pawMat = new THREE.MeshPhongMaterial({ color: white });
    const padMat = new THREE.MeshPhongMaterial({ color: pink });
    const legPositions = [
      [-0.20, 0.22, 0.32], [0.20, 0.22, 0.32],
      [-0.20, 0.22, -0.32],[0.20, 0.22, -0.32]
    ];
    catGroup.legs = [];
    legPositions.forEach(([x, y, z]) => {
      // upper leg
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.42, 8), legMat);
      leg.position.set(x, y, z); leg.castShadow = true;
      catGroup.add(leg); catGroup.legs.push(leg);
      // paw
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), pawMat);
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

    /* --- tail (curved, many segments) --- */
    const tailMat = new THREE.MeshPhongMaterial({ color: orange });
    catGroup.tailSegs = [];
    for (let i = 0; i < 8; i++) {
      const radius = 0.065 - i * 0.005;
      const seg = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.02, radius), 6, 4), tailMat);
      seg.position.set(0, 0.55 + i * 0.1, -0.48 - i * 0.1);
      catGroup.add(seg);
      catGroup.tailSegs.push(seg);
    }
    // tail tip (white)
    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshPhongMaterial({ color: darkOrange }));
    tailTip.position.set(0, 1.35, -1.28);
    catGroup.add(tailTip);
    catGroup.tailSegs.push(tailTip);

    /* --- chest patch --- */
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshPhongMaterial({ color: cream }));
    chest.position.set(0, 0.58, 0.38); chest.scale.set(0.7, 0.8, 0.5);
    catGroup.add(chest);

    /* --- tabby stripes --- */
    const stripeMat = new THREE.MeshPhongMaterial({ color: darkOrange });
    for (let i = 0; i < 5; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.015, 0.06), stripeMat);
      stripe.position.set(0, 0.96, 0.15 - i * 0.15);
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
  function makeNameLabel (name, yOffset) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    // background pill (with fallback for older browsers)
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(8, 8, 240, 48, 12);
    } else {
      // manual rounded rect fallback
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
    ctx.fillStyle = '#ffe0a0';
    ctx.fillText(name, 128, 34);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.0, 0.5, 1);
    sprite.position.set(0, yOffset || 1.6, 0);
    sprite.renderOrder = 999;
    return sprite;
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

    /* name label */
    const label = makeNameLabel(desc.name, 1.45 * sz);
    g.add(label);

    g.position.set(px, 0, pz);
    g.visible = false;
    scene.add(g);
    return { group: g, name: desc.name, data: desc };
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
    });
    window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; keys[e.code] = false; });

    renderer.domElement.addEventListener('click', () => {
      if (gameState === 'playing' && !isMobile) renderer.domElement.requestPointerLock();
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
      for (const t of e.changedTouches) { if (t.clientX > window.innerWidth * 0.5) { touchCamId = t.identifier; ltx = t.clientX; lty = t.clientY; } }
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
    bAction.addEventListener('touchstart', e => { e.preventDefault(); initAudio(); playSound('meow'); });
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

  function advanceCutscene () {
    cutsceneQueue.shift();
    showCutsceneSlide();
  }

  /* ====================================================
     OPENING CUTSCENE  (Into the Wild intro)
     ==================================================== */
  function startOpeningCutscene () {
    // The intro: Rusty dreams about the forest, wakes up at home
    const scenes = [
      { narration: true, text: '<strong>WARRIOR CATS: INTO THE WILD</strong>',
        camPos: { x: 0, y: 12, z: 90 }, camLook: { x: 0, y: 2, z: 60 } },
      { narration: true, text: 'The forest stretches beyond the garden fence, dark and full of mystery...',
        camPos: { x: 0, y: 6, z: 85 }, camLook: { x: 0, y: 2, z: 40 } },
      { narration: true, text: 'You are <strong>Rusty</strong>, a young ginger house cat who lives with your Twolegs. But every night you dream of something more...',
        camPos: { x: 3, y: 3, z: 84 }, camLook: { x: 0, y: 1, z: 82 } },
      { narration: true, text: 'The rustling of leaves, the scent of prey on the wind... something in the forest is calling to you.',
        camPos: { x: -5, y: 4, z: 75 }, camLook: { x: 0, y: 1, z: 50 } },
      { narration: true, text: 'Tonight, you\'ve decided. You will leave the garden, cross the fence, and explore the wild forest beyond.',
        camPos: { x: 0, y: 3, z: 72 }, camLook: { x: 0, y: 1, z: 68 } },
      { narration: true, text: '<em>Walk to the garden fence and cross into the forest...</em>',
        camPos: { x: 2, y: 2, z: 82 }, camLook: { x: 0, y: 0.5, z: 80 } },
    ];
    startCutscene(scenes, () => {
      // After intro cutscene → player starts at the Twoleg house, can walk around
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
      { narration: true, text: 'A gray cat leaps out of the ferns and lands right in front of you!',
        camPos: { x: player.position.x + 3, y: 2, z: player.position.z - 3 },
        camLook: { x: player.position.x + 1, y: 1, z: player.position.z - 4 } },
      { speaker: 'Graypaw', text: '"Hey! What are you doing here, kittypet? This is ThunderClan territory!"' },
      { speaker: 'Graypaw', text: '"You smell like Twoleg food! You don\'t belong here! Let\'s see if you can fight like a real cat!"' },
    ];
    startCutscene(scenes, () => {
      // After dialogue → start the fight!
      startGraypawFight();
    });
  }

  function startGraypawFight () {
    gameState = 'cutscene';
    // Simple turn-based fight with Graypaw
    let playerHP = player.health;
    let grayHP = 60;
    const maxGrayHP = 60;

    function fightRound () {
      // Player attacks
      const pDmg = 10 + Math.floor(Math.random() * 10);
      grayHP = Math.max(0, grayHP - pDmg);

      const hitText = 'You swipe at Graypaw! (-' + pDmg + ' damage) Graypaw HP: ' + grayHP + '/' + maxGrayHP;

      if (grayHP <= 20) {
        // Graypaw gives up
        const scenes = [
          { narration: true, text: hitText },
          { speaker: 'Graypaw', text: '"Okay, okay! You\'re pretty good for a kittypet! I give up!"' },
          { speaker: 'Graypaw', text: '"I\'m Graypaw, by the way. You know, you fight pretty well. Most kittypets just run away screaming."' },
          { narration: true, text: 'Graypaw sits up and shakes his thick gray fur, looking at you with new respect.' },
          { speaker: 'Graypaw', text: '"Hey, do you want to see something cool? Follow me deeper into the forest - but be careful, there might be a patrol around."' },
        ];
        startCutscene(scenes, () => {
          storyPhase = 'fought_graypaw';
          gameState = 'playing';
          // Graypaw follows nearby
          const gp = npcCats.find(c => c.name === 'Graypaw');
          if (gp) {
            gp.group.position.set(player.position.x + 1.5, 0, player.position.z - 1);
          }
          queueMessage('Narrator', 'Graypaw seems friendly now. Keep walking deeper into the forest...');
        });
        return;
      }

      // Graypaw attacks back
      const gDmg = 5 + Math.floor(Math.random() * 8);
      playerHP = Math.max(10, playerHP - gDmg); // don't let player die in tutorial
      player.health = playerHP;

      const grayText = 'Graypaw swipes back! (-' + gDmg + ' damage) Your HP: ' + playerHP + '/' + player.maxHealth;

      const scenes = [
        { narration: true, text: hitText },
        { narration: true, text: grayText },
        { narration: true, text: '<em>Press Space/tap to attack again!</em>' },
      ];
      startCutscene(scenes, () => {
        fightRound(); // next round
      });
    }

    fightRound();
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
      { speaker: 'Lionheart', text: '"Graypaw! What is going on here? Who is this kittypet?"' },
      { speaker: 'Graypaw', text: '"We were just... um... he\'s actually a pretty good fighter, Lionheart!"' },
      { speaker: 'Bluestar', text: '"Wait, Lionheart. Look at this young cat. There is fire in his eyes... something the forest needs."',
        camPos: { x: player.position.x - 1, y: 2.5, z: player.position.z - 2 },
        camLook: { x: player.position.x - 3, y: 1.2, z: player.position.z - 5 } },
      { speaker: 'Bluestar', text: '"I am Bluestar, leader of ThunderClan. I have been watching you. You showed courage coming into the forest, and skill in your fight."' },
      { speaker: 'Bluestar', text: '"I would like to offer you a place in our Clan. Join us, and you will learn to be a true warrior."' },
      { speaker: 'Lionheart', text: '"Are you sure, Bluestar? He\'s a kittypet..."' },
      { speaker: 'Bluestar', text: '"I am sure. StarClan has shown me a prophecy: <em>Fire alone will save our Clan.</em> This cat may be the one."' },
      { speaker: 'Graypaw', text: '"Wow! You\'re going to join ThunderClan? That\'s awesome!"' },
      { narration: true, text: 'Your heart pounds with excitement. A real warrior clan! But first, every clan cat needs a warrior name...' },
    ];
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
      // After ceremony → start playing!
      npcCats.forEach(c => { c.group.visible = true; }); // keep visible in camp
      saveGame();
      startPlaying();
    });
  }

  /* ====================================================
     START PLAYING (after naming ceremony, in camp)
     ==================================================== */
  function startPlaying () {
    gameState = 'playing';
    storyPhase = 'playing';
    catGroup.visible = true;

    // Place player in camp
    player.position = { x: 2, y: 0, z: 3 };
    catGroup.position.set(2, 0, 3);

    // show NPC cats in camp
    npcCats.forEach(c => { c.group.visible = true; });
    // Place cats around camp
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

    gameHud.classList.add('visible');
    playerNameEl.textContent = player.name;

    if (isMobile) mobileControls.classList.add('visible');

    // Start forest sounds
    startForestAmbience();

    // Welcome message
    queueMessage('Narrator',
      'Welcome to ThunderClan, ' + player.name + '! You are now an apprentice. Explore the camp and territory! ' +
      (isMobile ? 'Use the joystick to move.' : 'Use WASD to move. Click to control camera. Hold SHIFT to sprint.'));
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
      catGroup.children[0].position.y = 0.65 + Math.sin(walkCycle * 6) * 0.03;
      if (stepTimer > 0.3 / spd) { stepTimer = 0; playSound('step'); }
    } else {
      catGroup.legs.forEach(l => { l.rotation.x *= 0.9; });
      walkCycle = 0; stepTimer = 0;
    }
  }

  function animateTail (time) {
    if (!catGroup || !catGroup.tailSegs) return;
    catGroup.tailSegs.forEach((s, i) => {
      s.position.x = Math.sin(time * 2 + i * 0.5) * 0.06 * (i + 1);
    });
  }

  function animateNPCTails (time) {
    npcCats.forEach((c, ci) => {
      if (!c.group.visible || !c.group.tailSegs) return;
      c.group.tailSegs.forEach((s, i) => {
        s.position.x = Math.sin(time * 1.8 + ci * 2 + i * 0.5) * 0.05 * (i + 1);
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
     NPC FOLLOW (Graypaw follows during story)
     ==================================================== */
  function updateFollowers (dt) {
    if (storyPhase !== 'fought_graypaw') return;
    const gp = npcCats.find(c => c.name === 'Graypaw');
    if (!gp || !gp.group.visible) return;
    const gpPos = gp.group.position;
    const dx = player.position.x - gpPos.x;
    const dz = player.position.z - gpPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 3) {
      const spd = 4 * dt;
      gpPos.x += (dx / dist) * spd;
      gpPos.z += (dz / dist) * spd;
      gp.group.lookAt(player.position.x, 0, player.position.z);
    }
  }

  /* ====================================================
     MAIN LOOP
     ==================================================== */
  function animate () {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    const time = clock.getElapsedTime();

    if (gameState === 'playing') {
      updatePlayer(dt);
      updateCamera();
      updateHUD();
      animateFireflies(time);
      animateTail(time);
      animateNPCTails(time);
      checkStoryTriggers();
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
      animateFireflies(time);
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
