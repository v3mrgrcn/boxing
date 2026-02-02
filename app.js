// === Shadow Boxing Web App ===
// Production-ready with custom audio support

// === Audio Manager (Low Latency Web Audio API) ===
class AudioManager {
    constructor() {
        this.ctx = null;
        this.bufferCache = new Map();
        this.basePath = './';
        this.isLocked = true;
    }

    // Initialize AudioContext on user interaction
    init() {
        if (this.ctx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        // Play silent buffer to unlock audio on mobile
        const buffer = this.ctx.createBuffer(1, 1, 22050);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.ctx.destination);
        source.start(0);

        if (this.ctx.state === 'suspended') {
            this.unlock();
        }
    }

    async unlock() {
        if (!this.ctx) return;
        try {
            await this.ctx.resume();
            this.isLocked = false;
            console.log('🔊 AudioContext unlocked and active');
        } catch (e) {
            console.warn('AudioContext unlock failed:', e);
        }
    }

    async preload(files) {
        this.init();
        const promises = files.map(file => this.load(file));
        await Promise.allSettled(promises);
    }

    async load(file) {
        if (this.bufferCache.has(file)) return this.bufferCache.get(file);

        try {
            const response = await fetch(`${this.basePath}${file}`);
            const arrayBuffer = await response.arrayBuffer();

            // Ensure context is initialized before decoding
            this.init();

            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.bufferCache.set(file, audioBuffer);
            return audioBuffer;
        } catch (error) {
            console.warn(`Failed to load audio: ${file}`, error);
            return null;
        }
    }

    async play(file, priority = false) {
        if (!this.ctx) this.init();
        if (this.ctx.state === 'suspended') await this.unlock();

        let buffer = this.bufferCache.get(file);
        if (!buffer) {
            buffer = await this.load(file);
        }

        if (!buffer) return;

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.ctx.destination);

        // Return promise that resolves when sound ends
        return new Promise(resolve => {
            source.onended = resolve;
            source.start(0);
        });
    }

    stop() {
        // In Web Audio API, we usually stop specific nodes. 
        // For simplicity, we just allow current buffers to finish or could implement a gain node to fade out.
    }
}

// === Haptic Manager ===
class HapticManager {
    static light() {
        if (navigator.vibrate) navigator.vibrate(10);
    }

    static medium() {
        if (navigator.vibrate) navigator.vibrate(30);
    }

    static heavy() {
        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
    }

    static success() {
        if (navigator.vibrate) navigator.vibrate([30, 50, 30, 50, 100]);
    }
}

// === Punch Dictionary ===
const PUNCHES = {
    1: { name: 'Jab', audio: 'jab.mp3' },
    2: { name: 'Cross', audio: 'cross.mp3' },
    3: { name: 'Lead Hook', audio: 'lead_hook.mp3' },
    4: { name: 'Rear Hook', audio: 'rear_hook.mp3' },
    5: { name: 'Lead Uppercut', audio: 'lead_uppercut.mp3' },
    6: { name: 'Rear Uppercut', audio: 'rear_uppercut.mp3' }
};

const DEFENSE = {
    slip: { name: 'Slip', audio: 'slip.mp3' },
    roll: { name: 'Roll', audio: 'roll.mp3' },
    pivot: { name: 'Pivot', audio: 'pivot.mp3' },
    duck: { name: 'Duck', audio: 'duck.mp3' },
    block: { name: 'Block', audio: 'block.mp3' }
};

// === Breathing Patterns ===
const BREATHING_PATTERNS = {
    box: {
        name: 'Box Breathing',
        phases: [
            { phase: 'Nefes Al', duration: 4, audio: 'inhale.mp3', ring: 'inhale' },
            { phase: 'Tut', duration: 4, audio: 'hold.mp3', ring: 'hold' },
            { phase: 'Nefes Ver', duration: 4, audio: 'exhale.mp3', ring: 'exhale' },
            { phase: 'Tut', duration: 4, audio: 'hold.mp3', ring: 'hold' }
        ]
    },
    '478': {
        name: '4-7-8',
        phases: [
            { phase: 'Nefes Al', duration: 4, audio: 'inhale.mp3', ring: 'inhale' },
            { phase: 'Tut', duration: 7, audio: 'hold.mp3', ring: 'hold' },
            { phase: 'Nefes Ver', duration: 8, audio: 'exhale.mp3', ring: 'exhale' }
        ]
    },
    resonant: {
        name: 'Resonant',
        phases: [
            { phase: 'Nefes Al', duration: 5, audio: 'inhale.mp3', ring: 'inhale' },
            { phase: 'Nefes Ver', duration: 5, audio: 'exhale.mp3', ring: 'exhale' }
        ]
    }
};

