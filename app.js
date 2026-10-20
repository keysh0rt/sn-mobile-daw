
const $ = id => document.getElementById(id);

let audioCtx = null;
let sounds = [];
let selected = null;
let activeVoices = new Map();
let nextId = 1;
let db = null;

const noteNames = ['C', 'C#', 'D', 'D#', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const categories = [
  'Drums', 'Bass', 'Keys', 'Guitar', 'Vocals',
  'Orchestral', 'Synth', 'Loops', 'FX', 'Unsorted'
];

function slug(s) {
  return s.toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'sound';
}

function makeId() {
  return globalThis.crypto?.randomUUID?.()
    || `sn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function guessCategory(name, duration = 0) {
  const n = name.toLowerCase();

  if (/kick|snare|hat|clap|drum|perc|rim|tom|cymbal/.test(n)) return 'Drums';
  if (/808|bass|sub|low-end/.test(n)) return 'Bass';
  if (/piano|keys|rhodes|organ|bell|mallet/.test(n)) return 'Keys';
  if (/guitar|strat|acoustic/.test(n)) return 'Guitar';
  if (/vocal|voice|vox|chant|adlib/.test(n)) return 'Vocals';
  if (/string|violin|cello|brass|flute|sax/.test(n)) return 'Orchestral';
  if (/pad|lead|synth|pluck|arp/.test(n)) return 'Synth';
  if (/loop|music-loop|beat|break/.test(n)) return 'Loops';
  if (/fx|effect|riser|impact|sweep|noise|transition/.test(n)) return 'FX';

  return 'Unsorted';
}

function makeName(category, index) {
  const prefixes = {
    Drums: 'DrumVault',
    Bass: 'SubForge',
    Keys: 'Velvet-Keys',
    Guitar: 'StringLab',
    Vocals: 'VoxCraft',
    Orchestral: 'CineTone',
    Synth: 'Pulse',
    Loops: 'LoopLab',
    FX: 'FXLab',
    Unsorted: 'Sound'
  };

  return `SN ${prefixes[category] || 'Sound'} ${String(index).padStart(3, '0')}`;
}

function fmtBytes(n) {
  return n < 1024 * 1024
    ? `${(n / 1024).toFixed(0)} KB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/* ---------- Persistent sound database ---------- */

function openLibraryDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }

    const request = indexedDB.open('SNStudioLibrary', 1);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains('sounds')) {
        database.createObjectStore('sounds', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbRequest(mode, action) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Library database is not ready.'));
      return;
    }

    const tx = db.transaction('sounds', mode);
    const store = tx.objectStore('sounds');
    let request;

    try {
      request = action(store);
    } catch (error) {
      reject(error);
      return;
    }

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveSound(sound, audioBlob) {
  const record = {
    id: sound.id,
    name: sound.name,
    originalName: sound.originalName,
    category: sound.category,
    size: sound.size,
    duration: sound.duration,
    sampleRate: sound.sampleRate,
    channels: sound.channels,
    lastModified: sound.lastModified || 0,
    createdAt: sound.createdAt || Date.now(),
    audioBlob
  };

  await dbRequest('readwrite', store => store.put(record));
}

async function loadSavedLibrary() {
  if (!db) return;

  const records = await dbRequest('readonly', store => store.getAll());

  for (const record of records) {
    try {
      if (!record.audioBlob) continue;

      const bytes = await record.audioBlob.arrayBuffer();
      const ctx = await ensureAudio();
      const buffer = await ctx.decodeAudioData(bytes.slice(0));

      sounds.push({
        ...record,
        buffer
      });
    } catch (error) {
      console.warn('Could not restore sound:', record.originalName, error);
    }
  }

  nextId = sounds.length + 1;

  if (sounds.length && !selected) {
    selected = sounds[0];
    updateSelected();
  }

  renderLibrary();
  updateLibraryStatus();
}

/* ---------- Audio engine ---------- */

async function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  return audioCtx;
}

async function startAudio() {
  try {
    await ensureAudio();

    $('audioStatus').textContent = 'Audio engine ready';
    $('audioStart').textContent = 'Audio Ready';
  } catch (error) {
    console.error(error);
    $('audioStatus').textContent = 'Audio unavailable — try tapping Enable Audio again';
  }
}

$('audioStart').addEventListener('click', startAudio);

async function playSound(sound, semitones = 0, hold = false, keyId = null) {
  if (!sound?.buffer) return;

  try {
    const ctx = await ensureAudio();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();

    source.buffer = sound.buffer;
    source.playbackRate.value = Math.pow(2, semitones / 12);
    gain.gain.value = Number($('gain').value) / 100;

    source.connect(gain);
    gain.connect(ctx.destination);

    if (hold && keyId) {
      source.loop = true;
      activeVoices.set(keyId, { source, gain });
    }

    source.onended = () => {
      if (activeVoices.get(keyId)?.source === source) {
        activeVoices.delete(keyId);
      }
    };

    source.start();
  } catch (error) {
    console.error('Playback failed:', error);
  }
}

