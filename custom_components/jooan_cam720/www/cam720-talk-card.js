// CAM720 camera card: clean live WebRTC video, a Listen toggle, and a
// press-and-hold Talk button. The microphone is only captured while the
// button is held: it is opened on press and stopped on release (and when the
// app goes to the background or the view changes), so the phone's mic
// indicator is off and nothing, not even silence, reaches the camera speaker.
//
// Works anywhere the WebRTC Camera (webrtc-camera) element works, including
// the Home Assistant companion app (grant it microphone access in OS settings).
//
// Card config:
//   type: custom:cam720-talk-card
//   stream: crib0     # go2rtc stream name
//   talk: true        # false = video + listen only (no mic, no Talk button)
//   title: Hold to talk
//   ready_delay: 1500  # ms of 'Connecting…' before 'Talk now' (cold start)
//   ptz:               # optional pan/tilt arrows (hold to keep moving)
//     service: script.camera_move
//     data_left: {pan: -0.6}   # data_right / data_up / data_down likewise
//
// All controls sit in a row under the picture so nothing covers the video.
// The arrows follow the flip buttons, so each still moves the picture the
// way it points.
//   flip_entity: input_boolean.camera_flip      # optional; share the ⇆ / ⇅
//   flip_v_entity: input_boolean.camera_flip_v  # buttons' state across devices
//                      # (otherwise each is kept per browser); flip: false hides them

