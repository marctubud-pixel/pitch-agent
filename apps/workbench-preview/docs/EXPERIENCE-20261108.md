> 当前采用[中文桌面规格](DESKTOP-CN.md)。本文的多语言、手机模式及旧截图仅作历史参考。

# Frontend experience edition · November 8

This edition implements the user-approved eight-point UI audit on the frozen November 3 source. It changes the affected layout rules in DESIGN-SPEC.md; it does not change business thresholds, checkpoint approvals or service contracts. All project data, illustrations, reviews and assistant answers shown here are local engineering demo fixtures.

- Stage context is compact: title/status remain visible; purpose, summary and review detail sit in a disclosure that opens for revision requests. Eight stages and five workspace areas remain reachable. Phone stages show short names, with full stage/status accessible labels; all five workspace tabs fit without relying on sideways discovery.
- Visual development opens on current/pending valid work. Reference search and sketches are in a process view; cross-direction comparison has its own view. Historical versions remain inside the current-direction view. Pending links retain the exact direction/version, select the current view and focus the artwork. The separate decision control retains the original approval rules.
- Overview starts with the concrete next object. Pending artwork has one viewing entry per object; generic next actions use “Go to it”. The original task, progress, needs and results follow.
- Mobile WorkBot is a normal-flow toolbar row in the sticky header. Hide/restore and panel focus preserve the existing conversation. Desktop character behavior remains.
- Cabinet project titles wrap, folders no longer overlap, and review metadata uses the compact hierarchy. Cover art is labelled as a preview while detailed output loads; a cover image is never labelled as no output.
- The compact edition defines `--t-h1: 2rem`, `--t-h2: 1.625rem`, `--t-h3: 1.375rem` (phone: 1.625/1.125/1.125rem), retaining body/small/label roles and adding `--t-caption: .75rem` for small controls. All sizes in experience.css reference these shared roles. Color, fonts, artwork ratio and stage identities retain the baseline system.

## Reproduce and inspect

Run `npm run build`, `npm run preview -- --host 127.0.0.1`, and `npm run test:experience`. Browser evidence is written to artifacts/experience/result.json with viewport captures. The suite covers current work, process/compare return paths, object/version navigation, mobile controls/focus, light/dark, labelled Chinese KV and packaging layouts, empty/loading states and blocked external requests. It does not run slide editing, saving/recovery, export, paid model or real backend tests.

## Current screenshots

The files below are viewport captures, with reduced motion. They show synthetic demo content, not real research or customer approval.

- [Desktop visual](screenshots-experience/desktop-visual.png) · [process](screenshots-experience/desktop-process.png) · [comparison](screenshots-experience/desktop-compare.png)
- [Home](screenshots-experience/desktop-home.png) · [overview](screenshots-experience/desktop-overview.png)
- [390px visual](screenshots-experience/phone-390-visual.png) · [375px visual](screenshots-experience/phone-375-visual.png) · [390px overview](screenshots-experience/phone-390-overview.png)
