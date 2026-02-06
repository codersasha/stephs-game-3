/* ========================================
   Warriors: Into the Wild - Main Game
   3D forest game using Three.js
   ======================================== */

(function() {
  'use strict';

  // ---- DOM References ----
  const loadingScreen = document.getElementById('loading-screen');
  const loadingBarFill = document.getElementById('loading-bar-fill');
  const titleScreen = document.getElementById('title-screen');
  const gameHud = document.getElementById('game-hud');
  const mobileControls = document.getElementById('mobile-controls');
  const healthBar = document.getElementById('health-bar');
  const energyBar = document.getElementById('energy-bar');
  const locationText = document.getElementById('location-text');
  const messageBox = document.getElementById('message-box');
  const messageSpeaker = document.getElementById('message-speaker');
  const messageText = document.getElementById('message-text');

  // ---- Game State ----
  let gameState = 'loading'; // loading, title, playing
  let player = GameLogic.createPlayer();
  let gameTime = 30; // Start at morning
  let clock;
  
  // ---- Three.js Globals ----
  let scene, camera, renderer;
  let catGroup, catMixer;
  let trees = [], rocks = [], grassPatches = [];
  let treeObjects = [], rockObjects = [];
  
  // ---- Input State ----
  const keys = {};
  let mouseX = 0, mouseY = 0;
  let isPointerLocked = false;
  let cameraAngleY = 0;
  let cameraAngleX = 0.3;
  let joystickInput = { x: 0, z: 0 };
  let isMobile = false;

  // ---- Audio ----
  let audioCtx;
  
  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    switch(type) {
      case 'step':
        osc.frequency.value = 80 + Math.random() * 40;
        osc.type = 'triangle';
        gain.gain.value = 0.05;
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
        break;
      case 'meow':
        osc.frequency.value = 600;
        osc.type = 'sine';
        gain.gain.value = 0.15;
        osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
        break;
      case 'ambient':
        osc.frequency.value = 120 + Math.random() * 60;
        osc.type = 'sine';
        gain.gain.value = 0.02;
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2);
        osc.start();
        osc.stop(audioCtx.currentTime + 2);
        break;
    }
  }

  // ---- Initialization ----
  
  function init() {
    checkMobile();
    initThreeJS();
    createForest();
    createCat();
    createLighting();
    addFireflies();
    setupControls();
    
    // Show title screen
    loadingBarFill.style.width = '100%';
    setTimeout(() => {
      loadingScreen.classList.add('hidden');
      titleScreen.classList.remove('hidden');
      gameState = 'title';
      addTitleFireflies();
    }, 500);

    // Start render loop
    clock = new THREE.Clock();
    animate();
  }

  function checkMobile() {
    isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  }

  // ---- Three.js Setup ----

  function initThreeJS() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0.35, 0.55, 0.35);
    scene.fog = new THREE.FogExp2(0x2d4a2d, 0.012);

    // Camera (third person)
    camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );
    camera.position.set(0, 6, 10);
    camera.lookAt(0, 1, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    document.body.insertBefore(renderer.domElement, document.body.firstChild);
    renderer.domElement.id = 'game-canvas';

    // Handle resize
    window.addEventListener('resize', onResize);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---- Create the Forest ----

  function createForest() {
    const bounds = GameLogic.getForestBounds();
    
    // Ground
    createGround(bounds);
    
    // Trees
    trees = GameLogic.generateTreePositions(200, 42, bounds);
    trees.forEach(tree => {
      const treeObj = tree.type === 'oak' ? createOakTree(tree) : createPineTree(tree);
      treeObj.position.set(tree.x, 0, tree.z);
      scene.add(treeObj);
      treeObjects.push({ mesh: treeObj, data: tree });
    });
    
    // Rocks
    rocks = GameLogic.generateRockPositions(60, 42, bounds);
    rocks.forEach(rock => {
      const rockObj = createRock(rock);
      rockObj.position.set(rock.x, 0, rock.z);
      scene.add(rockObj);
      rockObjects.push({ mesh: rockObj, data: rock });
    });
    
    // Grass patches
    createGrassPatches(bounds);
    
    // Flowers
    createFlowers(bounds);
    
    // River
    createRiver();
  }

  function createGround(bounds) {
    // Main ground
    const groundGeo = new THREE.PlaneGeometry(200, 200, 20, 20);
    const groundMat = new THREE.MeshLambertMaterial({ 
      color: 0x3a6b35
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Add some variation with a darker circle near camp
    const campGeo = new THREE.CircleGeometry(12, 32);
    const campMat = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
    const campGround = new THREE.Mesh(campGeo, campMat);
    campGround.rotation.x = -Math.PI / 2;
    campGround.position.y = 0.01;
    scene.add(campGround);

    // Path from camp
    const pathGeo = new THREE.PlaneGeometry(3, 30);
    const pathMat = new THREE.MeshLambertMaterial({ color: 0x6b5b4a });
    const path = new THREE.Mesh(pathGeo, pathMat);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.02, 20);
    scene.add(path);
  }

  function createOakTree(treeData) {
    const group = new THREE.Group();
    const scale = treeData.scale;
    
    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.3 * scale, 0.5 * scale, 4 * scale, 8);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2 * scale;
    trunk.castShadow = true;
    group.add(trunk);
    
    // Canopy (multiple spheres for fullness)
    const leafColor = new THREE.Color(
      0.15 + Math.random() * 0.1,
      0.35 + Math.random() * 0.15,
      0.1 + Math.random() * 0.1
    );
    const leafMat = new THREE.MeshLambertMaterial({ color: leafColor });
    
    const positions = [
      [0, 5.5 * scale, 0, 2.5 * scale],
      [1 * scale, 5 * scale, 0.5 * scale, 1.8 * scale],
      [-0.8 * scale, 5 * scale, -0.5 * scale, 1.6 * scale],
      [0.3 * scale, 6 * scale, -0.4 * scale, 1.5 * scale],
    ];
    
    positions.forEach(([x, y, z, r]) => {
      const leafGeo = new THREE.SphereGeometry(r, 8, 6);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(x, y, z);
      leaf.castShadow = true;
      group.add(leaf);
    });
    
    return group;
  }

  function createPineTree(treeData) {
    const group = new THREE.Group();
    const scale = treeData.scale;
    
    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.2 * scale, 0.35 * scale, 3 * scale, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a2e14 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.5 * scale;
    trunk.castShadow = true;
    group.add(trunk);
    
    // Cone layers
    const leafColor = new THREE.Color(
      0.1 + Math.random() * 0.05,
      0.25 + Math.random() * 0.1,
      0.08 + Math.random() * 0.05
    );
    const leafMat = new THREE.MeshLambertMaterial({ color: leafColor });
    
    const layers = [
      [2.2 * scale, 2.5 * scale, 3 * scale],
      [1.7 * scale, 2 * scale, 5 * scale],
      [1.2 * scale, 1.8 * scale, 6.5 * scale],
    ];
    
    layers.forEach(([radius, height, yPos]) => {
      const coneGeo = new THREE.ConeGeometry(radius, height, 8);
      const cone = new THREE.Mesh(coneGeo, leafMat);
      cone.position.y = yPos;
      cone.castShadow = true;
      group.add(cone);
    });
    
    return group;
  }

  function createRock(rockData) {
    const group = new THREE.Group();
    const scale = rockData.scale;
    
    const rockGeo = new THREE.DodecahedronGeometry(scale, 0);
    const rockMat = new THREE.MeshLambertMaterial({ 
      color: new THREE.Color(0.4 + Math.random() * 0.1, 0.38 + Math.random() * 0.1, 0.35)
    });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.y = scale * 0.4;
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.scale.set(1, 0.6, 0.8 + Math.random() * 0.4);
    rock.castShadow = true;
    group.add(rock);
    
    return group;
  }

  function createGrassPatches(bounds) {
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x4a8b3f, side: THREE.DoubleSide });
    
    for (let i = 0; i < 300; i++) {
      const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      
      const grassGeo = new THREE.PlaneGeometry(0.15, 0.5 + Math.random() * 0.5);
      const grass = new THREE.Mesh(grassGeo, grassMat);
      grass.position.set(x, 0.25, z);
      grass.rotation.y = Math.random() * Math.PI;
      scene.add(grass);
    }
  }

  function createFlowers(bounds) {
    const flowerColors = [0xff6b9d, 0xffd93d, 0xff8c42, 0xc084fc, 0x6dd5ed];
    
    for (let i = 0; i < 80; i++) {
      const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      
      const color = flowerColors[Math.floor(Math.random() * flowerColors.length)];
      const flowerGeo = new THREE.SphereGeometry(0.12, 6, 4);
      const flowerMat = new THREE.MeshLambertMaterial({ color: color });
      const flower = new THREE.Mesh(flowerGeo, flowerMat);
      flower.position.set(x, 0.2, z);
      scene.add(flower);
    }
  }

  function createRiver() {
    const riverPath = new THREE.CurvePath();
    const points = [];
    for (let z = -100; z <= 100; z += 5) {
      points.push(new THREE.Vector3(70 + Math.sin(z * 0.05) * 10, 0.05, z));
    }
    
    // Simple river plane
    const riverGeo = new THREE.PlaneGeometry(8, 200, 1, 20);
    const riverMat = new THREE.MeshLambertMaterial({ 
      color: 0x3388aa, 
      transparent: true, 
      opacity: 0.7 
    });
    const river = new THREE.Mesh(riverGeo, riverMat);
    river.rotation.x = -Math.PI / 2;
    river.position.set(75, 0.05, 0);
    scene.add(river);
  }

  // ---- Create the Cat (Fireheart) ----

  function createCat() {
    catGroup = new THREE.Group();
    
    // Body
    const bodyGeo = new THREE.CapsuleGeometry(0.35, 0.8, 8, 12);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xff8c00 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.z = Math.PI / 2;
    body.position.set(0, 0.6, 0);
    body.castShadow = true;
    catGroup.add(body);
    
    // Head
    const headGeo = new THREE.SphereGeometry(0.3, 10, 8);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xff9922 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 0.8, 0.55);
    head.scale.set(1, 0.9, 1.1);
    head.castShadow = true;
    catGroup.add(head);
    
    // Ears
    const earGeo = new THREE.ConeGeometry(0.12, 0.2, 4);
    const earMat = new THREE.MeshLambertMaterial({ color: 0xff9922 });
    
    const earL = new THREE.Mesh(earGeo, earMat);
    earL.position.set(-0.15, 1.05, 0.55);
    earL.rotation.z = -0.2;
    catGroup.add(earL);
    
    const earR = new THREE.Mesh(earGeo, earMat);
    earR.position.set(0.15, 1.05, 0.55);
    earR.rotation.z = 0.2;
    catGroup.add(earR);
    
    // Inner ears
    const innerEarGeo = new THREE.ConeGeometry(0.07, 0.12, 4);
    const innerEarMat = new THREE.MeshLambertMaterial({ color: 0xffaa88 });
    
    const innerEarL = new THREE.Mesh(innerEarGeo, innerEarMat);
    innerEarL.position.set(-0.15, 1.03, 0.57);
    innerEarL.rotation.z = -0.2;
    catGroup.add(innerEarL);
    
    const innerEarR = new THREE.Mesh(innerEarGeo, innerEarMat);
    innerEarR.position.set(0.15, 1.03, 0.57);
    innerEarR.rotation.z = 0.2;
    catGroup.add(innerEarR);
    
    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.06, 8, 6);
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x44ff44 });
    
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.12, 0.85, 0.78);
    catGroup.add(eyeL);
    
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.12, 0.85, 0.78);
    catGroup.add(eyeR);
    
    // Pupils
    const pupilGeo = new THREE.SphereGeometry(0.03, 6, 4);
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    
    const pupilL = new THREE.Mesh(pupilGeo, pupilMat);
    pupilL.position.set(-0.12, 0.85, 0.83);
    catGroup.add(pupilL);
    
    const pupilR = new THREE.Mesh(pupilGeo, pupilMat);
    pupilR.position.set(0.12, 0.85, 0.83);
    catGroup.add(pupilR);
    
    // Nose
    const noseGeo = new THREE.SphereGeometry(0.04, 6, 4);
    const noseMat = new THREE.MeshLambertMaterial({ color: 0xff6688 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 0.78, 0.83);
    nose.scale.set(1.2, 0.8, 0.8);
    catGroup.add(nose);
    
    // Legs
    const legGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.4, 6);
    const legMat = new THREE.MeshLambertMaterial({ color: 0xff8c00 });
    
    const legPositions = [
      [-0.2, 0.2, 0.3],   // front left
      [0.2, 0.2, 0.3],    // front right
      [-0.2, 0.2, -0.3],  // back left
      [0.2, 0.2, -0.3],   // back right
    ];
    
    catGroup.legs = [];
    legPositions.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(x, y, z);
      leg.castShadow = true;
      catGroup.add(leg);
      catGroup.legs.push(leg);
    });
    
    // Paws (white tips)
    const pawGeo = new THREE.SphereGeometry(0.07, 6, 4);
    const pawMat = new THREE.MeshLambertMaterial({ color: 0xffeedd });
    
    legPositions.forEach(([x, y, z]) => {
      const paw = new THREE.Mesh(pawGeo, pawMat);
      paw.position.set(x, 0.02, z);
      paw.scale.y = 0.5;
      catGroup.add(paw);
    });
    
    // Tail
    const tailGroup = new THREE.Group();
    const tailSegments = 5;
    const tailMat = new THREE.MeshLambertMaterial({ color: 0xff8c00 });
    
    for (let i = 0; i < tailSegments; i++) {
      const segGeo = new THREE.SphereGeometry(0.06 - i * 0.005, 6, 4);
      const seg = new THREE.Mesh(segGeo, tailMat);
      seg.position.set(0, 0.6 + i * 0.12, -0.45 - i * 0.12);
      catGroup.add(seg);
    }
    
    // Chest patch (lighter fur)
    const chestGeo = new THREE.SphereGeometry(0.22, 8, 6);
    const chestMat = new THREE.MeshLambertMaterial({ color: 0xffbb66 });
    const chest = new THREE.Mesh(chestGeo, chestMat);
    chest.position.set(0, 0.55, 0.35);
    chest.scale.set(0.8, 0.8, 0.5);
    catGroup.add(chest);
    
    // Tabby stripes on back
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0xcc6600 });
    for (let i = 0; i < 4; i++) {
      const stripeGeo = new THREE.BoxGeometry(0.35, 0.02, 0.08);
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(0, 0.92, 0.1 - i * 0.18);
      stripe.rotation.x = 0.1;
      catGroup.add(stripe);
    }

    catGroup.position.set(player.position.x, player.position.y, player.position.z);
    scene.add(catGroup);
  }

  // ---- Lighting ----

  function createLighting() {
    // Ambient light
    const ambient = new THREE.AmbientLight(0x6b8f6b, 0.6);
    scene.add(ambient);
    
    // Directional (sun) light
    const sun = new THREE.DirectionalLight(0xffe4b5, 0.8);
    sun.position.set(30, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 100;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    scene.add(sun);
    
    // Hemisphere light for better outdoor lighting
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3a6b35, 0.4);
    scene.add(hemi);
  }

  // ---- Fireflies (particles) ----

  function addFireflies() {
    const fireflyCount = 40;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(fireflyCount * 3);
    const bounds = GameLogic.getForestBounds();
    
    for (let i = 0; i < fireflyCount; i++) {
      positions[i * 3] = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      positions[i * 3 + 1] = 1 + Math.random() * 4;
      positions[i * 3 + 2] = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
      color: 0xffdd66,
      size: 0.3,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true
    });
    
    const fireflies = new THREE.Points(geometry, material);
    fireflies.name = 'fireflies';
    scene.add(fireflies);
  }

  // ---- Title Screen Fireflies ----

  function addTitleFireflies() {
    const container = titleScreen;
    for (let i = 0; i < 20; i++) {
      const firefly = document.createElement('div');
      firefly.className = 'firefly';
      firefly.style.left = Math.random() * 100 + '%';
      firefly.style.top = Math.random() * 100 + '%';
      firefly.style.animationDelay = Math.random() * 6 + 's';
      firefly.style.animationDuration = (4 + Math.random() * 4) + 's';
      container.appendChild(firefly);
    }
  }

  // ---- Controls ----

  function setupControls() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      keys[e.key.toLowerCase()] = true;
      keys[e.code] = true;
      
      if (gameState === 'title') {
        startGame();
      }
      
      if (e.key === ' ' && messageBox.classList.contains('visible')) {
        hideMessage();
      }
    });
    
    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
      keys[e.code] = false;
    });

    // Mouse for camera
    renderer.domElement.addEventListener('click', () => {
      if (gameState === 'playing' && !isMobile) {
        renderer.domElement.requestPointerLock();
      }
    });
    
    document.addEventListener('pointerlockchange', () => {
      isPointerLocked = document.pointerLockElement === renderer.domElement;
    });
    
    document.addEventListener('mousemove', (e) => {
      if (isPointerLocked) {
        cameraAngleY -= e.movementX * 0.003;
        cameraAngleX = Math.max(0.1, Math.min(0.8, cameraAngleX + e.movementY * 0.003));
      }
    });

    // Touch / title screen tap
    titleScreen.addEventListener('click', () => {
      if (gameState === 'title') startGame();
    });
    
    titleScreen.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (gameState === 'title') startGame();
    });

    // Message box dismiss
    messageBox.addEventListener('click', hideMessage);
    messageBox.addEventListener('touchstart', (e) => {
      e.preventDefault();
      hideMessage();
    });

    // Mobile joystick
    setupMobileControls();
    
    // Touch camera control (right side of screen)
    let touchCameraId = null;
    let lastTouchX = 0, lastTouchY = 0;
    
    renderer.domElement.addEventListener('touchstart', (e) => {
      if (gameState !== 'playing') return;
      for (const touch of e.changedTouches) {
        if (touch.clientX > window.innerWidth * 0.5) {
          touchCameraId = touch.identifier;
          lastTouchX = touch.clientX;
          lastTouchY = touch.clientY;
        }
      }
    });
    
    renderer.domElement.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        if (touch.identifier === touchCameraId) {
          const dx = touch.clientX - lastTouchX;
          const dy = touch.clientY - lastTouchY;
          cameraAngleY -= dx * 0.005;
          cameraAngleX = Math.max(0.1, Math.min(0.8, cameraAngleX + dy * 0.005));
          lastTouchX = touch.clientX;
          lastTouchY = touch.clientY;
        }
      }
    });
    
    renderer.domElement.addEventListener('touchend', (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === touchCameraId) {
          touchCameraId = null;
        }
      }
    });
  }

  function setupMobileControls() {
    const joystickArea = document.getElementById('joystick-area');
    const joystickStick = document.getElementById('joystick-stick');
    const btnSprint = document.getElementById('btn-sprint');
    const btnAction = document.getElementById('btn-action');
    let joystickTouchId = null;
    let joystickCenter = { x: 0, y: 0 };

    joystickArea.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      joystickTouchId = touch.identifier;
      const rect = joystickArea.getBoundingClientRect();
      joystickCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    });

    joystickArea.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        if (touch.identifier === joystickTouchId) {
          let dx = touch.clientX - joystickCenter.x;
          let dy = touch.clientY - joystickCenter.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = 40;
          
          if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
          }
          
          joystickStick.style.transform = `translate(${dx}px, ${dy}px)`;
          joystickInput.x = dx / maxDist;
          joystickInput.z = dy / maxDist;
        }
      }
    });

    const resetJoystick = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === joystickTouchId) {
          joystickTouchId = null;
          joystickStick.style.transform = 'translate(0, 0)';
          joystickInput.x = 0;
          joystickInput.z = 0;
        }
      }
    };

    joystickArea.addEventListener('touchend', resetJoystick);
    joystickArea.addEventListener('touchcancel', resetJoystick);

    // Sprint button
    btnSprint.addEventListener('touchstart', (e) => {
      e.preventDefault();
      player.isSprinting = true;
    });
    btnSprint.addEventListener('touchend', (e) => {
      e.preventDefault();
      player.isSprinting = false;
    });

    // Action button - meow!
    btnAction.addEventListener('touchstart', (e) => {
      e.preventDefault();
      initAudio();
      playSound('meow');
    });
  }

  // ---- Start Game ----

  function startGame() {
    initAudio();
    gameState = 'playing';
    titleScreen.classList.add('hidden');
    gameHud.classList.add('visible');
    
    if (isMobile) {
      mobileControls.classList.add('visible');
    }
    
    // Show welcome message
    showMessage('Narrator', 
      'Welcome to the forest, Fireheart. ThunderClan needs you. ' +
      'Explore the territory and discover its secrets. ' +
      (isMobile ? 'Use the joystick to move around.' : 'Use WASD to move. Click to control the camera. Hold SHIFT to sprint.')
    );
    
    // Try to load saved game
    const saved = localStorage.getItem('warriors-save');
    if (saved) {
      const loadedPlayer = GameLogic.deserializeState(saved);
      if (loadedPlayer) {
        player = loadedPlayer;
        catGroup.position.set(player.position.x, 0, player.position.z);
      }
    }
  }

  // ---- Message System ----

  function showMessage(speaker, text) {
    messageSpeaker.textContent = speaker;
    messageText.textContent = text;
    messageBox.classList.add('visible');
  }

  function hideMessage() {
    messageBox.classList.remove('visible');
  }

  // ---- Animation / Walk cycle ----

  let walkCycle = 0;
  let stepTimer = 0;

  function animateCat(deltaTime, isMoving, speed) {
    if (!catGroup || !catGroup.legs) return;
    
    if (isMoving) {
      walkCycle += deltaTime * speed * 2;
      stepTimer += deltaTime;
      
      // Leg animation
      const legSwing = Math.sin(walkCycle * 3) * 0.3;
      catGroup.legs[0].rotation.x = legSwing;
      catGroup.legs[1].rotation.x = -legSwing;
      catGroup.legs[2].rotation.x = -legSwing;
      catGroup.legs[3].rotation.x = legSwing;
      
      // Body bob
      catGroup.children[0].position.y = 0.6 + Math.sin(walkCycle * 6) * 0.03;
      
      // Step sounds
      if (stepTimer > 0.3 / speed) {
        stepTimer = 0;
        playSound('step');
      }
    } else {
      // Reset legs
      catGroup.legs.forEach(leg => {
        leg.rotation.x *= 0.9;
      });
      walkCycle = 0;
      stepTimer = 0;
    }
  }

  // ---- Firefly Animation ----

  function animateFireflies(time) {
    const fireflies = scene.getObjectByName('fireflies');
    if (!fireflies) return;
    
    const positions = fireflies.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += Math.sin(time + i) * 0.01;
      positions[i + 1] += Math.cos(time * 0.7 + i * 0.5) * 0.005;
      positions[i + 2] += Math.sin(time * 0.5 + i * 0.3) * 0.01;
    }
    fireflies.geometry.attributes.position.needsUpdate = true;
    
    // Pulse opacity
    fireflies.material.opacity = 0.5 + Math.sin(time * 2) * 0.3;
  }

  // ---- Main Game Loop ----

  function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = Math.min(clock.getDelta(), 0.1);
    const time = clock.getElapsedTime();
    
    if (gameState === 'playing') {
      updatePlayer(deltaTime);
      updateCamera();
      updateHUD();
      animateFireflies(time);
      
      // Auto-save every 10 seconds
      if (Math.floor(time) % 10 === 0) {
        localStorage.setItem('warriors-save', GameLogic.serializeState(player));
      }
      
      // Ambient sounds
      if (Math.random() < 0.002) {
        playSound('ambient');
      }

      // Game time
      gameTime += deltaTime;
    }
    
    if (gameState === 'title') {
      // Slow camera rotation on title screen
      camera.position.x = Math.sin(time * 0.1) * 15;
      camera.position.z = Math.cos(time * 0.1) * 15;
      camera.position.y = 8;
      camera.lookAt(0, 2, 0);
    }
    
    renderer.render(scene, camera);
  }

  // ---- Player Update ----

  function updatePlayer(deltaTime) {
    // Get input direction
    let dirX = 0, dirZ = 0;
    
    if (isMobile) {
      dirX = joystickInput.x;
      dirZ = joystickInput.z;
    } else {
      if (keys['w'] || keys['arrowup']) dirZ = -1;
      if (keys['s'] || keys['arrowdown']) dirZ = 1;
      if (keys['a'] || keys['arrowleft']) dirX = -1;
      if (keys['d'] || keys['arrowright']) dirX = 1;
      
      player.isSprinting = keys['shift'] || keys['ShiftLeft'];
    }
    
    const isMoving = Math.abs(dirX) > 0.1 || Math.abs(dirZ) > 0.1;
    
    if (isMoving) {
      // Rotate direction based on camera angle
      const moveAngle = Math.atan2(dirX, dirZ) + cameraAngleY;
      const moveDir = {
        x: Math.sin(moveAngle),
        z: Math.cos(moveAngle)
      };
      
      const normalDir = GameLogic.normalizeDirection(moveDir);
      
      // Speed
      let speed = player.speed;
      if (player.isSprinting && player.energy > 0) {
        speed = player.sprintSpeed;
        player = GameLogic.useEnergy(player, deltaTime * 15);
      }
      
      // Calculate new position
      const newPos = GameLogic.calculateMovement(
        player.position, normalDir, speed, deltaTime
      );
      
      // Check bounds
      const bounds = GameLogic.getForestBounds();
      const clampedPos = GameLogic.clampPosition(newPos, bounds);
      
      // Check tree collisions
      const hasCollision = GameLogic.checkCollisions(clampedPos, trees, 1.2);
      
      if (!hasCollision) {
        player.position = clampedPos;
        
        // Rotate cat to face movement direction
        const targetRotation = Math.atan2(normalDir.x, normalDir.z);
        catGroup.rotation.y = lerpAngle(catGroup.rotation.y, targetRotation, 0.15);
      }
      
      // Animate walk
      animateCat(deltaTime, true, speed / player.speed);
    } else {
      animateCat(deltaTime, false, 1);
    }
    
    // Recover energy when not sprinting
    if (!player.isSprinting) {
      player = GameLogic.recoverEnergy(player, deltaTime * 5);
    }
    
    // Update cat position
    catGroup.position.set(player.position.x, 0, player.position.z);
  }

  function lerpAngle(from, to, t) {
    let diff = to - from;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return from + diff * t;
  }

  // ---- Camera Update ----

  function updateCamera() {
    const distance = 8;
    const height = 3 + cameraAngleX * 5;
    
    const camX = player.position.x + Math.sin(cameraAngleY) * distance;
    const camZ = player.position.z + Math.cos(cameraAngleY) * distance;
    const camY = height;
    
    camera.position.lerp(new THREE.Vector3(camX, camY, camZ), 0.08);
    
    const lookTarget = new THREE.Vector3(
      player.position.x,
      1.2,
      player.position.z
    );
    camera.lookAt(lookTarget);
  }

  // ---- HUD Update ----

  function updateHUD() {
    healthBar.style.width = (player.health / player.maxHealth * 100) + '%';
    energyBar.style.width = (player.energy / player.maxEnergy * 100) + '%';
    locationText.textContent = GameLogic.getLocationName(player.position);
  }

  // ---- Start Everything ----
  
  // Simulate loading
  let loadProgress = 0;
  const loadInterval = setInterval(() => {
    loadProgress += Math.random() * 20 + 5;
    if (loadProgress >= 100) {
      loadProgress = 100;
      clearInterval(loadInterval);
      loadingBarFill.style.width = '100%';
      // Start init after "loading" animation
      setTimeout(init, 300);
    } else {
      loadingBarFill.style.width = loadProgress + '%';
    }
  }, 100);

})();
