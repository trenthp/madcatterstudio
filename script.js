import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js';

// Scene setup
const canvas = document.getElementById('canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Camera setup with perspective matching viewport
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.z = 0;

// Renderer setup
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

// Calculate viewport dimensions at camera position
const getViewportDimensions = (distance) => {
    const vFov = (camera.fov * Math.PI) / 180;
    const height = 2 * Math.tan(vFov / 2) * distance;
    const width = height * camera.aspect;
    return { width, height };
};

// Create the forced perspective tunnel/grid
const createTunnel = () => {
    const group = new THREE.Group();

    const lineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 2
    });

    const depthSegments = 50;
    const segmentSpacing = 2;

    for (let i = 0; i < depthSegments; i++) {
        const z = -i * segmentSpacing;

        const viewportAtZ = getViewportDimensions(Math.abs(z) + 0.1);
        const scale = 1 + (i * 0.15);
        const width = viewportAtZ.width / scale;
        const height = viewportAtZ.height / scale;

        const points = [];
        points.push(new THREE.Vector3(-width/2, -height/2, z));
        points.push(new THREE.Vector3(width/2, -height/2, z));
        points.push(new THREE.Vector3(width/2, height/2, z));
        points.push(new THREE.Vector3(-width/2, height/2, z));
        points.push(new THREE.Vector3(-width/2, -height/2, z));

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, lineMaterial);
        group.add(line);

        if (i % 5 === 0) {
            const vertPoints1 = [
                new THREE.Vector3(-width/2, -height/2, z),
                new THREE.Vector3(-width/2, height/2, z)
            ];
            const vertPoints2 = [
                new THREE.Vector3(width/2, -height/2, z),
                new THREE.Vector3(width/2, height/2, z)
            ];

            const vertGeom1 = new THREE.BufferGeometry().setFromPoints(vertPoints1);
            const vertGeom2 = new THREE.BufferGeometry().setFromPoints(vertPoints2);

            group.add(new THREE.Line(vertGeom1, lineMaterial));
            group.add(new THREE.Line(vertGeom2, lineMaterial));
        }
    }

    const cornerMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 2
    });

    for (let corner = 0; corner < 4; corner++) {
        const points = [];
        for (let i = 0; i < depthSegments; i++) {
            const z = -i * segmentSpacing;
            const viewportAtZ = getViewportDimensions(Math.abs(z) + 0.1);
            const scale = 1 + (i * 0.15);
            const width = viewportAtZ.width / scale;
            const height = viewportAtZ.height / scale;

            let x, y;
            switch(corner) {
                case 0: x = -width/2; y = -height/2; break;
                case 1: x = width/2; y = -height/2; break;
                case 2: x = width/2; y = height/2; break;
                case 3: x = -width/2; y = height/2; break;
            }
            points.push(new THREE.Vector3(x, y, z));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, cornerMaterial);
        group.add(line);
    }

    return group;
};

const tunnel = createTunnel();
scene.add(tunnel);

// ── HTML Sign Overlay System ──────────────────────────────────────────
// Signs are HTML elements fixed over the canvas — no 3D movement.
// One visible at a time, crossfading based on scroll progress.
const signElements = document.querySelectorAll('.sign');
const signScrollEnd = 0.55; // signs finish before starfield/logo

// Weight each sign's scroll band by its text length so longer
// messages get proportionally more reading time.
const signLengths = Array.from(signElements).map(el => el.textContent.length);
const totalLength = signLengths.reduce((sum, len) => sum + len, 0);

// Build scroll band data — first 5 signs share signScrollEnd,
// then the last sign gets extra time appended after.
const lastSignExtra = 0.08; // extra scroll range for last sign
let cursor = 0;
const signBands = Array.from(signElements).map((el, i) => {
    const weight = signLengths[i] / totalLength;
    let slotSize = signScrollEnd * weight;
    if (i === signElements.length - 1) {
        slotSize += lastSignExtra;
    }
    const bandStart = cursor;
    const bandEnd = cursor + slotSize;
    const fadeDuration = slotSize * 0.25;
    cursor = bandEnd;
    return { el, bandStart, bandEnd, fadeDuration, isFirst: i === 0 };
});

