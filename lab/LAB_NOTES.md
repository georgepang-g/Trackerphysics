# Ball-drop gravity lab — notes

Working notes for analysing the ball-drop videos.

## Known so far

| Item | Value | Notes |
|---|---|---|
| Number of videos | 10 | One drop per video (to confirm) |
| Recording mode | Normal video at 120 fps, **not slow motion** | So the file rate and the real rate are the same: time per frame = 1/120 s ≈ 8.3 ms |
| Videos received | not yet | Will be sent later |

The actual frame rate will be read from each file's timestamps, because phones often record at
119.88 fps or a slightly variable rate rather than exactly 120.

## Still needed

- [ ] The 10 videos (upload to `lab/videos/` in this repo, or a Google Drive folder)
- [ ] The lab handout or question: what to calculate, which tables and graphs, the report format
- [ ] Drop height for each trial, from the bottom of the ball to the floor, and how precisely it was measured (e.g. ±0.5 cm)
- [ ] Whether the heights were all the same or different between trials
- [ ] Whether a metre stick or other known length is visible in the videos
- [ ] Accepted value of g to compare against (9.81 m/s² unless the teacher gives a local value)

## Plan once everything is in

1. For each video, read the true frame rate, then find the **release frame** (last frame before the
   ball moves) and the **landing frame** (first frame touching the floor). Check both by eye on the
   extracted frames.
2. Fall time t = (landing − release) / frame rate; g = 2h/t² with its uncertainty.
3. Track the ball through the fall and fit y(t) = y₀ + v₀t − ½gt² as a second estimate
   (needs a known length in the shot for the scale, or uses the measured drop height as the scale).
4. Combine the 10 trials: mean g, standard deviation, standard error, % error against the accepted value.
5. If the heights differ: plot h against t² for all trials. It is a straight line with slope g/2.
6. Deliver a per-trial table, the summary, graphs and CSV files, plus notes on method and error sources.

## Expected precision at 120 fps

Each frame mark is uncertain by about half a frame, so the fall time is uncertain by about one frame
(8.3 ms). For a 1 m drop (t ≈ 0.45 s) that alone is about ±4% in g for a single trial. Averaging
10 trials brings the random part down to roughly ±1%. Higher drops give better precision.
