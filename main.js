(() => {
  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  gsap.registerPlugin(ScrollTrigger);
  document.body.classList.add('loading');

  /* ---------------- Smooth scroll ---------------- */
  let lenis = null;
  if (typeof Lenis !== 'undefined' && !reduced) {
    lenis = new Lenis({ duration: 1.2, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenis.stop();
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const scrollTo = (target, immediate) => {
    if (lenis) lenis.scrollTo(target, { immediate, offset: 0, force: true });
    else document.querySelector(target)?.scrollIntoView({ behavior: immediate ? 'auto' : 'smooth' });
  };

  /* ---------------- Text splitting ---------------- */
  document.querySelectorAll('.split-words').forEach(el => {
    const wrapWords = (text, grad) => text.split(/(\s+)/).map(w => {
      if (!w.trim()) return document.createTextNode(' ');
      const outer = document.createElement('span');
      outer.className = 'word';
      const inner = document.createElement('span');
      inner.textContent = w;
      if (grad) inner.className = 'grad-word';
      outer.appendChild(inner);
      return outer;
    });
    const nodes = [...el.childNodes];
    el.innerHTML = '';
    nodes.forEach(n => {
      const parts = n.nodeType === 3 ? wrapWords(n.textContent, false) : wrapWords(n.textContent, true);
      parts.forEach(p => el.appendChild(p));
    });
  });
  const style = document.createElement('style');
  style.textContent = '.grad-word{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}';
  document.head.appendChild(style);

  /* ---------------- Three.js scene ---------------- */
  const canvas = document.getElementById('bg3d');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 1.5, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 9;

  const noise = `
    vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
    vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
    vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
    float snoise(vec3 v){
      const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
      vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
      vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
      vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
      i=mod289(i);
      vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
      float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
      vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
      vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
      vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
      vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
      vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
      vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
      vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
      p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
      vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
      return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
    }`;

  const uniforms = { uTime: { value: 0 }, uDistort: { value: 0.45 }, uHue: { value: 0 }, uFade: { value: 1 } };
  const orbMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `${noise}
      uniform float uTime; uniform float uDistort;
      varying vec3 vNormal; varying vec3 vView; varying float vNoise;
      void main(){
        float n = snoise(normal * 1.3 + uTime * .22) + .5 * snoise(normal * 3. - uTime * .3);
        vec3 p = position + normal * n * uDistort;
        vNoise = n;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uHue; uniform float uFade;
      varying vec3 vNormal; varying vec3 vView; varying float vNoise;
      void main(){
        float f = pow(1. - max(dot(normalize(vNormal), normalize(vView)), 0.), 2.2);
        vec3 cyan = vec3(.13,.83,.93), violet = vec3(.65,.55,.98), pink = vec3(.96,.45,.71);
        float t = clamp(vNoise * .5 + .5 + sin(uTime * .3 + uHue) * .25, 0., 1.);
        vec3 base = mix(cyan, violet, t);
        base = mix(base, pink, smoothstep(.55, 1., f + t * .3));
        vec3 col = mix(vec3(.02,.02,.06), base * .55, .25 + t * .35) + base * f * 1.4;
        gl_FragColor = vec4(col * uFade, 1.);
      }`
  });
  const group = new THREE.Group();
  scene.add(group);
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, isTouch ? 18 : 28), orbMat);
  group.add(orb);

  const wire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.5, 1),
    new THREE.MeshBasicMaterial({ color: 0xa78bfa, wireframe: true, transparent: true, opacity: 0.12 })
  );
  group.add(wire);

  const ringGeo = new THREE.BufferGeometry();
  const ringCount = 600, ringPos = new Float32Array(ringCount * 3);
  for (let i = 0; i < ringCount; i++) {
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 0.6;
    ringPos.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.12, Math.sin(a) * r], i * 3);
  }
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
  const ring = new THREE.Points(ringGeo, new THREE.PointsMaterial({ color: 0x22d3ee, size: 0.03, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = 1.15; ring.rotation.z = 0.3;
  group.add(ring);

  const starGeo = new THREE.BufferGeometry();
  const starCount = isTouch ? 600 : 1200, starPos = new Float32Array(starCount * 3), starCol = new Float32Array(starCount * 3);
  const palette = [new THREE.Color(0x22d3ee), new THREE.Color(0xa78bfa), new THREE.Color(0xf472b6), new THREE.Color(0xffffff)];
  for (let i = 0; i < starCount; i++) {
    const r = 6 + Math.random() * 18, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    starPos.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph) - 6], i * 3);
    const c = palette[i % 4]; starCol.set([c.r, c.g, c.b], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(stars);

  const layout = () => {
    const w = window.innerWidth;
    return w < 760 ? { x: 0, y: 2.3, s: 0.5 } : w < 1100 ? { x: 2.2, y: 0, s: 0.8 } : { x: 2.9, y: 0, s: 1 };
  };
  let base = layout();
  group.position.set(base.x, base.y, 0);
  group.scale.setScalar(0.001);

  let introDone = false;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('mousemove', e => {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  const scrollState = { p: 0 };
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: s => { scrollState.p = s.progress; } });

  const clock = new THREE.Clock();
  let visible = true;
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });
  let frame = 0;
  (function render() {
    requestAnimationFrame(render);
    if (!visible) return;
    if (window.scrollY > window.innerHeight && (frame++ & 1)) return;
    const t = clock.getElapsedTime();
    uniforms.uTime.value = t;
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    const p = scrollState.p;
    // orb drifts side to side as you scroll through the page
    // past the hero the orb recedes to the edge so it never fights the content
    const hero = Math.min(window.scrollY / window.innerHeight, 1);
    const side = window.innerWidth < 760 ? 0 : (base.x + 1.6 * hero) * (Math.cos(p * Math.PI * 3) >= 0 ? 1 : -1);
    const tx = (hero < 1 ? base.x + (side - base.x) * hero : side) + mouse.x * 0.35;
    const ty = base.y + (window.innerWidth < 760 ? hero * 1.5 : 0) + mouse.y * 0.3 + Math.sin(t * 0.6) * 0.08;
    const targetScale = base.s * (1 - hero * 0.35);
    if (introDone) group.scale.setScalar(group.scale.x + (targetScale - group.scale.x) * 0.06);
    uniforms.uFade.value = 1 - hero * 0.55;
    group.position.x += (tx - group.position.x) * 0.06;
    group.position.y += (ty - group.position.y) * 0.06;
    orb.rotation.y = t * 0.12 + p * 6;
    orb.rotation.x = mouse.y * 0.4;
    wire.rotation.y = -t * 0.08 - p * 4;
    wire.rotation.x = t * 0.05;
    ring.rotation.z = 0.3 + t * 0.15;
    stars.rotation.y = t * 0.012 + mouse.x * 0.08;
    stars.rotation.x = mouse.y * 0.05 + p * 0.6;
    uniforms.uHue.value = p * 6;
    camera.position.z = 9 + Math.sin(p * Math.PI) * 1.5;
    renderer.render(scene, camera);
  })();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    base = layout();
  });

  // distortion pulse on fast scroll
  if (lenis) lenis.on('scroll', ({ velocity }) => {
    uniforms.uDistort.value += (Math.min(0.45 + Math.abs(velocity) * 0.02, 0.9) - uniforms.uDistort.value) * 0.2;
  });
  gsap.ticker.add(() => { uniforms.uDistort.value += (0.45 - uniforms.uDistort.value) * 0.03; });

  /* ---------------- Loader + intro ---------------- */
  const counter = { v: 0 };
  const countEl = document.getElementById('loaderCount');
  const barEl = document.getElementById('loaderBar');
  const loadTween = gsap.to(counter, {
    v: 90, duration: 1.4, ease: 'power2.out',
    onUpdate: () => { countEl.textContent = Math.round(counter.v); barEl.style.width = counter.v + '%'; }
  });
  const finishLoad = () => {
    loadTween.kill();
    gsap.to(counter, {
      v: 100, duration: 0.4,
      onUpdate: () => { countEl.textContent = Math.round(counter.v); barEl.style.width = counter.v + '%'; },
      onComplete: intro
    });
  };
  if (document.readyState === 'complete') setTimeout(finishLoad, 900);
  else window.addEventListener('load', () => setTimeout(finishLoad, 600));

  function intro() {
    const tl = gsap.timeline({
      onComplete: () => {
        introDone = true;
        document.body.classList.remove('loading');
        lenis?.start();
        ScrollTrigger.refresh();
      }
    });
    tl.to('.loader__inner', { opacity: 0, y: -20, duration: 0.4 })
      .to('#loader', { yPercent: -100, duration: 1, ease: 'expo.inOut' })
      .to(group.scale, { x: base.s, y: base.s, z: base.s, duration: 1.8, ease: 'elastic.out(1, 0.6)' }, '-=0.5')
      .from('.nav', { y: -100, opacity: 0, duration: 1, ease: 'expo.out' }, '-=1.6')
      .from('.hero__title .split', { yPercent: 115, rotate: 4, duration: 1.2, stagger: 0.12, ease: 'expo.out' }, '-=1.5')
      .from('.hero .reveal-up', { y: 30, opacity: 0, filter: 'blur(8px)', duration: 1, stagger: 0.08, ease: 'power3.out' }, '-=0.9')
      .from('.hero__scroll', { opacity: 0, duration: 0.8 }, '-=0.4')
      .add(startTyping, '-=1');
  }

  /* ---------------- Typing ---------------- */
  const roles = ['AI Engineer', 'Data Scientist', 'LLM & RAG Builder', 'Python Automation Engineer', 'M.Sc. AI @ FAU'];
  const typedEl = document.getElementById('typed');
  function startTyping() {
    let r = 0, i = 0, del = false;
    (function tick() {
      const word = roles[r];
      i += del ? -1 : 1;
      typedEl.textContent = word.slice(0, i);
      let delay = del ? 40 : 85;
      if (!del && i === word.length) { del = true; delay = 1800; }
      else if (del && i === 0) { del = false; r = (r + 1) % roles.length; delay = 300; }
      setTimeout(tick, delay);
    })();
  }

  /* ---------------- Cursor ---------------- */
  if (!isTouch) {
    const cur = document.getElementById('cursor');
    const dot = document.getElementById('cursorDot');
    const cx = gsap.quickTo(cur, 'x', { duration: 0.45, ease: 'power3' });
    const cy = gsap.quickTo(cur, 'y', { duration: 0.45, ease: 'power3' });
    const dx = gsap.quickTo(dot, 'x', { duration: 0.08 });
    const dy = gsap.quickTo(dot, 'y', { duration: 0.08 });
    window.addEventListener('mousemove', e => { cx(e.clientX); cy(e.clientY); dx(e.clientX); dy(e.clientY); });
    window.addEventListener('mousemove', () => gsap.to([cur, dot], { opacity: 1, duration: 0.4 }), { once: true });
    document.querySelectorAll('a, button').forEach(el => {
      el.addEventListener('mouseenter', () => {
        if (el.dataset.hover) { cur.classList.add('is-label'); cur.textContent = el.dataset.hover; }
        else cur.classList.add('is-hover');
      });
      el.addEventListener('mouseleave', () => { cur.classList.remove('is-hover', 'is-label'); cur.textContent = ''; });
    });
    window.addEventListener('mousedown', () => gsap.to(cur, { scale: 0.8, duration: 0.2 }));
    window.addEventListener('mouseup', () => gsap.to(cur, { scale: 1, duration: 0.2 }));
  }

  /* ---------------- Magnetic, tilt, spotlight ---------------- */
  if (!isTouch) {
    document.querySelectorAll('.magnetic').forEach(el => {
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.35, y: (e.clientY - r.top - r.height / 2) * 0.35, duration: 0.4, ease: 'power3.out' });
      });
      el.addEventListener('mouseleave', () => gsap.to(el, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1, 0.4)' }));
    });

    document.querySelectorAll('.tilt').forEach(el => {
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--mx', px * 100 + '%');
        el.style.setProperty('--my', py * 100 + '%');
        const max = r.width > 700 ? 4 : 9;
        el._ry = el._ry || gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power2.out' });
        el._rx = el._rx || gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power2.out' });
        gsap.set(el, { transformPerspective: 1000 });
        el._ry((px - 0.5) * max * 2); el._rx(-(py - 0.5) * max * 2);
      });
      el.addEventListener('mouseleave', () => { el._rx?.(0); el._ry?.(0); });
    });
  }

  /* ---------------- Scroll animations ---------------- */
  gsap.to('#progress', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });

  document.querySelectorAll('.section__title').forEach(title => {
    gsap.from(title.querySelectorAll('.word > span'), {
      yPercent: 110, rotate: 3, duration: 1, stagger: 0.04, ease: 'expo.out',
      scrollTrigger: { trigger: title, start: 'top 85%' }
    });
  });
  gsap.utils.toArray('.eyebrow').forEach(el => gsap.from(el, {
    x: -30, opacity: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%' }
  }));

  ScrollTrigger.batch('.reveal-card', {
    start: 'top 88%',
    onEnter: batch => gsap.fromTo(batch,
      { y: 80, opacity: 0, rotationX: -18, scale: 0.94, transformPerspective: 1000 },
      { y: 0, opacity: 1, rotationX: 0, scale: 1, duration: 1.1, stagger: 0.1, ease: 'expo.out', overwrite: true })
  });
  gsap.set('.reveal-card', { opacity: 0 });

  gsap.utils.toArray('.job').forEach(job => {
    const tl = gsap.timeline({ scrollTrigger: { trigger: job, start: 'top 80%' } });
    tl.from(job.querySelector('.job__dot'), { scale: 0, duration: 0.6, ease: 'back.out(3)' })
      .from(job.querySelector('.job__card'), { x: 80, opacity: 0, rotationY: -12, transformPerspective: 1000, duration: 1.1, ease: 'expo.out' }, '-=0.4')
      .from(job.querySelectorAll('li'), { x: 20, opacity: 0, stagger: 0.06, duration: 0.6 }, '-=0.7');
  });
  gsap.to('#timelineFill', { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '.timeline', start: 'top 70%', end: 'bottom 70%', scrub: 0.5 } });

  document.querySelectorAll('.count').forEach(el => {
    const o = { v: 0 };
    gsap.to(o, {
      v: +el.dataset.to, duration: 2, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%' },
      onUpdate: () => { el.textContent = Math.round(o.v); }
    });
  });

  gsap.from('.contact__title .split', { yPercent: 115, rotate: 4, duration: 1.2, stagger: 0.12, ease: 'expo.out', scrollTrigger: { trigger: '.contact__title', start: 'top 85%' } });
  gsap.from(['.contact__sub', '.contact__mail'], { y: 30, opacity: 0, duration: 1, stagger: 0.1, scrollTrigger: { trigger: '.contact__sub', start: 'top 90%' } });
  gsap.from('.contact__card', { y: 60, opacity: 0, duration: 1, stagger: 0.1, ease: 'expo.out', scrollTrigger: { trigger: '.contact__grid', start: 'top 92%' } });

  gsap.to('.marquee__track', { xPercent: -8, ease: 'none', scrollTrigger: { trigger: '.marquee', start: 'top bottom', end: 'bottom top', scrub: 1 } });
  gsap.to('.hero__content', { yPercent: -15, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

  /* ---------------- Nav ---------------- */
  const nav = document.getElementById('nav');
  let lastY = 0;
  const onScroll = y => {
    if (y > lastY && y > 200 && !nav.classList.contains('open')) nav.classList.add('hide');
    else if (y < lastY) nav.classList.remove('hide');
    lastY = y;
  };
  if (lenis) lenis.on('scroll', ({ scroll }) => onScroll(scroll));
  else window.addEventListener('scroll', () => onScroll(window.scrollY));

  document.getElementById('burger').addEventListener('click', () => nav.classList.toggle('open'));

  const links = document.querySelectorAll('.nav__links a');
  ['about', 'skills', 'experience', 'projects', 'contact'].forEach(id => {
    ScrollTrigger.create({
      trigger: '#' + id, start: 'top 50%', end: 'bottom 50%',
      onToggle: s => { if (s.isActive) links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + id)); }
    });
  });

  /* ---------------- Page transitions ---------------- */
  const panels = document.querySelectorAll('#curtain span');
  let transitioning = false;
  document.querySelectorAll('[data-link]').forEach(a => {
    a.addEventListener('click', e => {
      const target = a.getAttribute('href');
      if (!target.startsWith('#')) return;
      e.preventDefault();
      nav.classList.remove('open');
      if (transitioning) return;
      if (reduced) { scrollTo(target, true); return; }
      transitioning = true;
      gsap.timeline({ onComplete: () => { transitioning = false; } })
        .set(panels, { transformOrigin: 'bottom' })
        .to(panels, { scaleY: 1, duration: 0.55, stagger: 0.06, ease: 'expo.inOut' })
        .add(() => { scrollTo(target, true); ScrollTrigger.update(); })
        .set(panels, { transformOrigin: 'top' })
        .to(panels, { scaleY: 0, duration: 0.6, stagger: 0.06, ease: 'expo.inOut' }, '+=0.1');
    });
  });

  /* ---------------- Footer ---------------- */
  document.getElementById('year').textContent = new Date().getFullYear();
  const clockEl = document.getElementById('clock');
  const tickClock = () => {
    clockEl.textContent = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  };
  tickClock(); setInterval(tickClock, 30000);
})();