function stopVoice(id) {
  const voice = activeVoices.get(id);

  if (voice) {
    try {
      voice.source.stop();
    } catch {}

    activeVoices.delete(id);
  }
}

/* ---------- Import: individual files or folders ---------- */

async function importFiles(fileList) {
  const files = Array.from(fileList || []);
  let added = 0;
  let skipped = 0;

  if (!files.length) return;

  await startAudio();

  for (const file of files) {
    if (
      !file.type.startsWith('audio/') &&
      !/\.(wav|aiff?|flac|mp3|ogg|m4a|aac|opus)$/i.test(file.name)
    ) {
      skipped++;
      continue;
    }

    try {
      const bytes = await file.arrayBuffer();
      const ctx = await ensureAudio();
      const buffer = await ctx.decodeAudioData(bytes.slice(0));

      // Avoid importing the same file repeatedly.
      const duplicate = sounds.some(sound =>
        sound.originalName === file.name &&
        sound.size === file.size &&
        sound.lastModified === file.lastModified
      );

      if (duplicate) {
        skipped++;
        continue;
      }

      const category = guessCategory(file.name, buffer.duration);
      const id = makeId();

      const sound = {
        id,
        name: makeName(category, nextId),
        originalName: file.name,
        category,
        size: file.size,
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        lastModified: file.lastModified || 0,
        createdAt: Date.now(),
        buffer
      };

      // Save original audio bytes, not the temporary AudioBuffer.
      const blob = new Blob([bytes], {
        type: file.type || 'application/octet-stream'
      });

      if (db) {
        try {
          await saveSound(sound, blob);
        } catch (storageError) {
          console.warn('Local persistence failed:', storageError);
          $('audioStatus').textContent =
            'Imported for this session; browser storage could not save this file';
        }
      }

      sounds.push(sound);
      nextId++;
      added++;
    } catch (error) {
      console.warn('Could not decode', file.name, error);
      skipped++;
    }
  }

  if (!selected && sounds.length) {
    selected = sounds[0];
    updateSelected();
  }

  renderLibrary();
  updateLibraryStatus();

  $('audioStatus').textContent =
    `${added} sound${added === 1 ? '' : 's'} imported` +
    (skipped ? ` · ${skipped} skipped` : '');

  $('fileInput').value = '';

  const folderInput = $('snFolderInput');
  if (folderInput) folderInput.value = '';
}

$('fileInput').addEventListener('change', e => importFiles(e.target.files));

/* Add a folder-import control without changing index.html.
   Folder selection depends on browser support. */
function addFolderImportControl() {
  const uploadLabel = document.querySelector('.uploadbtn');
  if (!uploadLabel || $('snFolderButton')) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.id = 'snFolderInput';
  input.multiple = true;
  input.accept = 'audio/*,.wav,.aiff,.aif,.flac,.mp3,.ogg,.m4a,.aac,.opus';
  input.setAttribute('webkitdirectory', '');
  input.hidden = true;

  const button = document.createElement('button');
  button.id = 'snFolderButton';
  button.type = 'button';
  button.className = 'secondary';
  button.textContent = 'Import folder';
  button.title = 'Import a folder of audio files where supported';

  button.addEventListener('click', () => input.click());
  input.addEventListener('change', e => importFiles(e.target.files));

  uploadLabel.insertAdjacentElement('afterend', button);
  button.insertAdjacentElement('afterend', input);
}

/* ---------- Library UI ---------- */

function updateSelected() {
  $('selectedName').textContent = selected?.name || 'No sound selected';
  $('playSelected').disabled = !selected;
}

