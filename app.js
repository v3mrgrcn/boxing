// === Shadow Boxing Web App ===
// Production-ready with custom audio support

// === Audio Manager ===
class AudioManager {
    constructor() {
        this.audioCache = new Map();
        this.currentAudio = null;
        this.audioQueue = [];
        this.isPlaying = false;
        this.basePath = './'; // Audio files are in same directory
    }

    async preload(files) {
        const promises = files.map(file => this.load(file));
        await Promise.allSettled(promises);
    }

    async load(file) {
        if (this.audioCache.has(file)) return this.audioCache.get(file);

        try {
            const audio = new Audio(`${this.basePath}${file}`);
            audio.preload = 'auto';

            await new Promise((resolve, reject) => {
                audio.addEventListener('canplaythrough', resolve, { once: true });
                audio.addEventListener('error', reject, { once: true });
            });

            this.audioCache.set(file, audio);
            return audio;
        } catch (error) {
            console.warn(`Failed to load audio: ${file}`, error);
            return null;
        }
    }

    async play(file, priority = false) {
        if (priority && this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.isPlaying = false;
        }

        if (this.isPlaying && !priority) {
            this.audioQueue.push(file);
            return;
        }

        let audio = this.audioCache.get(file);
        if (!audio) {
            audio = await this.load(file);
        }

        if (!audio) return;

        this.isPlaying = true;
        this.currentAudio = audio.cloneNode();

        this.currentAudio.addEventListener('ended', () => {
            this.isPlaying = false;
            this.currentAudio = null;
            this.playNext();
        }, { once: true });

        try {
            await this.currentAudio.play();
        } catch (error) {
            console.warn('Audio play failed:', error);
            this.isPlaying = false;
            this.playNext();
        }
    }

    playNext() {
        if (this.audioQueue.length > 0) {
            const next = this.audioQueue.shift();
            this.play(next);
        }
    }

    stop() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
        }
        this.audioQueue = [];
        this.isPlaying = false;
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
    1: { number: '1', name: 'Jab', audioNum: '1.mp3', audioName: 'jab.mp3' },
    2: { number: '2', name: 'Cross', audioNum: '2.mp3', audioName: 'cross.mp3' },
    3: { number: '3', name: 'Lead Hook', audioNum: '3.mp3', audioName: 'lead_hook.mp3' },
    4: { number: '4', name: 'Rear Hook', audioNum: '4.mp3', audioName: 'rear_hook.mp3' },
    5: { number: '5', name: 'Lead Uppercut', audioNum: '5.mp3', audioName: 'lead_uppercut.mp3' },
    6: { number: '6', name: 'Rear Uppercut', audioNum: '6.mp3', audioName: 'rear_uppercut.mp3' }
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
    announceMode: 'number',
    comboIntervalMs: 6000,
    lastCombo: [],

    // Breathing
    breathingActive: false,
    currentExercise: 'box',
    currentCycle: 0,
    totalCycles: 5,
    breathInterval: null
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
    announceControl: document.getElementById('announce-control'),
    roundDuration: document.getElementById('round-duration'),
    restDuration: document.getElementById('rest-duration'),
    roundCount: document.getElementById('round-count'),
    comboIntervalSelect: document.getElementById('combo-interval'),

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
    cyclePlus: document.getElementById('cycle-plus')
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

setupSegmentedControl(elements.announceControl, (value) => {
    state.announceMode = value;
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

// === Combo Generation ===
function generateCombo() {
    const difficultyConfig = {
        easy: { min: 2, max: 3, defense: false },
        medium: { min: 3, max: 5, defense: false },
        hard: { min: 4, max: 8, defense: true }
    };

    const config = difficultyConfig[state.difficulty];
    const length = Math.floor(Math.random() * (config.max - config.min + 1)) + config.min;
    const combo = [];
    let lastPunch = state.lastCombo[state.lastCombo.length - 1];

    for (let i = 0; i < length; i++) {
        let punch;
        let attempts = 0;
        do {
            punch = Math.floor(Math.random() * 6) + 1;
            attempts++;
        } while (punch === lastPunch && attempts < 10);

        combo.push(punch);
        lastPunch = punch;
    }

    // Add defense move for hard mode (30% chance)
    if (config.defense && Math.random() < 0.3) {
        const defenseKeys = Object.keys(DEFENSE);
        const defenseKey = defenseKeys[Math.floor(Math.random() * defenseKeys.length)];
        combo.push({ type: 'defense', key: defenseKey });
    }

    state.lastCombo = combo;

    // Display combo
    const displayParts = combo.map(p => {
        if (typeof p === 'object') return DEFENSE[p.key].name;
        return state.announceMode === 'number' ? PUNCHES[p].number : PUNCHES[p].name;
    });

    elements.comboDisplay.textContent = displayParts.join(' - ');
    elements.comboSection.classList.add('active');

    // Play audio sequence
    playComboAudio(combo);

    HapticManager.medium();
}

async function playComboAudio(combo) {
    for (const punch of combo) {
        if (typeof punch === 'object') {
            await audioManager.play(DEFENSE[punch.key].audio);
        } else {
            const audioFile = state.announceMode === 'number'
                ? PUNCHES[punch].audioNum
                : PUNCHES[punch].audioName;
            await audioManager.play(audioFile);
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

        // Play countdown sounds
        if (currentSecond !== prevSecond && currentSecond <= 10 && currentSecond >= 1) {
            if (currentSecond === 10) {
                audioManager.play('last_10_seconds.mp3', true);
            } else if (currentSecond <= 3) {
                // Play number countdown for last 3 seconds
                audioManager.play(`${currentSecond}.mp3`, true);
            } else {
                // Play beep for 9-4 seconds
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
    elements.comboHint.textContent = 'Kombo yakında...';

    state.roundDuration = parseInt(elements.roundDuration.value);
    state.endDate = Date.now() + state.roundDuration * 1000;

    // Play bell and round announcement
    audioManager.play('bell_start.mp3', true);
    setTimeout(() => {
        const roundAudio = `round_${state.currentRound}.mp3`;
        audioManager.play(roundAudio, true);
    }, 800);

    // Start combo generation after short delay
    setTimeout(() => {
        if (state.workoutState === 'work') {
            generateCombo();
            startComboInterval();
        }
    }, 2000);

    // Keep screen awake
    requestWakeLock();
}

function startComboInterval() {
    clearInterval(state.comboInterval);

    state.comboIntervalMs = parseInt(elements.comboIntervalSelect.value) * 1000;
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

    // Play bell end and rest announcement
    audioManager.play('bell_end.mp3', true);
    setTimeout(() => {
        audioManager.play('rest.mp3', true);
    }, 600);
}

function finishWorkout() {
    state.workoutState = 'finished';

    elements.stateBadge.textContent = 'BİTTİ!';
    elements.stateBadge.className = 'state-badge';
    elements.comboDisplay.textContent = '🎉 Tebrikler!';
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
    setTimeout(() => {
        audioManager.play('workout_complete.mp3', true);
        setTimeout(() => {
            audioManager.play('victory.mp3', false);
        }, 1500);
    }, 600);

    HapticManager.success();
    releaseWakeLock();
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

    console.log('🥊 Shadow Boxing App initialized');
}

// Start app
init();
