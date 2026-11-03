# Ball-drop gravity lab — notes

Experiment 2 (IB Physics Laboratory Manual, ch. 7.2): measure g by filming a ball dropped from rest.
Group: Ryan, Eric, George. Lab done Oct 30.

## What the handout asks for

- **Task 3:** in Tracker, set the measuring stick, track the ball from the frame where it starts to move (t = 0).
- **Task 4 (Excel):** one time column and one position column per run.
  - Adjusted time t_adj = (t_i − t_1) × (fps the file plays at ÷ fps it was filmed at). For example, 960 fps played at 30 fps gives (t_i − t_1)/32. Use whatever matches our camera setting.
  - Smoothed height h_s,i = (h_i−1 + h_i + h_i+1)/3.
  - Average velocity v_i = (h_s,i+1 − h_s,i)/Δt. Ryan's notebook uses the central difference (h_s,i+1 − h_s,i−1)/(t_i+1 − t_i−1). The slope comes out the same either way.
- **Task 5:** graph v against t_adj for each run, linear trendline with equation and R². The slope is −g.
- **Task 6:** table of g for all runs, then the mean and standard deviation.
- The theory section also suggests plotting h against t² (straight line, slope g/2) when v₀ ≈ 0.
- The handout and our notebook write h = v₀ + ½gt². It should be **h = v₀t + ½gt²**.

## Apparatus (from the videos and notebook)

- The ball (green, with holes) hangs on a string from a clamp at the top of a tall ring stand, and is released by hand.
- A wooden metre stick stands upright on the stand's base, right beside the steel rod. Its bottom end sits on
  the base plate; the top is out of frame. The notebook says the stick was marked with tape at 70 cm.
- The camera is on a monopod and doesn't move between clips.

## Frame rate: still to confirm

- George said: 120 fps, not slow motion.
- The notebook and handout photo say 240 fps slow-mo. Ryan's Tracker clip settings use 240 fps (dt 4.17 ms),
  tracking every 2nd frame (his time steps are 1/120 s).
- Settle this from the original files' metadata.

## Received so far: 6 of 10 videos (Nov 3), compressed copies

The copies that came through chat were re-encoded to **30 fps, 640×360 or 960×540, real-time speed**
(67–209 KB each). The fall takes about 12 frames (0.40 s), which matches real time for a drop of about 0.8 m.
Frames are 1/30 s apart. At this resolution the metre stick's markings and the 70 cm tape **can't be read**,
so there is no scale yet.

The ball was tracked by its green colour (`lab/tools/green_track.py`; every detected centre was checked by
eye). The free fall was fitted in pixels (`lab/tools/fit_px.py`), with positions scaled to a 640-wide frame:

| Video | Release frame | Reaches base | Fall time | Points | g (px/s²) | R² |
|---|---|---|---|---|---|---|
| 1 | 17 | 29 | 0.400 s | 11 | 3254 ± 56 | 0.99992 |
| 2 | 4 | 17 | 0.433 s | 12 | 3277 ± 33 | 0.99996 |
| 3 | 30 | 42 | 0.400 s | 11 | 3278 ± 55 | 0.99993 |
| 4 | 28 | 40 | 0.400 s | 11 | 3307 ± 28 | 0.99998 |
| 5 | 17 | 30 | 0.433 s | 12 | 3332 ± 44 | 0.99993 |
| 6 | 4 | 16 | 0.400 s | 11 | 3408 ± 124 | 0.99956 |

Mean 3309 px/s², spread 1.7%. **g in m/s² = (g in px/s²) ÷ (pixels per metre)**, so one scale number finishes
these. Video order: 1 dc95a2e9, 2 e8377417, 3 ca6e7598, 4 ba985988, 5 1f8cb790, 6 37e4371a (upload ids).

## Group's own Tracker results (Ryan's notebook, 10 runs)

g per run: 9.0583, 9.3372, 9.7036, 8.5280, 8.5925, 9.4651, 9.4640, 9.4127, 9.4591, 9.5071 m/s².
Mean 9.25 m/s², SD 0.379 m/s², 5.71% error against 9.81.

## Analysis decisions (Nov 3)

- **30 fps**, as George asked: the clips play in real time, so t_adj = (frame − release frame)/30.
- **Drop height 82.5 cm** from the bottom of the ball to the base plate it lands on (George's measurement).
- **Scale from the drop itself:** the ball centre moves exactly 0.825 m from rest until touchdown. Touchdown is
  where the falling and rebounding parabolas meet (`lab/tools/calibrate.py`); a line drawn at that height sits
  on the base plate in the frames. Per-run scale 372.6–387.6 px/m (640-px frame). Mean **381.3 ± 2.1 px/m**
  is used for all runs, because the camera did not move.
- **George's analysis is independent of Ryan's**: own tracking, own calibration (from the drop height, not the
  metre stick), the handout's forward-difference Vav, plus a first-half / second-half check for air resistance.

## Results so far (6 runs)

| Run | g from Vav–TADJ slope (m/s²) | R² |
|---|---|---|
| 1 | 8.636 | 0.9980 |
| 2 | 8.609 | 0.9994 |
| 3 | 8.749 | 0.9983 |
| 4 | 8.726 | 0.9996 |
| 5 | 8.856 | 0.9983 |
| 6 | 9.067 | 0.9953 |

Mean **8.77 m/s²**, SD 0.17, uncertainty of the mean 0.07 (scale adds about 0.05). **10.6% below 9.81.**

The low value is real physics, not a mistake: fitting a cubic shows the acceleration starts at about
9.5 ± 0.2 m/s² and drops to about 7.8 ± 0.2 m/s² by the time the ball reaches about 3.5 m/s. That matches air
resistance on a light ball with holes. In the workbook, the first half of the fall averages 9.14 m/s² and the
second half 8.66 m/s².

Workbook: `lab/Experiment2_Gravity_George.xlsx`. Rebuild after adding runs with
`python3 lab/tools/build_workbook.py lab/data lab/Experiment2_Gravity_George.xlsx`.

## Still needed

- [ ] The remaining 4 videos (runs 7–10). Same steps: `green_track.py` → `fit_px.py` → `calibrate.py` → `build_workbook.py`
      (add the new run ids to `VIDEO_IDS` in `build_workbook.py`).

## Method summary

1. Convert to metres. h measured downward from the release point, t = 0 at release.
2. Follow Tasks 4–6: t_adj, smoothed h, average velocity, v–t trendline per run, table of g, mean and SD, % error.
3. Second method: h against t² (slope g/2) for each run.
4. Deliver an Excel workbook (one sheet per run with formulas and charts, plus a summary sheet) and notes on
   uncertainty and sources of error.
