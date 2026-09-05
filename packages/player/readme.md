# @xsynaptic/player

A React music player for streaming long mixes: a persistent bar with transport, a waveform seek surface, a queue tray with shuffle, volume, a signal display, Media Session integration and play-time loudness normalization.

The host maps its catalog onto `QueueItem` and supplies `PlayerUrls` to resolve a track's stream and waveform, so the package never sees the host's own types or routes. All copy arrives through `PlayerLabels`. Colours and spacing are the `--player-*` custom properties in `player.css`, redeclared by the host on `.player-bar`.

Playback runs one media element inside a Web Audio graph (normalization gain, analyser, volume gain), which keeps progressive streaming and native seeking while allowing volume control where `element.volume` is read-only.
