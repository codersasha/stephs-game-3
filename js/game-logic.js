/* ========================================
   Warriors: Into the Wild - Game Logic
   Pure functions for testable game logic
   ======================================== */

const GameLogic = {

  // ---- Player Stats ----
  
  /**
   * Create a new player state
   */
  createPlayer(namePrefix = 'Fire') {
    return {
      namePrefix: namePrefix,
      name: namePrefix + 'paw',
      health: 100,
      maxHealth: 100,
      energy: 100,
      maxEnergy: 100,
      level: 1,
      experience: 0,
      experienceToNext: 100,
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      speed: 5,
      sprintSpeed: 9,
      isSprinting: false,
      prey: 0,
      clan: 'ThunderClan',
      rank: 'apprentice', // apprentice -> warrior
      battlesWon: 0
    };
  },

  /**
   * Get the full warrior name with correct suffix based on rank
   */
  getFullName(player) {
    if (player.rank === 'apprentice') {
      return player.namePrefix + 'paw';
    }
    return player.namePrefix + 'heart';
  },

  /**
   * Validate a name prefix (must be 2-12 chars, letters only)
   */
  validateNamePrefix(prefix) {
    if (!prefix || prefix.length < 2 || prefix.length > 12) return false;
    return /^[A-Za-z]+$/.test(prefix);
  },

  /**
   * Capitalize first letter of name
   */
  formatNamePrefix(prefix) {
    if (!prefix) return '';
    return prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase();
  },

  /**
   * Apply damage to player, returns new player state
   */
  takeDamage(player, amount) {
    const newHealth = Math.max(0, player.health - amount);
    return { ...player, health: newHealth };
  },

  /**
   * Heal player, returns new player state
   */
  heal(player, amount) {
    const newHealth = Math.min(player.maxHealth, player.health + amount);
    return { ...player, health: newHealth };
  },

  /**
   * Use energy (for sprinting, actions)
   */
  useEnergy(player, amount) {
    const newEnergy = Math.max(0, player.energy - amount);
    return { ...player, energy: newEnergy };
  },

  /**
   * Recover energy over time
   */
  recoverEnergy(player, amount) {
    const newEnergy = Math.min(player.maxEnergy, player.energy + amount);
    return { ...player, energy: newEnergy };
  },

  /**
   * Add experience and check for level up
   */
  addExperience(player, amount) {
    let newExp = player.experience + amount;
    let newLevel = player.level;
    let newExpToNext = player.experienceToNext;
    
    while (newExp >= newExpToNext) {
      newExp -= newExpToNext;
      newLevel++;
      newExpToNext = Math.floor(newExpToNext * 1.5);
    }
    
    return {
      ...player,
      experience: newExp,
      level: newLevel,
      experienceToNext: newExpToNext,
      maxHealth: 100 + (newLevel - 1) * 10,
      maxEnergy: 100 + (newLevel - 1) * 5
    };
  },

  /**
   * Check if player is alive
   */
  isAlive(player) {
    return player.health > 0;
  },

  // ---- Battle System ----

  /**
   * Create an enemy
   */
  createEnemy(type) {
    const enemies = {
      'rat': {
        name: 'Rat',
        type: 'rat',
        health: 30,
        maxHealth: 30,
        attack: 8,
        defense: 2,
        speed: 3,
        expReward: 25,
        color: 0x665544,
        description: 'A dirty rat from the Twoleg dump!'
      },
      'shadowclan_apprentice': {
        name: 'ShadowClan Apprentice',
        type: 'shadowclan_apprentice',
        health: 60,
        maxHealth: 60,
        attack: 12,
        defense: 5,
        speed: 5,
        expReward: 50,
        color: 0x333333,
        description: 'A ShadowClan apprentice is trespassing!'
      },
      'shadowclan_warrior': {
        name: 'ShadowClan Warrior',
        type: 'shadowclan_warrior',
        health: 100,
        maxHealth: 100,
        attack: 18,
        defense: 8,
        speed: 6,
        expReward: 80,
        color: 0x222222,
        description: 'A fierce ShadowClan warrior!'
      },
      'fox': {
        name: 'Fox',
        type: 'fox',
        health: 80,
        maxHealth: 80,
        attack: 20,
        defense: 6,
        speed: 7,
        expReward: 70,
        color: 0xaa4400,
        description: 'A fox has entered the territory!'
      },
      'adder': {
        name: 'Adder Snake',
        type: 'adder',
        health: 25,
        maxHealth: 25,
        attack: 22,
        defense: 1,
        speed: 8,
        expReward: 40,
        color: 0x445522,
        description: 'Watch out! An adder!'
      }
    };
    
    return enemies[type] ? { ...enemies[type] } : { ...enemies['rat'] };
  },

  /**
   * Get list of all enemy types
   */
  getEnemyTypes() {
    return ['rat', 'shadowclan_apprentice', 'shadowclan_warrior', 'fox', 'adder'];
  },

  /**
   * Calculate attack damage
   * Returns { damage, isCritical, missed }
   */
  calculateAttack(attacker, defender, moveType) {
    // Base damage depends on move type
    let baseDamage;
    let hitChance = 0.9;
    let critChance = 0.1;
    
    switch(moveType) {
      case 'scratch':
        baseDamage = 10 + (attacker.attack || attacker.level * 3);
        hitChance = 0.95;
        break;
      case 'bite':
        baseDamage = 15 + (attacker.attack || attacker.level * 4);
        hitChance = 0.8;
        critChance = 0.2;
        break;
      case 'hiss':
        // Hiss reduces enemy attack (returns negative damage = debuff)
        return { damage: 0, isCritical: false, missed: false, effect: 'intimidate' };
      default:
        baseDamage = 8 + (attacker.attack || attacker.level * 2);
    }
    
    // Check miss
    if (Math.random() > hitChance) {
      return { damage: 0, isCritical: false, missed: true };
    }
    
    // Apply defense
    const defense = defender.defense || 0;
    let damage = Math.max(1, baseDamage - defense);
    
    // Critical hit
    const isCritical = Math.random() < critChance;
    if (isCritical) {
      damage = Math.floor(damage * 1.5);
    }
    
    // Add some randomness
    damage = Math.floor(damage * (0.85 + Math.random() * 0.3));
    
    return { damage: Math.max(1, damage), isCritical, missed: false };
  },

  /**
   * Calculate enemy attack (simpler)
   */
  calculateEnemyAttack(enemy, player) {
    const baseDamage = enemy.attack;
    const defense = player.level * 2;
    let damage = Math.max(1, baseDamage - defense);
    damage = Math.floor(damage * (0.8 + Math.random() * 0.4));
    const missed = Math.random() > 0.85;
    return { damage: missed ? 0 : Math.max(1, damage), missed };
  },

  /**
   * Apply damage to an enemy, returns new enemy state
   */
  damageEnemy(enemy, amount) {
    const newHealth = Math.max(0, enemy.health - amount);
    return { ...enemy, health: newHealth };
  },

  /**
   * Check if enemy is defeated
   */
  isEnemyDefeated(enemy) {
    return enemy.health <= 0;
  },

  /**
   * Generate enemy spawn positions in the forest
   */
  generateEnemySpawns(seed, bounds) {
    const spawns = [];
    let s = seed + 5000;
    
    function seededRandom() {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    }
    
    // Rats near the edges (Twoleg area)
    for (let i = 0; i < 6; i++) {
      const angle = seededRandom() * Math.PI * 2;
      const dist = 30 + seededRandom() * 30;
      spawns.push({
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        type: 'rat',
        respawnTime: 30
      });
    }
    
    // ShadowClan cats near the ShadowClan border (west)
    for (let i = 0; i < 3; i++) {
      spawns.push({
        x: -55 - seededRandom() * 30,
        z: -30 + seededRandom() * 60,
        type: seededRandom() > 0.5 ? 'shadowclan_warrior' : 'shadowclan_apprentice',
        respawnTime: 60
      });
    }
    
    // Fox in the deep forest
    spawns.push({
      x: 20 + seededRandom() * 40,
      z: -30 - seededRandom() * 30,
      type: 'fox',
      respawnTime: 90
    });
    
    // Adder near Sunningrocks
    spawns.push({
      x: 50 + seededRandom() * 20,
      z: 10 + seededRandom() * 20,
      type: 'adder',
      respawnTime: 45
    });
    
    return spawns;
  },

  // ---- Movement ----

  /**
   * Calculate new position based on input direction and delta time
   */
  calculateMovement(position, direction, speed, deltaTime) {
    return {
      x: position.x + direction.x * speed * deltaTime,
      y: position.y,
      z: position.z + direction.z * speed * deltaTime
    };
  },

  /**
   * Normalize a direction vector
   */
  normalizeDirection(direction) {
    const length = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
    if (length === 0) return { x: 0, z: 0 };
    return {
      x: direction.x / length,
      z: direction.z / length
    };
  },

  /**
   * Keep position within forest bounds
   */
  clampPosition(position, bounds) {
    return {
      x: Math.max(bounds.minX, Math.min(bounds.maxX, position.x)),
      y: position.y,
      z: Math.max(bounds.minZ, Math.min(bounds.maxZ, position.z))
    };
  },

  // ---- World / Forest ----

  /**
   * Get the forest bounds
   */
  getForestBounds() {
    return {
      minX: -95,
      maxX: 95,
      minZ: -95,
      maxZ: 95
    };
  },

  /**
   * Generate tree positions deterministically using a seed
   */
  generateTreePositions(count, seed, bounds) {
    const trees = [];
    let s = seed;
    
    // Simple seeded random number generator
    function seededRandom() {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    }
    
    for (let i = 0; i < count; i++) {
      const x = bounds.minX + seededRandom() * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + seededRandom() * (bounds.maxZ - bounds.minZ);
      const scale = 0.8 + seededRandom() * 0.6;
      const type = seededRandom() > 0.3 ? 'oak' : 'pine';
      
      // Don't place trees too close to spawn (0,0)
      const distFromSpawn = Math.sqrt(x * x + z * z);
      if (distFromSpawn > 8) {
        trees.push({ x, z, scale, type });
      }
    }
    
    return trees;
  },

  /**
   * Generate rock positions
   */
  generateRockPositions(count, seed, bounds) {
    const rocks = [];
    let s = seed + 1000; // different seed offset
    
    function seededRandom() {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    }
    
    for (let i = 0; i < count; i++) {
      const x = bounds.minX + seededRandom() * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + seededRandom() * (bounds.maxZ - bounds.minZ);
      const scale = 0.3 + seededRandom() * 0.7;
      
      rocks.push({ x, z, scale });
    }
    
    return rocks;
  },

  /**
   * Check for collision with a tree or rock
   */
  checkCollision(position, obstacle, radius) {
    const dx = position.x - obstacle.x;
    const dz = position.z - obstacle.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    return distance < radius;
  },

  /**
   * Check collisions against a list of obstacles
   */
  checkCollisions(position, obstacles, radius) {
    for (const obstacle of obstacles) {
      if (this.checkCollision(position, obstacle, radius * (obstacle.scale || 1))) {
        return true;
      }
    }
    return false;
  },

  /**
   * Check if player is near an enemy spawn
   */
  checkEnemyEncounter(playerPos, enemySpawn, triggerRadius) {
    const dx = playerPos.x - enemySpawn.x;
    const dz = playerPos.z - enemySpawn.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    return distance < triggerRadius;
  },

  // ---- Time of Day ----

  /**
   * Calculate time of day (0-1 where 0.5 is noon)
   */
  getTimeOfDay(gameTime) {
    return (gameTime % 120) / 120; // 2 minute day cycle
  },

  /**
   * Get sky color based on time of day
   */
  getSkyColor(timeOfDay) {
    if (timeOfDay < 0.25) {
      // Dawn
      return { r: 0.4, g: 0.3, b: 0.5 };
    } else if (timeOfDay < 0.5) {
      // Day
      return { r: 0.5, g: 0.7, b: 0.9 };
    } else if (timeOfDay < 0.75) {
      // Dusk
      return { r: 0.6, g: 0.3, b: 0.3 };
    } else {
      // Night
      return { r: 0.05, g: 0.05, b: 0.15 };
    }
  },

  /**
   * Get ambient light intensity based on time of day
   */
  getAmbientLight(timeOfDay) {
    if (timeOfDay < 0.25) return 0.4;
    if (timeOfDay < 0.5) return 0.8;
    if (timeOfDay < 0.75) return 0.5;
    return 0.2;
  },

  // ---- Save/Load ----

  /**
   * Serialize player state for saving
   */
  serializeState(player) {
    return JSON.stringify(player);
  },

  /**
   * Deserialize saved state
   */
  deserializeState(jsonString) {
    try {
      const state = JSON.parse(jsonString);
      // Validate required fields
      if (typeof state.health !== 'number' || typeof state.name !== 'string') {
        return null;
      }
      return state;
    } catch (e) {
      return null;
    }
  },

  /**
   * Get location name based on position
   */
  getLocationName(position) {
    const dist = Math.sqrt(position.x * position.x + position.z * position.z);
    
    if (dist < 15) return 'ThunderClan Camp';
    if (dist < 40) return 'ThunderClan Forest';
    if (position.x > 50) return 'Sunningrocks';
    if (position.x < -50) return 'ShadowClan Border';
    if (position.z > 50) return 'Tallpines';
    if (position.z < -50) return 'River Border';
    return 'ThunderClan Territory';
  }
};

// Export for both browser and tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameLogic;
}