// === App State ===
const state = {
    // Workout
    workoutState: 'idle', // idle, prepare, work, rest, paused, finished
    currentRound: 0,
    totalRounds: 6,
    roundDuration: 180,
    restDuration: 60,
    endDate: null,
    pausedRemaining: null,
    timerInterval: null,
    comboInterval: null,
    difficulty: 'medium',
    comboIntervalMs: 6000,
    voiceEnabled: true,
    singleComboMode: false,
    lastCombo: [],

    // Breathing
    breathingActive: false,
    currentExercise: 'box',
    currentCycle: 0,
    totalCycles: 5,
    breathInterval: null,

    // Streak & Progress
    completions: [],
    currentStreak: 0,
    totalWorkouts: 0,

    // Free Timer
    freeTimerActive: false,
    freeRound: 0,
    freeTotalRounds: 6,
    freeRoundDuration: 180,
    freeRestDuration: 60,
    freeState: 'idle' // idle, prepare, work, rest
};

// === Initialize Audio Manager ===
const audioManager = new AudioManager();

// Preload essential audio files
const essentialAudio = [
    // System sounds
    'get_ready.mp3', 'round_start.mp3', 'rest.mp3', 'workout_complete.mp3',
    'last_10_seconds.mp3', 'time_reset.mp3', 'pause.mp3', 'resume.mp3',
    // Bell & effects
    'bell_start.mp3', 'bell_end.mp3', 'beep.mp3', 'victory.mp3',
    // Countdown
    '1.mp3', '2.mp3', '3.mp3', '4.mp3', '5.mp3', '6.mp3',
    '7.mp3', '8.mp3', '9.mp3', '10.mp3',
    // Punches - numbers
    'jab.mp3', 'cross.mp3', 'lead_hook.mp3', 'rear_hook.mp3',
    'lead_uppercut.mp3', 'rear_uppercut.mp3',
    // Breathing
    'inhale.mp3', 'exhale.mp3', 'hold.mp3', 'breathe_complete.mp3',
    // Round announcements
    'round_1.mp3', 'round_2.mp3', 'round_3.mp3', 'round_4.mp3',
    'round_5.mp3', 'round_6.mp3', 'round_7.mp3', 'round_8.mp3',
    'round_9.mp3', 'round_10.mp3', 'round_11.mp3', 'round_12.mp3'
];

// === DOM Elements ===
const elements = {
    // Tabs
    tabItems: document.querySelectorAll('.tab-item'),
    tabContents: document.querySelectorAll('.tab-content'),

    // Training
    stateBadge: document.getElementById('state-badge'),
    timerDisplay: document.getElementById('timer-display'),
    progressRing: document.getElementById('progress-ring'),
    roundCounter: document.getElementById('round-counter'),
    comboSection: document.getElementById('combo-section'),
    comboDisplay: document.getElementById('combo-display'),
    comboHint: document.getElementById('combo-hint'),
    settingsPanel: document.getElementById('settings-panel'),
    btnPlay: document.getElementById('btn-play'),
    btnStop: document.getElementById('btn-stop'),
    btnResync: document.getElementById('btn-resync'),
    playIcon: document.getElementById('play-icon'),
    playText: document.getElementById('play-text'),

    // Settings
    difficultyControl: document.getElementById('difficulty-control'),
    voiceControl: document.getElementById('voice-control'),
    roundDuration: document.getElementById('round-duration'),
    restDuration: document.getElementById('rest-duration'),
    roundCount: document.getElementById('round-count'),
    comboIntervalSelect: document.getElementById('combo-interval'),
    comboModeControl: document.getElementById('combo-mode-control'),

    // Breathing
    breathingRing: document.getElementById('breathing-ring'),
    breathPhase: document.getElementById('breath-phase'),
    breathTimer: document.getElementById('breath-timer'),
    cycleCounter: document.getElementById('cycle-counter'),
    cycleCount: document.getElementById('cycle-count'),
    cycleBarFill: document.getElementById('cycle-bar-fill'),
    btnBreathStart: document.getElementById('btn-breath-start'),
    exerciseCards: document.querySelectorAll('.exercise-card'),
    cycleMinus: document.getElementById('cycle-minus'),
    cyclePlus: document.getElementById('cycle-plus'),

    // Free Timer
    freeRoundDuration: document.getElementById('free-round-duration'),
    freeRestDuration: document.getElementById('free-rest-duration'),
    freeRoundCount: document.getElementById('free-round-count'),
    btnFreeStart: document.getElementById('btn-free-start'),
    btnFreeStop: document.getElementById('btn-free-stop'),
    freeDisplay: document.getElementById('free-display'),
    freeTimerValue: document.getElementById('free-timer-value'),
    freeTimerLabel: document.getElementById('free-timer-label'),
    freeRoundLabel: document.getElementById('free-round-label'),
    freePlayIcon: document.getElementById('free-play-icon'),
    freePlayText: document.getElementById('free-play-text'),

    // Progress
    streakGrid: document.getElementById('streak-grid'),
    statStreak: document.getElementById('stat-current-streak'),
    statTotal: document.getElementById('stat-total-workouts')
};

// === Progress Ring Constants ===
const RING_CIRCUMFERENCE = 2 * Math.PI * 90; // r=90

// === Tab Navigation ===
elements.tabItems.forEach(item => {
    item.addEventListener('click', () => {
        const tabName = item.dataset.tab;

        elements.tabItems.forEach(t => t.classList.remove('active'));
        elements.tabContents.forEach(c => c.classList.remove('active'));

        item.classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        if (tabName === 'progress') {
            renderStreakGrid();
        }

        HapticManager.light();
    });
});

