import { heightAt } from "./terrain.js";

const REST = {
  rShoulderX: 0, rShoulderZ: -0.12, rElbowX: -0.15,
  lShoulderX: 0, lShoulderZ: 0.12, lElbowX: -0.15,
  rLegX: 0, lLegX: 0, torsoX: 0, headX: 0, headY: 0, bodyY: 0,
};


function pose(c, overrides) {
  Object.assign(c.target, REST, overrides);
}

// Look at the player when they're close (or mid-conversation).
function attend(c, ctx, range = 5) {
  if (ctx.dist > range && !ctx.talking) return false;
  c.lookAt(ctx.player.x, ctx.player.y + 1.6, ctx.player.z);
  return true;
}

function turnToHeading(c, heading, dt, rate = 2) {
  const d = Math.atan2(Math.sin(heading - c.heading), Math.cos(heading - c.heading));
  c.heading += d * Math.min(1, dt * rate);
}

function wave(c, t) {
  c.target.rShoulderZ = -2.6;
  c.target.rShoulderX = -0.2;
  c.target.rElbowX = -0.5 + Math.sin(t * 10) * 0.35;
}

// Sayo sweeps the approach, then stops to wave when someone arrives.
function sweeper(m, ctx) {
  const c = m.character, s = c.state, { t, dt, player } = ctx;
  if (ctx.talking || ctx.dist < 4.5) {
    pose(c, { rShoulderX: -0.35, rElbowX: -0.5, lShoulderX: -0.4, lElbowX: -0.6, rShoulderZ: 0.1, lShoulderZ: -0.15 });
    c.turnTowards(player.x, player.z, dt, 3);
    if (!s.greeted && !ctx.talking) {
      s.greeted = true;
      s.waveUntil = t + 1.6;
      c.emote("♪");
      ctx.sound.pop();
    }
    if (t < s.waveUntil) wave(c, t);
    if (!ctx.talking) c.expression = t < s.waveUntil ? "happy" : "neutral";
    c.broom.rotation.z *= 0.9;
    attend(c, ctx);
  } else {
    if (ctx.dist > 12) s.greeted = false;
    const sw = Math.sin(t * 2.4);
    pose(c, {
      rShoulderX: -0.55 + sw * 0.2, lShoulderX: -0.75 + sw * 0.2, rShoulderZ: 0.3, lShoulderZ: -0.3,
      rElbowX: -0.5, lElbowX: -0.35, torsoX: 0.12, headX: 0.25,
    });
    c.broom.rotation.z = sw * 0.35;
    turnToHeading(c, c.home.heading + Math.sin(t * 0.15) * 0.6, dt);
    c.expression = "neutral";
  }
}

// Hana bows to arriving guests, tray in hand.
function host(m, ctx) {
  const c = m.character, s = c.state, { t, dt, player } = ctx;
  const tray = { rShoulderX: -0.25, rElbowX: -1.35, rShoulderZ: -0.05 };
  if (ctx.talking || ctx.dist < 6) {
    c.turnTowards(player.x, player.z, dt, 3);
    if (!s.greeted) {
      s.greeted = true;
      s.bowUntil = t + 1.3;
    }
    if (t < s.bowUntil) {
      pose(c, { ...tray, torsoX: 0.45, headX: 0.25, lShoulderX: 0.1, lElbowX: -0.2 });
      if (!ctx.talking) c.expression = "happy";
    } else {
      if (!s.bowDone) {
        s.bowDone = true;
        c.emote("♪");
        c.sparkle();
        ctx.sound.sparkle();
      }
      pose(c, tray);
      attend(c, ctx, 6);
      if (!ctx.talking) c.expression = "happy";
    }
  } else {
    if (ctx.dist > 14) s.greeted = s.bowDone = false;
    pose(c, { ...tray, headY: Math.sin(t * 0.4) * 0.3 });
    turnToHeading(c, c.home.heading, dt);
    c.expression = "neutral";
  }
}

// Mio paints at her easel and hums; she only turns around to chat.
function painter(m, ctx) {
  const c = m.character, s = c.state, { t, dt, player } = ctx;
  const palette = { lShoulderX: -0.55, lElbowX: -1.1, lShoulderZ: 0.2 };
  if (ctx.talking) {
    c.turnTowards(player.x, player.z, dt, 2.5);
    pose(c, { ...palette, rShoulderX: -0.2, rElbowX: -0.6 });
    attend(c, ctx);
    return;
  }
  turnToHeading(c, c.home.heading, dt);
  pose(c, {
    ...palette,
    rShoulderX: -1.25 + Math.sin(t * 1.3) * 0.1,
    rShoulderZ: -0.15 + Math.sin(t * 2.2) * 0.12,
    rElbowX: -0.45 + Math.sin(t * 3.1) * 0.1,
    headY: Math.sin(t * 0.5) * 0.15,
    headX: 0.05,
  });
  attend(c, ctx, 3.5);
  c.expression = "neutral";
  s.hum = (s.hum ?? 6) - dt;
  if (s.hum < 0) {
    s.hum = 10 + Math.random() * 8;
    c.emote("♪");
  }
}

