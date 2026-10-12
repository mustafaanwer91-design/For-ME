(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ============================================================
     1) PORTRAIT SPOTLIGHT / ARMOR REVEAL
     ============================================================ */
  const stage = document.getElementById('portraitStage');
  const reveal = document.getElementById('portraitReveal');

  if (stage && reveal) {
    const raw = { x: -9999, y: -9999 };
    const smooth = { x: -9999, y: -9999 };
    let isInside = false;
    let rafId = 0;

    const setTarget = (clientX, clientY) => {
      const rect = stage.getBoundingClientRect();
      raw.x = clientX - rect.left;
      raw.y = clientY - rect.top;

      isInside = raw.x >= 0 && raw.x <= rect.width && raw.y >= 0 && raw.y <= rect.height;
      stage.classList.toggle('is-active', isInside);

      if (smooth.x < -1000 || smooth.y < -1000) {
        smooth.x = raw.x;
        smooth.y = raw.y;
      }
    };

    const animateSpotlight = () => {
      if (!reduceMotion) {
        smooth.x += (raw.x - smooth.x) * 0.13;
        smooth.y += (raw.y - smooth.y) * 0.13;
      } else {
        smooth.x = raw.x;
        smooth.y = raw.y;
      }

      stage.style.setProperty('--spot-x', `${smooth.x}px`);
      stage.style.setProperty('--spot-y', `${smooth.y}px`);
      rafId = requestAnimationFrame(animateSpotlight);
    };

    stage.addEventListener('pointermove', (event) => {
      setTarget(event.clientX, event.clientY);
    }, { passive: true });

    stage.addEventListener('pointerdown', (event) => {
      setTarget(event.clientX, event.clientY);
    }, { passive: true });
    stage.addEventListener('pointerleave', () => {
      isInside = false;
      stage.classList.remove('is-active');
    }, { passive: true });

    rafId = requestAnimationFrame(animateSpotlight);
    window.addEventListener('pagehide', () => cancelAnimationFrame(rafId), { once: true });
  }

  /* ============================================================
     2) LIGHT PARTICLES
     ============================================================ */
  function createParticleSystem(canvas, options = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let particles = [];
    let width = 1;
    let height = 1;
    let dpr = 1;
    let raf = 0;

    const baseCount = options.count ?? 70;
    const color = options.color ?? '255,230,220';
    const speed = options.speed ?? 0.12;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const density = width < 700 ? .5 : width < 1100 ? .75 : 1;
      const count = reduceMotion ? Math.min(18, baseCount) : Math.round(baseCount * density);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: .45 + Math.random() * 1.55,
        vx: (Math.random() - .5) * speed,
        vy: (Math.random() - .5) * speed,
        alpha: .11 + Math.random() * .5,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: .006 + Math.random() * .016
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        if (!reduceMotion) {
          p.x += p.vx;
          p.y += p.vy;
          p.pulse += p.pulseSpeed;
        }
        if (p.x < -5) p.x = width + 5;
        if (p.x > width + 5) p.x = -5;
        if (p.y < -5) p.y = height + 5;
        if (p.y > height + 5) p.y = -5;

        const a = p.alpha * (.72 + Math.sin(p.pulse) * .28);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${color},${Math.max(.02, a)})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pagehide', () => cancelAnimationFrame(raf), { once: true });
  }

  createParticleSystem(document.getElementById('particleCanvas'), {
    count: 92,
    color: '255,225,214',
    speed: .19
  });

  createParticleSystem(document.getElementById('contactParticles'), {
    count: 70,
    color: '255,220,210',
    speed: .13
  });

  /* ============================================================
     3) IMAGE SMOKE IS CSS-ANIMATED
     The smoke itself lives in transparent PNG layers in /assets/smoke.
     ============================================================ */

  /* ============================================================
     4) SCROLL REVEAL
     ============================================================ */
  const scrollItems = document.querySelectorAll('.reveal-on-scroll');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .16 });
    scrollItems.forEach((item) => observer.observe(item));
  } else {
    scrollItems.forEach((item) => item.classList.add('in-view'));
  }

  /* ============================================================
     5) INTERACTIVE SPIDER — MOUSE + TOUCH
     ============================================================ */
  function createSpider(canvas, section) {
    if (!canvas || !section) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 1;
    let height = 1;
    let dpr = 1;
    let raf = 0;
    let lastTime = performance.now();
    let lastBodyX = 0;
    let lastBodyY = 0;

    const target = { x: 0, y: 0, active: false };
    const body = { x: 0, y: 0, vx: 0, vy: 0 };
    const trail = [];
    const legs = Array.from({ length: 8 }, (_, i) => ({
      side: i < 4 ? -1 : 1,
      index: i % 4,
      phase: (i % 4) * .65 + (i < 4 ? 0 : .32),
      footX: 0,
      footY: 0
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!target.active) {
        body.x = width * .52;
        body.y = height * .68;
        target.x = body.x;
        target.y = body.y;
      }
      legs.forEach((leg) => {
        const spread = 34 + leg.index * 15;
        const yOff = (leg.index - 1.5) * 20;
        leg.footX = body.x + leg.side * spread;
        leg.footY = body.y + yOff;
      });
    };

    const setPointer = (clientX, clientY) => {
      const rect = section.getBoundingClientRect();
      target.x = clamp(clientX - rect.left, 40, rect.width - 40);
      target.y = clamp(clientY - rect.top, 40, rect.height - 40);
      target.active = true;
    };

    section.addEventListener('pointermove', (event) => setPointer(event.clientX, event.clientY), { passive: true });
    section.addEventListener('pointerdown', (event) => setPointer(event.clientX, event.clientY), { passive: true });
    section.addEventListener('touchmove', (event) => {
      const touch = event.touches[0];
      if (touch) setPointer(touch.clientX, touch.clientY);
    }, { passive: true });

    const drawWebTrail = () => {
      for (let i = 1; i < trail.length; i++) {
        const p1 = trail[i - 1];
        const p2 = trail[i];
        const a = (i / trail.length) * .16;
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = .6;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    };

    const drawSpider = (time) => {
      const speed = Math.hypot(body.vx, body.vy);
      const angle = Math.atan2(body.vy, body.vx || .001);
      const bodyScale = clamp(1 + speed * .0025, 1, 1.12);

      ctx.save();
      ctx.translate(body.x, body.y);
      ctx.rotate(angle * .08);
      ctx.scale(bodyScale, bodyScale);

      // legs
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const leg of legs) {
        const side = leg.side;
        const idx = leg.index;
        const baseY = (idx - 1.5) * 6;
        const baseX = side * 7;

        const localFootX = leg.footX - body.x;
        const localFootY = leg.footY - body.y;
        const kneeX = side * (20 + idx * 4) + localFootX * .35;
        const kneeY = baseY + localFootY * .38 + Math.sin(time * .006 + leg.phase) * 2;

        ctx.strokeStyle = 'rgba(255,255,255,.74)';
        ctx.lineWidth = 1.35;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.quadraticCurveTo(kneeX, kneeY, localFootX, localFootY);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,80,55,.22)';
        ctx.lineWidth = 3.8;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.quadraticCurveTo(kneeX, kneeY, localFootX, localFootY);
        ctx.stroke();
      }

      // abdomen + head
      const glow = ctx.createRadialGradient(-2, 3, 0, -2, 3, 17);
      glow.addColorStop(0, 'rgba(255,255,255,.92)');
      glow.addColorStop(.18, 'rgba(255,235,230,.85)');
      glow.addColorStop(.48, 'rgba(255,80,45,.52)');
      glow.addColorStop(1, 'rgba(255,25,10,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(-2, 3, 17, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(247,247,247,.94)';
      ctx.beginPath();
      ctx.ellipse(-1, 4, 7.5, 10.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -5, 5.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(30,0,0,.95)';
      ctx.beginPath();
      ctx.arc(-2, -6, 1.15, 0, Math.PI * 2);
      ctx.arc(2, -6, 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const updateFeet = (time) => {
      const speed = Math.hypot(body.vx, body.vy);
      legs.forEach((leg) => {
        const spreadX = 34 + leg.index * 15;
        const spreadY = (leg.index - 1.5) * 22;
        const gait = Math.sin(time * .008 + leg.phase) * Math.min(9, speed * .25);
        const desiredX = body.x + leg.side * spreadX + gait * leg.side;
        const desiredY = body.y + spreadY - Math.abs(gait) * .35;
        const dist = Math.hypot(desiredX - leg.footX, desiredY - leg.footY);
        const step = dist > 23 ? .20 : .055;
        leg.footX = lerp(leg.footX, desiredX, step);
        leg.footY = lerp(leg.footY, desiredY, step);
      });
    };

    const animate = (time) => {
      const dt = Math.min(32, time - lastTime || 16);
      lastTime = time;
      ctx.clearRect(0, 0, width, height);

      // spring-like follow, slower than the pointer so it feels alive
      const follow = reduceMotion ? .22 : .075;
      const desiredVX = (target.x - body.x) * follow;
      const desiredVY = (target.y - body.y) * follow;
      body.vx = lerp(body.vx, desiredVX, .24);
      body.vy = lerp(body.vy, desiredVY, .24);
      body.x += body.vx * (dt / 16.67);
      body.y += body.vy * (dt / 16.67);

      updateFeet(time);

      if (Math.hypot(body.x - lastBodyX, body.y - lastBodyY) > 5) {
        trail.push({ x: body.x, y: body.y });
        if (trail.length > 22) trail.shift();
        lastBodyX = body.x;
        lastBodyY = body.y;
      }

      drawWebTrail();
      drawSpider(time);
      raf = requestAnimationFrame(animate);
    };

    resize();
    raf = requestAnimationFrame(animate);
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pagehide', () => cancelAnimationFrame(raf), { once: true });
  }

  const contactSection = document.getElementById('contact');
  createSpider(document.getElementById('spiderCanvas'), contactSection);

  /* ============================================================
     6) MAGNETIC CONTACT BUTTONS
     ============================================================ */
  if (contactSection && !reduceMotion) {
    const buttons = [...contactSection.querySelectorAll('.social-btn')];

    const resetButtons = () => {
      buttons.forEach((button) => {
        button.style.setProperty('--mx', '0px');
        button.style.setProperty('--my', '0px');
      });
    };

    contactSection.addEventListener('pointermove', (event) => {
      buttons.forEach((button) => {
        const rect = button.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = event.clientX - cx;
        const dy = event.clientY - cy;
        const distance = Math.hypot(dx, dy);
        const radius = 170;

        if (distance < radius) {
          const force = (1 - distance / radius) * 10;
          button.style.setProperty('--mx', `${clamp(dx / radius * force, -9, 9)}px`);
          button.style.setProperty('--my', `${clamp(dy / radius * force, -7, 7)}px`);
        } else {
          button.style.setProperty('--mx', '0px');
          button.style.setProperty('--my', '0px');
        }
      });
    }, { passive: true });

    contactSection.addEventListener('pointerleave', resetButtons, { passive: true });
  }
})();