// ── Floating bottom bar ──────────────────────────────────────────────
const floatingBar = document.getElementById('floating-bar');
const enterBtn = document.getElementById('floating-bar-enter');
const controlsEl = document.getElementById('floating-bar-controls');
const pauseBtn = document.getElementById('floating-bar-pause');
const skipBtn = document.getElementById('floating-bar-skip');
const pauseIcon = pauseBtn.querySelector('.pause-icon');
const playIcon = pauseBtn.querySelector('.play-icon');

let autoScrollId = null;

// Piecewise easing: fast ramp-up → slow cruise through signs → fast finish
// t = normalised time [0,1] → returns normalised scroll position [0,1]
const lastBandStart = signBands[signBands.length - 1].bandStart;
const signEndFraction = signBands[signBands.length - 1].bandEnd;

// Build a C1-continuous piecewise easing (no speed jumps).
const _rampEnd   = 0.02;
const _cruiseEnd = 0.70;
const _rampDist  = 0.03;

const _cruiseV = (lastBandStart - _rampDist) / (_cruiseEnd - _rampEnd);
const _rampA = _cruiseV * _rampEnd / 2;
const _accelLen  = 1 - _cruiseEnd;
const _accelV0   = _cruiseV * _accelLen;
const _accelDist = 1 - lastBandStart;

const customEase = (t) => {
    if (t <= _rampEnd) {
        const r = t / _rampEnd;
        return _rampA * r * r;
    } else if (t <= _cruiseEnd) {
        return _rampA + _cruiseV * (t - _rampEnd);
    } else {
        const r = (t - _cruiseEnd) / _accelLen;
        return lastBandStart + _accelV0 * r + (_accelDist - _accelV0) * r * r;
    }
};

// ── Auto-scroll state (supports pause / resume) ─────────────────────
let scrollAnim = null; // { start, distance, duration, elapsed, easeFn }

const stopAutoScroll = () => {
    if (autoScrollId) {
        cancelAnimationFrame(autoScrollId);
        autoScrollId = null;
    }
};

const runAutoScroll = () => {
    if (!scrollAnim) return;
    const anim = scrollAnim;
    const resumeTime = performance.now();

    const step = (now) => {
        const dt = now - resumeTime;
        anim.elapsed += dt;
        // Re-anchor resumeTime each frame so pause/resume stays accurate
        const t = Math.min(anim.elapsed / anim.duration, 1);
        window.scrollTo(0, anim.start + anim.distance * anim.easeFn(t));
        if (t < 1) {
            anim.elapsed = anim.elapsed; // already updated above
            const prevNow = now;
            autoScrollId = requestAnimationFrame((n) => {
                // Compute dt from *this* frame's now
                anim.elapsed -= dt; // undo the += above
                anim.elapsed += (n - resumeTime);
                const t2 = Math.min(anim.elapsed / anim.duration, 1);
                window.scrollTo(0, anim.start + anim.distance * anim.easeFn(t2));
                if (t2 < 1) {
                    // Continue recursively but simpler — switch to a clean loop
                } else {
                    autoScrollId = null;
                    scrollAnim = null;
                    showEnterBtn();
                }
            });
        } else {
            autoScrollId = null;
            scrollAnim = null;
            showEnterBtn();
        }
    };
    autoScrollId = requestAnimationFrame(step);
};

// Simpler approach: track elapsedAtPause, use a single startTime offset
const startAutoScroll = (target, duration, easeFn) => {
    stopAutoScroll();
    scrollAnim = {
        start: window.scrollY,
        distance: target - window.scrollY,
        duration,
        easeFn,
        elapsedAtPause: 0,
        timeOrigin: performance.now()
    };
    _runLoop();
};

const _runLoop = () => {
    if (!scrollAnim) return;
    const anim = scrollAnim;

    const step = (now) => {
        const elapsed = (now - anim.timeOrigin) + anim.elapsedAtPause;
        const t = Math.min(elapsed / anim.duration, 1);
        window.scrollTo(0, anim.start + anim.distance * anim.easeFn(t));
        if (t < 1) {
            autoScrollId = requestAnimationFrame(step);
        } else {
            autoScrollId = null;
            scrollAnim = null;
            showEnterBtn();
        }
    };
    autoScrollId = requestAnimationFrame(step);
};

const pauseAutoScroll = () => {
    if (!scrollAnim) return;
    const now = performance.now();
    scrollAnim.elapsedAtPause += (now - scrollAnim.timeOrigin);
    stopAutoScroll();
};

const resumeAutoScroll = () => {
    if (!scrollAnim) return;
    scrollAnim.timeOrigin = performance.now();
    _runLoop();
};