// === Segmented Controls ===
function setupSegmentedControl(container, callback) {
    const segments = container.querySelectorAll('.segment');
    segments.forEach(segment => {
        segment.addEventListener('click', () => {
            segments.forEach(s => s.classList.remove('active'));
            segment.classList.add('active');
            callback(segment.dataset.value);
            HapticManager.light();
        });
    });
}

setupSegmentedControl(elements.difficultyControl, (value) => {
    state.difficulty = value;
});

setupSegmentedControl(elements.voiceControl, (value) => {
    state.voiceEnabled = (value === 'on');
});

setupSegmentedControl(elements.comboModeControl, (value) => {
    state.singleComboMode = (value === 'single');
});

// === Utility Functions ===
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateProgressRing(progress, isRest = false) {
    const offset = RING_CIRCUMFERENCE * (1 - progress);
    elements.progressRing.style.strokeDashoffset = offset;
    elements.progressRing.classList.toggle('rest', isRest);
}

function setControlsEnabled(isRunning) {
    elements.btnResync.disabled = !isRunning;
    elements.btnStop.disabled = !isRunning;

    // Close settings when running
    if (isRunning) {
        elements.settingsPanel.removeAttribute('open');
    }
}

function updatePlayButton(isPaused) {
    elements.playIcon.textContent = isPaused ? '▶' : '⏸';
    elements.playText.textContent = isPaused ? 'Devam' : 'Duraklat';
}

// === Combo Library (Based on ExpertBoxing + Custom) ===
// 1=Jab, 2=Cross, 3=Lead Hook, 4=Rear Hook, 5=Lead Uppercut, 6=Rear Uppercut
// Defense: slip, roll, pivot, duck, block
const COMBO_LIBRARY = {
    // Easy: Basic 2-3 punch combinations
    easy: [
        [1, 1],           // Jab-Jab
        [1, 2],           // Jab-Cross
        [1, 1, 2],        // Jab-Jab-Cross
        [1, 2, 1],        // Jab-Cross-Jab
        [2, 1],           // Cross-Jab
        [1, 3],           // Jab-Hook
        [1, 2, 3],        // Jab-Cross-Hook
        [3, 2],           // Hook-Cross
        [1, 6],           // Jab-Uppercut
        [2, 3],           // Cross-Hook
    ],
    // Medium: Classic 3-5 punch combinations
    medium: [
        [1, 2, 1, 2],     // Jab-Cross-Jab-Cross
        [1, 2, 3, 2],     // Jab-Cross-Hook-Cross (Classic)
        [1, 6, 3, 2],     // Jab-Uppercut-Hook-Cross
        [1, 2, 3, 4],     // Jab-Cross-Hook-Hook
        [1, 2, 5, 2],     // Jab-Cross-Uppercut-Cross
        [2, 3, 2],        // Cross-Hook-Cross
        [1, 1, 2, 3],     // Double Jab-Cross-Hook
        [5, 2, 3],        // Uppercut-Cross-Hook
        [6, 3, 2],        // Rear Uppercut-Hook-Cross
        [1, 2, 3, 6, 3],  // Jab-Cross-Hook-Uppercut-Hook
        [3, 2, 1],        // Hook-Cross-Jab
        [1, 3, 2],        // Jab-Hook-Cross (Tricky)
        [4, 1, 2],        // Hook-Jab-Cross
        [6, 5, 2, 1, 2],  // Uppercut-Uppercut-Cross-Jab-Cross
        [1, 2, 3, 2, 1],  // 5-punch combo
    ],
    // Hard: Advanced combinations with defense moves
    hard: [
        [1, 2, 'slip', 1, 2],           // Jab-Cross-Slip-Jab-Cross
        [1, 2, 'roll', 3, 2],           // Jab-Cross-Roll-Hook-Cross
        [6, 5, 2, 1, 'pivot'],          // Infighting to pivot
        [1, 'slip', 2, 3, 2],           // Jab-Slip-Cross-Hook-Cross
        [1, 2, 3, 'roll', 3, 2, 3],     // Long combo with roll
        [4, 3, 6, 1, 2, 3],             // Hook-Hook-Uppercut combo
        [1, 2, 3, 4, 5, 6],             // Full combo
        [1, 6, 3, 2, 'pivot'],          // Combo ending with pivot
        [1, 1, 2, 'slip', 3, 2],        // Double jab with counter
        [2, 'duck', 5, 2, 3],           // Cross-Duck-Uppercut-Cross-Hook
        [1, 2, 'roll', 5, 6, 3, 2],     // Rolling uppercut combo
        [6, 3, 'pivot', 1, 2],          // Infight then pivot out
        [1, 2, 3, 2, 'slip', 1, 2],     // Long evasive combo
        [3, 6, 3, 2, 1, 2],             // Hook-Uppercut power series
        [1, 'duck', 6, 3, 2, 'pivot'],  // Full evasive combo
    ]
};

