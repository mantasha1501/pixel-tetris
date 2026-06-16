const canvas = document.getElementById('tetris');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nctx = nextCanvas.getContext('2d');

ctx.scale(24, 24);
nctx.scale(20, 20);

// Colourful block colors adjusted to stylistically align with the palette depth
const colors = [
    null,
    '#ff6b8b', // Pastel Rose (I)
    '#ff9f43', // Soft Muted Coral (L)
    '#48dbfb', // Robin Egg Blue (J)
    '#feca57', // Cream Yellow (O)
    '#1dd1a1', // Washed Jade Green (S)
    '#a29bfe', // Periwinkle Tint (T)
    '#ff4757'  // Matte Crimson (Z)
];

function createPiece(type) {
    if (type === 'I') return [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]];
    if (type === 'L') return [[0,2,0],[0,2,0],[0,2,2]];
    if (type === 'J') return [[0,3,0],[0,3,0],[3,3,0]];
    if (type === 'O') return [[4,4],[4,4]];
    if (type === 'Z') return [[7,7,0],[0,7,7],[0,0,0]];
    if (type === 'S') return [[0,6,6],[6,6,0],[0,0,0]];
    if (type === 'T') return [[0,5,0],[5,5,5],[0,0,0]];
}

/* 7-Bag Randomizer Engine for zero block repetition */
let tetrisBag = [];
function getNextPieceType() {
    if (tetrisBag.length === 0) {
        tetrisBag = ['I', 'L', 'J', 'O', 'Z', 'S', 'T'];
        for (let i = tetrisBag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tetrisBag[i], tetrisBag[j]] = [tetrisBag[j], tetrisBag[i]];
        }
    }
    return tetrisBag.pop();
}

const arena = Array.from({length: 20}, () => new Array(10).fill(0));
const player = { pos: {x: 0, y: 0}, matrix: null, score: 0 };

let nextPieceMatrix = null;
let dropCounter = 0;
let baseSpeed = 1000; 
let dropInterval = 1000;
let lastTime = 0;
let isGameOver = false;
let startTime;
let timerInterval;
let particles = [];

function setSpeed(ms, btn) {
    baseSpeed = ms;
    dropInterval = ms;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    canvas.focus();
}

function collide(arena, player) {
    const [m, o] = [player.matrix, player.pos];
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 && (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) return true;
        }
    }
    return false;
}

function rotate(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
    }
    if (dir > 0) matrix.forEach(row => row.reverse()); else matrix.reverse();
}

function playerRotate(dir) {
    const pos = player.pos.x;
    let offset = 1;
    rotate(player.matrix, dir);
    while (collide(arena, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) {
            rotate(player.matrix, -dir);
            player.pos.x = pos;
            return;
        }
    }
}

function merge(arena, player) {
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) arena[y + player.pos.y][x + player.pos.x] = value;
        });
    });
}

/* Particle Line Clear FX */
function spawnParticles(yRow) {
    for (let x = 0; x < 10; x++) {
        const colorVal = arena[yRow][x] || 1;
        for (let p = 0; p < 3; p++) {
            particles.push({
                x: x + 0.5,
                y: yRow + 0.5,
                vx: (Math.random() - 0.5) * 0.2,
                vy: (Math.random() - 0.8) * 0.2,
                alpha: 1,
                color: colors[colorVal]
            });
        }
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.04;
        if (p.alpha <= 0) particles.splice(i, 1);
    }
}

function drawParticles() {
    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fillRect(p.x, p.y, 0.15, 0.15);
    });
    ctx.globalAlpha = 1.0;
}

function arenaSweep() {
    let rowCount = 0;
    outer: for (let y = arena.length - 1; y > 0; --y) {
        for (let x = 0; x < arena[y].length; ++x) {
            if (arena[y][x] === 0) continue outer;
        }
        spawnParticles(y);
        const row = arena.splice(y, 1)[0].fill(0);
        arena.unshift(row);
        ++y;
        rowCount++;
    }
    if (rowCount > 0) {
        player.score += (rowCount * 10) * rowCount;
        updateScoreUI();
        dropInterval = Math.max(100, baseSpeed - (Math.floor(player.score / 100) * 30));
    }
}

/* Ghost Target Projection System */
function getGhostPosition() {
    let ghostY = player.pos.y;
    while (!collide(arena, { pos: { x: player.pos.x, y: ghostY + 1 }, matrix: player.matrix })) {
        ghostY++;
    }
    return ghostY;
}

function playerReset() {
    player.matrix = nextPieceMatrix ? nextPieceMatrix : createPiece(getNextPieceType());
    nextPieceMatrix = createPiece(getNextPieceType());
    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);

    if (collide(arena, player)) endGame();
    drawNext();
}