function updateLibraryStatus() {
  const status = $('audioStatus');

  if (sounds.length && db) {
    status.textContent = `${sounds.length} sound${sounds.length === 1 ? '' : 's'} in your library`;
  } else if (!sounds.length) {
    status.textContent = 'Import sounds to start your library';
  }
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function ensureLibraryFilters() {
  if ($('snLibrarySearch')) return;

  const library = $('library');
  const panel = library?.closest('.panel');
  if (!panel) return;

  const controls = makeElement('div', 'sn-library-filters');
  controls.style.cssText =
    'display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;';

  const search = document.createElement('input');
  search.id = 'snLibrarySearch';
  search.type = 'search';
  search.placeholder = 'Search your sounds…';
  search.setAttribute('aria-label', 'Search sound library');
  search.style.cssText =
    'flex:1;min-width:150px;padding:10px;border-radius:10px;';

  const filter = document.createElement('select');
  filter.id = 'snCategoryFilter';
  filter.setAttribute('aria-label', 'Filter sounds by category');
  filter.style.cssText = 'padding:10px;border-radius:10px;';

  ['All categories', ...categories].forEach(category => {
    const option = document.createElement('option');
    option.value = category === 'All categories' ? '' : category;
    option.textContent = category;
    filter.append(option);
  });

  search.addEventListener('input', renderLibrary);
  filter.addEventListener('change', renderLibrary);

  controls.append(search, filter);
  library.insertAdjacentElement('beforebegin', controls);
}

function renderLibrary() {
  const el = $('library');
  if (!el) return;

  ensureLibraryFilters();

  const search = ($('snLibrarySearch')?.value || '').toLowerCase().trim();
  const categoryFilter = $('snCategoryFilter')?.value || '';

  const filtered = sounds.filter(sound => {
    const matchesCategory = !categoryFilter || sound.category === categoryFilter;
    const haystack =
      `${sound.name} ${sound.originalName} ${sound.category}`.toLowerCase();

    return matchesCategory && haystack.includes(search);
  });

  if (!sounds.length) {
    el.className = 'library empty';
    el.textContent =
      'No sounds loaded yet. Import audio files or a folder to build your library.';
    return;
  }

  el.className = 'library';
  el.replaceChildren();

  if (!filtered.length) {
    el.append(makeElement('p', 'muted', 'No sounds match your search.'));
    return;
  }

  filtered.forEach(sound => {
    const row = makeElement('div', 'soundrow');
    const icon = makeElement('div', 'soundicon', '♫');
    const meta = makeElement('div', 'soundmeta');

    const title = makeElement('strong', '', sound.name);
    const sub = makeElement(
      'small',
      '',
      `${sound.category} · ${sound.duration.toFixed(2)} sec · ${fmtBytes(sound.size)} · ${sound.originalName}`
    );

    meta.append(title, sub);

    // Let the user correct an automatic classification.
    const categorySelect = document.createElement('select');
    categorySelect.setAttribute('aria-label', `Category for ${sound.originalName}`);

    categories.forEach(category => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      option.selected = category === sound.category;
      categorySelect.append(option);
    });

    categorySelect.addEventListener('change', async () => {
      sound.category = categorySelect.value;

      if (db) {
        try {
          await saveSound(
            sound,
            new Blob([], { type: 'application/octet-stream' })
          );
          // Replace the empty placeholder with the actual stored audio.
          // The update below preserves audio by using the database record.
        } catch (error) {
          console.warn('Category update failed:', error);
        }
      }

      renderLibrary();
    });

    // The category update must preserve the actual stored audio blob.
    categorySelect.addEventListener('change', async () => {
      if (!db) return;

      try {
        const existing = await dbRequest('readonly', store => store.get(sound.id));
        if (existing?.audioBlob) {
          await saveSound(sound, existing.audioBlob);
        }
      } catch (error) {
        console.warn('Could not persist category:', error);
      }
    });

    const selectButton = makeElement(
      'button',
      '',
      selected?.id === sound.id ? 'Selected' : 'Select'
    );

    selectButton.addEventListener('click', () => {
      selected = sound;
      updateSelected();
      renderLibrary();
    });

    const playButton = makeElement('button', '', '▶');
    playButton.setAttribute('aria-label', `Play ${sound.originalName}`);
    playButton.addEventListener('click', () => playSound(sound, 0, false));

    row.append(icon, meta, categorySelect, selectButton, playButton);
    el.append(row);
  });
}

/* ---------- Sampler controls ---------- */

$('playSelected').addEventListener('click', () => {
  if (selected) {
    playSound(selected, Number($('pitch').value), false);
  }
});

$('pitch').addEventListener('input', e => {
  $('pitchLabel').textContent = `${e.target.value} st`;
});

$('gain').addEventListener('input', e => {
  $('gainLabel').textContent = `${e.target.value}%`;
});

function buildKeyboard() {
  const el = $('keyboard');
  if (!el || el.dataset.built) return;

  el.dataset.built = 'true';

  noteNames.slice(0, 12).forEach((note, i) => {
    const button = makeElement(
      'button',
      `key${note.includes('#') ? ' black' : ''}`,
      note
    );

    button.addEventListener('pointerdown', e => {
      e.preventDefault();

      if (!selected) {
        $('fileInput').click();
        return;
      }

      const id = `key-${i}`;
      playSound(
        selected,
        Number($('pitch').value) + i - 5,
        $('playMode').value === 'sustain',
        id
      );
    });

    button.addEventListener('pointerup', () => stopVoice(`key-${i}`));
    button.addEventListener('pointercancel', () => stopVoice(`key-${i}`));
    button.addEventListener('pointerleave', () => stopVoice(`key-${i}`));

    el.append(button);
  });
}

/* ---------- Export catalog ---------- */

$('exportCatalog').addEventListener('click', () => {
  const catalog = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    storage: db ? 'IndexedDB + browser session' : 'Browser session only',
    instruments: sounds.map(({
      id, name, originalName, category, size, duration,
      sampleRate, channels, createdAt
    }) => ({
      id, name, originalName, category, size, duration,
      sampleRate, channels, createdAt
    }))
  };

  const blob = new Blob([JSON.stringify(catalog, null, 2)], {
    type: 'application/json'
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = 'sn-sound-catalog.json';
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

/* ---------- Startup ---------- */

async function initSNStudio() {
  buildKeyboard();
  addFolderImportControl();
  ensureLibraryFilters();

  try {
    db = await openLibraryDB();
    await loadSavedLibrary();
  } catch (error) {
    console.warn('Persistent library unavailable:', error);
    $('audioStatus').textContent =
      'Session-only mode: browser storage is unavailable';
    renderLibrary();
  }
}

initSNStudio();
