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

  /* ---------- audio ---------- */
  let audioCtx;
  function initAudio () {
    if (audioCtx) return;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* silent */ }
  }
  function playSound (type) {
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      switch (type) {
        case 'step':
          osc.frequency.value = 80 + Math.random() * 40; osc.type = 'triangle';
          gain.gain.value = 0.05; gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
          osc.start(); osc.stop(audioCtx.currentTime + 0.1); break;
        case 'meow':
          osc.frequency.value = 600; osc.type = 'sine'; gain.gain.value = 0.15;
          osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.3);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
          osc.start(); osc.stop(audioCtx.currentTime + 0.4); break;
        case 'ceremony':
          osc.frequency.value = 440; osc.type = 'sine'; gain.gain.value = 0.12;
          osc.frequency.linearRampToValueAtTime(660, audioCtx.currentTime + 0.3);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
          osc.start(); osc.stop(audioCtx.currentTime + 0.8); break;
        case 'ambient':
          osc.frequency.value = 120 + Math.random() * 60; osc.type = 'sine'; gain.gain.value = 0.02;
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2);
          osc.start(); osc.stop(audioCtx.currentTime + 2); break;
      }
    } catch (e) { /* silent */ }
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
    const bodyMain = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.85, 12, 16), bodyMat);
    bodyMain.rotation.z = Math.PI / 2; bodyMain.position.set(0, 0.65, 0); bodyMain.castShadow = true;
    catGroup.add(bodyMain);
    // belly (lighter, slightly below)
    const bellyMat = new THREE.MeshPhongMaterial({ color: cream, shininess: 10 });
    const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.30, 0.6, 8, 12), bellyMat);
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
     NPC CATS (sit in camp for meetings)
     ==================================================== */
  function makeSimpleCat (color, name, px, pz) {
    const g = new THREE.Group();
    const mat = new THREE.MeshPhongMaterial({ color: color, shininess: 10 });
    // body
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.55, 8, 10), mat);
    body.rotation.z = Math.PI / 2; body.position.y = 0.55; body.castShadow = true;
    g.add(body);
    // head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mat);
    head.position.set(0, 0.75, 0.42); g.add(head);
    // ears
    [[-0.13, 0.98, 0.42],[0.13, 0.98, 0.42]].forEach(p => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 4), mat);
      ear.position.set(...p); g.add(ear);
    });
    // eyes
    [[-.09, 0.78, 0.63],[.09, 0.78, 0.63]].forEach(p => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffdd44 }));
      eye.position.set(...p); g.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      pupil.position.set(p[0], p[1], p[2]+0.03); g.add(pupil);
    });
    // tail
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.05-i*0.005, 5, 4), mat);
      s.position.set(0, 0.45+i*0.08, -0.35-i*0.1); g.add(s);
    }
    g.position.set(px, 0, pz);
    g.visible = false; // only visible during meetings & gameplay
    scene.add(g);
    return { group: g, name: name };
  }

  function createNPCCats () {
    npcCats = [
      makeSimpleCat(0x4466aa, 'Bluestar', -3, -1.5),  // on highrock during meetings
      makeSimpleCat(0xccaa44, 'Lionheart', -1, 1),
      makeSimpleCat(0x888888, 'Graypaw', 1, 2),
      makeSimpleCat(0xffffff, 'Whitestorm', 2, -1),
      makeSimpleCat(0x885522, 'Dustpaw', -2, 3),
      makeSimpleCat(0xaa8866, 'Sandpaw', 0, 3.5),
      makeSimpleCat(0x996633, 'Mousefur', 3, 1),
      makeSimpleCat(0x444444, 'Darkstripe', -4, 2),
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
  }

  function advanceCutscene () {
    cutsceneQueue.shift();
    showCutsceneSlide();
  }

  /* ====================================================
     OPENING CUTSCENE  (Into the Wild intro)
     ==================================================== */
  function startOpeningCutscene () {
    const scenes = [
      { narration: true, text: 'The forest stretches beyond the garden fence, dark and full of mystery. You are <strong>Rusty</strong>, a young ginger house cat who has always dreamed of something more...',
        camPos: { x: 0, y: 4, z: 30 }, camLook: { x: 0, y: 2, z: 0 } },
      { narration: true, text: 'Every night you sit on the fence watching the trees sway. The rustling of leaves, the scent of prey on the wind... something in the forest is calling to you.',
        camPos: { x: -10, y: 6, z: 20 }, camLook: { x: 0, y: 1, z: 0 } },
      { narration: true, text: 'Tonight, you make your choice. With a deep breath, you leap over the fence and into the wild. The forest is bigger and darker than you ever imagined.',
        camPos: { x: 5, y: 3, z: 15 }, camLook: { x: 0, y: 1, z: 5 } },
      { narration: true, text: 'Strange scents fill the air. Then - a rustle in the bushes! A gray cat leaps out!',
        camPos: { x: 2, y: 2, z: 8 }, camLook: { x: 0, y: 1, z: 0 } },
      { speaker: 'Graypaw', text: '"Hey! You\'re on ThunderClan territory, kittypet! What are you doing here?"' },
      { narration: true, text: 'Before you can answer, two more cats emerge from the shadows - a large golden tabby and a blue-gray she-cat with piercing blue eyes.',
        camPos: { x: -4, y: 3, z: 6 }, camLook: { x: -3, y: 1, z: -4 } },
      { speaker: 'Bluestar', text: '"Wait, Lionheart. Look at this young cat. There is fire in his eyes... something the forest needs."' },
      { speaker: 'Bluestar', text: '"Young cat, I am Bluestar, leader of ThunderClan. I see courage in you. I would like to offer you a place in our Clan."' },
      { speaker: 'Lionheart', text: '"Are you sure, Bluestar? He\'s a kittypet..."' },
      { speaker: 'Bluestar', text: '"I am sure. StarClan has shown me a prophecy: <em>Fire alone will save our Clan.</em> This cat may be the one."' },
      { narration: true, text: 'Your heart pounds with excitement. A real warrior clan! This is what you\'ve always dreamed of. But first, every clan cat needs a warrior name...' },
    ];
    startCutscene(scenes, () => {
      // After cutscene → name picking
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
     START PLAYING
     ==================================================== */
  function startPlaying () {
    gameState = 'playing';
    catGroup.visible = true;
    catGroup.position.set(player.position.x, 0, player.position.z);

    // show NPC cats in camp
    npcCats.forEach(c => { c.group.visible = true; });
    // reset Bluestar to ground near highrock
    npcCats[0].group.position.set(-4, 0, -2);

    gameHud.classList.add('visible');
    playerNameEl.textContent = player.name;

    if (isMobile) mobileControls.classList.add('visible');

    // Welcome message
    queueMessage('Narrator',
      'Welcome to ThunderClan, ' + player.name + '! Explore the territory. ' +
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
      gameTime += dt;
      // autosave every 15s
      if (Math.floor(time * 10) % 150 === 0) saveGame();
      if (Math.random() < 0.002) playSound('ambient');
    }

    if (gameState === 'title' || gameState === 'saves') {
      camera.position.x = Math.sin(time * 0.08) * 18;
      camera.position.z = Math.cos(time * 0.08) * 18;
      camera.position.y = 8;
      camera.lookAt(0, 2, 0);
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
