import * as Tone from "tone";

// Real-time playback only. Never import AI analysis or export code here.
class SNAudioEngine {
  constructor() {
    this.ready = false;
    this.tracks = new Map();
    this.transport = Tone.getTransport();
  }
  async start() {
    await Tone.start(); // Call only from a user gesture on iOS.
    if (this.ready) return;
    this.limiter = new Tone.Limiter(-1);
    this.master = new Tone.Gain(0.85).connect(this.limiter);
    this.limiter.toDestination();
    this.ready = true;
  }
  createTrack(id, { volumeDb = -6, pan = 0, muted = false } = {}) {
    if (!this.ready) throw new Error("Tap Enable Audio first.");
    this.removeTrack(id);
    const gain = new Tone.Gain(Tone.dbToGain(volumeDb));
    const panner = new Tone.Panner(pan);
    gain.connect(panner);
    panner.connect(this.master);
    const track = { id, gain, panner, sources: new Set(), muted, originalGain: Tone.dbToGain(volumeDb) };
    this.tracks.set(id, track);
    this.#applyMute(track);
    return track;
  }
  async loadSample(trackId, fileOrUrl) {
    if (!this.ready) throw new Error("Tap Enable Audio first.");
    const track = this.tracks.get(trackId) || this.createTrack(trackId);
    let buffer;
    if (fileOrUrl instanceof File || fileOrUrl instanceof Blob) {
      buffer = await Tone.getContext().decodeAudioData((await fileOrUrl.arrayBuffer()).slice(0));
    } else {
      const response = await fetch(fileOrUrl);
      if (!response.ok) throw new Error(`Could not load sample: ${response.status}`);
      buffer = await Tone.getContext().decodeAudioData((await response.arrayBuffer()).slice(0));
    }
    return {
      name: fileOrUrl instanceof File ? fileOrUrl.name : String(fileOrUrl).split("/").pop(),
      duration: buffer.duration,
      play: (when = this.transport.seconds, { playbackRate = 1, offset = 0, duration } = {}) => {
        const player = new Tone.Player({ url: buffer, autostart: false, playbackRate });
        player.connect(track.gain);
        track.sources.add(player);
        player.onstop = () => { track.sources.delete(player); player.dispose(); };
        const startAt = Tone.now() + Math.max(0, when - this.transport.seconds);
        player.start(startAt, offset, duration);
        return player;
      }
    };
  }
  setVolumeDb(id, db) {
    const t = this.tracks.get(id);
    if (t) { t.originalGain = Tone.dbToGain(db); this.#applyMute(t); }
  }
  setPan(id, value) {
    const t = this.tracks.get(id);
    if (t) t.panner.pan.rampTo(Math.max(-1, Math.min(1, value)), 0.02);
  }
  setMute(id, muted) {
    const t = this.tracks.get(id);
    if (t) { t.muted = Boolean(muted); this.#applyMute(t); }
  }
  setTempo(bpm) { this.transport.bpm.value = Math.max(30, Math.min(300, Number(bpm) || 120)); }
  schedule(callback, musicalTime) { return this.transport.schedule(callback, musicalTime); }
  play() { if (!this.ready) throw new Error("Tap Enable Audio first."); this.transport.start(); }
  stop() {
    this.transport.stop();
    this.transport.position = 0;
    for (const t of this.tracks.values()) {
      for (const s of t.sources) { try { s.stop(); } catch {} s.dispose(); }
      t.sources.clear();
    }
  }
  removeTrack(id) {
    const t = this.tracks.get(id);
    if (!t) return;
    for (const s of t.sources) { try { s.stop(); } catch {} s.dispose(); }
    t.gain.dispose(); t.panner.dispose(); this.tracks.delete(id);
  }
  dispose() {
    this.stop();
    for (const id of [...this.tracks.keys()]) this.removeTrack(id);
    this.master?.dispose(); this.limiter?.dispose(); this.ready = false;
  }
  #applyMute(t) { t.gain.gain.rampTo(t.muted ? 0 : t.originalGain, 0.015); }
}
export const audioEngine = new SNAudioEngine();
export { Tone };