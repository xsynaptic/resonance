# Waveform data format, version 1

Two binary files describe one track's waveform, and a short string describes it in miniature. A writer in any language can produce them from this document and check its output against the files under `fixtures/v1/`.

- **Peaks**: the minimum, maximum and RMS of every 256 samples, called a pair. A reader fetches it a window at a time with HTTP range requests and draws the waveform from it.
- **Bands**: the level of the low, mid and high bands over every 1,024 samples, called a Frame. A reader fetches it beside the Peaks and tints the waveform from it. Bands are optional.
- **Overview**: the whole track reduced to a few hundred loudness values, small enough to send with the track's other details.

All integers are little-endian. Neither file is compressed, padded or aligned, and neither has a trailer.

## Before reducing

A writer decodes the track and prepares four signals at the source's own sample rate. Nothing in the files records how this was done, and the fixtures start after it, so these rules are the only statement of it.

- **Keep the source's sample rate.** Do not resample. The rate is written to both headers, and a reader derives every time from it.
- **Mix to mono with equal weights**: half the left channel plus half the right. A downmix that preserves power is 1.41 times louder and clips the peaks of a track mastered near full scale.
- **Split the mono mix into three bands** with a fourth-order crossover at 200 Hz and 2,000 Hz: low below 200 Hz, mid between the two, high above 2,000 Hz.

The mono mix feeds the Peaks. The three bands feed the Bands. Samples are floating point, with full scale at 1.0.

## Peaks

A 24-byte header, then three bytes for each pair.

| Offset | Type   | Field            | Value                    |
| ------ | ------ | ---------------- | ------------------------ |
| 0      | uint32 | Version          | 1                        |
| 4      | uint32 | Sample rate      | The source's, in hertz   |
| 8      | uint32 | Samples per pair | 256                      |
| 12     | uint32 | Pair count       | ⌈sample count ÷ 256⌉     |
| 16     | uint32 | Field count      | 3                        |
| 20     | uint32 | Value kind       | 1: minimum, maximum, RMS |

Each pair is three signed bytes, in this order:

| Byte | Field   | From the pair's samples            |
| ---- | ------- | ---------------------------------- |
| 0    | Minimum | The lowest sample                  |
| 1    | Maximum | The highest sample                 |
| 2    | RMS     | The square root of the mean square |

Each value is multiplied by 128, **truncated toward zero**, then clamped to −128 through 127. Truncation, where rounding would be the habit, keeps the RMS at or under the larger peak.

The last pair holds whatever samples remain. Its RMS divides by the number of samples it has, never by 256, and it is not padded with silence.

The file is exactly 24 + pair count × 3 bytes long. Pair `n` starts at byte 24 + `n` × 3, and covers the samples from `n` × 256.

## Bands

A 36-byte header, then three bytes for each Frame.

| Offset | Type   | Field             | Value                  |
| ------ | ------ | ----------------- | ---------------------- |
| 0      | uint32 | Version           | 1                      |
| 4      | uint32 | Sample rate       | The source's, in hertz |
| 8      | uint32 | Samples per Frame | 1,024                  |
| 12     | uint32 | Frame count       | ⌈sample count ÷ 1,024⌉ |
| 16     | uint32 | Band count        | 3                      |
| 20     | uint32 | First band edge   | 200, in hertz          |
| 24     | uint32 | Second band edge  | 2,000, in hertz        |
| 28     | uint32 | Value kind        | 1: RMS in decibels     |
| 32     | uint32 | Decibel range     | 60                     |

Each Frame is three unsigned bytes: low, mid, high. Each is a level, computed from the band's samples in that Frame:

1. Take the mean of the squared samples.
2. If it is exactly zero, the level is **0**. Nothing else writes a 0.
3. Otherwise convert to decibels, 10 × log₁₀(mean square), and scale so that 0 dB is 255 and −60 dB is 0: level = 255 × (1 + decibels ÷ 60).
4. **Round to the nearest integer**, then clamp to 1 through 255.

So 255 is full scale or above, 1 is anything at or below the floor that is not digital silence, and 0 is digital silence alone. A reader may take a Frame of three zeros to mean that nothing has loaded yet, which is why a quiet signal never writes one.

The last Frame holds whatever samples remain and divides by the number it has.

The file is exactly 36 + Frame count × 3 bytes long. Frame `n` starts at byte 36 + `n` × 3.

Both files are cut from one sample count, so the Frame count is always ⌈pair count ÷ 4⌉, and both headers carry the same sample rate.

## Derived facts

A reader never requests a header. Whoever publishes the files hands the reader a descriptor instead: where each body starts, the counts and rates, and two references computed from the finished files. `describeWavedata` returns all of it; a writer in another language computes the same values.

