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
document.getElementById('floating-bar-cta').addEventListener('click', () => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
});

// ── HTML Logo + CTA Overlay ───────────────────────────────────────────
const logoOverlay = document.getElementById('logo-overlay');
const logoImg = logoOverlay.querySelector('img');
const ctaTagline = document.getElementById('cta-tagline');
const ctaRow = document.getElementById('cta-row');
const contactLink = logoOverlay.querySelector('.contact-link');

// ── Starfield ─────────────────────────────────────────────────────────
const createStarfield = () => {
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 1000;
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 20;
        positions[i + 1] = (Math.random() - 0.5) * 20;
        positions[i + 2] = (Math.random() - 0.5) * 20;
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.05,
        transparent: true,
        opacity: 0
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

    // ── Starfield — appears at 55%, full by 75% ──
    if (scrollProgress >= 0.55) {
        const starProgress = THREE.MathUtils.clamp(
            (scrollProgress - 0.55) / 0.2, 0, 1
        );
        starfield.material.opacity = starProgress;

        const scale = 0.01 + (starProgress * 8);
        starfield.scale.set(scale, scale, scale);

        starfield.position.z = -totalTunnelDepth - 10;
    } else {
        starfield.material.opacity = 0;
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
    } else {
        ctaTagline.style.opacity = 0;
        ctaTagline.style.transform = 'translateY(-60px)';
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
const animate = () => {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
};

animate();
