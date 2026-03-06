/**
 * liquid-ether.js
 * Vanilla-JS port of the LiquidEther React component.
 * Requires THREE.js as a global (load from CDN before this script).
 *
 * Usage:
 *   const le = initLiquidEther(containerEl, { colors: ['#5227FF','#FF9FFC','#B19EEF'], ... });
 *   le.dispose(); // cleanup
 */
(function (global) {
  'use strict';

  function initLiquidEther(container, options) {
    const T = global.THREE;
    if (!T) { console.error('THREE.js not found'); return { dispose() {} }; }

    const opts = Object.assign({
      mouseForce: 20,
      cursorSize: 100,
      isViscous: false,
      viscous: 30,
      iterationsViscous: 32,
      iterationsPoisson: 32,
      dt: 0.014,
      BFECC: true,
      resolution: 0.5,
      isBounce: false,
      colors: ['#5227FF', '#FF9FFC', '#B19EEF'],
      autoDemo: true,
      autoSpeed: 0.5,
      autoIntensity: 2.2,
      takeoverDuration: 0.25,
      autoResumeDelay: 1000,
      autoRampDuration: 0.6
    }, options || {});

    let rafId = null;
    const isVisibleRef = { current: true };

    // ── Palette texture ──────────────────────────────────────────────
    function makePaletteTexture(stops) {
      const arr = (Array.isArray(stops) && stops.length > 0)
        ? (stops.length === 1 ? [stops[0], stops[0]] : stops)
        : ['#ffffff', '#ffffff'];
      const w = arr.length;
      const data = new Uint8Array(w * 4);
      for (let i = 0; i < w; i++) {
        const c = new T.Color(arr[i]);
        data[i * 4 + 0] = Math.round(c.r * 255);
        data[i * 4 + 1] = Math.round(c.g * 255);
        data[i * 4 + 2] = Math.round(c.b * 255);
        data[i * 4 + 3] = 255;
      }
      const tex = new T.DataTexture(data, w, 1, T.RGBAFormat);
      tex.magFilter = T.LinearFilter;
      tex.minFilter = T.LinearFilter;
      tex.wrapS = T.ClampToEdgeWrapping;
      tex.wrapT = T.ClampToEdgeWrapping;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      return tex;
    }

    const paletteTex = makePaletteTexture(opts.colors);
    const bgVec4 = new T.Vector4(0, 0, 0, 0);

    // ── CommonClass ──────────────────────────────────────────────────
    class CommonClass {
      constructor() {
        this.width = 0; this.height = 0; this.aspect = 1;
        this.pixelRatio = 1; this.time = 0; this.delta = 0;
        this.container = null; this.renderer = null; this.clock = null;
      }
      init(el) {
        this.container = el;
        this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        this.resize();
        this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.autoClear = false;
        this.renderer.setClearColor(new T.Color(0x000000), 0);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(this.width, this.height);
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.display = 'block';
        this.clock = new T.Clock();
        this.clock.start();
      }
      resize() {
        if (!this.container) return;
        const r = this.container.getBoundingClientRect();
        this.width = Math.max(1, Math.floor(r.width));
        this.height = Math.max(1, Math.floor(r.height));
        this.aspect = this.width / this.height;
        if (this.renderer) this.renderer.setSize(this.width, this.height, false);
      }
      update() {
        this.delta = this.clock.getDelta();
        this.time += this.delta;
      }
    }
    const Common = new CommonClass();

    // ── MouseClass ───────────────────────────────────────────────────
    class MouseClass {
      constructor() {
        this.mouseMoved = false;
        this.coords = new T.Vector2();
        this.coords_old = new T.Vector2();
        this.diff = new T.Vector2();
        this.timer = null;
        this.container = null;
        this.docTarget = null;
        this.listenerTarget = null;
        this.isHoverInside = false;
        this.hasUserControl = false;
        this.isAutoActive = false;
        this.autoIntensity = 2.0;
        this.takeoverActive = false;
        this.takeoverStartTime = 0;
        this.takeoverDuration = 0.25;
        this.takeoverFrom = new T.Vector2();
        this.takeoverTo = new T.Vector2();
        this.onInteract = null;
        this._onMouseMove = this.onDocumentMouseMove.bind(this);
        this._onTouchStart = this.onDocumentTouchStart.bind(this);
        this._onTouchMove = this.onDocumentTouchMove.bind(this);
        this._onTouchEnd = this.onTouchEnd.bind(this);
        this._onDocumentLeave = this.onDocumentLeave.bind(this);
      }
      init(el) {
        this.container = el;
        this.docTarget = el.ownerDocument || null;
        const win = (this.docTarget && this.docTarget.defaultView) || window;
        if (!win) return;
        this.listenerTarget = win;
        win.addEventListener('mousemove', this._onMouseMove);
        win.addEventListener('touchstart', this._onTouchStart, { passive: true });
        win.addEventListener('touchmove', this._onTouchMove, { passive: true });
        win.addEventListener('touchend', this._onTouchEnd);
        if (this.docTarget) this.docTarget.addEventListener('mouseleave', this._onDocumentLeave);
      }
      dispose() {
        if (this.listenerTarget) {
          this.listenerTarget.removeEventListener('mousemove', this._onMouseMove);
          this.listenerTarget.removeEventListener('touchstart', this._onTouchStart);
          this.listenerTarget.removeEventListener('touchmove', this._onTouchMove);
          this.listenerTarget.removeEventListener('touchend', this._onTouchEnd);
        }
        if (this.docTarget) this.docTarget.removeEventListener('mouseleave', this._onDocumentLeave);
        this.listenerTarget = null; this.docTarget = null; this.container = null;
      }
      isPointInside(cx, cy) {
        if (!this.container) return false;
        const r = this.container.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
      }
      updateHoverState(cx, cy) { this.isHoverInside = this.isPointInside(cx, cy); return this.isHoverInside; }
      setCoords(x, y) {
        if (!this.container) return;
        if (this.timer) clearTimeout(this.timer);
        const r = this.container.getBoundingClientRect();
        if (!r.width || !r.height) return;
        this.coords.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height * 2 - 1));
        this.mouseMoved = true;
        this.timer = setTimeout(() => { this.mouseMoved = false; }, 100);
      }
      setNormalized(nx, ny) { this.coords.set(nx, ny); this.mouseMoved = true; }
      onDocumentMouseMove(e) {
        if (!this.updateHoverState(e.clientX, e.clientY)) return;
        if (this.onInteract) this.onInteract();
        if (this.isAutoActive && !this.hasUserControl && !this.takeoverActive) {
          if (!this.container) return;
          const r = this.container.getBoundingClientRect();
          if (!r.width || !r.height) return;
          this.takeoverFrom.copy(this.coords);
          this.takeoverTo.set((e.clientX - r.left) / r.width * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
          this.takeoverStartTime = performance.now();
          this.takeoverActive = true; this.hasUserControl = true; this.isAutoActive = false;
          return;
        }
        this.setCoords(e.clientX, e.clientY);
        this.hasUserControl = true;
      }
      onDocumentTouchStart(e) {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        if (!this.updateHoverState(t.clientX, t.clientY)) return;
        if (this.onInteract) this.onInteract();
        this.setCoords(t.clientX, t.clientY); this.hasUserControl = true;
      }
      onDocumentTouchMove(e) {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        if (!this.updateHoverState(t.clientX, t.clientY)) return;
        if (this.onInteract) this.onInteract();
        this.setCoords(t.clientX, t.clientY);
      }
      onTouchEnd() { this.isHoverInside = false; }
      onDocumentLeave() { this.isHoverInside = false; }
      update() {
        if (this.takeoverActive) {
          const t = (performance.now() - this.takeoverStartTime) / (this.takeoverDuration * 1000);
          if (t >= 1) {
            this.takeoverActive = false;
            this.coords.copy(this.takeoverTo);
            this.coords_old.copy(this.coords);
            this.diff.set(0, 0);
          } else {
            const k = t * t * (3 - 2 * t);
            this.coords.copy(this.takeoverFrom).lerp(this.takeoverTo, k);
          }
        }
        this.diff.subVectors(this.coords, this.coords_old);
        this.coords_old.copy(this.coords);
        if (this.coords_old.x === 0 && this.coords_old.y === 0) this.diff.set(0, 0);
        if (this.isAutoActive && !this.takeoverActive) this.diff.multiplyScalar(this.autoIntensity);
      }
    }
    const Mouse = new MouseClass();

    // ── AutoDriver ───────────────────────────────────────────────────
    class AutoDriver {
      constructor(mouse, manager, aopts) {
        this.mouse = mouse; this.manager = manager;
        this.enabled = aopts.enabled; this.speed = aopts.speed;
        this.resumeDelay = aopts.resumeDelay || 3000;
        this.rampDurationMs = (aopts.rampDuration || 0) * 1000;
        this.active = false;
        this.current = new T.Vector2();
        this.target = new T.Vector2();
        this.lastTime = performance.now(); this.activationTime = 0;
        this.margin = 0.2;
        this._tmpDir = new T.Vector2();
        this.pickNewTarget();
      }
      pickNewTarget() {
        this.target.set((Math.random() * 2 - 1) * (1 - this.margin), (Math.random() * 2 - 1) * (1 - this.margin));
      }
      forceStop() { this.active = false; this.mouse.isAutoActive = false; }
      update() {
        if (!this.enabled) return;
        const now = performance.now();
        if (now - this.manager.lastUserInteraction < this.resumeDelay) { if (this.active) this.forceStop(); return; }
        if (this.mouse.isHoverInside) { if (this.active) this.forceStop(); return; }
        if (!this.active) { this.active = true; this.current.copy(this.mouse.coords); this.lastTime = now; this.activationTime = now; }
        this.mouse.isAutoActive = true;
        let dt = Math.min((now - this.lastTime) / 1000, 0.2);
        this.lastTime = now;
        const dir = this._tmpDir.subVectors(this.target, this.current);
        const dist = dir.length();
        if (dist < 0.01) { this.pickNewTarget(); return; }
        dir.normalize();
        let ramp = 1;
        if (this.rampDurationMs > 0) { const t = Math.min(1, (now - this.activationTime) / this.rampDurationMs); ramp = t * t * (3 - 2 * t); }
        this.current.addScaledVector(dir, Math.min(this.speed * dt * ramp, dist));
        this.mouse.setNormalized(this.current.x, this.current.y);
      }
    }

    // ── Shaders ──────────────────────────────────────────────────────
    const face_vert = `
      attribute vec3 position; uniform vec2 px; uniform vec2 boundarySpace; varying vec2 uv; precision highp float;
      void main(){ vec3 pos=position; vec2 scale=1.0-boundarySpace*2.0; pos.xy=pos.xy*scale; uv=vec2(0.5)+pos.xy*0.5; gl_Position=vec4(pos,1.0); }
    `;
    const line_vert = `
      attribute vec3 position; uniform vec2 px; precision highp float; varying vec2 uv;
      void main(){ vec3 pos=position; uv=0.5+pos.xy*0.5; vec2 n=sign(pos.xy); pos.xy=abs(pos.xy)-px*1.0; pos.xy*=n; gl_Position=vec4(pos,1.0); }
    `;
    const mouse_vert = `
      precision highp float; attribute vec3 position; attribute vec2 uv; uniform vec2 center; uniform vec2 scale; uniform vec2 px; varying vec2 vUv;
      void main(){ vec2 pos=position.xy*scale*2.0*px+center; vUv=uv; gl_Position=vec4(pos,0.0,1.0); }
    `;
    const advection_frag = `
      precision highp float; uniform sampler2D velocity; uniform float dt; uniform bool isBFECC; uniform vec2 fboSize; uniform vec2 px; varying vec2 uv;
      void main(){
        vec2 ratio=max(fboSize.x,fboSize.y)/fboSize;
        if(isBFECC==false){ vec2 vel=texture2D(velocity,uv).xy; vec2 uv2=uv-vel*dt*ratio; gl_FragColor=vec4(texture2D(velocity,uv2).xy,0.0,0.0); }
        else { vec2 sn=uv; vec2 vo=texture2D(velocity,uv).xy; vec2 so=sn-vo*dt*ratio; vec2 vn1=texture2D(velocity,so).xy; vec2 sn2=so+vn1*dt*ratio; vec2 err=sn2-sn; vec2 sn3=sn-err/2.0; vec2 v2=texture2D(velocity,sn3).xy; vec2 so2=sn3-v2*dt*ratio; gl_FragColor=vec4(texture2D(velocity,so2).xy,0.0,0.0); }
      }
    `;
    const color_frag = `
      precision highp float; uniform sampler2D velocity; uniform sampler2D palette; uniform vec4 bgColor; varying vec2 uv;
      void main(){ vec2 vel=texture2D(velocity,uv).xy; float lenv=clamp(length(vel),0.0,1.0); vec3 c=texture2D(palette,vec2(lenv,0.5)).rgb; vec3 outRGB=mix(bgColor.rgb,c,lenv); float outA=mix(bgColor.a,1.0,lenv); gl_FragColor=vec4(outRGB,outA); }
    `;
    const divergence_frag = `
      precision highp float; uniform sampler2D velocity; uniform float dt; uniform vec2 px; varying vec2 uv;
      void main(){ float x0=texture2D(velocity,uv-vec2(px.x,0.0)).x; float x1=texture2D(velocity,uv+vec2(px.x,0.0)).x; float y0=texture2D(velocity,uv-vec2(0.0,px.y)).y; float y1=texture2D(velocity,uv+vec2(0.0,px.y)).y; gl_FragColor=vec4((x1-x0+y1-y0)/2.0/dt); }
    `;
    const externalForce_frag = `
      precision highp float; uniform vec2 force; uniform vec2 center; uniform vec2 scale; uniform vec2 px; varying vec2 vUv;
      void main(){ vec2 circle=(vUv-0.5)*2.0; float d=1.0-min(length(circle),1.0); d*=d; gl_FragColor=vec4(force*d,0.0,1.0); }
    `;
    const poisson_frag = `
      precision highp float; uniform sampler2D pressure; uniform sampler2D divergence; uniform vec2 px; varying vec2 uv;
      void main(){ float p0=texture2D(pressure,uv+vec2(px.x*2.0,0.0)).r; float p1=texture2D(pressure,uv-vec2(px.x*2.0,0.0)).r; float p2=texture2D(pressure,uv+vec2(0.0,px.y*2.0)).r; float p3=texture2D(pressure,uv-vec2(0.0,px.y*2.0)).r; float div=texture2D(divergence,uv).r; gl_FragColor=vec4((p0+p1+p2+p3)/4.0-div); }
    `;
    const pressure_frag = `
      precision highp float; uniform sampler2D pressure; uniform sampler2D velocity; uniform vec2 px; uniform float dt; varying vec2 uv;
      void main(){ float p0=texture2D(pressure,uv+vec2(px.x,0.0)).r; float p1=texture2D(pressure,uv-vec2(px.x,0.0)).r; float p2=texture2D(pressure,uv+vec2(0.0,px.y)).r; float p3=texture2D(pressure,uv-vec2(0.0,px.y)).r; vec2 v=texture2D(velocity,uv).xy; v=v-vec2(p0-p1,p2-p3)*0.5*dt; gl_FragColor=vec4(v,0.0,1.0); }
    `;
    const viscous_frag = `
      precision highp float; uniform sampler2D velocity; uniform sampler2D velocity_new; uniform float v; uniform vec2 px; uniform float dt; varying vec2 uv;
      void main(){ vec2 old=texture2D(velocity,uv).xy; vec2 n0=texture2D(velocity_new,uv+vec2(px.x*2.0,0.0)).xy; vec2 n1=texture2D(velocity_new,uv-vec2(px.x*2.0,0.0)).xy; vec2 n2=texture2D(velocity_new,uv+vec2(0.0,px.y*2.0)).xy; vec2 n3=texture2D(velocity_new,uv-vec2(0.0,px.y*2.0)).xy; vec2 nv=4.0*old+v*dt*(n0+n1+n2+n3); nv/=4.0*(1.0+v*dt); gl_FragColor=vec4(nv,0.0,0.0); }
    `;

    // ── ShaderPass base ──────────────────────────────────────────────
    class ShaderPass {
      constructor(props) {
        this.props = props || {};
        this.uniforms = this.props.material?.uniforms;
        this.scene = null; this.camera = null; this.material = null; this.plane = null;
      }
      init() {
        this.scene = new T.Scene();
        this.camera = new T.Camera();
        if (this.uniforms) {
          this.material = new T.RawShaderMaterial(this.props.material);
          this.plane = new T.Mesh(new T.PlaneGeometry(2, 2), this.material);
          this.scene.add(this.plane);
        }
      }
      update() {
        Common.renderer.setRenderTarget(this.props.output || null);
        Common.renderer.render(this.scene, this.camera);
        Common.renderer.setRenderTarget(null);
      }
    }

    // ── Advection ────────────────────────────────────────────────────
    class Advection extends ShaderPass {
      constructor(sp) {
        super({ material: { vertexShader: face_vert, fragmentShader: advection_frag, uniforms: { boundarySpace: { value: sp.cellScale }, px: { value: sp.cellScale }, fboSize: { value: sp.fboSize }, velocity: { value: sp.src.texture }, dt: { value: sp.dt }, isBFECC: { value: true } } }, output: sp.dst });
        this.uniforms = this.props.material.uniforms;
        this.init();
        const bg = new T.BufferGeometry();
        bg.setAttribute('position', new T.BufferAttribute(new Float32Array([-1,-1,0,-1,1,0,-1,1,0,1,1,0,1,1,0,1,-1,0,1,-1,0,-1,-1,0]), 3));
        this.line = new T.LineSegments(bg, new T.RawShaderMaterial({ vertexShader: line_vert, fragmentShader: advection_frag, uniforms: this.uniforms }));
        this.scene.add(this.line);
      }
      update({ dt, isBounce, BFECC }) {
        this.uniforms.dt.value = dt;
        this.line.visible = isBounce;
        this.uniforms.isBFECC.value = BFECC;
        super.update();
      }
    }

    // ── ExternalForce ────────────────────────────────────────────────
    class ExternalForce extends ShaderPass {
      constructor(sp) {
        super({ output: sp.dst });
        super.init();
        const mat = new T.RawShaderMaterial({ vertexShader: mouse_vert, fragmentShader: externalForce_frag, blending: T.AdditiveBlending, depthWrite: false, uniforms: { px: { value: sp.cellScale }, force: { value: new T.Vector2() }, center: { value: new T.Vector2() }, scale: { value: new T.Vector2(sp.cursor_size, sp.cursor_size) } } });
        this.mouse = new T.Mesh(new T.PlaneGeometry(1, 1), mat);
        this.scene.add(this.mouse);
      }
      update(p) {
        const u = this.mouse.material.uniforms;
        u.force.value.set((Mouse.diff.x / 2) * p.mouse_force, (Mouse.diff.y / 2) * p.mouse_force);
        const csx = p.cursor_size * p.cellScale.x, csy = p.cursor_size * p.cellScale.y;
        u.center.value.set(Math.min(Math.max(Mouse.coords.x, -1 + csx + p.cellScale.x * 2), 1 - csx - p.cellScale.x * 2), Math.min(Math.max(Mouse.coords.y, -1 + csy + p.cellScale.y * 2), 1 - csy - p.cellScale.y * 2));
        u.scale.value.set(p.cursor_size, p.cursor_size);
        super.update();
      }
    }

    // ── Viscous ──────────────────────────────────────────────────────
    class Viscous extends ShaderPass {
      constructor(sp) {
        super({ material: { vertexShader: face_vert, fragmentShader: viscous_frag, uniforms: { boundarySpace: { value: sp.boundarySpace }, velocity: { value: sp.src.texture }, velocity_new: { value: sp.dst_.texture }, v: { value: sp.viscous }, px: { value: sp.cellScale }, dt: { value: sp.dt } } }, output: sp.dst, output0: sp.dst_, output1: sp.dst });
        this.init();
      }
      update({ viscous, iterations, dt }) {
        this.uniforms.v.value = viscous;
        let fi, fo;
        for (let i = 0; i < iterations; i++) {
          fi = i % 2 === 0 ? this.props.output0 : this.props.output1;
          fo = i % 2 === 0 ? this.props.output1 : this.props.output0;
          this.uniforms.velocity_new.value = fi.texture;
          this.props.output = fo;
          this.uniforms.dt.value = dt;
          super.update();
        }
        return fo;
      }
    }

    // ── Divergence ───────────────────────────────────────────────────
    class Divergence extends ShaderPass {
      constructor(sp) {
        super({ material: { vertexShader: face_vert, fragmentShader: divergence_frag, uniforms: { boundarySpace: { value: sp.boundarySpace }, velocity: { value: sp.src.texture }, px: { value: sp.cellScale }, dt: { value: sp.dt } } }, output: sp.dst });
        this.init();
      }
      update({ vel }) { this.uniforms.velocity.value = vel.texture; super.update(); }
    }

    // ── Poisson ──────────────────────────────────────────────────────
    class Poisson extends ShaderPass {
      constructor(sp) {
        super({ material: { vertexShader: face_vert, fragmentShader: poisson_frag, uniforms: { boundarySpace: { value: sp.boundarySpace }, pressure: { value: sp.dst_.texture }, divergence: { value: sp.src.texture }, px: { value: sp.cellScale } } }, output: sp.dst, output0: sp.dst_, output1: sp.dst });
        this.init();
      }
      update({ iterations }) {
        let pi, po;
        for (let i = 0; i < iterations; i++) {
          pi = i % 2 === 0 ? this.props.output0 : this.props.output1;
          po = i % 2 === 0 ? this.props.output1 : this.props.output0;
          this.uniforms.pressure.value = pi.texture;
          this.props.output = po;
          super.update();
        }
        return po;
      }
    }

    // ── Pressure ─────────────────────────────────────────────────────
    class Pressure extends ShaderPass {
      constructor(sp) {
        super({ material: { vertexShader: face_vert, fragmentShader: pressure_frag, uniforms: { boundarySpace: { value: sp.boundarySpace }, pressure: { value: sp.src_p.texture }, velocity: { value: sp.src_v.texture }, px: { value: sp.cellScale }, dt: { value: sp.dt } } }, output: sp.dst });
        this.init();
      }
      update({ vel, pressure }) { this.uniforms.velocity.value = vel.texture; this.uniforms.pressure.value = pressure.texture; super.update(); }
    }

    // ── Simulation ───────────────────────────────────────────────────
    class Simulation {
      constructor(sopts) {
        this.options = Object.assign({ iterations_poisson: 32, iterations_viscous: 32, mouse_force: 20, resolution: 0.5, cursor_size: 100, viscous: 30, isBounce: false, dt: 0.014, isViscous: false, BFECC: true }, sopts || {});
        this.fbos = { vel_0: null, vel_1: null, vel_viscous0: null, vel_viscous1: null, div: null, pressure_0: null, pressure_1: null };
        this.fboSize = new T.Vector2();
        this.cellScale = new T.Vector2();
        this.boundarySpace = new T.Vector2();
        this.init();
      }
      init() { this.calcSize(); this.createAllFBO(); this.createShaderPass(); }
      getFloatType() { return /(iPad|iPhone|iPod)/i.test(navigator.userAgent) ? T.HalfFloatType : T.FloatType; }
      createAllFBO() {
        const type = this.getFloatType();
        const base = { type, depthBuffer: false, stencilBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter, wrapS: T.ClampToEdgeWrapping, wrapT: T.ClampToEdgeWrapping };
        for (const k in this.fbos) this.fbos[k] = new T.WebGLRenderTarget(this.fboSize.x, this.fboSize.y, base);
      }
      createShaderPass() {
        this.advection = new Advection({ cellScale: this.cellScale, fboSize: this.fboSize, dt: this.options.dt, src: this.fbos.vel_0, dst: this.fbos.vel_1 });
        this.externalForce = new ExternalForce({ cellScale: this.cellScale, cursor_size: this.options.cursor_size, dst: this.fbos.vel_1 });
        this.viscous = new Viscous({ cellScale: this.cellScale, boundarySpace: this.boundarySpace, viscous: this.options.viscous, src: this.fbos.vel_1, dst: this.fbos.vel_viscous1, dst_: this.fbos.vel_viscous0, dt: this.options.dt });
        this.divergence = new Divergence({ cellScale: this.cellScale, boundarySpace: this.boundarySpace, src: this.fbos.vel_viscous0, dst: this.fbos.div, dt: this.options.dt });
        this.poisson = new Poisson({ cellScale: this.cellScale, boundarySpace: this.boundarySpace, src: this.fbos.div, dst: this.fbos.pressure_1, dst_: this.fbos.pressure_0 });
        this.pressure = new Pressure({ cellScale: this.cellScale, boundarySpace: this.boundarySpace, src_p: this.fbos.pressure_0, src_v: this.fbos.vel_viscous0, dst: this.fbos.vel_0, dt: this.options.dt });
      }
      calcSize() {
        const w = Math.max(1, Math.round(this.options.resolution * Common.width));
        const h = Math.max(1, Math.round(this.options.resolution * Common.height));
        this.cellScale.set(1 / w, 1 / h);
        this.fboSize.set(w, h);
      }
      resize() { this.calcSize(); for (const k in this.fbos) this.fbos[k].setSize(this.fboSize.x, this.fboSize.y); }
      dispose() { for (const k in this.fbos) if (this.fbos[k]) this.fbos[k].dispose(); }
      update() {
        this.boundarySpace.copy(this.options.isBounce ? new T.Vector2() : this.cellScale);
        this.advection.update({ dt: this.options.dt, isBounce: this.options.isBounce, BFECC: this.options.BFECC });
        this.externalForce.update({ cursor_size: this.options.cursor_size, mouse_force: this.options.mouse_force, cellScale: this.cellScale });
        let vel = this.fbos.vel_1;
        if (this.options.isViscous) vel = this.viscous.update({ viscous: this.options.viscous, iterations: this.options.iterations_viscous, dt: this.options.dt });
        this.divergence.update({ vel });
        const pressure = this.poisson.update({ iterations: this.options.iterations_poisson });
        this.pressure.update({ vel, pressure });
      }
    }

    // ── Output ───────────────────────────────────────────────────────
    class Output {
      constructor(simOptions) {
        this.simulation = new Simulation(simOptions);
        this.scene = new T.Scene();
        this.camera = new T.Camera();
        this.mesh = new T.Mesh(new T.PlaneGeometry(2, 2), new T.RawShaderMaterial({ vertexShader: face_vert, fragmentShader: color_frag, transparent: true, depthWrite: false, uniforms: { velocity: { value: this.simulation.fbos.vel_0.texture }, boundarySpace: { value: new T.Vector2() }, palette: { value: paletteTex }, bgColor: { value: bgVec4 } } }));
        this.scene.add(this.mesh);
      }
      resize() { this.simulation.resize(); }
      dispose() { this.simulation.dispose(); paletteTex.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
      update() { this.simulation.update(); Common.renderer.setRenderTarget(null); Common.renderer.render(this.scene, this.camera); }
    }

    // ── WebGLManager ─────────────────────────────────────────────────
    class WebGLManager {
      constructor(el, mopts) {
        this.lastUserInteraction = performance.now();
        Common.init(el);
        Mouse.init(el);
        Mouse.autoIntensity = mopts.autoIntensity;
        Mouse.takeoverDuration = mopts.takeoverDuration;
        Mouse.onInteract = () => { this.lastUserInteraction = performance.now(); if (this.autoDriver) this.autoDriver.forceStop(); };
        this.autoDriver = new AutoDriver(Mouse, this, { enabled: mopts.autoDemo, speed: mopts.autoSpeed, resumeDelay: mopts.autoResumeDelay, rampDuration: mopts.autoRampDuration });
        this.output = new Output({ mouse_force: mopts.mouseForce, cursor_size: mopts.cursorSize, isViscous: mopts.isViscous, viscous: mopts.viscous, iterations_viscous: mopts.iterationsViscous, iterations_poisson: mopts.iterationsPoisson, dt: mopts.dt, BFECC: mopts.BFECC, resolution: mopts.resolution, isBounce: mopts.isBounce });
        el.prepend(Common.renderer.domElement);
        this._loop = this.loop.bind(this);
        this._resize = () => { Common.resize(); this.output.resize(); };
        window.addEventListener('resize', this._resize);
        this._vis = () => { document.hidden ? this.pause() : (isVisibleRef.current && this.start()); };
        document.addEventListener('visibilitychange', this._vis);
        this.running = false;
      }
      render() { if (this.autoDriver) this.autoDriver.update(); Mouse.update(); Common.update(); this.output.update(); }
      loop() { if (!this.running) return; this.render(); rafId = requestAnimationFrame(this._loop); }
      start() { if (this.running) return; this.running = true; this.loop(); }
      pause() { this.running = false; if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
      dispose() {
        try { this.pause(); window.removeEventListener('resize', this._resize); document.removeEventListener('visibilitychange', this._vis); Mouse.dispose(); this.output.dispose(); if (Common.renderer) { const c = Common.renderer.domElement; if (c.parentNode) c.parentNode.removeChild(c); Common.renderer.dispose(); } } catch(e){}
      }
    }

    // ── Mount ────────────────────────────────────────────────────────
    container.style.position = container.style.position || 'relative';
    container.style.overflow = container.style.overflow || 'hidden';

    const webgl = new WebGLManager(container, opts);
    webgl.start();

    const io = new IntersectionObserver(entries => {
      const v = entries[0].isIntersecting && entries[0].intersectionRatio > 0;
      isVisibleRef.current = v;
      v && !document.hidden ? webgl.start() : webgl.pause();
    }, { threshold: [0, 0.01, 0.1] });
    io.observe(container);

    const ro = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => webgl && webgl._resize && webgl._resize());
    });
    ro.observe(container);

    return {
      dispose() { try { io.disconnect(); ro.disconnect(); webgl.dispose(); } catch(e){} }
    };
  }

  global.initLiquidEther = initLiquidEther;
})(window);
