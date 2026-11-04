// CAM720 camera card: clean live WebRTC video, a Listen toggle, and a
// press-and-hold Talk button. Audio is only sent to the camera while the
// button is held: the mic sender is detached (replaceTrack(null)) otherwise,
// so nothing, not even silence, reaches the camera speaker.
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
    if (!this._building) {
      this._building = true;
      this._build().catch((e) => console.error('cam720-talk-card:', e));
    }
  }

  async _build() {
    await customElements.whenDefined('webrtc-camera');
    const talk = this.config.talk !== false;

    this.style.position = 'relative';
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

    const bar = document.createElement('div');
    Object.assign(bar.style, {
      position: 'absolute', left: '0', right: '0', bottom: '14px', zIndex: '10',
      display: 'flex', gap: '10px', justifyContent: 'center',
    });
    this.appendChild(bar);

    const pill = (label) => {
      const b = document.createElement('button');
      b.textContent = label;
      Object.assign(b.style, {
        padding: '12px 22px', borderRadius: '24px', border: 'none',
        background: 'rgba(0,0,0,0.55)', color: '#fff', font: '600 16px sans-serif',
        cursor: 'pointer', userSelect: 'none', webkitUserSelect: 'none', touchAction: 'none',
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
    bar.appendChild(listen);

    if (!talk) return;

    // Talk: press and hold. The camera needs ~1.5 s to arm its speaker from
    // cold, so show a loader until then; if it was used in the last few
    // seconds the speaker is still on and talking can start immediately.
    const label = this.config.title || 'Hold to talk';
    const readyMs = Number(this.config.ready_delay ?? 1500);
    const style = document.createElement('style');
    style.textContent = '@keyframes cam720spin{to{transform:rotate(360deg)}}'
      + '.cam720-spin{display:inline-block;width:14px;height:14px;margin-right:8px;'
      + 'vertical-align:-2px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;'
      + 'border-radius:50%;animation:cam720spin .8s linear infinite}';
    this.appendChild(style);

    const btn = pill(label);
    bar.appendChild(btn);
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

    // Track the mic sender across (re)connections and keep it detached
    // unless the button is held.
    this._talking = false;
    this._timer = setInterval(() => this._sync(), 300);
  }

  _sync() {
    const pc = this._cam && this._cam.pc;
    if (!pc || !pc.getSenders) return;
    if (pc !== this._pc) {
      this._pc = pc;
      this._sender = null;
    }
    if (!this._sender) {
      const s = pc.getSenders().find((x) => x.track && x.track.kind === 'audio');
      if (!s) return;
      this._sender = s;
      this._mic = s.track;
    }
    // Mute the track as well as detaching it, so a sender the browser keeps
    // alive can only ever carry silence.
    this._mic.enabled = this._talking;
    const want = this._talking ? this._mic : null;
    if (this._sender.track !== want) {
      this._sender.replaceTrack(want).catch(() => {});
    }
  }

  _talk(on) {
    this._talking = on;
    this._sync();
  }

  _video() {
    if (!this._cam) return null;
    return this._cam.video
      || this._cam.querySelector('video')
      || (this._cam.shadowRoot && this._cam.shadowRoot.querySelector('video'));
  }

  disconnectedCallback() {
    if (this._timer) clearInterval(this._timer);
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
