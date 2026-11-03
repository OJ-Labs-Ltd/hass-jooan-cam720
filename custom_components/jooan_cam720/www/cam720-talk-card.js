// CAM720 Talk Camera card: live video + listen, plus a press-and-hold Talk
// button that opens the microphone to the camera speaker only while held.
//
// It wraps the WebRTC Camera (webrtc-camera) element for transport, so it works
// anywhere that card does, including the Home Assistant companion app (grant the
// app microphone access in the OS settings). The mic track is negotiated once
// (one permission prompt) and kept muted until the button is pressed.
//
// Card config:
//   type: custom:cam720-talk-card
//   stream: crib0        # go2rtc stream name (video + cam720 backchannel)
//   title: Talk          # optional button label

class Cam720TalkCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.stream) {
      throw new Error('cam720-talk-card: "stream" is required');
    }
    this.config = config;
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
    // webrtc-camera may not be registered yet when this card first renders.
    await customElements.whenDefined('webrtc-camera');

    this.style.position = 'relative';
    this.style.display = 'block';

    const cam = document.createElement('webrtc-camera');
    // Force WebRTC only: two-way audio needs it, and it avoids the MSE media
    // player (play/seek controls) in favour of a clean live stream.
    cam.setConfig({ url: this.config.stream, media: 'video,audio,microphone', mode: 'webrtc' });
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

    // Listen: toggle the camera audio (muted by default for autoplay).
    const listen = pill('Listen');
    listen.addEventListener('click', (e) => {
      e.preventDefault();
      const v = this._video();
      if (!v) return;
      v.muted = !v.muted;
      listen.textContent = v.muted ? 'Listen' : 'Mute';
      listen.style.background = v.muted ? 'rgba(0,0,0,0.55)' : 'rgba(40,120,214,0.9)';
      if (!v.muted) v.play && v.play().catch(() => {});
    });
    bar.appendChild(listen);

    // Talk: press and hold.
    const btn = pill(this.config.title || 'Hold to talk');
    bar.appendChild(btn);
    const down = (e) => { e.preventDefault(); this._setMic(true); btn.style.background = 'rgba(214,40,40,0.9)'; btn.textContent = 'Talking…'; };
    const up = (e) => { e.preventDefault(); this._setMic(false); btn.style.background = 'rgba(0,0,0,0.55)'; btn.textContent = this.config.title || 'Hold to talk'; };
    btn.addEventListener('pointerdown', down);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, up);

    // Keep the mic muted whenever not pressed, re-applying as the track appears
    // or the connection re-establishes.
    this._talking = false;
    this._timer = setInterval(() => {
      const t = this._micTrack();
      if (t) t.enabled = this._talking;
    }, 400);
  }

  _micTrack() {
    const pc = this._cam && this._cam.pc;
    if (!pc || !pc.getSenders) return null;
    for (const s of pc.getSenders()) {
      if (s.track && s.track.kind === 'audio') return s.track;
    }
    return null;
  }

  _video() {
    if (!this._cam) return null;
    return this._cam.video
      || this._cam.querySelector('video')
      || (this._cam.shadowRoot && this._cam.shadowRoot.querySelector('video'));
  }

  _setMic(on) {
    this._talking = on;
    const t = this._micTrack();
    if (t) t.enabled = on;
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
  description: 'CAM720 camera with press-and-hold talk',
});
