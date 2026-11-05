---
name: k9-blackhole-3d
description: "Use when building or changing the 3D black-hole experience (K9 Orbit): scene, camera, interactions, performance tiers, fallbacks. Not for 2D layout or the Mini App."
---
# K9 Orbit: black hole 3D

Stack: React, Vite, three, @react-three/fiber, @react-three/drei, maath, detect-gpu. Plain CSS tokens. Lazy-load the whole 3D chunk after first paint.

## Concept The black hole (K9 Core) is the hub. Six service objects orbit it slowly. Tap one: the camera glides to it and an HTML panel opens with a plain description and a Get a price button. Everything the 3D can do must also be possible from a normal list (accessibility and fallback).

## Scene (keep it cheap)
1. Core: black sphere (#000, unlit) plus a thin photon ring (emissive violet- ice).
2. Disk: one flat ring mesh with a ShaderMaterial. Radial gradient (indigo- 600 to violet-400 to ice), slow noise swirl, one side about 25% brighter (Doppler look), rotation period of 60 s or more.
3. Lens halo: a camera-facing billboard ring above and below the core that fakes the bent back side of the disk.
4. Lensing: ONE low-resolution fullscreen pass that bends the background with a 1/r deflection approximation. No ray marching and no per-pixel step loops.
5. Background: a pre-baked starfield and nebula texture (compressed), plus

optional static Points. No twinkle.
6. Dust: GPU-driven instanced particles, orbit computed in the vertex shader from a time uniform. Count depends on tier.
7. Satellites (six, up to 2,000 triangles each, procedural geometry, shared material): Telegram Bot = rounded cube with a small antenna. Website and Tools = floating browser-window plane. Mini App = phone slab. Video Editing = lens ring with a play triangle. Digital Products = faceted crystal. Custom Project = hollow wireframe cube. Orbit periods 90 to 180 s. Dark glass look with a thin violet edge glow (fresnel).
8. Post: at most one gentle half-resolution bloom. No depth of field, no SSAO, no film grain.

## Interaction
- Drag = orbit, pinch or scroll = zoom, double-tap = reset. Limits: polar angle 20 to 80 degrees, distance min and max so the core never leaves view. No camera roll.
- Camera moves use critically damped smoothing (about 0.35 s) or an eased tween of 1.0 to 1.6 s. Never snap.
- Always-visible labeled buttons: Zoom in, Zoom out, Reset view, Tour (guided, 6 stops). Gestures are a bonus, not a requirement.
- Hover (desktop) or press-and-hold (touch): label and soft highlight. Selected object: the others dim to about 35%.
- Keyboard: Tab to the list, arrow keys cycle objects, Enter selects, Esc returns to the full orbit. Screen-reader labels on the HTML list.
- Do not hijack page scroll. The hero stage scrolls with the page. A full- screen ‘Explore in 3D’ mode captures gestures and has a visible Close button.

## Performance rules (smart rendering)
- Quality tiers from detect-gpu, deviceMemory, hardwareConcurrency, Save-Data and prefers-reduced-motion:
  - T0 (no WebGL2 or very low GPU): static poster image with gentle CSS parallax only.
  - T1 (low): no lensing pass, no dust, no bloom, DPR 1, 30 fps cap.
    - T2 (mid): lensing at 0.5 resolution, 2k dust, DPR up to 1.5, no bloom.
    - T3 (high): lensing at 0.75 resolution, 8k dust, soft bloom, DPR up to 2.
- Auto step-down: use PerformanceMonitor. If fps stays under about 40 for 2 s, drop one tier. Step up at most once. Use AdaptiveDpr while the camera moves.
- Idle: cap at 30 fps (slow motion looks the same). During interaction: full rate. Stop rendering when the canvas is off-screen (IntersectionObserver) or the tab is hidden.
- All animation lives in shaders (time uniform) and refs. No React state updates inside useFrame.

- Budgets: under 40 draw calls, under 100k triangles, textures up to 2048 (satellite maps up to 1024), initial 3D chunk up to 250 KB gzip, first paint never blocked by 3D. Dispose geometries, materials and textures on unmount.
- Prefer procedural geometry and shaders over downloaded models. If a GLB is needed, use Draco or Meshopt compression.

## Fallback and QA
- No WebGL, context lost or any error: show the poster plus the plain service list. Never a blank canvas.
- Test on a low-end Android phone first, then desktop. Report fps notes and bundle size in the pull request.
- All text, labels and buttons are HTML (Burmese needs proper shaping). Never put text in WebGL.
