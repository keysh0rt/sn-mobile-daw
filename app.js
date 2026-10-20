(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const scales = {
    "C minor": [0, 2, 3, 5, 7, 8, 10],
    "C major": [0, 2, 4, 5, 7, 9, 11],
    "A minor": [0, 2, 3, 5, 7, 8, 10],
    "D minor": [0, 2, 3, 5, 7, 9, 10]
  };
  let audioCtx = null;
  let masterGain = null;
  let sounds = [];
  let selected = null;
  let activeVoices = new Map();
  let nextId = 1;
  let currentView = "arrangement";
  let currentCategory = "All";
  let midiNotes = [];
  let selectedNoteId = null;
  let dragState = null;
  let playbackTimer = null;
  let playbackStep = 0;
  let trackCount = 3;
  let isPlaying = false;
  function status(message) {
    if ($("statusMessage")) $("statusMessage").textContent = message;
  }
  function slug(s) {
    return s.toLowerCase().replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "sound";
  }
  function guessCategory(name) {
    const n = name.toLowerCase();
    if (/808|kick|snare|hat|clap|drum|perc|rim|tom/.test(n)) return "Drums";
    if (/bass|sub|low/.test(n)) return "Bass";
    if (/piano|keys|rhodes|organ|bell|mallet/.test(n)) return "Keys";
    if (/guitar|strat|acoustic/.test(n)) return "Guitar";
    if (/vocal|voice|vox|chant/.test(n)) return "Vocals";
    if (/string|violin|cello|brass|flute|sax/.test(n)) return "Orchestral";
    if (/pad|lead|synth|pluck/.test(n)) return "Synth";
    return "Unsorted";
  }
  function makeName(category, index) {
    const prefixes = {
      Drums: "DrumVault", Bass: "SubForge", Keys: "VelvetKeys",
      Guitar: "StringLab", Vocals: "VoxCraft",
      Orchestral: "CineTone", Synth: "Pulse", Unsorted: "Sound"
    };
    return `SN ${prefixes[category] || "Sound"} ${String(index).padStart(3, "0")}`;
  }
  function fmtBytes(n) {
    return n < 1024 * 1024
      ? `${(n / 1024).toFixed(0)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`;
  }
  async function startAudio() {
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error("Web Audio is not supported in this browser.");
        audioCtx = new AudioContextClass();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = Number($("masterVolume")?.value ?? 80) / 100;
        masterGain.connect(audioCtx.destination);
      }
      if (audioCtx.state === "suspended") await audioCtx.resume();
      $("audioStatus").textContent = "Audio engine ready";
      $("audioStart").textContent = "Audio Ready";
      status("Audio engine ready.");
      return true;
    } catch (error) {
      status(error.message || "Could not start audio.");
      return false;
    }
  }
  $("audioStart")?.addEventListener("click", startAudio);
  function switchView(view) {
    if (!$( "view-" + view)) return;
    currentView = view;
    document.querySelectorAll(".view").forEach(el => {
      el.classList.toggle("active", el.id === "view-" + view);
    });
    document.querySelectorAll("[data-view]").forEach(el => {
      el.classList.toggle("active", el.dataset.view === view);
    });
    const titles = {
      arrangement: ["Arrangement", "Build your sound, one pattern at a time."],
      piano: ["Piano Roll", "Create, move, and resize MIDI note blocks."],
      sounds: ["Sound Library", "Import and organize your audio samples."],
      mixer: ["Mixer", "Control the master output."]
    };
    $("viewTitle").textContent = titles[view][0];
    $("viewDescription").textContent = titles[view][1];
  }
  document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => switchView(button.dataset.go));
  });
  $("brandHome")?.addEventListener("click", () => switchView("arrangement"));
  // Audio import and automatic categorization.
  $("fileInput")?.addEventListener("change", async event => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    if (!await startAudio()) return;
    let imported = 0;
    for (const file of files) {
      if (!file.type.startsWith("audio/") &&
          !/\.(wav|aiff?|flac|mp3|ogg|m4a|aac|opus)$/i.test(file.name)) continue;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
        const category = guessCategory(file.name);
        const item = {
          id: `sn-${slug(file.name)}-${nextId}`,
          name: makeName(category, nextId),
          originalName: file.name,
          category,
          size: file.size,
          duration: decoded.duration,
          sampleRate: decoded.sampleRate,
          channels: decoded.numberOfChannels,
          buffer: decoded
        };
        nextId++;
        sounds.push(item);
        imported++;
      } catch (error) {
        console.warn("Could not decode", file.name, error);
      }
    }
    event.target.value = "";
    renderLibrary();
    if (imported) {
      status(`Imported ${imported} sound${imported === 1 ? "" : "s"}.`);
    } else {
      status("No supported audio files were imported.");
    }
  });
  function renderLibrary() {
    const library = $("library");
    if (!library) return;
    const visible = sounds.filter(s =>
      currentCategory === "All" || s.category === currentCategory
    );
    $("soundCount").textContent = sounds.length;
    $("categoryCount").textContent = new Set(sounds.map(s => s.category)).size;
    library.replaceChildren();
    if (!visible.length) {
      library.className = "library empty";
      library.textContent = sounds.length
        ? "No sounds in this category yet."
        : "Your sounds will appear here after you import audio.";
      return;
    }
    library.className = "library";
    visible.forEach(sound => {
      const row = document.createElement("div");
      row.className = "soundrow";
      const icon = document.createElement("div");
      icon.className = "soundicon";
      icon.textContent = "♫";
      const meta = document.createElement("div");
      meta.className = "soundmeta";
      const title = document.createElement("strong");
      title.textContent = sound.name;
      const sub = document.createElement("small");
      sub.textContent =
        `${sound.category} · ${sound.duration.toFixed(2)} sec · ${fmtBytes(sound.size)} · ${sound.originalName}`;
      meta.append(title, sub);
      const select = document.createElement("button");
      select.textContent = selected?.id === sound.id ? "Selected" : "Select";
      select.addEventListener("click", () => {
        selected = sound;
        $("selectedName").textContent = sound.name;
        $("playSelected").disabled = false;
        renderLibrary();
      });
      const play = document.createElement("button");
      play.textContent = "▶";
      play.setAttribute("aria-label", "Preview sound");
      play.addEventListener("click", () => playSound(sound, 0));
      row.append(icon, meta, select, play);
      library.append(row);
    });
    if (!selected && sounds.length) {
      selected = sounds[0];
      $("selectedName").textContent = selected.name;
      $("playSelected").disabled = false;
    }
  }
  $("categoryFilter")?.addEventListener("click", event => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    currentCategory = button.dataset.category;
    document.querySelectorAll("[data-category]").forEach(chip => {
      chip.classList.toggle("active", chip === button);
    });
    renderLibrary();
  });
  async function playSound(sound, semitones = 0, hold = false, keyId = null) {
    if (!sound || !await startAudio()) return;
    const source = audioCtx.createBufferSource();
    source.buffer = sound.buffer;
    source.playbackRate.value = Math.pow(2, semitones / 12);
    const gain = audioCtx.createGain();
    gain.gain.value = Number($("gain")?.value ?? 80) / 100;
    source.connect(gain);
    gain.connect(masterGain);
    if (hold && keyId) {
      activeVoices.set(keyId, { source, gain });
      source.onended = () => activeVoices.delete(keyId);
    }
    source.start();
    status(`Playing ${sound.name}`);
  }
  function stopVoice(id) {
    const voice = activeVoices.get(id);
    if (!voice) return;
    try { voice.source.stop(); } catch (_) {}
    activeVoices.delete(id);
  }
  $("playSelected")?.addEventListener("click", () => {
    if (selected) playSound(selected, Number($("pitch").value));
  });
  $("pitch")?.addEventListener("input", event => {
    $("pitchLabel").textContent = `${event.target.value} st`;
  });
  $("gain")?.addEventListener("input", event => {
    $("gainLabel").textContent = `${event.target.value}%`;
  });
  $("masterVolume")?.addEventListener("input", event => {
    const value = Number(event.target.value);
    $("masterLabel").textContent = `${value}%`;
    if (masterGain && audioCtx) {
      masterGain.gain.setTargetAtTime(value / 100, audioCtx.currentTime, 0.015);
    }
  });
  // Touch-friendly sample keyboard.
  function buildKeyboard() {
    const keyboard = $("keyboard");
    if (!keyboard) return;
    keyboard.replaceChildren();
    for (let i = 0; i < 12; i++) {
      const note = noteNames[i];
      const button = document.createElement("button");
      button.className = "key" + (note.includes("#") ? " black" : "");
      button.textContent = note;
      button.addEventListener("pointerdown", event => {
        event.preventDefault();
        if (!selected) {
          switchView("sounds");
          $("fileInput").click();
          return;
        }
        const id = `key-${i}`;
        playSound(selected, Number($("pitch").value) + i - 5,
          $("playMode").value === "sustain", id);
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach(type => {
        button.addEventListener(type, () => stopVoice(`key-${i}`));
      });
      keyboard.append(button);
    }
  }
  // Piano roll: 24 rows, 32 steps. Notes are session-local.
  const ROWS = 24;
  const STEPS = 32;
  function noteForRow(row) {
    const midi = 72 - row;
    return { midi, name: noteNames[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1 };
  }
  function isScaleNote(row) {
    const info = noteForRow(row);
    const scale = scales[$("scaleSelect")?.value || "C minor"];
    return scale.includes(info.midi % 12);
  }
  function buildPiano() {
    const keys = $("pianoKeys");
    const grid = $("pianoGrid");
    if (!keys || !grid) return;
    keys.replaceChildren();
    grid.replaceChildren();
    for (let row = 0; row < ROWS; row++) {
      const info = noteForRow(row);
      const key = document.createElement("div");
      key.className = "piano-key" + (info.name.includes("#") ? " black-key" : "");
      if (info.name === "C") key.textContent = `C${info.octave}`;
      if (info.name === "C" && info.octave % 2 === 0) key.classList.add("scale-root");
      keys.append(key);
    }
    for (let row = 0; row < ROWS; row++) {
      for (let step = 0; step < STEPS; step++) {
        const cell = document.createElement("button");
        cell.className = "piano-cell";
        if (isScaleNote(row)) cell.classList.add("scale-note");
        if (noteForRow(row).name === "C") cell.classList.add("root-note");
        if (step % 4 === 0) cell.classList.add("bar-start");
        cell.dataset.row = row;
        cell.dataset.step = step;
        cell.setAttribute("aria-label", `${noteForRow(row).name}${noteForRow(row).octave}, step ${step + 1}`);
        cell.addEventListener("click", () => {
          if (dragState) return;
          const existing = midiNotes.find(n => n.row === row && step >= n.step && step < n.step + n.length);
          if (existing) {
            selectedNoteId = existing.id;
          } else {
            const note = { id: nextId++, row, step, length: 2 };
            midiNotes.push(note);
            selectedNoteId = note.id;
          }
          renderNotes();
        });
        grid.append(cell);
      }
    }
    renderNotes();
  }
  function renderNotes() {
    const grid = $("pianoGrid");
    if (!grid) return;
    grid.querySelectorAll(".midi-note").forEach(el => el.remove());
    midiNotes.forEach(note => {
      const el = document.createElement("div");
      el.className = "midi-note" + (note.id === selectedNoteId ? " selected" : "");
      el.style.left = `${note.step / STEPS * 100}%`;
      el.style.width = `${note.length / STEPS * 100}%`;
      el.style.top = `${note.row * 25 + 2}px`;
      el.style.height = "20px";
      el.dataset.id = note.id;
      el.title = `${noteForRow(note.row).name}${noteForRow(note.row).octave} · ${note.length} steps`;
      const handle = document.createElement("div");
      handle.className = "note-handle";
      handle.addEventListener("pointerdown", event => beginNoteDrag(event, note, true));
      el.append(handle);
      el.addEventListener("pointerdown", event => {
        if (event.target === handle) return;
        beginNoteDrag(event, note, false);
      });
      el.addEventListener("click", event => {
        event.stopPropagation();
        selectedNoteId = note.id;
        renderNotes();
      });
      el.addEventListener("dblclick", event => {
        event.stopPropagation();
        midiNotes = midiNotes.filter(n => n.id !== note.id);
        selectedNoteId = null;
        renderNotes();
      });
      grid.append(el);
    });
    $("noteCount").textContent = `${midiNotes.length} NOTES`;
  }
  function beginNoteDrag(event, note, resize) {
    event.preventDefault();
    event.stopPropagation();
    selectedNoteId = note.id;
    dragState = {
      note,
      resize,
      startX: event.clientX,
      startY: event.clientY,
      originalStep: note.step,
      originalRow: note.row,
      originalLength: note.length
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) {}
    renderNotes();
  }
  document.addEventListener("pointermove", event => {
    if (!dragState) return;
    const grid = $("pianoGrid");
    const rect = grid.getBoundingClientRect();
    const stepWidth = rect.width / STEPS;
    const rowHeight = 25;
    const dx = Math.round((event.clientX - dragState.startX) / stepWidth);
    const dy = Math.round((event.clientY - dragState.startY) / rowHeight);
    if (dragState.resize) {
      dragState.note.length = Math.max(1, Math.min(STEPS - dragState.originalStep,
        dragState.originalLength + dx));
    } else {
      dragState.note.step = Math.max(0, Math.min(STEPS - dragState.note.length,
        dragState.originalStep + dx));
      dragState.note.row = Math.max(0, Math.min(ROWS - 1,
        dragState.originalRow + dy));
    }
    renderNotes();
  });
  document.addEventListener("pointerup", () => { dragState = null; });
  $("scaleSelect")?.addEventListener("change", buildPiano);
  $("addNote")?.addEventListener("click", () => {
    const note = { id: nextId++, row: 12, step: 0, length: 2 };
    midiNotes.push(note);
    selectedNoteId = note.id;
    renderNotes();
  });
  $("clearNotes")?.addEventListener("click", () => {
    midiNotes = [];
    selectedNoteId = null;
    renderNotes();
  });
  // Arrangement patterns.
  function addPattern(button) {
    const track = button.dataset.pattern || "Track";
    const created = document.createElement("button");
    created.className = "pattern-block created";
    created.textContent = `${track} pattern`;
    created.title = "Tap to remove this pattern";
    created.addEventListener("click", () => created.remove());
    button.replaceWith(created);
    status(`${track} pattern added.`);
  }
  document.querySelectorAll("[data-pattern]").forEach(button => {
    button.addEventListener("click", () => addPattern(button));
  });
  $("addTrack")?.addEventListener("click", () => {
    trackCount++;
    const name = `Track ${trackCount}`;
    const row = document.createElement("div");
    row.className = "track-row";
    row.dataset.track = name;
    const label = document.createElement("div");
    label.className = "track-label";
    const number = document.createElement("b");
    number.textContent = String(trackCount).padStart(2, "0");
    const title = document.createElement("span");
    title.textContent = name;
    const type = document.createElement("small");
    type.textContent = "AUDIO TRACK";
    label.append(number, title, type);
    const lane = document.createElement("div");
    lane.className = "track-lane";
    const pattern = document.createElement("button");
    pattern.className = "pattern-block";
    pattern.dataset.pattern = name;
    pattern.textContent = "＋ Create pattern";
    pattern.addEventListener("click", () => addPattern(pattern));
    lane.append(pattern);
    row.append(label, lane);
    $("timeline").append(row);
    status(`${name} added.`);
  });
  // Transport: the metronome is a timing scaffold, not a full song sequencer.
  function stopTransport() {
    isPlaying = false;
    if (playbackTimer) clearInterval(playbackTimer);
    playbackTimer = null;
    $("playTransport").textContent = "▶";
    status("Playback stopped.");
  }
  $("playTransport")?.addEventListener("click", async () => {
    if (isPlaying) {
      stopTransport();
      return;
    }
    if (!await startAudio()) return;
    isPlaying = true;
    playbackStep = 0;
    $("playTransport").textContent = "Ⅱ";
    status("Transport running.");
    const tick = () => {
      if (!audioCtx || !isPlaying) return;
      const bpm = Math.max(40, Math.min(240, Number($("tempo").value) || 120));
      const beatMs = 60000 / bpm;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = playbackStep % 4 === 0 ? 1000 : 700;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
      osc.connect(gain).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.04);
      playbackStep++;
      if (playbackStep % 4 === 0) status(`Bar beat ${playbackStep / 4}`);
      playbackTimer = setTimeout(tick, beatMs);
    };
    tick();
  });
  $("stopTransport")?.addEventListener("click", stopTransport);
  // Download the editable MIDI note arrangement as JSON for now.
  $("saveProject")?.addEventListener("click", () => {
    const project = {
      format: "SN Mobile DAW Project",
      version: 1,
      savedAt: new Date().toISOString(),
      tempo: Number($("tempo").value) || 120,
      scale: $("scaleSelect").value,
      notes: midiNotes,
      patterns: Array.from(document.querySelectorAll(".pattern-block.created")).map(p => ({
        name: p.textContent,
        track: p.closest(".track-row")?.dataset.track || "Track"
      })),
      soundCatalog: sounds.map(({ id, name, originalName, category, duration }) =>
        ({ id, name, originalName, category, duration }))
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sn-mobile-daw-project.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("Project data exported as JSON.");
  });
  $("exportCatalog")?.addEventListener("click", () => {
    const catalog = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      instruments: sounds.map(({ id, name, originalName, category, size, duration, sampleRate, channels }) =>
        ({ id, name, originalName, category, size, duration, sampleRate, channels }))
    };
    const blob = new Blob([JSON.stringify(catalog, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sn-sound-catalog.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  buildKeyboard();
  buildPiano();
  renderLibrary();
})();