// ── UI state helpers ─────────────────────────────────────────────────
let isPaused = false;

const showControls = () => {
    enterBtn.classList.add('hidden');
    controlsEl.classList.add('active');
    isPaused = false;
    pauseIcon.classList.remove('hidden');
    playIcon.classList.add('hidden');
};

const showEnterBtn = () => {
    enterBtn.classList.remove('hidden');
    controlsEl.classList.remove('active');
    isPaused = false;
};

// ── Button handlers ──────────────────────────────────────────────────
enterBtn.addEventListener('click', () => {
    showControls();
    startAutoScroll(document.body.scrollHeight, 22000, customEase);
});

pauseBtn.addEventListener('click', () => {
    if (!isPaused) {
        pauseAutoScroll();
        isPaused = true;
        pauseIcon.classList.add('hidden');
        playIcon.classList.remove('hidden');
    } else {
        resumeAutoScroll();
        isPaused = false;
        pauseIcon.classList.remove('hidden');
        playIcon.classList.add('hidden');
    }
});

skipBtn.addEventListener('click', () => {
    stopAutoScroll();
    scrollAnim = null;
    // Quick skip to end
    const skipStart = window.scrollY;
    const skipTarget = document.body.scrollHeight;
    const skipDist = skipTarget - skipStart;
    const skipDuration = 3500;
    const skipOrigin = performance.now();

    const step = (now) => {
        const t = Math.min((now - skipOrigin) / skipDuration, 1);
        // Gentle ease-in-out with a long, soft landing
        const ease = t < 0.3
            ? (t / 0.3) * (t / 0.3) * 0.3
            : 0.3 + 0.7 * (1 - Math.pow(1 - (t - 0.3) / 0.7, 3));
        window.scrollTo(0, skipStart + skipDist * ease);
        if (t < 1) {
            autoScrollId = requestAnimationFrame(step);
        } else {
            autoScrollId = null;
            showEnterBtn();
        }
    };
    autoScrollId = requestAnimationFrame(step);
});

// Stop auto-scroll if the user scrolls manually, revert to Enter button
const cancelAndReset = () => {
    if (autoScrollId || scrollAnim) {
        stopAutoScroll();
        scrollAnim = null;
        showEnterBtn();
    }
};
window.addEventListener('wheel', cancelAndReset);
window.addEventListener('touchstart', (e) => {
    // Don't cancel when tapping the floating bar controls
    if (floatingBar.contains(e.target)) return;
    cancelAndReset();
});

// ── HTML Logo + CTA Overlay ───────────────────────────────────────────
const logoOverlay = document.getElementById('logo-overlay');
const logoImg = logoOverlay.querySelector('img');
const ctaTagline = document.getElementById('cta-tagline');
const ctaSubline = document.getElementById('cta-subline');
const ctaRow = document.getElementById('cta-row');
const contactLink = logoOverlay.querySelector('.contact-link');