// Track last used combos to avoid repetition
let usedComboIndices = { easy: [], medium: [], hard: [] };

// === Combo Generation ===
function generateCombo() {
    const difficulty = state.difficulty;
    const combos = COMBO_LIBRARY[difficulty];

    // Reset indices if we've used most combos
    if (usedComboIndices[difficulty].length >= combos.length - 2) {
        usedComboIndices[difficulty] = [];
    }

    // Pick a random unused combo
    let comboIndex;
    do {
        comboIndex = Math.floor(Math.random() * combos.length);
    } while (usedComboIndices[difficulty].includes(comboIndex));

    usedComboIndices[difficulty].push(comboIndex);

    const combo = combos[comboIndex];
    state.lastCombo = combo;

    // Display combo
    const displayParts = combo.map(p => {
        if (typeof p === 'string') {
            return DEFENSE[p]?.name || p;
        }
        return PUNCHES[p].name;
    });

    elements.comboDisplay.textContent = displayParts.join(' - ');
    elements.comboSection.classList.add('active');

    // Play audio sequence
    if (state.voiceEnabled) {
        playComboAudio(combo);
    }

    HapticManager.medium();
}

async function playComboAudio(combo) {
    for (const punch of combo) {
        if (typeof punch === 'string') {
            // Defense move
            if (DEFENSE[punch]) {
                await audioManager.play(DEFENSE[punch].audio);
            }
        } else {
            // Punch
            await audioManager.play(PUNCHES[punch].audio);
        }
        await new Promise(r => setTimeout(r, 400)); // Gap between punches
    }
}

// === Timer Update ===
function updateTimer() {
    if (!state.endDate || state.workoutState === 'paused') return;

    const remaining = Math.max(0, (state.endDate - Date.now()) / 1000);
    elements.timerDisplay.textContent = formatTime(remaining);

    // Calculate progress
    const totalDuration = state.workoutState === 'work' ? state.roundDuration : state.restDuration;
    const progress = remaining / totalDuration;
    updateProgressRing(progress, state.workoutState === 'rest');

    // Last 10 seconds warning with countdown beeps
    if (remaining <= 10 && remaining > 0) {
        elements.timerDisplay.classList.add('warning');

        const currentSecond = Math.floor(remaining);
        const prevSecond = Math.floor(remaining + 0.05);

        // Play countdown sounds (always enabled for timing)
        if (currentSecond !== prevSecond) {
            if (currentSecond === 9) {
                audioManager.play('last_10_seconds.mp3', true);
            } else if (currentSecond <= 2 && currentSecond >= 0) {
                audioManager.play(`${currentSecond + 1}.mp3`, true);
            } else if (currentSecond < 9 && currentSecond > 2) {
                audioManager.play('beep.mp3', true);
            }
        }
    } else {
        elements.timerDisplay.classList.remove('warning');
    }

    if (remaining <= 0) {
        handlePhaseComplete();
    }
}

// === Phase Handlers ===
function handlePhaseComplete() {
    HapticManager.heavy();

    if (state.workoutState === 'prepare') {
        startWorkPhase();
    } else if (state.workoutState === 'work') {
        if (state.currentRound >= state.totalRounds) {
            finishWorkout();
        } else {
            startRestPhase();
        }
    } else if (state.workoutState === 'rest') {
        startWorkPhase();
    }
}

function startPrepare() {
    state.workoutState = 'prepare';
    state.currentRound = 0;
    state.lastCombo = [];

    elements.stateBadge.textContent = 'HAZIRLAN';
    elements.stateBadge.className = 'state-badge prepare';
    elements.comboDisplay.textContent = '3...2...1';
    elements.comboHint.textContent = '';

    state.endDate = Date.now() + 3000;
    updateProgressRing(1);

    state.timerInterval = setInterval(updateTimer, 50);
    updateTimer();

    setControlsEnabled(true);

    audioManager.play('get_ready.mp3', true);
}

function startWorkPhase() {
    state.workoutState = 'work';
    state.currentRound++;

    elements.stateBadge.textContent = `ROUND ${state.currentRound}`;
    elements.stateBadge.className = 'state-badge work';
    elements.roundCounter.textContent = `${state.currentRound} / ${state.totalRounds}`;
    elements.comboHint.textContent = '';

    state.roundDuration = parseInt(elements.roundDuration.value);
    state.endDate = Date.now() + state.roundDuration * 1000;

    // Play bell (always enabled)
    audioManager.play('bell_start.mp3', true);

    // Play round announcement (voice enabled)
    if (state.voiceEnabled) {
        setTimeout(() => {
            const roundAudio = `round_${state.currentRound}.mp3`;
            audioManager.play(roundAudio, true);
        }, 800);
    }

    // Start combo generation after short delay
    setTimeout(() => {
        if (state.workoutState === 'work') {
            generateCombo();
            if (!state.singleComboMode) {
                startComboInterval();
            }
        }
    }, 2000);

    // Keep screen awake
    requestWakeLock();
}

