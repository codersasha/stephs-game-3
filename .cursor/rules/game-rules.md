# Warriors: Into the Wild - Game Rules

## Project Overview
A 3D HTML5 game based on the Warriors book series "The Prophecy Begins" graphic novels. 
You play as Fireheart, a cat in the forest, with third-person camera and WASD/arrow key controls.

## Technology
- **Pure HTML5, CSS, and JavaScript** - no frameworks, no build tools, no backend
- **Three.js** from CDN for 3D graphics
- **Hosting**: Static GitHub Pages
- **Responsive**: Must work on phones, tablets, and desktops

## Workflow Rules
1. **Auto-commit and push**: After making changes, automatically commit with a descriptive message and push to GitHub. Don't ask for permission.
2. **Open in browser**: After changes, open the game locally using `python3 -m http.server 8080` and the Cursor browser.
3. **Run tests**: If there's a test suite, run it after changes.
4. **Fix bugs immediately**: If something breaks, fix it right away.

## Game Development Rules
1. **Simple UI**: Make buttons big and easy to tap on phones
2. **Save progress**: Use localStorage to save game data (no accounts)
3. **Sound effects**: Use Web Audio API (no external files)
4. **Graphics**: Use Three.js for 3D, SVG for UI elements
5. **Target audience**: Kids (~8 years old) - keep it easy to understand

## File Structure
```
/
├── index.html          (main game page)
├── css/
│   └── style.css       (all styles)
├── js/
│   ├── game.js         (main game code - 3D scene, rendering, controls)
│   └── game-logic.js   (testable game logic - pure functions)
├── tests/
│   └── test-runner.html (browser-based tests)
└── .github/
    └── workflows/
        └── deploy.yml  (GitHub Pages deployment)
```

## Game Details
- **Character**: Fireheart (orange tabby cat)
- **Setting**: ThunderClan forest territory
- **View**: Third-person camera following the cat
- **Controls**: WASD or arrow keys to move, mouse to look around
- **3D Library**: Three.js from CDN
- **Theme**: Based on Warriors: The Prophecy Begins graphic novels

## If Multiplayer Is Requested
Use PeerJS (WebRTC) from CDN for peer-to-peer multiplayer.

## Communication Style
- Be patient and helpful (user might be a kid)
- Ask simple questions if unclear
- Show the game after each change
- Make small changes and test often
