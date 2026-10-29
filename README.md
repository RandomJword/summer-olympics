# Summer Olympics '83

A 1983-style track and field arcade game in the spirit of Konami's *Hyper Olympic* (*Track & Field*).
It runs in any modern browser with no build step: open `index.html`, or serve the folder with any static
server (for example GitHub Pages).

## Controls

The keys copy the original arcade panel's three buttons: **RUN, ACTION, RUN**.

| Key | Button |
| --- | --- |
| `Z` or `←` | RUN (left) |
| `X`, `Space` or `↑` | ACTION: jump or throw. Hold it to raise the angle, release it to let go. |
| `C` or `→` | RUN (right) |
| `H` | Event records (top 5 of every event), from the title screen |
| `M` | Sound on or off |
| `P` or `Esc` | Pause during an event |

Alternate the two RUN keys as fast as you can. Pressing the same RUN key twice in a row barely counts.
On phones and tablets three on-screen buttons appear under the screen.

## Events

Each round has the six events in the arcade order. Miss a qualifying mark and the game is over. Clear all
six and the next round starts with tougher marks.

1. **100m dash**: wait for the gun (two false starts and you are out), then run.
2. **Long jump**: run up and press ACTION before the board. Hold it to raise the angle (about 45° is best) and release. You get 3 attempts.
3. **Javelin**: run up, press ACTION before the foul line, hold for the angle, release. You get 3 attempts.
4. **110m hurdles**: run, and press ACTION to jump each hurdle. Hitting one slows you down.
5. **Hammer throw**: press RUN to start spinning. The spin speeds up by itself, and tapping RUN helps. Hold ACTION to raise the angle and release while the dial arrow is green. More than 12 turns is a foul. You get 3 attempts.
6. **High jump**: keep your run-up speed in the green zone, press ACTION close to the bar, and release at a steep angle (about 70°). The bar rises 5 cm after every clearance, and three misses in a row ends the event.

## Scoring

Points use the real decathlon scoring tables (the hammer uses the throws-pentathlon table), so roughly
1000 points is a world-class performance. The score board after each event shows the points adding up.

The top 10 scores are kept in the browser (`localStorage`) with three-letter initials, the country and the
round reached. Each event also keeps its own top 5: a result that makes it asks for your initials and shows
that event's board. Press `H` on the title screen to see the top 5 of every event. Your personal best for each
event is shown before the event.

You can represent 24 countries, listed alphabetically, including Thailand and Vietnam, and four nations with
strong Summer Olympics records: East Germany, Hungary, Cuba and the Netherlands.

## Music

All music is original chiptune written for this game and played live with the Web Audio API: two pulse
channels, a triangle bass and a noise drum channel, like a sound chip of the era.

## Files

- `index.html`: page and canvas (256×224, scaled up with crisp pixels)
- `js/font.js`: 5×7 bitmap font
- `js/audio.js`: music sequencer, songs and sound effects
- `js/gfx.js`: athlete figure, flags and stadium drawing
- `js/events.js`: physics and drawing for the six events, qualifying marks and points
- `js/main.js`: title, country select, score board, initials entry and leaderboard
- `tools/sim.js`: headless check of the event physics, used to tune the qualifying marks (`node tools/sim.js`)
