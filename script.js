"use strict";

/*
This script maps each object's vertical position to a note name and horizontal
position to an octave. It also runs the existing repeating garden patterns.
*/

/* Page elements ------------------------------------------------------------- */
const soundCanvas = document.getElementById("sound-canvas");
const playButton = document.getElementById("play-button");
const soundObjectElements = document.querySelectorAll(".soundObject");
const objectInfoElements = [
    document.getElementById("object-one-info"),
    document.getElementById("object-two-info")
];

/* Musical mapping ----------------------------------------------------------- */
const noteNames = ["C", "D", "E", "F", "G", "A", "B"];
const octaves = [1, 2, 3, 4, 5, 6, 7, 8];
const minimumDelay = 700;
const maximumDelay = 1400;

function createObjectState(
    element,
    infoElement,
    xPosition,
    yPosition,
    waveform
) {
    return {
        element,
        infoElement,
        xPosition,
        yPosition,
        note: "",
        baseFrequency: 0,
        playedFrequency: 0,
        volumeCompensation: 0,
        waveform,
        synth: null,
        timerId: null,
        previewSynth: null,
        usingPatternSynthForDrag: false
    };
}

const soundObjects = [
    createObjectState(soundObjectElements[0], objectInfoElements[0], 0.28, 0.65, "triangle"),
    createObjectState(soundObjectElements[1], objectInfoElements[1], 0.68, 0.35, "triangle")
];

function mapPositionToNote(xPosition, yPosition) {
    // Horizontal position selects octaves 1 through 8.
    const octaveIndex = Math.round(xPosition * (octaves.length - 1));

    // Vertical position selects C at the bottom through B at the top.
    const noteIndex = Math.round((1 - yPosition) * (noteNames.length - 1));
    return noteNames[noteIndex] + octaves[octaveIndex];
}

function randomiseFrequency(baseFrequency) {
    // The 0.3% variation changes the measured frequency without changing the note.
    const maximumVariation = baseFrequency * 0.003;
    return baseFrequency + (Math.random() * 2 - 1) * maximumVariation;
}

function getVolumeCompensation(note) {
    const octave = Number(note.slice(-1));
    const compensationByOctave = {
        1: 8,
        2: 5,
        3: 2,
        4: 0,
        5: -1,
        6: -2,
        7: -3,
        8: -4
    };

    // A bounded boost balances low octaves while high octaves remain comfortable.
    return compensationByOctave[octave];
}

function choosePlayedFrequency(soundObject) {
    soundObject.playedFrequency = randomiseFrequency(soundObject.baseFrequency);
    updateTestingLabel(soundObject);
}

function updateObject(soundObject) {
    const maximumX = soundCanvas.clientWidth - soundObject.element.offsetWidth;
    const maximumY = soundCanvas.clientHeight - soundObject.element.offsetHeight;
    const selectedNote = mapPositionToNote(
        soundObject.xPosition,
        soundObject.yPosition
    );
    const noteChanged = selectedNote !== soundObject.note;

    soundObject.element.style.left = `${maximumX * soundObject.xPosition}px`;
    soundObject.element.style.top = `${maximumY * soundObject.yPosition}px`;

    // Frequency variation changes only after the object enters a new note area.
    if (noteChanged) {
        soundObject.note = selectedNote;
        soundObject.baseFrequency = Tone.Frequency(selectedNote).toFrequency();
        soundObject.volumeCompensation = getVolumeCompensation(selectedNote);
        choosePlayedFrequency(soundObject);

        if (soundObject.synth) {
            soundObject.synth.frequency.rampTo(soundObject.playedFrequency, 0.04);
            soundObject.synth.volume.rampTo(soundObject.volumeCompensation, 0.06);
        }

        if (soundObject.previewSynth) {
            soundObject.previewSynth.frequency.rampTo(soundObject.playedFrequency, 0.04);
            soundObject.previewSynth.volume.rampTo(
                -18 + soundObject.volumeCompensation,
                0.06
            );
        }
    }

    updateTestingLabel(soundObject);
}

