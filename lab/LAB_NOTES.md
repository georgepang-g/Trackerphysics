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

## FINAL: 10 original videos at 120 fps (Nov 3)

- George sent the originals: IMG_3041, IMG_3049–IMG_3057. iPhone 17 Pro Max, HEVC 3840×2160, **120 fps in real time**
  (frames 8.33 ms apart; not slow motion). All ten are clips cut from one long recording (Oct 30, 1:21 pm).
- The clips were trimmed on the phone: the files keep the cut frames hidden behind an edit list, so frame times are
  read from the decoded frames (`hi_track.py`). Within the shown frames every gap is 8.3 ms.
- **IMG_3041 is a duplicate of IMG_3055** (same drop; tracked positions identical to 0.0 px). It is left out, so
  the analysis has **9 unique drops**. Every other pair of clips differs.
- Pipeline: `hi_track.py` (track the green ball at half resolution in a strip around its path; every centre checked
  by eye) → `hi_analyze.py` (release, touchdown, scale) → `build_workbook.py runs_120fps.json … IMG_3041`.
  Data in `lab/data/runs_120fps.json` and `lab/data/120fps/`.
- Scale from the 82.5 cm drop: per run 2239.9–2288.7 px/m in the 4K frame; mean **2263.3 px/m (±0.3%)**.
- The wooden metre stick's markings face away from the camera, so they can't be used as a check.

## Results (9 runs, 120 fps) — final

| Run | Video | g (m/s²) | R² | g first half | g second half |
|---|---|---|---|---|---|
| 1 | IMG_3049 | 8.623 | 0.9901 | 9.34 | 7.11 |
| 2 | IMG_3050 | 8.777 | 0.9980 | 9.13 | 8.19 |
| 3 | IMG_3051 | 8.886 | 0.9981 | 9.22 | 8.53 |
| 4 | IMG_3052 | 8.681 | 0.9971 | 9.11 | 8.07 |
| 5 | IMG_3053 | 9.059 | 0.9985 | 9.15 | 8.94 |
| 6 | IMG_3054 | 9.125 | 0.9982 | 9.43 | 9.10 |
| 7 | IMG_3055 | 8.849 | 0.9982 | 9.21 | 8.33 |
| 8 | IMG_3056 | 8.952 | 0.9975 | 9.22 | 8.51 |
| 9 | IMG_3057 | 9.094 | 0.9983 | 9.17 | 8.99 |

Mean **8.89 m/s²**, SD 0.18, uncertainty of the mean 0.06 (scale adds 0.02). **9.3% below 9.81.**
In every run the second half of the fall has a smaller acceleration than the first half (means 9.22 → 8.42 m/s²):
air resistance on the light ball with holes. Fall time from release to touchdown is about 0.40–0.42 s.

The earlier 30 fps analysis of compressed copies (6 runs, mean 8.77 m/s²) is superseded; its data stays in
`lab/data/` (track_run*.json, fits_px.json, calibration.json).

## Method summary

1. Convert to metres. h measured downward from the release point, t = 0 at release.
2. Follow Tasks 4–6: t_adj, smoothed h, average velocity, v–t trendline per run, table of g, mean and SD, % error.
3. Second method: h against t² (slope g/2) for each run.
4. Deliver an Excel workbook (one sheet per run with formulas and charts, plus a summary sheet) and notes on
   uncertainty and sources of error.
