---
name: k9-brand-color
description: Use when choosing, changing or reviewing any color, gradient, glow or theme in K9 Service (website, 3D scene, Mini App). Not for layout or copy.
---
# K9 color system (identity lock)

Source of truth: the original K9 website. First read its real CSS variables. The values below were estimated from a screenshot, so correct them to the site's actual values and record them in tokens.css.

## Tokens (starting values)

- --void #07060d (page), --ink #0e0c1b (panels), --ink-raised #151228, --line rgba(167,139,250,.16)
- --text #f1efff, --text-muted #a8a4c4 (at least 4.5:1 on --ink)
- --violet-300 #c4b5fd, --violet-400 #a78bfa, --violet-500 #8b7cf6 (primary), --indigo-600 #5b4bdb, --indigo-900 #1d1647, --ice #dcd6ff
- Status colors, cool and rarely used: success #7fe3c8, error #ff8fa8
- Headline gradient: lavender #d9c9ff to periwinkle #8f7cf0, on one phrase only
- Primary button: fill --violet-400 to --violet-500, text #0b0818

## Color theory rules
- Ratio: about 60% void and ink, 30% violet-indigo mid tones, 10% lavender- ice highlights.
- One hue family: violet to indigo (roughly 245 to 275 degrees). No warm accents. No cyan, teal, green or pink glows.
- Large areas dark and low in saturation, small accents more saturated. Darker, less saturated surfaces read calmer.
- No pure #000 UI backgrounds and no pure #fff text. Only the black hole core may be #000.
- One glow source per screen: the black hole. UI elements have no glow.
- Never use color alone to carry meaning. Pair it with text or an icon.
- Focus ring: --violet-300, at least 3:1 against its surroundings.

## Psychology (hypotheses, not facts) Deep violet and indigo with cool neutrals tends to read as calm, thoughtful, premium tech. Research ties hue, saturation and darkness to brand impressions, but effects are modest and vary by culture and context. Contrast, clarity and testing with real users come first.

## Mini App ASCII background fix (blue to purple)
- Replace colors ['#1e3fd8','#f6f8ff','#a5d8ff','#38bdf8'] with ['#4a2fd1','#f6f3ff','#cdbcff','#8b7cf6'].
- Calm settings: cellSize 22 to 26, density 0.4 to 0.5, glyphOpacity 0.5 to 0.6, glow 0.12, flicker 0, grain 0, speed 0.3, clickEffect 'none'.
- Replace any leftover #1e3fd8, #38bdf8 or #a5d8ff in CSS (buttons, radios, borders, focus rings).

## Checks before finishing Search the repo for blue hex values and hues between 190 and 230 degrees. Verify contrast for every text and button pair and report the ratios in the pull request.