function updateTestingLabel(soundObject) {
    const objectNumber = soundObjects.indexOf(soundObject) + 1;
    const gainPrefix = soundObject.volumeCompensation >= 0 ? "+" : "";

    soundObject.infoElement.textContent =
        `Object ${objectNumber}: ${soundObject.note} - ` +
        `${soundObject.playedFrequency.toFixed(1)} Hz ` +
        `(base ${soundObject.baseFrequency.toFixed(1)} Hz) - ` +
        `Gain: ${gainPrefix}${soundObject.volumeCompensation} dB`;
}

/* Audio --------------------------------------------------------------------- */
let isGardenPlaying = false;
let isButtonBusy = false;
let masterGain;

function createSynth(waveform) {
    return new Tone.Synth({
        oscillator: {
            type: waveform
        },
        envelope: {
            attack: 0.04,
            decay: 0.12,
            sustain: 0.18,
            release: 0.3
        }
    });
}

function createPatternSynth(soundObject) {
    soundObject.synth = createSynth(soundObject.waveform).connect(masterGain);
    soundObject.synth.volume.value = soundObject.volumeCompensation;
}

async function startObjectSound(soundObject) {
    // Tone.js must start within a user gesture before either drag preview can play.
    await Tone.start();
    if (!activeDrag || activeDrag.soundObject !== soundObject || isButtonBusy) return;

    choosePlayedFrequency(soundObject);

    if (isGardenPlaying && soundObject.synth) {
        soundObject.usingPatternSynthForDrag = true;
        soundObject.synth.triggerAttack(soundObject.playedFrequency, Tone.now(), 0.55);
        return;
    }

    soundObject.previewSynth = createSynth(soundObject.waveform).toDestination();
    soundObject.previewSynth.volume.value = -18 + soundObject.volumeCompensation;
    soundObject.previewSynth.triggerAttack(soundObject.playedFrequency);
}

function stopObjectSound(soundObject) {
    if (soundObject.usingPatternSynthForDrag && soundObject.synth) {
        soundObject.synth.triggerRelease();
        soundObject.usingPatternSynthForDrag = false;
    }

    if (!soundObject.previewSynth) return;

    const previewSynth = soundObject.previewSynth;
    soundObject.previewSynth = null;
    previewSynth.triggerRelease();

    setTimeout(() => {
        previewSynth.dispose();
    }, 400);
}

function getRandomDelay() {
    return minimumDelay + Math.random() * (maximumDelay - minimumDelay);
}

function playRepeatingNote(soundObject) {
    if (!isGardenPlaying || !soundObject.synth) return;

    // Small frequency and velocity changes keep each existing pattern organic.
    choosePlayedFrequency(soundObject);
    const velocity = 0.48 + Math.random() * 0.12;
    soundObject.synth.triggerAttackRelease(
        soundObject.playedFrequency,
        "8n",
        Tone.now(),
        velocity
    );

    soundObject.timerId = setTimeout(() => {
        playRepeatingNote(soundObject);
    }, getRandomDelay());
}

async function startGarden() {
    await Tone.start();
    if (isGardenPlaying) return;

    masterGain = new Tone.Gain(0).toDestination();
    soundObjects.forEach(createPatternSynth);
    isGardenPlaying = true;
    playButton.textContent = "Stop Garden";
    masterGain.gain.rampTo(0.16, 0.1);

    soundObjects[0].timerId = setTimeout(() => playRepeatingNote(soundObjects[0]), 80);
    soundObjects[1].timerId = setTimeout(() => playRepeatingNote(soundObjects[1]), 420);
}

function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function stopGarden() {
    isGardenPlaying = false;
    playButton.textContent = "Play Garden";

    soundObjects.forEach(soundObject => {
        clearTimeout(soundObject.timerId);
        soundObject.timerId = null;
        stopObjectSound(soundObject);
        if (soundObject.synth) soundObject.synth.triggerRelease();
    });

    if (masterGain) masterGain.gain.rampTo(0, 0.2);
    await wait(300);

    soundObjects.forEach(soundObject => {
        if (soundObject.synth) soundObject.synth.dispose();
        soundObject.synth = null;
    });

    if (masterGain) masterGain.dispose();
    masterGain = null;
}

