/** Fixed-timestep loop: update at a constant step, render with interpolation. */
export function createLoop({ step = 1 / 60, update, render, maxSteps = 5 }) {
  let acc = 0, last = 0, raf = 0, running = false;
  let fps = 60, fpsAcc = 0, fpsFrames = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25; // tab was hidden or a long hitch
    acc += dt;
    let n = 0;
    while (acc >= step && n < maxSteps) { update(step); acc -= step; n++; }
    if (n === maxSteps) acc = 0;
    fpsAcc += dt; fpsFrames++;
    if (fpsAcc >= 0.5) { fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0; }
    render(acc / step, dt);
  }
  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    get fps() { return fps; },
  };
}
