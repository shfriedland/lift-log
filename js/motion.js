// Motion: springs, page transitions, and the sheet's open / close / drag behavior.
// The rules followed here (from Apple's fluid-interface guidance): things move like physical objects, start
// from wherever they currently are on screen, keep the finger's speed when let go, and never block input.
"use strict";

const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const motionOff = () => !!(reduceMotion && reduceMotion.matches);

// ---------- springs ----------

// Animate a number with a spring. Unlike a fixed-duration animation it can start at any speed (velocity,
// in units per second) and be stopped at any moment, which is what lets a drag hand off to it seamlessly.
//   response: roughly how long it takes to get there, in seconds (lower = snappier)
//   damping:  1 = settles with no bounce; below 1 = overshoots a little. Bounce only after a flick.
function spring({
  from,
  to,
  velocity = 0,
  response = .4,
  damping = 1,
  onUpdate,
  onDone
}) {
  const stiffness = (2 * Math.PI / response) ** 2,
    friction = 4 * Math.PI * damping / response;
  let x = from,
    v = velocity,
    last = null,
    raf = 0,
    running = true;
  const step = t => {
    if (!running) return;
    const dt = last === null ? 1 / 60 : Math.min(.034, (t - last) / 1000);
    last = t;
    for (let i = 0; i < 4; i++) { // small sub-steps keep the maths stable
      const h = dt / 4;
      v += (-stiffness * (x - to) - friction * v) * h;
      x += v * h
    }
    if (Math.abs(x - to) < .5 && Math.abs(v) < 12) {
      running = false;
      onUpdate(to);
      if (onDone) onDone();
      return
    }
    onUpdate(x);
    raf = requestAnimationFrame(step)
  };
  raf = requestAnimationFrame(step);
  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf)
    },
    get velocity() {
      return running ? v : 0
    }
  }
}

// Where a flick would coast to if nothing stopped it (same maths as iOS scroll deceleration).
const projectMomentum = (velocity, rate = .998) => (velocity / 1000) * rate / (1 - rate);

// Finger speed (px per second) from recent positions. If the finger rested before lifting, it's 0.
function releaseVelocity(track, endTime, key) {
  const a = track[0],
    b = track[track.length - 1];
  if (!a || !b || b.t <= a.t || endTime - b.t > 80) return 0;
  return (b[key] - a[key]) / ((b.t - a.t) / 1000)
}

// Dragging past a limit: follow the finger less and less instead of stopping dead.
const rubberband = (over, size, c = .55) => (over * size * c) / (size + c * Math.abs(over));

// ---------- page transitions ----------

// How deep a page is: 0 for a tab's list, 1 for something opened from it.
function pageDepth(v) {
  return ({
    log: v.workoutId,
    ex: v.exerciseId,
    rt: v.routineId,
    cd: v.cardioId
  } [v.tab]) ? 1 : 0
}

// Which way the page change should animate: 'forward' (slide in from the right),
// 'back' (slide out to the right), 'fade' (switching tabs) or '' (no animation).
function navDirection(from, to) {
  const d1 = pageDepth(from),
    d2 = pageDepth(to);
  if (from.tab !== to.tab) return d2 > d1 ? 'forward' : 'fade';
  if (d2 > d1) return 'forward';
  if (d2 < d1) return 'back';
  return ''
}

function fadeInPage() {
  const main = $('#main');
  main.classList.remove('fadeIn');
  void main.offsetWidth; // restart the animation if it was already running
  main.classList.add('fadeIn')
}

