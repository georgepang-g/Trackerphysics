# TrackerPhysics

A browser app for a free-fall video lab, in the spirit of the
[Tracker](https://physlets.org/tracker/) video analysis tool. Open a video of a
falling ball. The app tracks the ball on every frame, converts its position to
metres, plots height against time, and fits a parabola to measure **g**.

Everything runs in the browser. Videos are never uploaded anywhere.

## Run it

No install or build step is needed.

- **Locally:** download the repository and double-click `index.html`.
- **Online:** turn on GitHub Pages for this repository (Settings → Pages → deploy
  from branch, root folder) and share the link with your class.

It opens with a demo clip (a synthetic 120 fps drop past a metre stick) that has
already been tracked, so you can see the whole workflow before you film anything.

## Doing the lab

1. **Film the drop.**
   - Put the camera on a tripod, level, and square to the wall. Don't zoom or move it during the clip.
   - Put a metre stick (or anything of known length) in the frame, **at the same distance from the
     camera as the ball's path**. If it is nearer or farther, the scale will be wrong (parallax).
   - Use the highest frame rate your phone offers (slow-motion 120 or 240 fps is ideal), bright light,
     and a ball that contrasts with the background.
2. **Open the video** with *Open video…* or drag it onto the page. The frame rate is detected
   automatically. For slow-motion clips, set *Real capture rate* to the rate the camera recorded at
   (for example 240). Time is computed from this rate.
3. **Scale:** drag the ends of the blue stick onto the ends of the metre stick and type its real length.
4. **Origin:** drag the axes to the floor. Then y is the ball's height above the floor, with y pointing up.
5. **Track:** step to a frame just after the ball is released, choose *Pick ball*, and click the ball.
   Tracking runs to the end frame. *Auto-find ball* finds the moving ball for you instead.
   - If the ball is lost (it hits the floor, leaves the frame, or is hidden), tracking stops and says
     where. Click the ball again on that frame to carry on.
   - Choose which frames to use under *Track and fit*: type a *Start frame* and *End frame*, or press
     *Use this frame* to take the frame on screen. Tracking stops at the end frame, and the fit uses only
     these frames, so you can leave out the moments before release and after the bounce. Points outside
     the range are greyed out and left out of the fit.
   - To go to a frame, type its number in the *Frame* box, drag the slider, or use the step buttons
     and the ← → keys (Shift steps 10 frames).
   - Drag a point with *Move* to correct it, or use *Mark by hand* to click the ball yourself frame by frame.
6. **Read the result.** The panel shows g with its standard error from the least-squares fit, the percent
   difference from the accepted value, and a cross-check of g from the slope of v<sub>y</sub>(t).
   *Copy CSV* / *Download CSV* export the data table for a spreadsheet.

### How g is measured

With y up, a freely falling ball follows

    y(t) = y₀ + v₀·t − ½·g·t²

The app fits `y = c₀ + c₁·t + c₂·t²` by least squares, so **g = −2·c₂**. The ± value is
2 × the standard error of c₂. The release doesn't need to be on camera: the fit finds the initial
velocity v₀ as well.

The cross-check computes v<sub>y</sub> on each frame by central differences and fits a straight line.
Its slope is −g.

### How the tracking works

- **Template match** (default): after you click the ball, the app finds its edge to measure its radius,
  then saves the pixels around it as a template. On each next frame it predicts where the ball will be
  from its velocity and acceleration so far, searches a window around that point for the best colour
  match, and refines the match to sub-pixel accuracy. The template adapts slowly (*Template update*)
  so it can follow changes in lighting.
- **Colour blob**: finds all pixels close to the ball's colour near the predicted position and takes their
  centre. It copes better with motion blur. The colour comparison ignores shading, so the lit and shadowed
  sides of the ball both count.
- **Auto-find**: compares the current frame with frames just before and after it. Whatever differs from
  both is the moving ball.

## Project layout

| File | What it does |
|---|---|
| `index.html`, `css/style.css` | Page and styles |
| `js/app.js` | UI: video frames, scale and axes, tracking loop, graphs, table, export |
| `js/tracker.js` | Ball detection and tracking on raw pixel data |
| `js/physics.js` | Least-squares polynomial fit and free-fall analysis |
| `js/demo.js` | Synthetic demo clip with a known g of 9.81 m/s² |
| `js/charts.js` | Canvas graphs |
| `tests/run-tests.js` | Node tests: fitting, and tracking the demo clip end to end |

Run the unit tests with `node tests/run-tests.js`.

The browser test opens real video files through the page and sets points the way a student
would: the file picker, drag and drop, dragging the scale and origin, clicking the ball, marking
by hand, moving and deleting points, and the frame keys. It needs Python with numpy, ffmpeg and
Playwright:

    python3 tests/browser/make_clips.py /tmp/clips   # test clips with known motion
    node tests/browser/e2e.js /tmp/clips

The clips cover H.264 MP4, MOV with audio, VP9 WebM, 4K, a portrait phone clip with rotation
metadata, and a 240 fps slow-motion clip saved at 30 fps. Each run checks the tracked positions
against the true ball and g against 9.81 m/s².

## Limits

- The axes are horizontal and vertical in the image, so the camera must be level.
- The scale is the same over the whole frame. Lens distortion near the edges of wide-angle
  phone cameras and parallax both add error. Keep the drop near the middle of the frame.
- Very large videos are scaled down to 1920 px wide before tracking.
- The browser must be able to play the video. iPhones record HEVC by default, which Safari plays
  but some other browsers don't. If a clip won't open, set the iPhone camera to *Most Compatible*
  (Settings → Camera → Formats), or convert the clip to MP4 (H.264).
