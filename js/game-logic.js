/* ========================================
   Warriors: Into the Wild - Game Logic
   Pure functions for testable game logic
   ======================================== */

const GameLogic = {

  // ---- Player Stats ----
  
  /**
   * Create a new player state
   */
  createPlayer(name = 'Fireheart') {
    return {
      name: name,
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
      clan: 'ThunderClan'
    };
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