// Run a page change with its animation.
// Tab switches fade the new page in. Opening and going back slide: the old page is kept for a moment as a
// lifeless copy (.pageGhost) and animated out while the real #main animates in. The top bar and tab bar are
// untouched, so their glass stays live while the pages move underneath.
// With iOS Reduce Motion on, every page change is a short plain fade instead (see styles.css).
function withTransition(dir, update) {
  const main = $('#main');
  if (!dir || !main.animate) return update();
  if (dir === 'fade' || motionOff()) {
    update();
    fadeInPage();
    return
  }
  // If a slide is still running, the outgoing page starts from where it is right now, not from rest.
  const cs = getComputedStyle(main),
    live = {
      transform: cs.transform,
      opacity: cs.opacity
    },
    shift = cs.transform === 'none' ? 0 : new DOMMatrix(cs.transform).m41;
  const r = main.getBoundingClientRect();
  document.querySelectorAll('.pageGhost').forEach(g => g.remove());
  main.getAnimations().forEach(a => a.cancel());
  main.classList.remove('pageCover', 'fadeIn');

  const ghost = main.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  ghost.className = 'pageGhost';
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    top: r.top + 'px',
    left: (r.left - shift) + 'px',
    width: r.width + 'px'
  });
  main.before(ghost);
  update();

  const opts = {
    duration: 480,
    easing: 'cubic-bezier(.32, .72, 0, 1)', // the iOS push curve: quick to start, long gentle settle
    fill: 'forwards'
  };
  const offRight = {
      transform: 'translateX(100%)',
      opacity: 1
    },
    inPlace = {
      transform: 'none',
      opacity: 1
    },
    tuckedLeft = {
      transform: 'translateX(-25%)',
      opacity: 0
    };
  // The page on top gets a solid backdrop (.pageCover) so the one underneath doesn't show through it.
  const top = dir === 'forward' ? main : ghost;
  top.classList.add('pageCover');
  let anims;
  if (dir === 'forward') anims = [main.animate([offRight, inPlace], opts), ghost.animate([live, tuckedLeft], opts)];
  else anims = [main.animate([tuckedLeft, inPlace], opts), ghost.animate([live, offRight], opts)];
  Promise.all(anims.map(a => a.finished)).then(() => {
    ghost.remove();
    main.classList.remove('pageCover');
    anims[0].cancel()
  }).catch(() => {}) // a newer page change took over
}

// ---------- sheet: spring up, spring down, drag to dismiss ----------

// y is how far the sheet is pushed down from its resting place, in px (0 = fully open).
const sheetMotion = {
  y: 0,
  anim: null,
  closing: false,
  drag: null,
  flick: 0
};
const sheetTravel = () => $('#sheet').offsetHeight + 24; // distance to get it fully off screen

function setSheetY(y) {
  sheetMotion.y = y;
  $('#sheet').style.transform = y ? `translateY(${y}px)` : '';
  // the dimming behind follows the sheet, so it fades as you drag it away
  const gone = Math.min(1, Math.max(0, y / sheetTravel()));
  $('#sheetWrap').style.backgroundColor = `rgba(0, 0, 0, ${(.45 * (1 - gone)).toFixed(3)})`
}

function stopSheetAnim() {
  const v = sheetMotion.anim ? sheetMotion.anim.velocity : 0;
  if (sheetMotion.anim) sheetMotion.anim.stop();
  sheetMotion.anim = null;
  return v
}

function springSheet(to, opts, onDone) {
  const velocity = opts.velocity !== undefined ? opts.velocity : stopSheetAnim();
  stopSheetAnim();
  sheetMotion.anim = spring({
    from: sheetMotion.y,
    to,
    velocity,
    response: opts.response,
    damping: opts.damping,
    onUpdate: setSheetY,
    onDone() {
      sheetMotion.anim = null;
      if (onDone) onDone()
    }
  })
}

// Show the sheet. If it's already open this only swaps the content; if it was on its way out, it turns round.
function showSheet() {
  const wrap = $('#sheetWrap'),
    wasOn = wrap.classList.contains('on');
  wrap.classList.add('on');
  wrap.classList.remove('closing');
  if (motionOff()) {
    stopSheetAnim();
    sheetMotion.closing = false;
    setSheetY(0);
    return
  }
  if (wasOn && !sheetMotion.closing) return;
  if (!wasOn) setSheetY(sheetTravel());
  sheetMotion.closing = false;
  springSheet(0, {
    response: .42,
    damping: 1
  })
}