function startComboInterval() {
    clearInterval(state.comboInterval);

    let intervalSec = parseInt(elements.comboIntervalSelect.value);

    // Auto-adjust for Hard difficulty if interval is too short
    if (state.difficulty === 'hard' && intervalSec < 8) {
        intervalSec = 8;
        console.log('🥊 Hard mode detected: Combo interval adjusted to 8s to prevent overlap.');
    }

    state.comboIntervalMs = intervalSec * 1000;
    const randomVariance = () => Math.random() * 2000 - 1000; // ±1 second

    state.comboInterval = setInterval(() => {
        if (state.workoutState === 'work') {
            // Check if we're not in last 10 seconds
            const remaining = (state.endDate - Date.now()) / 1000;
            if (remaining > 12) {
                generateCombo();
            }
        }
    }, state.comboIntervalMs + randomVariance());
}

function startRestPhase() {
    state.workoutState = 'rest';

    elements.stateBadge.textContent = 'MOLA';
    elements.stateBadge.className = 'state-badge rest';
    elements.comboDisplay.textContent = '💪 Dinlen';
    elements.comboHint.textContent = `Sonraki: Round ${state.currentRound + 1}`;
    elements.comboSection.classList.remove('active');

    clearInterval(state.comboInterval);

    state.restDuration = parseInt(elements.restDuration.value);
    state.endDate = Date.now() + state.restDuration * 1000;

    // Play bell end (always)
    audioManager.play('bell_end.mp3', true);

    // Play rest announcement (voice enabled)
    if (state.voiceEnabled) {
        setTimeout(() => {
            audioManager.play('rest.mp3', true);
        }, 600);
    }
}

function finishWorkout() {
    state.workoutState = 'finished';

    elements.stateBadge.textContent = 'BİTTİ!';
    elements.stateBadge.className = 'state-badge';
    elements.comboDisplay.textContent = '🥊 Başardınız!';
    elements.comboHint.textContent = `${state.totalRounds} round tamamlandı`;
    elements.comboSection.classList.remove('active');
    elements.timerDisplay.classList.remove('warning');

    clearInterval(state.timerInterval);
    clearInterval(state.comboInterval);

    updateProgressRing(0);
    updatePlayButton(true);
    elements.playText.textContent = 'Yeniden';

    // Play bell, workout complete, then victory sound
    audioManager.play('bell_end.mp3', true);

    if (state.voiceEnabled) {
        setTimeout(() => {
            audioManager.play('workout_complete.mp3', true);
            setTimeout(() => {
                audioManager.play('victory.mp3', false);
            }, 1500);
        }, 600);
    }

    HapticManager.success();
    releaseWakeLock();
    saveWorkoutCompletion();
}

function pauseWorkout() {
    state.workoutState = 'paused';
    state.pausedRemaining = state.endDate - Date.now();

    elements.stateBadge.textContent = 'DURAKLADI';
    elements.stateBadge.className = 'state-badge paused';

    clearInterval(state.comboInterval);

    updatePlayButton(true);

    audioManager.play('pause.mp3', true);
}

function resumeWorkout() {
    // Restore previous state
    const wasWork = elements.roundCounter.textContent.includes(state.currentRound.toString());
    state.workoutState = wasWork ? 'work' : 'rest';

    elements.stateBadge.textContent = state.workoutState === 'work'
        ? `ROUND ${state.currentRound}`
        : 'MOLA';
    elements.stateBadge.className = `state-badge ${state.workoutState}`;

    state.endDate = Date.now() + state.pausedRemaining;

    if (state.workoutState === 'work') {
        startComboInterval();
    }

    updatePlayButton(false);

    audioManager.play('resume.mp3', true);
}

function stopWorkout() {
    state.workoutState = 'idle';

    elements.stateBadge.textContent = 'HAZIR';
    elements.stateBadge.className = 'state-badge';
    elements.timerDisplay.textContent = '00:00';
    elements.timerDisplay.classList.remove('warning');
    elements.comboDisplay.textContent = '--';
    elements.comboHint.textContent = '';
    elements.comboSection.classList.remove('active');
    state.currentRound = 0;
    elements.roundCounter.textContent = `0 / ${state.totalRounds}`;

    clearInterval(state.timerInterval);
    clearInterval(state.comboInterval);

    updateProgressRing(0);
    setControlsEnabled(false);
    updatePlayButton(true);
    elements.playText.textContent = 'Başlat';

    audioManager.stop();
    releaseWakeLock();
}

function resyncTimer() {
    if (state.workoutState === 'work') {
        state.endDate = Date.now() + state.roundDuration * 1000;
        audioManager.play('time_reset.mp3', true);
        HapticManager.medium();
    } else if (state.workoutState === 'rest') {
        state.endDate = Date.now() + state.restDuration * 1000;
        audioManager.play('time_reset.mp3', true);
        HapticManager.medium();
    }
}

// === Event Listeners: Training ===
elements.btnPlay.addEventListener('click', () => {
    // Initialize audio on first interaction
    audioManager.init();

    state.totalRounds = parseInt(elements.roundCount.value);

    switch (state.workoutState) {
        case 'idle':
        case 'finished':
            startPrepare();
            updatePlayButton(false);
            break;
        case 'paused':
            resumeWorkout();
            break;
        case 'prepare':
        case 'work':
        case 'rest':
            pauseWorkout();
            break;
    }
});