async function toggleGarden() {
    if (isButtonBusy) return;

    isButtonBusy = true;
    playButton.disabled = true;

    if (isGardenPlaying) {
        await stopGarden();
    } else {
        await startGarden();
    }

    playButton.disabled = false;
    isButtonBusy = false;
}

/* Dragging ------------------------------------------------------------------ */
let activeDrag = null;

function beginDragging(
    clientX,
    clientY,
    soundObject,
    inputType,
    pointerId = null
) {
    if (activeDrag) return;

    const objectBounds = soundObject.element.getBoundingClientRect();
    activeDrag = {
        soundObject,
        inputType,
        pointerId,
        offsetX: clientX - objectBounds.left,
        offsetY: clientY - objectBounds.top
    };

    soundObject.element.classList.add("isDragging");
    startObjectSound(soundObject);
}

function moveDraggedObject(clientX, clientY) {
    if (!activeDrag) return;

    const soundObject = activeDrag.soundObject;
    const canvasBounds = soundCanvas.getBoundingClientRect();
    const maximumX = soundCanvas.clientWidth - soundObject.element.offsetWidth;
    const maximumY = soundCanvas.clientHeight - soundObject.element.offsetHeight;
    const objectX = clientX - canvasBounds.left - activeDrag.offsetX;
    const objectY = clientY - canvasBounds.top - activeDrag.offsetY;

    soundObject.xPosition = Math.min(Math.max(objectX / maximumX, 0), 1);
    soundObject.yPosition = Math.min(Math.max(objectY / maximumY, 0), 1);
    updateObject(soundObject);
}

function finishDragging(soundObject) {
    if (!activeDrag || activeDrag.soundObject !== soundObject) return;

    soundObject.element.classList.remove("isDragging");
    stopObjectSound(soundObject);
    activeDrag = null;
}

/* User input and setup ------------------------------------------------------ */
soundObjects.forEach(soundObject => {
    soundObject.element.addEventListener("mousedown", event => {
        if (event.button !== 0) return;
        event.preventDefault();
        beginDragging(event.clientX, event.clientY, soundObject, "mouse");
    });
});

soundCanvas.addEventListener("mousemove", event => {
    if (!activeDrag || activeDrag.inputType !== "mouse") return;
    moveDraggedObject(event.clientX, event.clientY);
});

window.addEventListener("mouseup", () => {
    if (!activeDrag || activeDrag.inputType !== "mouse") return;
    finishDragging(activeDrag.soundObject);
});

// Pointer events preserve the same drag interaction on touchscreens and pens.
soundObjects.forEach(soundObject => {
    soundObject.element.addEventListener("pointerdown", event => {
        if (event.pointerType === "mouse" || activeDrag) return;
        event.preventDefault();
        beginDragging(
            event.clientX,
            event.clientY,
            soundObject,
            "pointer",
            event.pointerId
        );
        soundObject.element.setPointerCapture(event.pointerId);
    });

    soundObject.element.addEventListener("pointermove", event => {
        if (!activeDrag || activeDrag.inputType !== "pointer") return;
        if (activeDrag.soundObject !== soundObject) return;
        if (activeDrag.pointerId !== event.pointerId) return;
        moveDraggedObject(event.clientX, event.clientY);
    });

    soundObject.element.addEventListener("pointerup", event => {
        if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
        finishDragging(soundObject);
    });

    soundObject.element.addEventListener("pointercancel", event => {
        if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
        finishDragging(soundObject);
    });
});

playButton.addEventListener("click", toggleGarden);
soundObjects.forEach(updateObject);

window.addEventListener("resize", () => {
    soundObjects.forEach(updateObject);
});