// Hide the sheet: it leaves the way it came, downward, carrying any flick speed with it.
function hideSheet() {
  const wrap = $('#sheetWrap');
  const flick = sheetMotion.flick;
  sheetMotion.flick = 0;
  if (!wrap.classList.contains('on')) return;
  const finish = () => {
    wrap.classList.remove('on', 'closing');
    sheetMotion.closing = false;
    stopSheetAnim();
    setSheetY(0);
    wrap.style.backgroundColor = ''
  };
  if (motionOff()) return finish();
  sheetMotion.closing = true;
  wrap.classList.add('closing'); // taps pass through to the page while it slides away
  springSheet(sheetTravel(), {
    response: .36,
    damping: 1,
    velocity: flick || undefined
  }, finish)
}

// Dragging the grabber at the top of the sheet: it follows the finger 1:1, resists being pulled up,
// and on release either springs back or is thrown shut, depending on where the flick would carry it.
document.addEventListener('pointerdown', e => {
  if (e.target.id !== 'sheetGrab' || sheetMotion.closing) return;
  stopSheetAnim(); // grab it mid-flight: it stays exactly where it is
  try {
    e.target.setPointerCapture(e.pointerId)
  } catch (x) {}
  sheetMotion.drag = {
    id: e.pointerId,
    offset: e.clientY - sheetMotion.y, // respect where it was grabbed
    track: [{
      y: e.clientY,
      t: e.timeStamp
    }]
  }
});
document.addEventListener('pointermove', e => {
  const d = sheetMotion.drag;
  if (!d || e.pointerId !== d.id) return;
  let y = e.clientY - d.offset;
  if (y < 0) y = -rubberband(-y, sheetTravel());
  setSheetY(y);
  d.track.push({
    y: e.clientY,
    t: e.timeStamp
  });
  while (d.track.length > 2 && e.timeStamp - d.track[0].t > 100) d.track.shift() // speed over the last 0.1s
});
['pointerup', 'pointercancel'].forEach(type => document.addEventListener(type, e => {
  const d = sheetMotion.drag;
  if (!d || e.pointerId !== d.id) return;
  sheetMotion.drag = null;
  const velocity = releaseVelocity(d.track, e.timeStamp, 'y'); // downward is positive
  const landing = sheetMotion.y + projectMomentum(velocity);
  if (type === 'pointerup' && landing > sheetTravel() * .5) {
    sheetMotion.flick = Math.max(0, velocity);
    haptic();
    closeSheet()
  } else springSheet(0, {
    response: .34,
    damping: .8, // a little bounce is right here: a finger just let go of it
    velocity
  })
}));

// iOS only shows :active (pressed) styles when something is listening for touches.
document.addEventListener('touchstart', () => {}, {
  passive: true
});

// ---------- haptics ----------

// A light tap you feel, for a few meaningful moments only: a long-press menu opening, a sheet thrown shut,
// a swipe-back that commits. iPhones don't let web pages vibrate, but iOS 18+ Safari plays its own haptic when
// a switch-style checkbox is toggled, so a hidden one is toggled here. Android uses the Vibration API.
// Older iPhones simply get nothing.
let hapticLabel = null;

function haptic() {
  try {
    if (navigator.vibrate && !/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      navigator.vibrate(12);
      return
    }
    if (!hapticLabel) {
      hapticLabel = document.createElement('label');
      hapticLabel.setAttribute('aria-hidden', 'true');
      hapticLabel.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-10px;top:0';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.setAttribute('switch', '');
      box.tabIndex = -1;
      hapticLabel.appendChild(box);
      document.body.appendChild(hapticLabel)
    }
    hapticLabel.click()
  } catch (e) {}
}

// ---------- swipe from the left edge to go back ----------

// On a page opened from a list (a workout, an exercise, a routine), dragging from the left edge of the
// screen pulls the page to the right with the finger, revealing the list underneath. Let go past halfway
// (or with a flick) and it finishes going back; otherwise it springs back into place. You can change your
// mind at any point during the drag.
const EDGE = 24; // how close to the left edge the drag must start, in px
const swipe = {
  touch: null,
  anim: null
};

