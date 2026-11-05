---
name: k9-ux-placement
description: Use when arranging layout, deciding where buttons, text or visuals go, or writing UI copy on the K9 website or Mini App. Covers placement psychology, beginner and older-user friendliness, and Burmese typography.
---
# Placement and plain-language rules

## Where things go
- Reading: people scan the top and left of text areas first (the F-pattern). It is a tendency, not a law. Put the point of each block in its first words and align left.
- Hero: headline on the left, black hole off-center (right on desktop, upper area on mobile). Copy sits in dark negative space, never over the bright disk. Add a soft dark gradient under text if needed.
- One primary action per screen: a filled violet button, the only filled violet element on screen (the isolation effect makes it stand out). Same position on every screen.
- Mobile: primary action in the bottom thumb zone. Reassurance text (price rule, reply time) sits directly next to the button.
- Choices: at most 6 services at once (Hick's law). The recommended one comes first with a ‘Most requested’ mark. Custom Project comes last as the catch- all (first and last items are remembered best).
- Related things sit close together (proximity). Separate groups with space, not boxes everywhere.
- Trust cues (‘Direct with the creator’, reply time) sit near the order button, not only in the footer.
- Show progress in words, for example ‘Step 2 of 3’.

## Beginner and older-friendly
- Body text 17 to 18 px minimum on mobile. Nothing under 14 px. No all-caps micro labels and no wide letter-spacing.
- Buttons at least 56 px tall. Targets at least 48 px with 12 px gaps (the WCAG 2.2 minimum is 24 px; use more).
- Every icon has a word next to it. No gesture-only actions.
- Plain words: say what it is and what happens next. Put a short explanation under any jargon. One phrase for one action everywhere (for example ‘Get a price’, not four variants).
- Errors say what to fix. Confirmations say what happens next and when.
- Back is always available and never loses what the person typed.

## Burmese (first-class)
- Unicode only. Font stack: Noto Sans Myanmar, Padauk, Pyidaungsu, then system sans. Set lang='my' on Burmese text so browsers choose correct fonts and line breaking.
- Body line-height 1.75 to 1.9. Burmese 1 to 2 px larger than the English equivalent. No letter-spacing, no uppercase, no text-transform.
- Never fix button heights. Use min-height and padding so stacked marks are not clipped. Test long strings for wrapping.
- If people type Burmese into forms, detect Zawgyi text and convert it to Unicode before saving (use a Zawgyi detector library).
- Do not machine-translate silently. Mark new strings ‘needs native review’. The language switch shows both names: English / မြန်မာ.
