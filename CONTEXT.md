# car-volleyball

The glossary, copied from the training repo's `CONTEXT.md` (rocket-league-bot) on 2026-10-27. Terms both repos use keep the same meaning in both.

## Language

**Browser game**:
The car-volleyball game in this repo, run entirely in the player's browser. Volleyball, not soccer, is the game the public plays.
_Avoid_: web app, website (the site is only the host)

**Volleyball track**:
Training the car-volleyball bot in the training repo, run with the full stage process but numbered separately from Phase 3 (volleyball stage 1, 2, …) so cross-stage comparisons never mix the two games.
_Avoid_: stage 16 (implies Phase 3 numbering), volleyball mode (implies a toggle on the soccer bot)

**Rally**:
Play from a serve until the ball first touches the floor. A ball landing inside the court lines scores for the player whose side it didn't land on; one landing outside scores against whoever touched it last. A ball off the net stays in play.
_Avoid_: point (the score a rally produces)

**Serve**:
The start of every rally: the ball rests on a tee, 250 uu up and 1000 uu in front of the server's spawn, until the server strikes it. The server's shot clock starts at once, so an untouched tee loses the rally. The winner of the previous rally serves.
_Avoid_: kickoff (the soccer race for a ball on the centre spot), drop serve (the rejected first design)

**Crossing**:
A car's centre passing the plane of the net, extended upward without limit. The car explodes and respawns on its own side at once; the rally goes on.
_Avoid_: net touch (touching the net is not a fault), fault (crossing never ends a rally)

**Touch limit**:
The match setting for how many touches a player may make before the ball must cross the net, counting each separate contact, with held contact counting once. Unlimited by default.
_Avoid_: hit limit

**Shot clock**:
The time a player has, from their first touch on their side of the net, to send the ball back over; when it runs out, the rally is lost. It stops and resets when the ball crosses the net. The serve's clock runs from the start of the rally instead, since an untouched tee never falls. A match setting, and part of what the bot observes.
_Avoid_: stall timer (that names the soccer training guard, which ends an episode without scoring)

**Soccer harness**:
The browser game's pipeline running an existing soccer milestone on the real dumped arena meshes, at the gravity and boost consumption that milestone trained at, locally only, to prove the port against a bot already trusted. Never published.
_Avoid_: soccer mode, soccer demo (both imply something players see)

**Web release**:
The policy network alone, taken from a milestone and labelled with that milestone's name, in the form the browser game loads. Only finished milestones become web releases, never in-progress checkpoints.
_Avoid_: export (also covers the scratch exports used while testing), deployment (Phase 6 means RLBot)

**Parity fixture**:
Recorded data from Python RocketSim that the browser game must reproduce: observations from game states, action probabilities from observations, the next state after one physics step from a set state and controls, and the volleyball rules' events (points and why, crossings, the shot clock) over recorded play.
_Avoid_: golden file, test data (too generic)
