import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Attribution } from 'ox/erc8021';

export function useGameEngine({ onPayEndFee }) {
  const containerRef = useRef(null);
  const engineRef = useRef({});

  const [gameState, setGameState] = useState('loading');
  const [loadMsg, setLoadMsg] = useState('');
  const [loadProgress, setLoadProgress] = useState(0);
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [combo, setCombo] = useState(1);
  const [distance, setDistance] = useState(0);
  const [toastMsg, setToastMsg] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [finalCoins, setFinalCoins] = useState(0);
  const [finalCombo, setFinalCombo] = useState(1);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const LANE_XS = [3.8, 0.0, -3.8];

    const cfg = {
      camDist: 9,
      camHeight: 5.5,
      camLookH: 2.2,
      walkableNY: 0.35,
      rayUp: 12,
      rayDown: 110,
      groundSnap: 18,
      maxStepUp: 4,
      colHstand: [0.45, 1.2, 1.95],
      colHroll: [0.3, 0.85],
      colIgnoreBelow: 0.15,
      frontalNZ: -0.35,
      landSnap: 0.35,
      landDrop: 1.2,
      laneSnap: 0.02,
      coinHover: 0.25,
      coinRadius: 1.3,
      coinSpin: 5,
      coinScore: 120,
      coinSpacing: 1.8,
      trainZMin: 90,
      trainZMax: 150,
      trainDespawn: 60,
      trainRadius: 0.85,
      trainTopEps: 0.25,
      trainJitter: 6,
      trainLaneGap: 35,
      nearDZ: 1.6,
      nearDX: 2.0,
      nearBonus: 600,
      nearShake: 0.45,
      shakeDec: 8,
      fovBase: 62,
      fovAdd: 12,
      comboWindow: 1.6,
      comboMax: 10,
      guardFollowDist: 4.2,
      guardCatchDist: 1.8,
      ignore: [
        'nocollide',
        'decor',
        'fx',
        'particle',
        'trigger',
        'helper',
        'coin',
      ],
    };

    const DIFF = {
      normal: {
        spd: 16,
        spdMax: 30,
        accel: 1.5,
        laneSpd: 10,
        jump: 13,
        grav: 32,
        colDist: 1.35,
        coinsT: 16,
        trainSpd: 30,
        tMin: 1.8,
        tMax: 2.8,
        t2: 0.4,
      },
    };

    let scene, camera, renderer, clock, raycaster;
    let player,
      playerMixer,
      actions = {},
      activeAct;
    let mapTiles = [],
      mapTmpl = null,
      mapTmpl2 = null,
      mapLen = 60,
      mapLen2 = 60,
      mapAlt = 0;
    let guard = null,
      guardMixer = null,
      guardAct = null;
    let coinTmpl = null,
      coinTmplScale = 1;
    let trainTmpl = null,
      trainTmplScale = 1;
    let trains = [],
      trainTimer = 2;
    let isRunning = false,
      isOver = false,
      isPaused = false;
    let lane = 1,
      targetX = LANE_XS[1];
    let velY = 0,
      isJump = false,
      isRoll = false,
      rollT = 0;
    let score = 0,
      coins = 0,
      combo = 1,
      lastCoinT = -9999;
    let baseY = 0,
      footOff = 0;
    let shakeAmp = 0;
    let particles = null;
    let p = DIFF.normal;
    let totalDist = 0;
    let lastGuardWarning = 0;
    let touchX0 = 0,
      touchY0 = 0;
    let bestScore = parseInt(localStorage.getItem('ss_best') || '0');

    // ===== WEB3 STATE =====
    let web3Wallet = null; // { provider, signer, address } — null when not connected

    // ===== AUDIO =====
    const Aud = {
      ctx: null,
      master: null,
      musicGain: null,
      sfxGain: null,
      muted: false,
      vol: 0.7,
      playing: false,
      step: 0,
      notes: [0, 4, 7, 12, 7, 4, 0, 7, 12, 15, 12, 7],
      root: 196,
      tempo: 128,
      timer: null,
      init() {
        if (this.ctx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.vol;
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.38;
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.85;
        this.musicGain.connect(this.master);
        this.sfxGain.connect(this.master);
        this.master.connect(this.ctx.destination);
      },
      async unlock() {
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') {
          try {
            await this.ctx.resume();
          } catch (e) {}
        }
        if (!this.playing) this.startMusic();
      },
      setVol(v) {
        this.vol = Math.max(0, Math.min(1, v));
        if (this.master) this.master.gain.value = this.muted ? 0 : this.vol;
      },
      setMute(m) {
        this.muted = !!m;
        if (this.master) this.master.gain.value = this.muted ? 0 : this.vol;
      },
      _tone({
        freq = 440,
        dur = 0.12,
        type = 'sine',
        gain = 0.2,
        attack = 0.002,
        release = 0.06,
        slide = null,
      }) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime,
          o = this.ctx.createOscillator(),
          g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (slide)
          o.frequency.exponentialRampToValueAtTime(Math.max(1, slide), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(gain, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
        o.connect(g);
        g.connect(this.sfxGain);
        o.start(t);
        o.stop(t + dur + release + 0.02);
      },
      _noise({ dur = 0.08, gain = 0.18, freq = 900, q = 0.7 }) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime,
          n = Math.floor(this.ctx.sampleRate * dur);
        const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate),
          d = buf.getChannelData(0);
        for (let i = 0; i < n; i++)
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.4);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const bq = this.ctx.createBiquadFilter();
        bq.type = 'bandpass';
        bq.frequency.value = freq;
        bq.Q.value = q;
        const g2 = this.ctx.createGain();
        g2.gain.setValueAtTime(gain, t);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
        src.connect(bq);
        bq.connect(g2);
        g2.connect(this.sfxGain);
        src.start(t);
        src.stop(t + dur + 0.1);
      },
      sfxSwitch() {
        this._tone({
          freq: 650,
          dur: 0.04,
          type: 'square',
          gain: 0.09,
          release: 0.03,
        });
      },
      sfxJump() {
        this._tone({
          freq: 480,
          dur: 0.12,
          type: 'triangle',
          gain: 0.25,
          slide: 960,
          release: 0.1,
        });
      },
      sfxRoll() {
        this._tone({
          freq: 200,
          dur: 0.14,
          type: 'sawtooth',
          gain: 0.15,
          slide: 110,
          release: 0.1,
        });
        this._noise({ dur: 0.12, gain: 0.12, freq: 1100 });
      },
      sfxCoin() {
        this._tone({ freq: 1047, dur: 0.05, gain: 0.2, release: 0.07 });
        this._tone({ freq: 1319, dur: 0.05, gain: 0.15, release: 0.07 });
      },
      sfxCombo() {
        this._tone({
          freq: 1046,
          dur: 0.09,
          type: 'triangle',
          gain: 0.22,
          slide: 1568,
          release: 0.12,
        });
      },
      sfxNear() {
        this._noise({ dur: 0.14, gain: 0.18, freq: 650, q: 0.5 });
        this._tone({ freq: 160, dur: 0.1, gain: 0.12, slide: 100 });
      },
      sfxHorn() {
        this._tone({
          freq: 440,
          dur: 0.22,
          type: 'square',
          gain: 0.16,
          release: 0.12,
        });
        this._tone({
          freq: 330,
          dur: 0.26,
          type: 'square',
          gain: 0.13,
          release: 0.14,
        });
      },
      sfxOver() {
        this._tone({
          freq: 370,
          dur: 0.18,
          type: 'triangle',
          gain: 0.25,
          slide: 185,
          release: 0.25,
        });
        this._noise({ dur: 0.2, gain: 0.14, freq: 350, q: 0.8 });
      },
      sfxGuard() {
        this._noise({ dur: 0.08, gain: 0.12, freq: 400, q: 0.4 });
      },
      startMusic() {
        if (!this.ctx || this.playing) return;
        this.playing = true;
        const step = 60 / this.tempo / 2;
        let next = this.ctx.currentTime + 0.02;
        this.timer = setInterval(() => {
          if (!this.ctx) return;
          while (next < this.ctx.currentTime + 0.12) {
            const s = this.step++ % this.notes.length;
            const f = this.root * Math.pow(2, this.notes[s] / 12);
            this._pluck(f, next, step * 0.9, 0.07);
            if (this.step % 4 === 0) this._kick(next);
            if (this.step % 2 === 0) this._hat(next);
            if (this.step % 8 === 0) this._bass(next, f * 0.5);
            next += step;
          }
        }, 25);
      },
      stopMusic() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.playing = false;
      },
      _pluck(f, t, dur, amp) {
        if (!this.ctx) return;
        const o = this.ctx.createOscillator(),
          g = this.ctx.createGain(),
          flt = this.ctx.createBiquadFilter();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f, t);
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(2200, t);
        flt.Q.value = 0.6;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(amp, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(flt);
        flt.connect(g);
        g.connect(this.musicGain);
        o.start(t);
        o.stop(t + dur + 0.02);
      },
      _kick(t) {
        if (!this.ctx) return;
        const o = this.ctx.createOscillator(),
          g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.14, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        o.connect(g);
        g.connect(this.musicGain);
        o.start(t);
        o.stop(t + 0.16);
      },
      _hat(t) {
        if (!this.ctx) return;
        const n = Math.floor(this.ctx.sampleRate * 0.03),
          buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate),
          d = buf.getChannelData(0);
        for (let i = 0; i < n; i++)
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.8);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 7000;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
        src.connect(hp);
        hp.connect(g);
        g.connect(this.musicGain);
        src.start(t);
        src.stop(t + 0.06);
      },
      _bass(t, f) {
        if (!this.ctx) return;
        const o = this.ctx.createOscillator(),
          g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t);
        const flt = this.ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.value = 300;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.06, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(flt);
        flt.connect(g);
        g.connect(this.musicGain);
        o.start(t);
        o.stop(t + 0.22);
      },
    };

    // ===== HELPERS =====
    function lerp(a, b, t) {
      return a + (b - a) * t;
    }
    function sAlpha(spd, dt) {
      return 1 - Math.exp(-spd * dt);
    }
    function rand(a, b) {
      return a + Math.random() * (b - a);
    }
    function isIgnored(obj) {
      const n = (obj?.name || '').toLowerCase();
      return n && cfg.ignore.some((s) => n.includes(s));
    }
    function wNormal(hit) {
      if (!hit.face) return new THREE.Vector3(0, 1, 0);
      return hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    }
    function footY() {
      return player ? player.position.y - footOff : baseY;
    }

    // ===== TOAST =====
    let toastTimeout = null;
    function showToast(txt, ms = 700) {
      const el = document.getElementById('toast');
      // Color based on content
      if (txt.includes('COMBO') || txt.includes('x'))
        el.style.color = '#00E5FF';
      else if (txt.includes('COIN') || txt.includes('GOLD'))
        el.style.color = '#FFD600';
      else if (txt.includes('CLOSE') || txt.includes('NEAR'))
        el.style.color = '#FF6D00';
      else if (txt.includes('RUN') || txt.includes('GO'))
        el.style.color = '#00E676';
      else el.style.color = '#fff';
      el.textContent = txt;
      el.classList.add('show');
      clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => el.classList.remove('show'), ms);
    }

    // ===== FLOATING SCORE POP =====
    function spawnScorePop(worldPos, text) {
      const el = document.createElement('div');
      el.className = 'multiplier-pop';
      el.textContent = text;
      // Project world pos to screen
      const v = worldPos.clone().project(camera);
      const x = (v.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1000);
    }

    // ===== SCREEN FLASH =====
    function flashScreen(color = 'rgba(255,100,0,0.3)') {
      const el = document.getElementById('screen-flash');
      el.style.background = color;
      setTimeout(() => {
        el.style.background = 'transparent';
      }, 120);
    }

    // ===== PARTICLES =====
    function spawnBurst(pos, color, count = 20, spd = 6, life = 0.6) {
      if (!particles) return;
      const geo = new THREE.BufferGeometry();
      const pos3 = new Float32Array(count * 3),
        vels = [];
      for (let i = 0; i < count; i++) {
        pos3[i * 3] = pos.x;
        pos3[i * 3 + 1] = pos.y;
        pos3[i * 3 + 2] = pos.z;
        vels.push(
          new THREE.Vector3(
            (Math.random() * 2 - 1) * spd,
            (Math.random() + 0.4) * spd,
            (Math.random() * 2 - 1) * spd,
          ),
        );
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos3, 3));
      const mat = new THREE.PointsMaterial({
        color,
        size: 0.28,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
      const pts = new THREE.Points(geo, mat);
      pts.userData = { life, life0: life, vels };
      particles.add(pts);
    }
    function updateParticles(dt) {
      if (!particles) return;
      for (let i = particles.children.length - 1; i >= 0; i--) {
        const pts = particles.children[i];
        const attr = pts.geometry.getAttribute('position'),
          vels = pts.userData.vels;
        pts.userData.life -= dt;
        const t = Math.max(0, pts.userData.life / pts.userData.life0);
        pts.material.opacity = t;
        for (let j = 0; j < vels.length; j++) {
          attr.array[j * 3] += vels[j].x * dt;
          attr.array[j * 3 + 1] += vels[j].y * dt - 4 * (1 - t) * dt;
          attr.array[j * 3 + 2] += vels[j].z * dt;
        }
        attr.needsUpdate = true;
        if (pts.userData.life <= 0) {
          pts.geometry.dispose();
          pts.material.dispose();
          particles.remove(pts);
        }
      }
    }

    // ===== MAP =====
    function placeholderMap() {
      const g = new THREE.Group();
      const f = new THREE.Mesh(
        new THREE.PlaneGeometry(15, mapLen),
        new THREE.MeshPhongMaterial({ color: 0x555555 }),
      );
      f.rotation.x = -Math.PI / 2;
      f.position.z = mapLen / 2;
      f.receiveShadow = true;
      f.name = 'floor';
      g.add(f);
      const o = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshPhongMaterial({ color: 0xff0000 }),
      );
      o.name = 'obstacle_box';
      o.position.set(0, 1, mapLen / 2);
      g.add(o);
      return g;
    }
    function normScale(obj, mode = 'train') {
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj),
        s = new THREE.Vector3();
      b.getSize(s);
      const mx = Math.max(0.0001, s.x, s.y, s.z),
        want = mode === 'train' ? 12 : 1;
      if (mx > want * 6 || mx < want * 0.2) return want / mx;
      return 1;
    }
    function spawnTile(zPos) {
      mapAlt++;
      let tmpl = mapTmpl,
        len = mapLen;
      if (mapTmpl2 && mapAlt % 2 === 0) {
        tmpl = mapTmpl2;
        len = mapLen2;
      }
      const tile = tmpl ? SkeletonUtils.clone(tmpl) : placeholderMap();
      tile.position.set(0, 0, zPos);
      tile.userData.tileLen = len;
      tile.userData.tileZ = zPos;
      scene.add(tile);
      mapTiles.push(tile);
      populateCoins(tile);
    }
    function initMap() {
      let z = 0;
      for (let i = 0; i < 6; i++) {
        spawnTile(z);
        // advance by the actual len of the tile just spawned
        const t = mapTiles[mapTiles.length - 1];
        z += t.userData.tileLen;
      }
    }
    function updateMap() {
      if (!mapTiles.length || !player) return;
      const first = mapTiles[0];
      if (player.position.z > first.userData.tileZ + first.userData.tileLen) {
        mapTiles.shift();
        const last = mapTiles[mapTiles.length - 1];
        const nz = last.userData.tileZ + last.userData.tileLen;
        first.position.z = nz;
        first.userData.tileZ = nz;
        mapTiles.push(first);
        populateCoins(first);
      }
    }

    // ===== COINS =====
    function makeCoin() {
      let c;
      if (coinTmpl) {
        c = SkeletonUtils.clone(coinTmpl);
        c.scale.multiplyScalar(coinTmplScale);
      } else {
        const m = new THREE.Mesh(
          new THREE.TorusGeometry(0.45, 0.16, 12, 24),
          new THREE.MeshStandardMaterial({
            color: 0xffd54f,
            metalness: 0.7,
            roughness: 0.2,
          }),
        );
        m.name = 'coin_placeholder';
        c = new THREE.Group();
        c.add(m);
      }
      c.name = 'coin_pickup';
      c.userData.isCoin = true;
      c.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.name = (o.name || '') + '_coin';
        }
      });
      return c;
    }
    function populateCoins(tile) {
      if (!tile.userData.coinGroup) {
        tile.userData.coinGroup = new THREE.Group();
        tile.add(tile.userData.coinGroup);
      }
      const cg = tile.userData.coinGroup;
      while (cg.children.length) cg.remove(cg.children[0]);
      tile.userData.coins = [];
      const len = tile.userData.tileLen || mapLen,
        tz = tile.userData.tileZ || tile.position.z;
      // Use tile's own measured floor Y so coins sit correctly regardless of map height differences
      const floorY =
        tile.userData.floorY !== undefined ? tile.userData.floorY : baseY;
      // Convert world floorY to local Y inside tile (tile.position.y is 0, so local = world)
      const coinLocalY = floorY - tile.position.y + cfg.coinHover;
      const count = p.coinsT,
        lastZ = [-9999, -9999, -9999];
      // Sometimes make a line of coins in one lane
      const lineChance = Math.random() < 0.3;
      const lineLane = Math.floor(Math.random() * 3);
      const lineStart = tz + 5 + Math.random() * (len - 20);
      if (lineChance) {
        for (let j = 0; j < 6; j++) {
          const coin = makeCoin();
          coin.position.set(
            LANE_XS[lineLane],
            coinLocalY,
            lineStart + j * 2.2 - tile.position.z,
          );
          coin.rotation.y = j * 0.8;
          cg.add(coin);
          tile.userData.coins.push(coin);
        }
      }
      for (let i = 0; i < count; i++) {
        const ln = Math.floor(Math.random() * 3),
          x = LANE_XS[ln];
        let z = tz + 2 + Math.random() * (len - 4),
          guard2 = 0;
        while (Math.abs(z - lastZ[ln]) < cfg.coinSpacing && guard2++ < 20)
          z = tz + 2 + Math.random() * (len - 4);
        lastZ[ln] = z;
        const coin = makeCoin();
        coin.position.set(x, coinLocalY, z - tile.position.z);
        coin.rotation.y = Math.random() * Math.PI * 2;
        cg.add(coin);
        tile.userData.coins.push(coin);
      }
    }
    function updateCoins(dt, now) {
      if (!player) return;
      const px = player.position.x,
        py = footY() + 1.0,
        pz = player.position.z,
        r2 = cfg.coinRadius * cfg.coinRadius;
      for (const tile of mapTiles) {
        const list = tile.userData.coins;
        if (!list || !list.length) continue;
        for (let i = list.length - 1; i >= 0; i--) {
          const c = list[i];
          if (!c || !c.parent) {
            list.splice(i, 1);
            continue;
          }
          c.rotation.y += cfg.coinSpin * dt;
          const wp = new THREE.Vector3();
          c.getWorldPosition(wp);
          const dx = wp.x - px,
            dy = wp.y - py,
            dz = wp.z - pz;
          if (dx * dx + dy * dy + dz * dz <= r2) {
            c.parent.remove(c);
            list.splice(i, 1);
            coins++;
            if (now - lastCoinT <= cfg.comboWindow) {
              combo = Math.min(cfg.comboMax, combo + 1);
              if (combo >= 3) {
                Aud.sfxCombo();
              }
              if (combo >= 5) showToast('🔥 COMBO x' + combo + '!');
              else if (combo >= 3) showToast('COMBO x' + combo);
            } else {
              combo = 1;
            }
            lastCoinT = now;
            const add = Math.floor(cfg.coinScore * combo);
            score += add;
            setCoins(coins);
            const cb = document.getElementById('combo-board');
            cb.textContent = 'x' + combo;
            cb.classList.remove('pop');
            void cb.offsetWidth;
            cb.classList.add('pop');
            Aud.sfxCoin();
            spawnBurst(wp, 0xffd600, 20, 6, 0.55);
            if (add > cfg.coinScore) spawnScorePop(wp, '+' + add);
          }
        }
      }
    }

    // ===== TRAINS =====
    function makeTrain() {
      let t;
      if (trainTmpl) {
        t = SkeletonUtils.clone(trainTmpl);
        t.scale.multiplyScalar(trainTmplScale);
      } else {
        const g = new THREE.Mesh(
          new THREE.BoxGeometry(2.6, 2.6, 10),
          new THREE.MeshStandardMaterial({
            color: 0x263238,
            metalness: 0.1,
            roughness: 0.8,
          }),
        );
        g.castShadow = true;
        g.name = 'train_ph';
        t = new THREE.Group();
        t.add(g);
      }
      t.name = 'train_active';
      t.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      t.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(t);
      t.userData.botOff = -b.min.y;
      t.userData.lane = 1;
      t.userData.passed = false;
      t.userData.honked = false;
      return t;
    }
    function schedTrain() {
      trainTimer = rand(p.tMin, p.tMax);
    }
    function canTrain(ln, z) {
      for (const tr of trains) {
        if (!tr || !tr.parent) continue;
        if (tr.userData.lane !== ln) continue;
        if (Math.abs(tr.position.z - z) < cfg.trainLaneGap) return false;
      }
      return true;
    }
    function spawnTrain(ln, z) {
      const t = makeTrain();
      t.userData.lane = ln;
      t.position.set(LANE_XS[ln], baseY + (t.userData.botOff || 0), z);
      t.rotation.y = Math.PI;
      scene.add(t);
      trains.push(t);
    }
    function spawnWave() {
      if (!player) return;
      const cnt = Math.random() < p.t2 ? 2 : 1;
      const bz = player.position.z + rand(cfg.trainZMin, cfg.trainZMax);
      const lns = [0, 1, 2].sort(() => Math.random() - 0.5);
      let done = 0;
      for (let i = 0; i < lns.length && done < cnt; i++) {
        const z = bz + (done ? rand(-cfg.trainJitter, cfg.trainJitter) : 0);
        if (!canTrain(lns[i], z)) continue;
        spawnTrain(lns[i], z);
        done++;
      }
      let g2 = 0;
      while (done < cnt && g2++ < 6) {
        const ln = Math.floor(Math.random() * 3),
          z = bz + rand(-10, 10);
        if (!canTrain(ln, z)) continue;
        spawnTrain(ln, z);
        done++;
      }
      if (done > 0 && Math.random() < 0.55) Aud.sfxHorn();
      if (done === 2) showToast('⚡ DOUBLE TROUBLE!');
    }
    function sphBox(c, r, box) {
      const x = Math.max(box.min.x, Math.min(c.x, box.max.x)),
        y = Math.max(box.min.y, Math.min(c.y, box.max.y)),
        z = Math.max(box.min.z, Math.min(c.z, box.max.z));
      const dx = x - c.x,
        dy = y - c.y,
        dz = z - c.z;
      return dx * dx + dy * dy + dz * dz <= r * r;
    }
    function updateTrains(dt) {
      if (!player) return;
      trainTimer -= dt;
      if (trainTimer <= 0) {
        spawnWave();
        schedTrain();
      }
      const pz = player.position.z;
      for (let i = trains.length - 1; i >= 0; i--) {
        const t = trains[i];
        if (!t || !t.parent) {
          trains.splice(i, 1);
          continue;
        }
        t.position.z -= p.trainSpd * dt;
        const dz2 = t.position.z - pz;
        if (!t.userData.honked && dz2 < 45 && dz2 > 20) {
          t.userData.honked = true;
          if (Math.random() < 0.5) Aud.sfxHorn();
        }
        if (t.position.z < pz - cfg.trainDespawn) {
          t.parent.remove(t);
          trains.splice(i, 1);
          continue;
        }
        const ctr = new THREE.Vector3(player.position.x, footY() + 1.2, pz);
        t.updateMatrixWorld(true);
        const wb = t.userData._wb || (t.userData._wb = new THREE.Box3());
        wb.setFromObject(t);
        if (sphBox(ctr, cfg.trainRadius, wb)) {
          if (footY() > wb.max.y - cfg.trainTopEps) {
            /*on top*/
          } else {
            gameOver();
            return;
          }
        }
        if (!t.userData.passed && t.position.z < pz) {
          t.userData.passed = true;
          const dx = Math.abs(player.position.x - t.position.x);
          if (dx <= cfg.nearDX && Math.abs(pz - t.position.z) <= cfg.nearDZ) {
            score += cfg.nearBonus + Math.floor(120 * combo);
            shakeAmp = Math.min(1, shakeAmp + cfg.nearShake);
            Aud.sfxNear();
            showToast('😱 SO CLOSE!');
            flashScreen('rgba(255,200,0,0.25)');
            spawnBurst(
              new THREE.Vector3(player.position.x, footY() + 1.2, pz),
              0x80d8ff,
              25,
              8,
              0.5,
            );
          }
        }
      }
    }

    // ===== ANIM =====
    function cleanClip(clip) {
      if (!clip) return;
      clip.tracks = clip.tracks.filter((tr) => !tr.name.endsWith('.position'));
    }
    function playAnim(name, fade = 0.2, loop = true) {
      if (!actions[name]) return;
      const a = actions[name];
      if (activeAct !== a) {
        if (activeAct) activeAct.fadeOut(fade);
        a.reset();
        a.setEffectiveTimeScale(1);
        a.setEffectiveWeight(1);
        a.clampWhenFinished = !loop;
        a.loop = loop ? THREE.LoopRepeat : THREE.LoopOnce;
        a.fadeIn(fade).play();
        activeAct = a;
      }
    }
    function doJump() {
      velY = p.jump;
      isJump = true;
      playAnim('jump', 0.1, false);
      Aud.sfxJump();
    }
    function doRoll() {
      isRoll = true;
      rollT = 0.8;
      playAnim('roll', 0.1, false);
      Aud.sfxRoll();
    }

    // ===== GROUND =====
    function updateGround(dt) {
      if (!player || !mapTiles.length) return;
      const orig = player.position.clone();
      orig.y += cfg.rayUp;
      raycaster.set(orig, new THREE.Vector3(0, -1, 0));
      raycaster.far = cfg.rayUp + cfg.rayDown;
      const hits = raycaster.intersectObjects(mapTiles, true);
      for (const h of hits) {
        if (!h.object || isIgnored(h.object)) continue;
        const n = wNormal(h);
        if (n.y < cfg.walkableNY) continue;
        const gY = h.point.y;
        if (isJump) {
          if (velY > 0) continue;
          if (gY > footY() + cfg.landSnap) continue;
          if (footY() - gY > cfg.landDrop) continue;
          baseY = gY;
          player.position.y = baseY + footOff;
          isJump = false;
          velY = 0;
          if (!isRoll) playAnim('run');
          return;
        } else {
          if (gY - baseY > cfg.maxStepUp) continue;
          baseY = lerp(baseY, gY, sAlpha(cfg.groundSnap, dt));
          player.position.y = baseY + footOff;
          return;
        }
      }
    }
    function checkCollision() {
      if (!player || !mapTiles.length) return;
      const hs = isRoll ? cfg.colHroll : cfg.colHstand,
        fwd = new THREE.Vector3(0, 0, 1);
      for (const h of hs) {
        const orig = new THREE.Vector3(
          player.position.x,
          footY() + h,
          player.position.z,
        );
        raycaster.set(orig, fwd);
        raycaster.far = p.colDist;
        const hits = raycaster.intersectObjects(mapTiles, true);
        for (const hit of hits) {
          if (!hit.object || isIgnored(hit.object)) continue;
          const n = wNormal(hit);
          if (n.y >= cfg.walkableNY) continue;
          if (n.z > cfg.frontalNZ) continue;
          if (hit.point.y <= footY() + cfg.colIgnoreBelow) continue;
          flashScreen('rgba(244,67,54,0.5)');
          gameOver();
          return;
        }
      }
    }

    // ===== WEB3 FUNCTIONS =====
    async function connectWallet() {
      if (!window.ethereum) {
        alert(
          'MetaMask not found. Please install MetaMask to use on-chain features.',
        );
        return;
      }
      const btnW = document.getElementById('btn-wallet');
      btnW.disabled = true;
      btnW.textContent = 'Connecting...';
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send('eth_requestAccounts', []);
        // Switch to Base Mainnet
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: BASE_CHAIN_HEX }],
          });
        } catch (err) {
          if (err.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: BASE_CHAIN_HEX,
                  chainName: 'Base',
                  nativeCurrency: {
                    name: 'Ether',
                    symbol: 'ETH',
                    decimals: 18,
                  },
                  rpcUrls: [BASE_RPC],
                  blockExplorerUrls: ['https://basescan.org'],
                },
              ],
            });
          } else {
            throw err;
          }
        }
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        web3Wallet = { provider, signer, address };
        updateWalletUI();
      } catch (err) {
        console.warn('Wallet connect failed:', err.message);
        btnW.disabled = false;
        btnW.textContent = 'Connect Wallet';
      }
    }

    function updateWalletUI() {
      const btnW = document.getElementById('btn-wallet');
      const addrEl = document.getElementById('wallet-address');
      const addrTxt = document.getElementById('wallet-addr-text');
      const hudInfo = document.getElementById('hud-wallet-info');
      const hudAddr = document.getElementById('hud-wallet-addr');
      if (web3Wallet) {
        const short = `${web3Wallet.address.slice(0, 6)}\u2026${web3Wallet.address.slice(-4)}`;
        btnW.style.display = 'none';
        addrEl.style.display = 'flex';
        addrEl.href = `https://basescan.org/address/${web3Wallet.address}`;
        addrTxt.textContent = short;
        hudInfo.style.display = 'flex';
        hudAddr.textContent = short;
      } else {
        btnW.style.display = 'flex';
        addrEl.style.display = 'none';
        hudInfo.style.display = 'none';
      }
    }

    function setFeeStatus(status, txHash) {
      const badge = document.getElementById('fee-badge');
      const dot = document.getElementById('fee-dot');
      const txt = document.getElementById('fee-text');
      if (!status) {
        badge.style.display = 'none';
        return;
      }
      badge.style.display = 'flex';
      const states = {
        paying: ['warn', 'Paying fee...'],
        ok: ['ok', 'Fee paid'],
        skip: ['skip', 'Fee skipped'],
      };
      const [cls, label] = states[status] || ['skip', ''];
      dot.className = 'fee-dot ' + cls;
      txt.textContent = label;
      if (txHash) {
        const txWrap = document.getElementById('go-tx-wrap');
        const txLink = document.getElementById('go-tx-link');
        txWrap.style.display = 'block';
        txLink.href = `https://basescan.org/tx/${txHash}`;
      }
    }

    async function payStartFee() {
      if (!web3Wallet?.signer) return;
      // Skip if contract is not deployed yet (placeholder address)
      if (CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000')
        return;
      setFeeStatus('paying');
      try {
        const contract = new ethers.Contract(
          CONTRACT_ADDRESS,
          CONTRACT_ABI,
          web3Wallet.signer,
        );
        const fee = await contract.gameStartFee();
        const txReq = await contract.payGameStart.populateTransaction({ value: fee });
        const dataSuffix = Attribution.toDataSuffix({ codes: ['bc_rmpv9254'] });
        txReq.data = txReq.data + dataSuffix.slice(2);
        const tx = await web3Wallet.signer.sendTransaction(txReq);
        await tx.wait();
        setFeeStatus('ok', tx.hash);
      } catch (e) {
        console.warn('payStartFee failed:', e.message);
        setFeeStatus('skip');
      }
    }

    async function payEndFee() {
      if (!web3Wallet?.signer) return;
      if (CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000')
        return;
      try {
        const contract = new ethers.Contract(
          CONTRACT_ADDRESS,
          CONTRACT_ABI,
          web3Wallet.signer,
        );
        const fee = await contract.gameEndFee();
        const txReq = await contract.payGameEnd.populateTransaction({ value: fee });
        const dataSuffix = Attribution.toDataSuffix({ codes: ['bc_rmpv9254'] });
        txReq.data = txReq.data + dataSuffix.slice(2);
        const tx = await web3Wallet.signer.sendTransaction(txReq);
        await tx.wait();
        setFeeStatus('ok', tx.hash);
      } catch (e) {
        console.warn('payEndFee failed:', e.message);
      }
    }

    // ===== GAME OVER =====
    function gameOver() {
      isRunning = false;
      isOver = true;
      isPaused = false;
      if (activeAct) activeAct.stop();
      Aud.sfxOver();
      Aud.stopMusic();
      // Update best
      if (score > bestScore) {
        bestScore = Math.floor(score);
        localStorage.setItem('ss_best', bestScore);
      }
      const sc = Math.floor(score);

      // First set React state so GameOverScreen can mount
      setFinalScore(sc);
      setFinalCoins(coins);
      setFinalCombo(combo);
      setGameState('gameover');

      // If the DOM element is present (component already mounted), update text
      const finalScoreEl = document.getElementById('final-score');
      if (finalScoreEl) {
        finalScoreEl.textContent = sc.toString().padStart(5, '0');
      }
      if (guard && player) {
        guard.position.z = player.position.z - 1.5;
        if (guardAct) guardAct.stop();
      }
      // Base Mainnet: pay end game fee (don't block UI)

      if (onPayEndFee) onPayEndFee();
    }

    // ===== INPUT =====
    function handleKey(e) {
      if (isOver) return;
      const k = e.key.toLowerCase();
      if (k === 'p') {
        if (!isRunning) return;
        isPaused = !isPaused;
        document.getElementById('pause-overlay').style.display = isPaused
          ? 'flex'
          : 'none';
        if (!isPaused) clock.getDelta();
        return;
      }
      if (!player || !isRunning || isPaused) return;
      if ((k === 'a' || k === 'arrowleft') && lane > 0) {
        lane--;
        targetX = LANE_XS[lane];
        Aud.sfxSwitch();
      }
      if ((k === 'd' || k === 'arrowright') && lane < 2) {
        lane++;
        targetX = LANE_XS[lane];
        Aud.sfxSwitch();
      }
      if ((k === 'w' || k === 'arrowup' || k === ' ') && !isJump && !isRoll)
        doJump();
      if ((k === 's' || k === 'arrowdown') && !isRoll && !isJump) doRoll();
    }
    function handleTouchStart(e) {
      touchX0 = e.touches[0].clientX;
      touchY0 = e.touches[0].clientY;
    }
    function handleTouchEnd(e) {
      if (!isRunning || isOver || isPaused) return;
      const dx = e.changedTouches[0].clientX - touchX0,
        dy = e.changedTouches[0].clientY - touchY0;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > 25) {
          if (dx > 0 && lane < 2) {
            lane++;
            targetX = LANE_XS[lane];
            Aud.sfxSwitch();
          } else if (dx < 0 && lane > 0) {
            lane--;
            targetX = LANE_XS[lane];
            Aud.sfxSwitch();
          }
        }
      } else {
        if (Math.abs(dy) > 25) {
          if (dy < 0 && !isJump && !isRoll) doJump();
          else if (dy > 0 && !isJump && !isRoll) doRoll();
        }
      }
    }

    // ===== SCENE INIT =====
    function initScene() {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x87ceeb);
      scene.fog = new THREE.Fog(0x87ceeb, 90, 250);
      camera = new THREE.PerspectiveCamera(
        cfg.fovBase,
        innerWidth / innerHeight,
        0.1,
        800,
      );
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(innerWidth, innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      if (container) {
        container.appendChild(renderer.domElement);
      }

      // Lighting - warmer, more Subway Surfers feel
      const hemi = new THREE.HemisphereLight(0xfff4e0, 0x4a4a8a, 1.1);
      scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xfff0cc, 1.8);
      sun.position.set(30, 60, -10);
      sun.castShadow = true;
      sun.shadow.mapSize.width = 2048;
      sun.shadow.mapSize.height = 2048;
      sun.shadow.camera.near = 0.5;
      sun.shadow.camera.far = 400;
      sun.shadow.camera.left = -60;
      sun.shadow.camera.right = 60;
      sun.shadow.camera.top = 60;
      sun.shadow.camera.bottom = -60;
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0xaad4ff, 0.4);
      fill.position.set(-20, 10, 30);
      scene.add(fill);

      clock = new THREE.Clock();
      raycaster = new THREE.Raycaster();
      particles = new THREE.Group();
      scene.add(particles);

      window.addEventListener('resize', () => {
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
      });
      window.addEventListener('keydown', handleKey);
      window.addEventListener('touchstart', handleTouchStart, {
        passive: true,
      });
      window.addEventListener('touchend', handleTouchEnd);
      window.addEventListener('touchmove', (e) => e.preventDefault(), {
        passive: false,
      });

      const muteEl = document.getElementById('btn-mute');
      if (muteEl) {
        muteEl.addEventListener('click', () => {
          Aud.setMute(!Aud.muted);
          muteEl.textContent = Aud.muted ? '🔇' : '🔊';
        });
      }
    }

    // ===== START =====
    engineRef.current.startGame = async function startGame() {
      setGameState('playing');
      Aud.unlock();

      if (player) {
        lane = 1;
        targetX = LANE_XS[1];
        baseY = player.position.y - footOff;
        player.position.x = targetX;
        score = 0;
        coins = 0;
        combo = 1;
        lastCoinT = -9999;
        totalDist = 0;
        setCoins(0);
        setCombo(1);
        setScore(0);
        setDistance(0);
        const sz = player.position.z;
        mapTiles.forEach((t) => scene.remove(t));
        mapTiles = [];
        mapAlt = 0;
        let sz2 = player.position.z;
        for (let i = 0; i < 6; i++) {
          spawnTile(sz2);
          sz2 += mapTiles[mapTiles.length - 1].userData.tileLen;
        }
        trains.forEach((t) => {
          if (t?.parent) t.parent.remove(t);
        });
        trains = [];
        schedTrain();
        showToast('🏃 RUN!', 1000);
        if (guard) {
          guard.position.set(
            player.position.x,
            baseY,
            player.position.z - cfg.guardFollowDist,
          );
          if (guardAct) guardAct.play();
        }
      }
      isRunning = true;
      isOver = false;
      isPaused = false;
      setGameState('none' === 'flex' ? 'paused' : 'playing');
      if (activeAct) activeAct.play();
      if (!Aud.playing) Aud.startMusic();
    };

    // ===== LOAD ASSETS =====
    function loadAssets() {
      const files = [
        'characterSubwaySurfer.glb',
        'MapSub2.glb',
        'coin.glb',
        'train4.glb',
        'subway_surfers_guard_npc.glb',
      ];
      let done = 0,
        total = files.length;
      const bar = document.getElementById('progress-bar');
      const msg = document.getElementById('loading-msg');
      function tick(label) {
        done++;
        setLoadProgress((done / total) * 100);
        setLoadMsg('✓ ' + label);
        if (done >= total) onAllLoaded();
      }
      function fail(label) {
        done++;
        setLoadProgress((done / total) * 100);
        setLoadMsg('Skipped: ' + label);
        if (done >= total) onAllLoaded();
      }
      const loader = new GLTFLoader();

      loader.load(
        './characterSubwaySurfer.glb',
        (gltf) => {
          player = gltf.scene;
          player.traverse((o) => {
            if (o.isMesh) o.castShadow = true;
          });
          player.position.set(LANE_XS[1], 20, 30);
          scene.add(player);
          player.updateMatrixWorld(true);
          const b = new THREE.Box3().setFromObject(player);
          footOff = player.position.y - b.min.y;
          baseY = b.min.y;
          playerMixer = new THREE.AnimationMixer(player);
          const anims = gltf.animations || [];
          anims.forEach((c) => cleanClip(c));
          const get = (name) =>
            anims.find((a) => a.name.toLowerCase().includes(name));
          actions.run = playerMixer.clipAction(get('run') || anims[0]);
          actions.jump = playerMixer.clipAction(get('jump') || anims[0]);
          actions.roll = playerMixer.clipAction(get('roll') || anims[0]);
          playAnim('run');
          tick('Character');
        },
        undefined,
        () => fail('Character'),
      );

      loader.load(
        './MapSub2.glb',
        (gltf) => {
          const raw = gltf.scene;
          // Force update so bounding box is accurate
          raw.updateMatrixWorld(true);
          const b0 = new THREE.Box3().setFromObject(raw);
          const s0 = new THREE.Vector3();
          b0.getSize(s0);
          // Rotate so longest axis = Z (forward)
          if (s0.x > s0.z) raw.rotation.y = -Math.PI / 2;
          raw.rotation.y += Math.PI;
          raw.updateMatrixWorld(true);
          // Recompute after rotation
          const b1 = new THREE.Box3().setFromObject(raw);
          const s1 = new THREE.Vector3(),
            c1 = new THREE.Vector3();
          b1.getSize(s1);
          b1.getCenter(c1);
          // Build template: inner raw is shifted so that
          //   X center = 0, Y bottom = 0, Z start = 0
          const wr = new THREE.Group();
          raw.position.set(-c1.x, -b1.min.y, -b1.min.z);
          wr.add(raw);
          mapTmpl = new THREE.Group();
          mapTmpl.add(wr);
          if (s1.z > 10) mapLen = s1.z;
          console.log(
            'Map1 size:',
            s1.x.toFixed(1),
            s1.y.toFixed(1),
            s1.z.toFixed(1),
          );
          tick('Map1');
        },
        undefined,
        () => fail('Map1'),
      );

      loader.load(
        './coin.glb',
        (gltf) => {
          coinTmpl = gltf.scene;
          coinTmpl.name = 'coin_tmpl';
          coinTmpl.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.name = (o.name || '') + '_coin';
            }
          });
          coinTmplScale = normScale(coinTmpl, 'coin');
          tick('Coins');
        },
        undefined,
        () => fail('Coins'),
      );

      loader.load(
        './train4.glb',
        (gltf) => {
          trainTmpl = gltf.scene;
          trainTmpl.name = 'train_tmpl';
          trainTmpl.traverse((o) => {
            if (o.isMesh) o.castShadow = true;
          });
          trainTmplScale = normScale(trainTmpl, 'train');
          tick('Train');
        },
        undefined,
        () => fail('Train'),
      );

      loader.load(
        './subway_surfers_guard_npc.glb',
        (gltf) => {
          try {
            guard = gltf.scene;
            guard.name = 'guard_npc';
            guard.traverse((o) => {
              if (o.isMesh) o.castShadow = true;
            });
            guardMixer = new THREE.AnimationMixer(guard);
            const anims = gltf.animations || [];
            anims.forEach((c) => cleanClip(c));
            const get = (name) =>
              anims.find((a) => a.name.toLowerCase().includes(name));
            if (anims.length > 0) {
              guardAct = guardMixer.clipAction(get('run') || anims[0]);
              guardAct.setEffectiveTimeScale(1.15);
            }
            tick('Guard');
          } catch (e) {
            fail('Guard');
          }
        },
        undefined,
        () => fail('Guard'),
      );
    }

    function onAllLoaded() {
      initMap();
      schedTrain();
      animate();
      setLoadMsg('🏁 Ready!');
      setGameState('ready');

      document.getElementById('btn-play').addEventListener(
        'click',
        async () => {
          setFeeStatus(null);
          await payStartFee();
          startGame();
        },
        { once: true },
      );
      // Attach connect wallet event
    }

    // ===== MILESTONE TOASTS =====
    let lastMilestone = 0;
    function checkMilestones() {
      const m = Math.floor(totalDist / 500) * 500;
      if (m > lastMilestone && m > 0) {
        lastMilestone = m;
        showToast('🌟 ' + m + 'm!', 1000);
        spawnBurst(
          new THREE.Vector3(player.position.x, footY() + 2, player.position.z),
          0xffd600,
          30,
          8,
          0.8,
        );
      }
    }

    // ===== MAIN LOOP =====
    function animate() {
      requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const now = performance.now() / 1000;

      if (playerMixer) playerMixer.update(dt);
      if (guardMixer && isRunning && !isOver) guardMixer.update(dt);
      updateParticles(dt);

      // Camera with smooth lerp + shake
      if (player) {
        const sp01 = Math.min(1, p.spd / p.spdMax);
        camera.fov = lerp(
          camera.fov,
          cfg.fovBase + cfg.fovAdd * sp01,
          sAlpha(4, dt),
        );
        camera.updateProjectionMatrix();
        shakeAmp = Math.max(0, shakeAmp - cfg.shakeDec * dt);
        const sx = (Math.random() * 2 - 1) * 0.2 * shakeAmp,
          sy = (Math.random() * 2 - 1) * 0.15 * shakeAmp;
        camera.position.x = lerp(
          camera.position.x,
          player.position.x + sx,
          sAlpha(6, dt),
        );
        camera.position.y = lerp(
          camera.position.y,
          player.position.y + cfg.camHeight + sy,
          sAlpha(6, dt),
        );
        camera.position.z = lerp(
          camera.position.z,
          player.position.z - cfg.camDist,
          sAlpha(6, dt),
        );
        camera.lookAt(
          player.position.x,
          player.position.y + cfg.camLookH,
          player.position.z + 8,
        );
      }

      if (!isRunning || isOver || !player || !mapTiles.length || isPaused) {
        renderer.render(scene, camera);
        return;
      }

      // Speed ramp
      p.spd = Math.min(p.spd + p.accel * dt, p.spdMax);
      player.position.z += p.spd * dt;
      totalDist += p.spd * dt;

      // Lane
      const ax = sAlpha(p.laneSpd, dt);
      player.position.x = lerp(player.position.x, targetX, ax);
      if (Math.abs(player.position.x - targetX) <= cfg.laneSnap)
        player.position.x = targetX;

      // Tilt on lane change
      const tiltTarget = (player.position.x - targetX) * -0.15;
      player.rotation.z = lerp(player.rotation.z, tiltTarget, sAlpha(8, dt));

      updateGround(dt);

      // Jump
      const gpY = baseY + footOff;
      if (isJump) {
        player.position.y += velY * dt;
        velY -= p.grav * dt;
        if (player.position.y <= gpY) {
          player.position.y = gpY;
          isJump = false;
          velY = 0;
          if (!isRoll) playAnim('run');
        }
      }

      // Roll
      if (isRoll) {
        rollT -= dt;
        if (rollT <= 0) {
          isRoll = false;
          playAnim('run');
        }
      }

      // Score
      score += p.spd * dt * 2;
      document.getElementById('score-board').textContent = Math.floor(score)
        .toString()
        .padStart(5, '0');
      document.getElementById('dist-board').textContent =
        Math.floor(totalDist) + 'm';

      // Milestones
      checkMilestones();

      // Guard follow — speeds up as score increases
      if (guard) {
        const guardSpd = Math.min(1 + score / 5000, 2.5);
        guard.position.x = lerp(
          guard.position.x,
          player.position.x,
          sAlpha(5 * guardSpd, dt),
        );
        guard.position.z = player.position.z - cfg.guardFollowDist;
        guard.position.y = baseY;
        guard.rotation.y = 0;
        // Guard warning
        if (now - lastGuardWarning > 8 && Math.random() < 0.005) {
          lastGuardWarning = now;
          showToast('👮 BUSTED!', 600);
          Aud.sfxGuard();
        }
      }

      updateMap();
      updateCoins(dt, now);
      updateTrains(dt);
      checkCollision();

      renderer.render(scene, camera);
    }

    // ===== BOOT =====
    initScene();
    loadAssets();

    engineRef.current.restartGame = function () {
      setGameState('ready');
      initMap();
      coins = 0;
      score = 0;
      totalDist = 0;
      combo = 1;
      p.spd = cfg.spdStart;
      isOver = false;
      isRunning = false;
      if (player) {
        player.position.set(LANE_XS[1], footOff, 30);
        playAnim('run');
      }
      if (guard) {
        guard.position.set(LANE_XS[1], footOff, player.position.z - 1.5);
      }
    };

    engineRef.current.togglePause = function () {
      if (!isRunning || isOver) return;
      isPaused = !isPaused;
      if (!isPaused) lastTime = performance.now();
      setGameState(isPaused ? 'paused' : 'playing');
    };

    engineRef.current.setVolume = function (v) {
      Aud.setVol(v);
    };

    engineRef.current.toggleMute = function () {
      Aud.toggleMute();
    };

    engineRef.current.handleInput = function (action) {
      if (isPaused || isOver || !isRunning) return;
      if (action === 'jump' && !isJump && !isRoll) {
        doJump();
        return;
      }
      if (action === 'roll' && !isRoll && !isJump) {
        doRoll();
        return;
      }
      if (action === 'left' && lane > 0) {
        lane--;
        targetX = LANE_XS[lane];
        Aud.sfxSwitch();
      }
      if (action === 'right' && lane < 2) {
        lane++;
        targetX = LANE_XS[lane];
        Aud.sfxSwitch();
      }
    };

    return () => {
      isRunning = false;
      isOver = true;
      if (typeof renderer !== 'undefined') renderer.dispose();
      if (typeof Aud !== 'undefined') Aud.ctx?.close();
    };
  }, [onPayEndFee]);

  return {
    containerRef,
    gameState,
    setGameState,
    loadMsg,
    loadProgress,
    score,
    coins,
    combo,
    distance,
    toastMsg,
    finalScore,
    finalCoins,
    finalCombo,
    isMuted,
    startGame: () =>
      engineRef.current.startGame && engineRef.current.startGame(),
    restartGame: () =>
      engineRef.current.restartGame && engineRef.current.restartGame(),
    togglePause: () =>
      engineRef.current.togglePause && engineRef.current.togglePause(),
    setVolume: (v) =>
      engineRef.current.setVolume && engineRef.current.setVolume(v),
    toggleMute: () =>
      engineRef.current.toggleMute && engineRef.current.toggleMute(),
    handleInput: (act) =>
      engineRef.current.handleInput && engineRef.current.handleInput(act),
  };
}