function backState() {
  return ({
    log: {
      workoutId: null
    },
    ex: {
      exerciseId: null
    },
    rt: {
      routineId: null
    },
    cd: {
      cardioId: null
    }
  })[view.tab] || null
}

// Build a lifeless copy of the list page to sit underneath while the current page is dragged away.
function makeUnderPage() {
  const list = ({
    log: vLog,
    ex: vExList,
    rt: vRoutines,
    cd: vCardioList
  })[view.tab];
  const main = $('#main'),
    r = main.getBoundingClientRect();
  const under = document.createElement('div');
  under.className = 'pageUnder';
  under.setAttribute('aria-hidden', 'true');
  under.innerHTML = list();
  under.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  Object.assign(under.style, {
    top: main.offsetTop + 'px', // where the list's first row sits when it's scrolled to the top
    left: r.left + 'px',
    width: r.width + 'px'
  });
  main.before(under);
  return under
}

// x = how far the page has been pulled right, in px.
function setSwipeX(x) {
  const s = swipe.touch;
  if (!s) return;
  s.x = x;
  const w = s.width,
    p = Math.min(1, Math.max(0, x / w));
  $('#main').style.transform = x ? `translateX(${x}px)` : '';
  // the list underneath moves at a quarter of the speed and brightens as it's uncovered
  s.under.style.transform = `translateX(${(-25 * (1 - p)).toFixed(2)}%)`;
  s.under.style.opacity = (.35 + .65 * p).toFixed(3)
}

function endSwipe(committed) {
  const s = swipe.touch;
  swipe.touch = null;
  swipe.anim = null;
  const main = $('#main');
  main.style.transform = '';
  main.classList.remove('pageCover', 'swiping');
  s.under.remove();
  if (committed) {
    Object.assign(view, backState());
    openNotes.clear();
    render();
    scrollToTop()
  }
}

document.addEventListener('touchstart', e => {
  if (swipe.touch || e.touches.length !== 1 || motionOff()) return;
  const t = e.touches[0];
  if (t.clientX > EDGE || !pageDepth(view) || $('#sheetWrap').classList.contains('on')) return;
  if (document.querySelector('.pageGhost')) return; // a page slide is still running
  swipe.touch = {
    id: t.identifier,
    x0: t.clientX,
    y0: t.clientY,
    x: 0,
    active: false,
    track: [],
    width: window.innerWidth
  }
}, {
  passive: true
});

document.addEventListener('touchmove', e => {
  const s = swipe.touch;
  if (!s) return;
  const t = [...e.touches].find(x => x.identifier === s.id);
  if (!t) return;
  const dx = t.clientX - s.x0,
    dy = t.clientY - s.y0;
  if (!s.active) {
    // wait ~10px to see whether this is a sideways swipe or a scroll
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) {
      swipe.touch = null;
      return
    }
    s.active = true;
    s.offset = dx; // respect where the finger is, so the page doesn't jump
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    s.under = makeUnderPage();
    $('#main').classList.add('pageCover', 'swiping')
  }
  e.preventDefault(); // this is our gesture now: don't scroll the page
  setSwipeX(Math.max(0, dx - s.offset));
  s.track.push({
    x: t.clientX,
    t: e.timeStamp
  });
  while (s.track.length > 2 && e.timeStamp - s.track[0].t > 100) s.track.shift()
}, {
  passive: false
});

function releaseSwipe(cancelled, endTime) {
  const s = swipe.touch;
  if (!s) return;
  if (!s.active) {
    swipe.touch = null;
    return
  }
  const velocity = releaseVelocity(s.track, endTime, 'x');
  const commit = !cancelled && s.x + projectMomentum(velocity) > s.width / 2;
  if (commit) haptic();
  swipe.anim = spring({
    from: s.x,
    to: commit ? s.width : 0,
    velocity,
    response: commit ? .32 : .36,
    damping: 1,
    onUpdate: setSwipeX,
    onDone: () => endSwipe(commit)
  })
}
document.addEventListener('touchend', e => releaseSwipe(false, e.timeStamp));
document.addEventListener('touchcancel', e => releaseSwipe(true, e.timeStamp));