// Rin dozes against the camphor tree. She was not asleep. She'll tell you.
function sleeper(m, ctx) {
  const c = m.character, s = c.state, { t, dt } = ctx;
  const sit = {
    rLegX: -1.45, lLegX: -1.4, bodyY: -0.78, torsoX: -0.2,
    rShoulderX: -0.45, lShoulderX: -0.4, rElbowX: -0.8, lElbowX: -0.85, rShoulderZ: 0.05, lShoulderZ: -0.05,
  };
  s.asleep ??= true;
  if (s.asleep) {
    pose(c, { ...sit, headX: 0.4, headY: 0.15 });
    c.expression = "sleep";
    if (c.emoteType !== "zzz" || !c.emoteSprite.visible) c.emote("zzz", 3);
    if (ctx.dist < 4.2 || ctx.talking) {
      s.asleep = false;
      s.startled = t + 1.4;
      c.emote("!", 1.6);
      ctx.sound.pop();
    }
    return;
  }
  pose(c, sit);
  attend(c, ctx, 9);
  if (!ctx.talking) c.expression = t < s.startled ? "flustered" : "neutral";
  s.away = ctx.dist > 12 ? (s.away ?? 0) + dt : 0;
  if (s.away > 6) {
    s.asleep = true;
    s.away = 0;
  }
}

// Kiko runs her delivery route back and forth, slowing down near people.
function runner(m, ctx) {
  const c = m.character, s = c.state, { t, dt, player } = ctx;
  const route = m.route, p = c.root.position;
  s.i ??= 1;
  s.dir ??= 1;
  s.pause ??= 0;
  s.phase ??= 0;

  let speed = 4.3;
  if (ctx.talking) speed = 0;
  else if (ctx.dist < 5) {
    speed = 1.5;
    if (!s.warned) {
      s.warned = true;
      c.emote("sweat", 1.6);
      ctx.sound.pop();
    }
  } else if (ctx.dist > 10) s.warned = false;
  if (s.pause > 0) {
    s.pause -= dt;
    speed = 0;
  }

  if (speed > 0) {
    const [tx, tz] = route[s.i];
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d < 0.3) {
      if (s.i + s.dir < 0 || s.i + s.dir >= route.length) {
        s.dir *= -1;
        s.pause = 2.5;
        c.emote("♪", 1.8);
      }
      s.i += s.dir;
    } else {
      const step = Math.min(d, speed * dt);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      c.turnTowards(tx, tz, dt, 8);
      p.y = heightAt(p.x, p.z);
    }
  }
  if (ctx.talking) c.turnTowards(player.x, player.z, dt, 5);

  const run = Math.min(1, speed / 4.3);
  s.phase += speed > 0 ? dt * (5 + speed * 1.6) : 0;
  const sw = speed > 0 ? Math.sin(s.phase) : 0;
  pose(c, {
    rLegX: sw * (0.35 + 0.45 * run), lLegX: -sw * (0.35 + 0.45 * run),
    rShoulderX: -sw * (0.3 + 0.6 * run), lShoulderX: sw * (0.3 + 0.6 * run),
    rElbowX: -0.3 - run, lElbowX: -0.3 - run,
    torsoX: 0.18 * run, bodyY: Math.abs(Math.sin(s.phase)) * 0.05 * run,
  });
  c.swingExtra = Math.abs(sw) * 0.35 * run;
  attend(c, ctx, 5);
  if (!ctx.talking) c.expression = ctx.dist < 5 ? "flustered" : s.pause > 0 ? "happy" : "neutral";
}

export const BEHAVIORS = { sweeper, host, painter, sleeper, runner };

export function updateCast(members, { dt, t, gust, player, talkingTo, sound }) {
  for (const m of members) {
    const c = m.character;
    const dist = Math.hypot(player.x - c.root.position.x, player.z - c.root.position.z);
    m.dist = dist;
    m.behavior(m, { dt, t, player, dist, talking: talkingTo === m, sound });
    // far-off residents are specks in the haze; skip drawing them
    c.root.visible = dist < 80;
    if (c.root.visible) c.update(dt, t, gust);
    else c.collider.x = c.root.position.x, c.collider.z = c.root.position.z;
  }
}

// The resident you're close to and roughly facing, if any.
export function nearestTalkable(members, player, yaw) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let best = null;
  for (const m of members) {
    if (m.dist > 3.2) continue;
    const p = m.character.root.position;
    const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz) || 1;
    if ((dx * fx + dz * fz) / d < 0.35) continue;
    if (!best || m.dist < best.dist) best = m;
  }
  return best;
}
