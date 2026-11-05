---
name: k9-miniapp-flow
description: Use when changing the K9 Telegram Mini App ordering flow, screens, buttons or copy. Covers the 3-step order flow and Telegram WebApp API usage.
---
# K9 Mini App: easy order flow

Keep the identity and design. Change only the flow, sizes, words and the blue-to-purple color fix.

## Flow (3 steps)
1. What do you need? Six big radio-style rows, each with a short plain explanation. Nothing pre-selected. Footer line: ‘Not sure? Choose Custom Project.’
2. Tell us a little. One main box (‘What do you want to build?’) and optional time chips (As soon as possible / This month / No rush). Hint: ‘You can also send a voice message in chat.’
3. Check and send. A summary of the choices, then one big ‘Send order’ button. After sending: a success screen with an order number, what happens next, and a ‘See my orders’ button.

Every price-related label becomes one phrase: ‘Get a price’ (we send the price after you describe the need). Confirm the real payment rule with the owner before writing anything about payment.

## Layout rules

- Step title in words plus a thin progress bar. Title 24 to 28 px, body 17 to 18 px, buttons 56 px tall.
- Header: brand on the left, language switch on the right (English / မြန်မာ), a ‘Need help?’ action always reachable.
- One primary button per screen, always in the same place.

## Telegram APIs (core.telegram.org/bots/webapps)
- On start: WebApp.ready() and expand(). Set header, background and bottom bar colors to the void color. Call disableVerticalSwipes() so scrolling never closes the app.
- MainButton is the primary action (text changes per step, shows progress while sending). BackButton shows from step 2. SecondaryButton is ‘Need help?’ and opens the chat.
- HapticFeedback: selectionChanged on choose, notificationOccurred('success') after sending.
- CloudStorage: save a draft after each step (key k9_draft), restore it on open, and call enableClosingConfirmation() while a draft exists.
- Safe areas: padding from --tg-safe-area-inset-* and --tg-content-safe-area- inset-* with env() fallback.
- Keep the existing order submission and server-side initData validation. Do not change backend behavior unless asked.
- ASCII hero (GradientASCII): purple ramp and calm settings from k9-brand- color. Small height (about 30 to 36 svh on step 1, tiny or hidden on later steps).
- No 3D scene in the Mini App.
