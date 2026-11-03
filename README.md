# Typing Snails

A typing game for young kids (5+, with a grown-up nearby). Help a group of snails cross
a bike road by typing the letter shown at the top before the bike rides through the puddle
and splashes them.

## Play

Open `index.html` in a browser. No install or build needed.
(If your browser blocks local files, run `python3 -m http.server` here and open http://localhost:8000.)

Online version: https://oscarolbe.github.io/typingsnail/ (deployed by GitHub Actions on every push to `master`).

## How it works

- 64 keyboard levels in 6 worlds, from never touching a keyboard to typing fast with no mistakes:
  Home row → Reach out → Top row → Bottom row → Word wizard → Perfectionist.
- It starts with a single key (`F`, then `J`). Every new pair of keys gets three levels:
  **Meet** (no bikes, no timer), **Practice** (slow bikes, only the new keys) and
  **Mix in** (the new keys mixed with the ones already learned). Each world ends with a review.
- Word levels only use words made of keys the child already knows.
- Stars: bike levels count snails saved, no-bike levels count accuracy,
  and Perfectionist levels need both.
- The on-screen keyboard and hands show which key to press and with which finger.
  Each finger has its own color.
- A voice says each letter (turn it off with the speaker button).
- Wrong keys never hurt the snails. Only running out of time does.
- You start with 5 snails. Stars: 5 saved = 3 stars, 3–4 = 2 stars, 1–2 = 1 star.
- The bike speed adapts to the child: faster after quick crossings, slower after splashes.
  This is saved between sessions.

## Game controller world

A 7th world, **Controller**, practices the four face buttons (A, B, X, Y) of a game
controller (tested layout: Xbox-style, like most Shanwan pads: Y top, X left, B right, A bottom).
It is open from the start and keeps its own stars and bike speed. It starts with A, then B,
then X and Y, and ends with mixed, faster levels.
The bottom of the screen shows a controller with the button to press glowing.

Plug in the controller and press any button so the browser notices it.
In menus the D-pad or stick moves, A selects, B goes back and Start pauses.

## Tips for grown-ups

- **Shift+U** on the level screen unlocks every level.
- **Reset progress** on the level screen clears stars and the speed setting (for a new child).
- **Esc** pauses the game.

## Files

- `src/levels.js`: level list, finger colors, letter names. Edit this to change the lessons.
- `src/game.js`: game logic, screens and input.
- `src/art.js`: cartoon drawings (snails, bikes, hands, keys).
- `src/audio.js`: synthesized sound effects and speech.