elements.btnStop.addEventListener('click', stopWorkout);
elements.btnResync.addEventListener('click', resyncTimer);

elements.roundCount.addEventListener('change', () => {
    state.totalRounds = parseInt(elements.roundCount.value);
    elements.roundCounter.textContent = `${state.currentRound} / ${state.totalRounds}`;
});

// === Breathing Tab ===
elements.exerciseCards.forEach(card => {
    card.addEventListener('click', () => {
        if (state.breathingActive) return;

        elements.exerciseCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        state.currentExercise = card.dataset.exercise;
        HapticManager.light();
    });
});

elements.cycleMinus.addEventListener('click', () => {
    if (state.totalCycles > 1) {
        state.totalCycles--;
        elements.cycleCount.textContent = state.totalCycles;
        elements.cycleCounter.textContent = `${state.currentCycle} / ${state.totalCycles}`;
        HapticManager.light();
    }
});

elements.cyclePlus.addEventListener('click', () => {
    if (state.totalCycles < 20) {
        state.totalCycles++;
        elements.cycleCount.textContent = state.totalCycles;
        elements.cycleCounter.textContent = `${state.currentCycle} / ${state.totalCycles}`;
        HapticManager.light();
    }
});

// === Breathing Exercise ===
function startBreathing() {
    // Initialize audio on first interaction
    audioManager.init();

    if (state.breathingActive) {
        stopBreathing();
        return;
    }

    state.breathingActive = true;
    state.currentCycle = 0;

    elements.btnBreathStart.querySelector('span:first-child').textContent = '⏹';
    elements.btnBreathStart.querySelector('span:last-child').textContent = 'Durdur';
    elements.breathingRing.classList.add('active');

    // Disable exercise selection while running
    elements.exerciseCards.forEach(c => c.style.pointerEvents = 'none');

    runBreathingCycle();
    requestWakeLock();
}

function runBreathingCycle() {
    const pattern = BREATHING_PATTERNS[state.currentExercise];
    let phaseIndex = 0;
    let countdown = pattern.phases[0].duration;

    function updatePhase() {
        const phase = pattern.phases[phaseIndex];
        elements.breathPhase.textContent = phase.phase;
        elements.breathTimer.textContent = countdown;

        // Update ring animation
        elements.breathingRing.className = 'breathing-ring active';
        elements.breathingRing.classList.add(phase.ring);

        // Set transition duration based on phase
        elements.breathingRing.style.transitionDuration = `${phase.duration}s`;

        audioManager.play(phase.audio, true);
        HapticManager.light();
    }

    updatePhase();

    state.breathInterval = setInterval(() => {
        if (!state.breathingActive) return;

        countdown--;
        elements.breathTimer.textContent = countdown;

        if (countdown <= 0) {
            phaseIndex++;

            if (phaseIndex >= pattern.phases.length) {
                // Cycle complete
                state.currentCycle++;
                elements.cycleCounter.textContent = `${state.currentCycle} / ${state.totalCycles}`;
                elements.cycleBarFill.style.width = `${(state.currentCycle / state.totalCycles) * 100}%`;

                HapticManager.medium();

                if (state.currentCycle >= state.totalCycles) {
                    stopBreathing();
                    audioManager.play('breathe_complete.mp3', true);
                    HapticManager.success();
                    return;
                }

                phaseIndex = 0;
            }

            countdown = pattern.phases[phaseIndex].duration;
            updatePhase();
        }
    }, 1000);
}

function stopBreathing() {
    state.breathingActive = false;
    clearInterval(state.breathInterval);

    elements.breathingRing.className = 'breathing-ring';
    elements.breathingRing.style.transitionDuration = '';
    elements.breathPhase.textContent = 'Hazır';
    elements.breathTimer.textContent = '0';

    elements.btnBreathStart.querySelector('span:first-child').textContent = '▶';
    elements.btnBreathStart.querySelector('span:last-child').textContent = 'Başlat';

    // Re-enable exercise selection
    elements.exerciseCards.forEach(c => c.style.pointerEvents = '');

    audioManager.stop();
    releaseWakeLock();
}

elements.btnBreathStart.addEventListener('click', startBreathing);

// === Wake Lock (Keep Screen On) ===
let wakeLock = null;

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
            console.warn('Wake Lock failed:', err);
        }
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
}

// Re-acquire wake lock on visibility change
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        if (state.workoutState === 'work' || state.workoutState === 'rest' || state.breathingActive) {
            await requestWakeLock();
        }
    }
});

// === Initialization ===
function init() {
    // Set initial values
    elements.roundCounter.textContent = `0 / ${state.totalRounds}`;
    elements.cycleCounter.textContent = `0 / ${state.totalCycles}`;
    elements.cycleCount.textContent = state.totalCycles;

    // Initialize progress ring
    elements.progressRing.style.strokeDasharray = RING_CIRCUMFERENCE;
    elements.progressRing.style.strokeDashoffset = RING_CIRCUMFERENCE;

    // Preload audio
    audioManager.preload(essentialAudio);

    // Register Service Worker for PWA
    registerServiceWorker();

    // Setup audio cache button
    setupAudioCacheButton();
    loadStreakData();

    console.log('🥊 Shadow Boxing App initialized');
}