// ── Starfield ─────────────────────────────────────────────────────────
const starCount = 8000;
const createStarfield = () => {
    const starGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const twinkleSeeds = new Float32Array(starCount);
    const baseAlphas = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
        positions[i * 3]     = (Math.random() - 0.5) * 30;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 30;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
        sizes[i] = 0.15 + Math.random() * 0.5;
        twinkleSeeds[i] = Math.random() * Math.PI * 2;
        baseAlphas[i] = 0.15 + Math.random() * 0.85; // varying transparency
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    starGeometry.setAttribute('twinkleSeed', new THREE.BufferAttribute(twinkleSeeds, 1));
    starGeometry.setAttribute('baseAlpha', new THREE.BufferAttribute(baseAlphas, 1));

    const starMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
            uOpacity: { value: 0 },
            uTime: { value: 0 },
            uPixelRatio: { value: renderer.getPixelRatio() }
        },
        vertexShader: `
            attribute float size;
            attribute float twinkleSeed;
            attribute float baseAlpha;
            uniform float uTime;
            uniform float uPixelRatio;
            varying float vTwinkle;
            varying float vShape;
            varying float vBaseAlpha;
            void main() {
                vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
                vBaseAlpha = baseAlpha;
                // ~60% are four-pointed stars
                vShape = step(0.4, fract(twinkleSeed * 3.17));
                // Only circular stars can twinkle (~15% of all stars)
                float isCircle = 1.0 - vShape;
                float speed = 0.3 + twinkleSeed * 0.2;
                float doTwinkle = isCircle * step(4.4, twinkleSeed * 6.28);
                vTwinkle = mix(1.0, 0.3 + 0.7 * sin(uTime * speed + twinkleSeed * 6.28), doTwinkle);
                float sizeScale = mix(1.0, 1.4, vShape);
                gl_PointSize = size * sizeScale * uPixelRatio * (200.0 / max(-mvPos.z, 0.1));
                gl_Position = projectionMatrix * mvPos;
            }
        `,
        fragmentShader: `
            uniform float uOpacity;
            varying float vTwinkle;
            varying float vShape;
            varying float vBaseAlpha;
            void main() {
                vec2 uv = gl_PointCoord - 0.5;
                float alpha;
                if (vShape > 0.5) {
                    // Four-pointed star, taller on vertical axis
                    float ax = abs(uv.x);
                    float ay = abs(uv.y);
                    // Horizontal spike (narrow)
                    float spikeH = smoothstep(0.5, 0.0, ax) * smoothstep(0.08, 0.0, ay);
                    // Vertical spike (narrow, longer reach)
                    float spikeV = smoothstep(0.5, 0.0, ay) * smoothstep(0.06, 0.0, ax);
                    // Bright core
                    float core = smoothstep(0.12, 0.0, length(uv));
                    alpha = max(max(spikeH, spikeV), core);
                    if (alpha < 0.01) discard;
                } else {
                    // Soft circular point
                    float d = length(uv);
                    if (d > 0.5) discard;
                    alpha = smoothstep(0.5, 0.3, d);
                }
                gl_FragColor = vec4(1.0, 1.0, 1.0, alpha * uOpacity * vTwinkle * vBaseAlpha);
            }
        `
    });

    return new THREE.Points(starGeometry, starMaterial);
};

const starfield = createStarfield();
scene.add(starfield);

// ── Scroll Handling ───────────────────────────────────────────────────
let scrollProgress = 0;

// Cache spacer element
const scrollSpacer = document.getElementById('scroll-spacer');