function drawMatrix(matrix, offset, context, isGhost = false) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                if (isGhost) {
                    context.strokeStyle = colors[value];
                    context.lineWidth = 0.06;
                    context.strokeRect(x + offset.x + 0.05, y + offset.y + 0.05, 0.9, 0.9);
                } else {
                    // Depth shadow offset
                    context.fillStyle = 'rgba(0,0,0,0.35)';
                    context.fillRect(x + offset.x + 0.08, y + offset.y + 0.08, 1, 1);
                    // Solid core
                    context.fillStyle = colors[value];
                    context.fillRect(x + offset.x, y + offset.y, 1, 1);
                    // Soft edge highlight accent
                    context.fillStyle = 'rgba(255,255,255,0.25)';
                    context.fillRect(x + offset.x, y + offset.y, 1, 0.1);
                    context.fillRect(x + offset.x, y + offset.y, 0.1, 1);
                }
            }
        });
    });
}

function drawBackgroundGrid() {
    ctx.strokeStyle = 'rgba(114, 136, 174, 0.1)';
    ctx.lineWidth = 0.04;
    for (let x = 0; x < 10; x++) {
        for (let y = 0; y < 20; y++) {
            ctx.strokeRect(x, y, 1, 1);
        }
    }
}

function draw() {
    ctx.fillStyle = '#0b0f2b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawBackgroundGrid();
    drawMatrix(arena, {x: 0, y: 0}, ctx);
    
    const ghostY = getGhostPosition();
    drawMatrix(player.matrix, { x: player.pos.x, y: ghostY }, ctx, true);

    drawMatrix(player.matrix, player.pos, ctx);
    drawParticles();
}

function drawNext() {
    nctx.fillStyle = '#0b0f2b';
    nctx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    const size = nextPieceMatrix.length;
    const offset = { x: (size === 2) ? 1 : 0.5, y: (size === 4) ? 0 : 0.5 };
    drawMatrix(nextPieceMatrix, offset, nctx);
}

function update(time = 0) {
    if (isGameOver) return;
    const deltaTime = time - lastTime;
    lastTime = time;

    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
        playerDrop();
    }

    updateParticles();
    draw();
    requestAnimationFrame(update);
}

function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
        player.pos.y--;
        merge(arena, player);
        playerReset();
        arenaSweep();
    }
    dropCounter = 0;
}

function playerMove(offset) {
    player.pos.x += offset;
    if (collide(arena, player)) player.pos.x -= offset;
}

function updateScoreUI() {
    document.getElementById('score').innerText = player.score;
    let currentHigh = localStorage.getItem('indieTrisHighCustom') || 0;
    if (player.score > currentHigh) {
        localStorage.setItem('indieTrisHighCustom', player.score);
        document.getElementById('highScore').innerText = player.score;
    }
}

function endGame() {
    isGameOver = true;
    document.getElementById('game-over').style.display = 'flex';
    clearInterval(timerInterval);
}

function resetGame() {
    arena.forEach(row => row.fill(0));
    particles = [];
    tetrisBag = [];
    player.score = 0;
    isGameOver = false;
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('highScore').innerText = localStorage.getItem('indieTrisHighCustom') || 0;
    
    updateScoreUI();
    nextPieceMatrix = null;
    playerReset();
    
    startTime = Date.now();
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        document.getElementById('timer').innerText = Math.floor((Date.now() - startTime) / 1000) + 's';
    }, 1000);
    
    update();
}

// Action Mapping Events
document.addEventListener('keydown', e => {
    if (isGameOver) return;
    if (e.keyCode === 37) playerMove(-1);
    else if (e.keyCode === 39) playerMove(1);
    else if (e.keyCode === 40) playerDrop();
    else if (e.keyCode === 38) playerRotate(1);
});

function setupMobileControls() {
    const btns = {
        'ctrl-left': () => playerMove(-1),
        'ctrl-right': () => playerMove(1),
        'ctrl-down': () => playerDrop(),
        'ctrl-rotate': () => playerRotate(1),
    };
    for (let id in btns) {
        document.getElementById(id).addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (!isGameOver) btns[id]();
        });
    }
}

// Setup difficulty button events
document.getElementById('btn-easy').addEventListener('click', function() { setSpeed(1000, this); });
document.getElementById('btn-med').addEventListener('click', function() { setSpeed(500, this); });
document.getElementById('btn-hard').addEventListener('click', function() { setSpeed(200, this); });
document.getElementById('restart-btn').addEventListener('click', resetGame);

if ('ontouchstart' in window || navigator.maxTouchPoints > 0) setupMobileControls();
resetGame();