// === Streak & Progress Management ===
function saveWorkoutCompletion() {
    const today = new Date().toISOString().split('T')[0];
    if (!state.completions.includes(today)) {
        state.completions.push(today);
        localStorage.setItem('shadowboxing_completions', JSON.stringify(state.completions));
        calculateStreak();
    }
}

function loadStreakData() {
    const saved = localStorage.getItem('shadowboxing_completions');
    if (saved) {
        state.completions = JSON.parse(saved);
        calculateStreak();
    }
}

function calculateStreak() {
    if (state.completions.length === 0) {
        state.currentStreak = 0;
        state.totalWorkouts = 0;
        return;
    }

    state.totalWorkouts = state.completions.length;

    const sortedDates = [...state.completions].sort().reverse();
    let streak = 0;
    let todayValue = new Date();
    todayValue.setHours(0, 0, 0, 0);

    let lastDate = new Date(sortedDates[0]);
    lastDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((todayValue - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays <= 1) {
        streak = 1;
        for (let i = 1; i < sortedDates.length; i++) {
            const current = new Date(sortedDates[i]);
            const prev = new Date(sortedDates[i - 1]);
            current.setHours(0, 0, 0, 0);
            prev.setHours(0, 0, 0, 0);

            const diff = Math.floor((prev - current) / (1000 * 60 * 60 * 24));
            if (diff === 1) {
                streak++;
            } else {
                break;
            }
        }
    }

    state.currentStreak = streak;
    if (elements.statStreak) elements.statStreak.textContent = state.currentStreak;
    if (elements.statTotal) elements.statTotal.textContent = state.totalWorkouts;
}

function renderStreakGrid() {
    if (!elements.streakGrid) return;
    elements.streakGrid.innerHTML = '';
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthPrefix = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${monthPrefix}-${d.toString().padStart(2, '0')}`;
        const dayDiv = document.createElement('div');
        dayDiv.className = 'streak-day';
        if (state.completions.includes(dateStr)) dayDiv.classList.add('completed');
        if (dateStr === new Date().toISOString().split('T')[0]) dayDiv.classList.add('today');
        dayDiv.textContent = d;
        elements.streakGrid.appendChild(dayDiv);
    }
}

// === Free Timer Logic ===
function startFreeTimer() {
    state.freeTimerActive = true;
    state.freeRound = 0;
    state.freeTotalRounds = parseInt(elements.freeRoundCount.value);
    state.freeRoundDuration = parseInt(elements.freeRoundDuration.value);
    state.freeRestDuration = parseInt(elements.freeRestDuration.value);

    elements.freeDisplay.style.display = 'block';
    document.querySelector('#free-tab .settings-panel').style.display = 'none';
    elements.btnFreeStop.style.display = 'block';
    elements.freePlayText.textContent = 'Durdur';
    elements.freePlayIcon.textContent = '⏹';

    runFreePrepare();
    requestWakeLock();
}

function stopFreeTimer() {
    state.freeTimerActive = false;
    clearInterval(state.freeInterval);
    elements.freeDisplay.style.display = 'none';
    document.querySelector('#free-tab .settings-panel').style.display = 'block';
    elements.btnFreeStop.style.display = 'none';
    elements.freePlayText.textContent = 'Başlat';
    elements.freePlayIcon.textContent = '▶';
    document.body.classList.remove('flash-work', 'flash-rest');
    releaseWakeLock();
}

function runFreePrepare() {
    state.freeState = 'prepare';
    elements.freeTimerLabel.textContent = 'HAZIRLAN';
    elements.freeRoundLabel.textContent = '';
    let countdown = 3;
    elements.freeTimerValue.textContent = formatTime(countdown);

    if (state.voiceEnabled) audioManager.play('get_ready.mp3', true);

    state.freeInterval = setInterval(() => {
        countdown--;
        if (countdown >= 0) {
            elements.freeTimerValue.textContent = formatTime(countdown);
        }
        if (countdown <= 0) {
            clearInterval(state.freeInterval);
            runFreeWork();
        }
    }, 1000);
}

function runFreeWork() {
    state.freeState = 'work';
    state.freeRound++;
    elements.freeRoundLabel.textContent = `Round ${state.freeRound} / ${state.freeTotalRounds}`;
    elements.freeTimerLabel.textContent = 'ÇALIŞ!';
    document.body.classList.add('flash-work');

    let remaining = state.freeRoundDuration;
    elements.freeTimerValue.textContent = formatTime(remaining);

    // Play bell (always)
    audioManager.play('bell_start.mp3', true);

    if (state.voiceEnabled) {
        setTimeout(() => {
            if (state.freeTimerActive && state.freeState === 'work') {
                audioManager.play(`round_${state.freeRound}.mp3`, true);
            }
        }, 800);
    }

    state.freeInterval = setInterval(() => {
        remaining--;
        if (remaining >= 0) {
            elements.freeTimerValue.textContent = formatTime(remaining);
        }

        if (remaining <= 10 && remaining > 0 && state.voiceEnabled) {
            if (remaining === 10) audioManager.play('last_10_seconds.mp3', true);
            else if (remaining <= 3) audioManager.play(`${remaining}.mp3`, true);
            else audioManager.play('beep.mp3', true);
        }

        if (remaining <= 0) {
            clearInterval(state.freeInterval);
            document.body.classList.remove('flash-work');
            if (state.freeRound < state.freeTotalRounds) runFreeRest();
            else finishFreeWorkout();
        }
    }, 1000);
}

function runFreeRest() {
    state.freeState = 'rest';
    elements.freeTimerLabel.textContent = 'MOLA';
    document.body.classList.add('flash-rest');

    let remaining = state.freeRestDuration;
    elements.freeTimerValue.textContent = formatTime(remaining);

    // Bell (always)
    audioManager.play('bell_end.mp3', true);

    if (state.voiceEnabled) {
        setTimeout(() => {
            if (state.freeTimerActive && state.freeState === 'rest') {
                audioManager.play('rest.mp3', true);
            }
        }, 600);
    }

    state.freeInterval = setInterval(() => {
        remaining--;
        if (remaining >= 0) {
            elements.freeTimerValue.textContent = formatTime(remaining);
        }

        if (remaining <= 10 && remaining > 0 && state.voiceEnabled) {
            if (remaining === 10) audioManager.play('last_10_seconds.mp3', true);
            else if (remaining <= 3) audioManager.play(`${remaining}.mp3`, true);
            else audioManager.play('beep.mp3', true);
        }
        if (remaining <= 0) {
            clearInterval(state.freeInterval);
            document.body.classList.remove('flash-rest');
            runFreeWork();
        }
    }, 1000);
}

function finishFreeWorkout() {
    elements.freeTimerLabel.textContent = 'BİTTİ!';
    elements.freeTimerValue.textContent = '🥊';

    if (state.voiceEnabled) {
        audioManager.play('bell_end.mp3', true);
        setTimeout(() => audioManager.play('workout_complete.mp3', true), 600);
    }

    saveWorkoutCompletion();
    setTimeout(() => {
        if (state.freeTimerActive) stopFreeTimer();
    }, 5000);
}

// === Event Listeners for Free Timer ===
if (elements.btnFreeStart) {
    elements.btnFreeStart.addEventListener('click', () => {
        audioManager.init();
        if (!state.freeTimerActive) startFreeTimer();
        else stopFreeTimer();
    });
}
if (elements.btnFreeStop) {
    elements.btnFreeStop.addEventListener('click', stopFreeTimer);
}

// === PWA Service Worker Registration ===
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('[PWA] Service Worker registered:', registration);

            // Check for updates
            registration.addEventListener('updatefound', () => {
                console.log('[PWA] New version available');
            });
        } catch (error) {
            console.warn('[PWA] Service Worker registration failed:', error);
        }
    }
}

// === Audio Cache Management ===
function setupAudioCacheButton() {
    const downloadBtn = document.getElementById('btn-download-audio');
    if (!downloadBtn) return;

    // Check current cache status
    checkAudioCacheStatus();

    downloadBtn.addEventListener('click', async () => {
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<span class="btn-icon-inner">⏳</span><span>İndiriliyor...</span>';

        try {
            await cacheAllAudio();
            downloadBtn.innerHTML = '<span class="btn-icon-inner">✓</span><span>İndirildi!</span>';
            downloadBtn.classList.add('success');
        } catch (error) {
            console.error('Audio cache failed:', error);
            downloadBtn.innerHTML = '<span class="btn-icon-inner">⚠</span><span>Hata!</span>';
            downloadBtn.disabled = false;
        }
    });
}

async function checkAudioCacheStatus() {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active || navigator.serviceWorker.controller;

    if (!worker) return;

    return new Promise((resolve) => {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
            const { cached, total, complete } = event.data;
            const downloadBtn = document.getElementById('btn-download-audio');
            if (downloadBtn && complete) {
                downloadBtn.innerHTML = '<span class="btn-icon-inner">✓</span><span>Çevrimdışı Hazır</span>';
                downloadBtn.classList.add('success');
                downloadBtn.disabled = true;
            }
            resolve(event.data);
        };
        worker.postMessage(
            { action: 'getAudioCacheStatus' },
            [messageChannel.port2]
        );
    });
}

async function cacheAllAudio() {
    if (!('serviceWorker' in navigator)) {
        await audioManager.preload(essentialAudio);
        return;
    }

    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active || navigator.serviceWorker.controller;

    if (!worker) {
        await audioManager.preload(essentialAudio);
        return;
    }

    return new Promise((resolve, reject) => {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
            if (event.data.success) {
                resolve();
            } else {
                reject(new Error(event.data.error));
            }
        };
        worker.postMessage(
            { action: 'cacheAudio' },
            [messageChannel.port2]
        );
    });
}

// Start app
init();

