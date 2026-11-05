# K9 Service: project rules for Codex

## What this is K9 Service sells IT services and digital products: Telegram bots, websites and tools, Telegram Mini Apps, video editing, digital products, custom projects. Two surfaces: the website (with a 3D experience called K9 Orbit) and the Telegram Mini App (the ordering shop).

## Always
- Identity lock: keep the original K9 look: near-black void, violet-to-indigo glow, lavender headline gradient, black-hole imagery. Never add blue, cyan, teal or green accents. Use only tokens from the k9-brand-color skill.

- Mood: cold, peaceful, calm. Slow motion, wide spacing, quiet type. No flashing, shaking, neon or visual noise.
- Languages: English is the default, Burmese (Unicode) is first-class. All user text lives in i18n files (en, my). Never hard-code strings. Never render text inside WebGL; use HTML.
- Beginner and older-user friendly: plain words, big buttons, one primary action per screen.
- Performance: 3D code is lazy-loaded and follows the budget in k9-blackhole-3d. The site must work with no WebGL.
- Accessibility: text contrast at least 4.5:1 (aim for 7:1 on body text), touch targets at least 48 px, visible focus, prefers-reduced-motion respected, everything reachable by keyboard.
- Hosting: the site runs on Cloudflare Workers (workers.dev). Keep builds static-asset friendly. No Node-only runtime dependencies in client code.

## Working style
- Inspect the repo first. Reuse existing components, routes and styles. Do not rewrite what works.
- You cannot ask questions mid-task. Make the best assumption and list assumptions in the pull request.
- Small commits. Run lint, type-check and build before finishing. Report bundle sizes.
- Never invent Burmese translations silently. Mark every new Burmese string ‘needs native review’ in the i18n file.

## Skills $k9-brand-color, $k9-ux-placement, $k9-blackhole-3d, $k9-miniapp-flow