const updateScene = () => {
    const totalTunnelDepth = 100; // 50 segments * 2 spacing

    // Move camera through the tunnel and beyond
    camera.position.z = -(scrollProgress * (totalTunnelDepth + 20));

    // ── HTML sign fade based on scroll progress bands ──
    signBands.forEach(({ el, bandStart, bandEnd, fadeDuration, isFirst }) => {
        let opacity = 0;

        if (scrollProgress >= bandStart && scrollProgress <= bandEnd) {
            // Inside the band — fade in (skip for first sign)
            if (isFirst) {
                opacity = 1;
            } else if (scrollProgress < bandStart + fadeDuration) {
                opacity = THREE.MathUtils.smoothstep(
                    scrollProgress, bandStart, bandStart + fadeDuration
                );
            } else {
                opacity = 1;
            }

            // Fade out at end of band
            if (scrollProgress > bandEnd - fadeDuration) {
                const fadeOut = 1 - THREE.MathUtils.smoothstep(
                    scrollProgress, bandEnd - fadeDuration, bandEnd
                );
                opacity = Math.min(opacity, fadeOut);
            }
        }

        el.style.opacity = opacity;
    });

    // ── Floating bar — visible while signs are showing, fades with last sign ──
    const lastBand = signBands[signBands.length - 1];
    const barFadeStart = lastBand.bandEnd - lastBand.fadeDuration;
    if (scrollProgress >= barFadeStart) {
        const barOpacity = 1 - THREE.MathUtils.smoothstep(
            scrollProgress, barFadeStart, lastBand.bandEnd
        );
        floatingBar.style.opacity = barOpacity;
        floatingBar.style.pointerEvents = barOpacity < 0.1 ? 'none' : 'auto';
    } else {
        floatingBar.style.opacity = 1;
        floatingBar.style.pointerEvents = 'auto';
    }

    // ── Starfield — appears at 70%, full by 90%, eases to a stop ──
    if (scrollProgress >= 0.70) {
        const raw = THREE.MathUtils.clamp(
            (scrollProgress - 0.70) / 0.20, 0, 1
        );
        // Ease-out cubic so expansion decelerates smoothly
        const starProgress = 1 - Math.pow(1 - raw, 3);
        starfield.material.uniforms.uOpacity.value = starProgress;

        const scale = 0.01 + (starProgress * 8);
        starfield.scale.set(scale, scale, scale);

        starfield.position.z = -totalTunnelDepth - 10;
    } else {
        starfield.material.uniforms.uOpacity.value = 0;
    }

    // ── Fade out tunnel wireframes 60-85% ──
    if (scrollProgress > 0.6) {
        const fadeProgress = THREE.MathUtils.clamp(
            (scrollProgress - 0.6) / 0.25, 0, 1
        );
        tunnel.children.forEach(child => {
            if (child.material) {
                child.material.opacity = 1 - fadeProgress;
                child.material.transparent = true;
            }
        });
    }

    // ── Tagline drops in after last sign ends, lands in position with logo ──
    const taglineStart = signBands[signBands.length - 1].bandEnd;
    const logoStart = 0.65;
    const taglineFadeDuration = logoStart - taglineStart; // opacity fills gap until logo
    const taglineMoveDuration = 0.20; // movement is slower, continues into logo phase
    if (scrollProgress >= taglineStart) {
        const fadeIn = THREE.MathUtils.clamp(
            (scrollProgress - taglineStart) / taglineFadeDuration, 0, 1
        );
        const moveIn = THREE.MathUtils.clamp(
            (scrollProgress - taglineStart) / taglineMoveDuration, 0, 1
        );
        ctaTagline.style.opacity = fadeIn;
        // Drop from above: starts high, eases down to 0 (natural position)
        const yShift = (1 - moveIn) * -60;
        ctaTagline.style.transform = `translateY(${yShift}px)`;
        // Subline handled separately below
    } else {
        ctaTagline.style.opacity = 0;
        ctaTagline.style.transform = 'translateY(-60px)';
    }

    // ── Subline fades in during logo phase ──
    const sublineStart = logoStart + 0.05;
    if (scrollProgress >= sublineStart) {
        const sublineFadeIn = THREE.MathUtils.clamp(
            (scrollProgress - sublineStart) / 0.15, 0, 1
        );
        ctaSubline.style.opacity = sublineFadeIn;
        const sublineYShift = (1 - sublineFadeIn) * -30;
        ctaSubline.style.transform = `translateY(${sublineYShift}px)`;
    } else {
        ctaSubline.style.opacity = 0;
        ctaSubline.style.transform = 'translateY(-30px)';
    }

    // ── Logo fade and scale (65-95%), CTA appears once logo settles ──
    if (scrollProgress >= logoStart) {
        const logoProgress = THREE.MathUtils.clamp(
            (scrollProgress - logoStart) / 0.30, 0, 1
        );
        logoImg.style.opacity = logoProgress;
        const s = 0.15 + logoProgress * 0.85; // scale 0.15 → 1.0
        logoImg.style.transform = `scale(${s})`;

        // Show CTA row + contact link once logo is at full size
        if (logoProgress >= 1) {
            ctaRow.classList.add('visible');
            contactLink.classList.add('visible');
        } else {
            ctaRow.classList.remove('visible');
            contactLink.classList.remove('visible');
        }
    } else {
        logoImg.style.opacity = 0;
        logoImg.style.transform = 'scale(0.15)';
        ctaRow.classList.remove('visible');
        contactLink.classList.remove('visible');
    }
};

const syncScroll = () => {
    const spacerTop = scrollSpacer.offsetTop;
    const spacerHeight = scrollSpacer.offsetHeight;
    const spacerEnd = spacerTop + spacerHeight;

    const clampedScroll = Math.min(window.scrollY, spacerEnd - window.innerHeight);
    const maxScroll = spacerEnd - window.innerHeight;

    scrollProgress = maxScroll > 0 ? clampedScroll / maxScroll : 0;
    scrollProgress = THREE.MathUtils.clamp(scrollProgress, 0, 1);

    updateScene();
};

window.addEventListener('scroll', syncScroll);

// Sync on load so a mid-page refresh shows the correct state
syncScroll();

// Handle window resize (use visualViewport on mobile for accurate size)
const getViewportSize = () => {
    const vv = window.visualViewport;
    return {
        width: vv ? vv.width : window.innerWidth,
        height: vv ? vv.height : window.innerHeight
    };
};

const onResize = () => {
    const { width, height } = getViewportSize();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
};

window.addEventListener('resize', onResize);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onResize);
}

// Animation loop
const clock = new THREE.Clock();
const animate = () => {
    requestAnimationFrame(animate);
    starfield.material.uniforms.uTime.value = clock.getElapsedTime();
    renderer.render(scene, camera);
};

animate();