class Cam720TalkCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.stream) {
      throw new Error('cam720-talk-card: "stream" is required');
    }
    this.config = { talk: true, ...config };
  }

  set hass(hass) {
    this._hass = hass;
    if (this._cam) this._cam.hass = hass;
    if (this._flipButtons && this.config.flip !== false) this._applyFlip();
    if (!this._building) {
      this._building = true;
      this._build().catch((e) => console.error('cam720-talk-card:', e));
    }
  }

  async _build() {
    await customElements.whenDefined('webrtc-camera');
    const talk = this.config.talk !== false;

    this.style.display = 'block';

    const cam = document.createElement('webrtc-camera');
    cam.setConfig({
      url: this.config.stream,
      media: talk ? 'video,audio,microphone' : 'video,audio',
      mode: 'webrtc',
    });
    if (this._hass) cam.hass = this._hass;
    this.appendChild(cam);
    this._cam = cam;
    // webrtc-camera reconnects by itself when the page is shown again.
    document.addEventListener('visibilitychange', () => { if (document.hidden) this._closeNow(); });
    window.addEventListener('pagehide', () => this._closeNow());

    // Controls fill the card's width in rows under the picture: Talk on its
    // own row, then Listen and the flips, then the pan/tilt arrows.
    const bar = document.createElement('div');
    Object.assign(bar.style, { display: 'grid', gap: '8px', padding: '10px 0 2px' });
    this.appendChild(bar);
    const row = () => {
      const r = document.createElement('div');
      Object.assign(r.style, { display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '1fr', gap: '8px' });
      bar.appendChild(r);
      return r;
    };
    const main = row();

    const pill = (label) => {
      const b = document.createElement('button');
      b.textContent = label;
      Object.assign(b.style, {
        padding: '12px 22px', borderRadius: '24px', border: 'none',
        background: 'rgba(0,0,0,0.55)', color: '#fff', font: '600 16px sans-serif',
        cursor: 'pointer', userSelect: 'none', webkitUserSelect: 'none', touchAction: 'none',
        flex: '1 1 0', minWidth: '0', minHeight: '48px',
      });
      return b;
    };

    const listen = pill('Listen');
    listen.addEventListener('click', (e) => {
      e.preventDefault();
      const v = this._video();
      if (!v) return;
      v.muted = !v.muted;
      listen.textContent = v.muted ? 'Listen' : 'Mute';
      listen.style.background = v.muted ? 'rgba(0,0,0,0.55)' : 'rgba(40,120,214,0.9)';
      if (!v.muted && v.play) v.play().catch(() => {});
    });
    main.appendChild(listen);

    // ⇆ mirrors left/right, ⇅ upside down (both = a ceiling mount turned 180°).
    this._flipButtons = {};
    for (const [axis, label, title] of this.config.flip === false ? [] : [
      ['h', '⇆', 'Mirror the picture left/right'],
      ['v', '⇅', 'Flip the picture upside down'],
    ]) {
      const b = pill(label);
      b.title = title;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        const on = !this._flipped(axis);
        const entity = this._flipEntity(axis);
        if (entity) {
          this._hass.callService('input_boolean', on ? 'turn_on' : 'turn_off', { entity_id: entity });
        } else {
          try { localStorage.setItem(this._flipKey(axis), on ? '1' : ''); } catch (_) {}
        }
        this._applyFlip();
      });
      main.appendChild(b);
      this._flipButtons[axis] = b;
    }
    if (this.config.flip !== false) this._applyFlip();

    if (this.config.ptz && this.config.ptz.service) {
      const pad = row();
      for (const [dir, label] of [['left', '◀'], ['up', '▲'], ['down', '▼'], ['right', '▶']]) {
        const b = pill(label);
        b.title = `Move ${dir}`;
        let repeat = null;
        const stop = () => { clearInterval(repeat); repeat = null; };
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          stop();
          this._move(dir);
          // The move script runs ~0.6 s, so holding re-sends to keep going.
          repeat = setInterval(() => this._move(dir), 600);
        });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
        b.addEventListener('contextmenu', (e) => e.preventDefault());
        pad.appendChild(b);
      }

    }

    if (!talk) return;

    // Talk: press and hold. The camera needs ~1.5 s to arm its speaker from
    // cold, so show a loader until then; if it was used in the last few
    // seconds the speaker is still on and talking can start immediately.
    const label = this.config.title || 'Hold to talk';
    const readyMs = this.config.ready_delay == null ? 1500 : Number(this.config.ready_delay);
    const style = document.createElement('style');
    style.textContent = '@keyframes cam720spin{to{transform:rotate(360deg)}}'
      + '.cam720-spin{display:inline-block;width:14px;height:14px;margin-right:8px;'
      + 'vertical-align:-2px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;'
      + 'border-radius:50%;animation:cam720spin .8s linear infinite}';
    this.appendChild(style);

    const btn = pill(label);
    btn.style.minHeight = '56px';
    bar.prepend(btn);
    // Browsers only expose the microphone on https (or localhost). The
    // companion app on home Wi-Fi usually loads the plain-http internal URL.
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      btn.textContent = 'Talk needs https';
      btn.style.opacity = '0.6';
      btn.title = 'Open Home Assistant over https to use the microphone';
      return;
    }
    let readyTimer = null;
    const setBtn = (state) => {
      if (state === 'connecting') {
        btn.style.background = 'rgba(214,140,20,0.92)';
        btn.innerHTML = '<span class="cam720-spin"></span>Connecting…';
      } else if (state === 'live') {
        btn.style.background = 'rgba(214,40,40,0.92)';
        btn.textContent = '● Talk now';
      } else {
        btn.style.background = 'rgba(0,0,0,0.55)';
        btn.textContent = label;
      }
    };
    // Walkie-talkie: Listen is muted while talking, otherwise the phone speaker
    // plays the camera's mic (which hears its own speaker) back into the phone
    // mic and the voice echoes round the loop.
    let wasMuted = true;
    const down = (e) => {
      e.preventDefault();
      if (this._talking) return;
      const v = this._video();
      if (v) { wasMuted = v.muted; v.muted = true; }
      this._talk(true);
      clearTimeout(readyTimer);
      const warm = Date.now() - (this._lastRelease || 0) < 3500;
      if (warm || readyMs <= 0) { setBtn('live'); return; }
      setBtn('connecting');
      readyTimer = setTimeout(() => { if (this._talking) setBtn('live'); }, readyMs);
    };
    const up = (e) => {
      e.preventDefault();
      if (!this._talking) return;
      clearTimeout(readyTimer);
      this._talk(false);
      this._lastRelease = Date.now();
      setBtn('idle');
      const v = this._video();
      if (v && !wasMuted) v.muted = false;
    };
    btn.addEventListener('pointerdown', down);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    // A release the button never sees (app backgrounded mid-press, view
    // switched) must still end the talk and free the mic.
    this._release = () => up({ preventDefault() {} });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this._release(); this._dropMic(); }
    });

    // Track the mic sender across (re)connections and keep it detached
    // unless the button is held.
    this._talking = false;
    this._timer = setInterval(() => this._sync(), 300);
    this._built = true;
  }

  _sync() {
    const pc = this._cam && this._cam.pc;
    if (pc !== this._pc) {
      this._pc = pc;
      this._sender = null;
    }
    // No connection (backgrounded, view switched, reconnecting): hold nothing.
    if (!pc || !pc.getTransceivers) { this._dropMic(); return; }
    if (!this._sender) {
      const t = pc.getTransceivers().find((x) => x.direction === 'sendonly'
        || (x.sender.track && x.sender.track.kind === 'audio'));
      if (!t) return;
      this._sender = t.sender;
    }
    // webrtc-camera opens the mic for each new connection's offer; stop that
    // capture straight away, the sender keeps its slot for replaceTrack.
    const opened = this._sender.track;
    if (opened && opened !== this._mic) {
      this._sender.replaceTrack(null).catch(() => {});
      opened.stop();
    }
    if (!this._talking) { this._dropMic(); return; }
    const live = this._mic && this._mic.readyState === 'live' && !this._mic.muted;
    if (!live) { this._openMic(); return; }
    if (this._sender.track !== this._mic) this._sender.replaceTrack(this._mic).catch(() => {});
  }

  async _openMic() {
    if (this._opening) return;
    this._opening = true;
    let track = null;
    try {
      track = (await navigator.mediaDevices.getUserMedia({ audio: true })).getAudioTracks()[0];
    } catch (e) {
      console.warn('cam720-talk-card: microphone unavailable', e);
    } finally {
      this._opening = false;
    }
    if (!track) return;
    if (!this._talking) { track.stop(); return; } // released while opening
    if (this._mic) this._mic.stop();
    this._mic = track;
    this._sync();
  }

  _dropMic() {
    if (this._sender && this._sender.track) this._sender.replaceTrack(null).catch(() => {});
    if (this._mic) this._mic.stop();
    this._mic = null;
  }

  // The stream ends the moment nobody can see it: app closed or put in the
  // background, tab hidden, or another view opened. webrtc-camera would wait
  // five seconds, and every second of live view costs a battery camera.
  _closeNow() {
    const cam = this._cam;
    if (!cam || !cam.ondisconnect) return;
    clearTimeout(cam.disconnectTID);
    cam.disconnectTID = 0;
    clearTimeout(cam.reconnectTID); // or a pending retry would reopen it unseen
    cam.reconnectTID = 0;
    cam.ondisconnect();
  }

  _talk(on) {
    this._talking = on;
    this._sync();
  }

  _flipEntity(axis) { return this.config[axis === 'h' ? 'flip_entity' : 'flip_v_entity']; }

  _flipKey(axis) { return `cam720-flip${axis === 'h' ? '' : '-v'}-${this.config.stream}`; }

  _flipped(axis) {
    const entity = this._flipEntity(axis);
    if (entity) {
      const state = this._hass && this._hass.states[entity];
      return Boolean(state) && state.state === 'on';
    }
    try { return localStorage.getItem(this._flipKey(axis)) === '1'; } catch (_) { return false; }
  }

  // Mirrors the video. Re-run on every hass update, so a flip made on another
  // device lands here too.
  _applyFlip() {
    const want = { h: this._flipped('h'), v: this._flipped('v') };
    const v = this._video();
    if (!v) {
      clearTimeout(this._flipRetry);
      this._flipRetry = setTimeout(() => this._applyFlip(), 300);
      return;
    }
    v.style.transform = `scale(${want.h ? -1 : 1}, ${want.v ? -1 : 1})`;
    for (const axis of ['h', 'v']) {
      this._flipButtons[axis].style.background = want[axis] ? 'rgba(40,120,214,0.9)' : 'rgba(0,0,0,0.55)';
    }
  }

  // Arrows point the way the picture should move, so a flipped picture
  // moves the camera the other way.
  _move(dir) {
    const opposite = { left: 'right', right: 'left', up: 'down', down: 'up' };
    const axis = dir === 'left' || dir === 'right' ? 'h' : 'v';
    if (this._flipped(axis)) dir = opposite[dir];
    const { service, [`data_${dir}`]: data } = this.config.ptz;
    if (!data) return;
    const [domain, name] = service.split('.', 2);
    this._hass.callService(domain, name, data);
  }

  _video() {
    if (!this._cam) return null;
    return this._cam.video
      || this._cam.querySelector('video')
      || (this._cam.shadowRoot && this._cam.shadowRoot.querySelector('video'));
  }

  connectedCallback() {
    // Home Assistant detaches and re-attaches cards when switching views;
    // restart the mic watcher or a reconnected stream would keep its mic live.
    if (this._built && this.config.talk !== false && !this._timer) {
      this._timer = setInterval(() => this._sync(), 300);
    }
  }

  disconnectedCallback() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    if (this._release) this._release();
    this._dropMic();
    this._closeNow();
  }

  getCardSize() { return 4; }
}

customElements.define('cam720-talk-card', Cam720TalkCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'cam720-talk-card',
  name: 'CAM720 Talk Camera',
  description: 'CAM720 camera with live video, listen, and press-and-hold talk',
});