| Fact               | Value                 |
| ------------------ | --------------------- |
| Peaks `byteOffset` | 24                    |
| `pairCount`        | From the Peaks header |
| `pairsPerSecond`   | Sample rate ÷ 256     |
| `rmsRange`         | See below             |
| Bands `byteOffset` | 36                    |
| `frameCount`       | From the Bands header |
| `framesPerSecond`  | Sample rate ÷ 1,024   |
| `bandCount`        | 3                     |
| `minDecibels`      | −60                   |
| `medians`          | See below             |

**`rmsRange`** is a quiet level and a loud level, in the Peaks' own units. Take the RMS byte of every pair above −60 dBFS. A stored RMS of 1 is already −42 dBFS, so that is every pair whose RMS byte is 1 or more. Sort them ascending and take the 10th and the 95th percentiles by nearest rank: with `n` values, the value at position ⌈0.10 × `n`⌉ and the value at position ⌈0.95 × `n`⌉, counting from 1. A track with no such pair has a range of `[0, 0]`.

**`medians`** is one level for each band, low first. For each band take its level byte from every Frame **where that byte is not 0**, and take the median by nearest rank: with `n` values sorted ascending, the value at position ⌈`n` ÷ 2⌉. A band with no sounding Frame has a median of 0. Leaving the silent Frames out is part of the definition: a long silence would otherwise drag the median to the floor.

## Overview

One unsigned byte for each bucket, base64-encoded as a string. Each byte is the bucket's loudness as a share of the loudest bucket, so the loudest is 255 and a silent track is all zeros.

How many buckets there are, and how a bucket's loudness is reduced from the Peaks, is the publisher's choice. A reader decodes the string, divides each byte by 255 and spreads the values evenly across the track.

## Using the fixtures

`fixtures/v1/` holds one small track and everything a correct writer makes of it.

- **`golden.json`** is the input and the expected results.
  - `sampleRate` and `sampleCount`: 44,100 and 2,348, which is nine full pairs and one of 44 samples, and two full Frames and one of 300.
  - `input`: the four signals a writer reduces (`mono`, `low`, `mid`, `high`), each a list of runs. A run is `samples` copies of `value`, as a 32-bit float. They start after the mono mix and the crossover.
  - `fields`: the expected minimum, maximum and RMS of each pair.
  - `levels`: the expected low, mid and high level of each Frame.
  - `facts`: the expected derived facts.
- **`peaks.bin`** is the Peaks file for that input, 54 bytes.
- **`bands.bin`** is the Bands file for that input, 45 bytes.

To test a writer, expand the runs into samples, feed them to the code that reduces samples to pairs and Frames, write both files, and compare each with its `.bin` byte for byte. Feed the samples in chunks that split a sample down the middle if the writer streams. Then compute the derived facts from the files and compare them with `facts`.

Each pair and Frame is there to catch one mistake:

| Pair | Mono input | Min, max, RMS | Catches a writer that |
| --- | --- | --- | --- |
| 0 | 0.5 | 64, 64, 64 | Scales by 127 |
| 1 | −0.25 | −32, −32, 32 | Signs the RMS |
| 2 | 2 | 127, 127, 127 | Wraps instead of clamping |
| 3 | −2 | −128, −128, 127 | Clamps both ends alike |
| 4 | 0 | 0, 0, 0 |  |
| 5 | −0.5 for 128 samples, then 0.75 | −64, 96, 81 | Swaps the fields, or rounds (82) |
| 6 | 0.999 | 127, 127, 127 | Rounds up to 128 |
| 7 | 0.004 | 0, 0, 0 | Lifts a quiet pair off zero |
| 8 | 1 | 127, 127, 127 | Lets full scale overflow |
| 9 | 0.25 for 44 samples | 32, 32, 32 | Pads the short last pair, or divides it by 256 (13) |

| Frame | Low, mid, high input | Levels | Catches a writer that |
| --- | --- | --- | --- |
| 0 | 1, 0.1, 0 | 255, 170, 0 | Writes linear levels, or lifts silence off 0 |
| 1 | 2, 0.00001, 0.001 | 255, 1, 1 | Writes the floor as 0 |
| 2 | 0.1, 0.5, 0.25 for 300 samples | 170, 229, 204 | Truncates (203), or pads the short last Frame |

The expected `rmsRange` is `[32, 127]`: positions 1 and 8 of the eight sounding pairs. The expected `medians` are `[255, 170, 1]`: the high band's silent Frame is left out, so its median is the lower of the two that remain.

The fixtures cannot catch a mistake made before the reduction (a louder downmix, a different crossover, a resample), which is why those rules are written out above. `validateWavedata` checks a finished pair of files for structure: header fields, lengths, the order of each pair's three values, and that the two files agree. It passes a file whose values are scaled or rounded wrongly, which only the fixtures catch.
