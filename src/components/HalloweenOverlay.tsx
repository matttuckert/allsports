import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

const INTERVAL_MS = 20_000;
// react-native-web has no native driver; asking for it only logs a warning.
const useNativeDriver = Platform.OS !== 'web';

type Kind = 'web' | 'lightning' | 'ghost';
const KINDS: Kind[] = ['web', 'lightning', 'ghost'];

type AnimationProps = { onDone: () => void };

// Runs `animation` on mount and reports completion; stops it on unmount.
function useRunOnMount(build: () => Animated.CompositeAnimation, onDone: () => void) {
  useEffect(() => {
    const animation = build();
    animation.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

const WEB_SPOKES = 9;
const WEB_RINGS = 9;

// A corner web fanning across the whole screen: spokes radiate from the
// top-left corner and each ring sags toward the corner between spokes.
function webPath(width: number, height: number): string {
  const radius = Math.hypot(width, height);
  const point = (r: number, i: number): [number, number] => {
    const angle = (i / (WEB_SPOKES - 1)) * (Math.PI / 2);
    return [r * Math.cos(angle), r * Math.sin(angle)];
  };
  const parts: string[] = [];
  for (let i = 0; i < WEB_SPOKES; i++) {
    const [x, y] = point(radius, i);
    parts.push(`M0 0L${x} ${y}`);
  }
  for (let ring = 1; ring <= WEB_RINGS; ring++) {
    const r = (radius * ring) / WEB_RINGS;
    const [sx, sy] = point(r, 0);
    parts.push(`M${sx} ${sy}`);
    for (let i = 1; i < WEB_SPOKES; i++) {
      const [x, y] = point(r, i);
      const [cx, cy] = point(r * 0.9, i - 0.5);
      parts.push(`Q${cx} ${cy} ${x} ${y}`);
    }
  }
  return parts.join('');
}

const CRAWL_POINTS = 12;
const MAX_DRIFT = 60;
const SPIDER_COUNT = 10;
// Fraction of its available time each spider takes: 1 is the slowest, and
// anything lower finishes early, so spiders vary slightly in speed.
const MIN_DURATION_FRACTION = 0.75;
// Latest a spider may set off, as a fraction of the crawl animation.
const MAX_START_FRACTION = 0.2;

// Left-to-right crawl: x advances steadily across the screen while y is a
// random walk, so the spider wanders up and down but keeps heading right.
// The spider is turned to face each leg of the route.
function randomCrawlPath(width: number, height: number) {
  const minX = 40;
  const maxX = width - 40;
  const minY = 60;
  const maxY = Math.max(height - 140, minY);
  const step = (maxX - minX) / (CRAWL_POINTS - 1);
  const xs = Array.from({ length: CRAWL_POINTS }, (_, i) => minX + step * i);
  const ys = [minY + Math.random() * (maxY - minY)];
  for (let i = 1; i < CRAWL_POINTS; i++) {
    const next = ys[i - 1] + (Math.random() * 2 - 1) * MAX_DRIFT;
    ys.push(Math.min(Math.max(next, minY), maxY));
  }
  const angles = xs.map((x, i) => {
    const j = Math.min(i, xs.length - 2);
    // 90deg turns the emoji from facing up to facing right.
    return 90 + (Math.atan2(ys[j + 1] - ys[j], xs[j + 1] - xs[j]) * 180) / Math.PI;
  });
  const start = Math.random() * MAX_START_FRACTION;
  const duration = (1 - start) * (MIN_DURATION_FRACTION + Math.random() * (1 - MIN_DURATION_FRACTION));
  return {
    start,
    // Clamped so float error can never push the end past the timeline's end.
    end: Math.min(start + duration, 1),
    t: xs.map((_, i) => start + (i / (xs.length - 1)) * duration),
    x: xs,
    y: ys,
    rotate: angles.map((a) => `${a}deg`),
  };
}

function SpiderWeb({ onDone }: AnimationProps) {
  const { width, height } = useWindowDimensions();
  const web = useState(() => new Animated.Value(0))[0];
  const crawl = useState(() => new Animated.Value(0))[0];
  const paths = useState(() =>
    Array.from({ length: SPIDER_COUNT }, () => randomCrawlPath(width, height))
  )[0];

  useRunOnMount(
    () =>
      Animated.sequence([
        Animated.timing(web, { toValue: 1, duration: 1600, useNativeDriver }),
        Animated.timing(crawl, {
          toValue: 1,
          duration: 4500,
          easing: Easing.linear,
          useNativeDriver,
        }),
        Animated.timing(web, { toValue: 0, duration: 800, useNativeDriver }),
      ]),
    onDone
  );

  return (
    <>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: web.interpolate({ inputRange: [0, 1], outputRange: [0, 0.75] }),
            // Grow out of the top-left corner the web is anchored to.
            transform: [
              { translateX: web.interpolate({ inputRange: [0, 1], outputRange: [-width / 2, 0] }) },
              { translateY: web.interpolate({ inputRange: [0, 1], outputRange: [-height / 2, 0] }) },
              { scale: web.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
            ],
          },
        ]}
      >
        <Svg width={width} height={height}>
          <Path d={webPath(width, height)} stroke="#D4D4D8" strokeWidth={1.5} fill="none" />
        </Svg>
      </Animated.View>
      {paths.map((path, i) => (
        <Animated.Text
          key={i}
          style={[
            styles.spider,
            {
              opacity: crawl.interpolate({
                inputRange: [
                  0,
                  path.start,
                  path.start + 0.05 * (path.end - path.start),
                  path.start + 0.95 * (path.end - path.start),
                  path.end,
                  1,
                ],
                outputRange: [0, 0, 1, 1, 0, 0],
              }),
              transform: [
                { translateX: crawl.interpolate({
                    inputRange: path.t,
                    outputRange: path.x,
                    extrapolate: 'clamp',
                  }) },
                { translateY: crawl.interpolate({
                    inputRange: path.t,
                    outputRange: path.y,
                    extrapolate: 'clamp',
                  }) },
                { rotate: crawl.interpolate({
                    inputRange: path.t,
                    outputRange: path.rotate,
                    extrapolate: 'clamp',
                  }) },
              ],
            },
          ]}
        >
          🕷️
        </Animated.Text>
      ))}
    </>
  );
}

function Lightning({ onDone }: AnimationProps) {
  const flash = useState(() => new Animated.Value(0))[0];

  const blink = (toValue: number, duration: number) =>
    Animated.timing(flash, { toValue, duration, useNativeDriver });

  // Two distinct flashes with a dark beat between them.
  useRunOnMount(
    () =>
      Animated.sequence([
        blink(0.9, 50),
        blink(0, 120),
        blink(1, 50),
        blink(0, 500),
      ]),
    onDone
  );

  return <Animated.View style={[StyleSheet.absoluteFill, styles.flash, { opacity: flash }]} />;
}

function Ghost({ onDone }: AnimationProps) {
  const { width, height } = useWindowDimensions();
  const fade = useState(() => new Animated.Value(0))[0];
  const pos = useState(() => ({
    left: Math.random() * Math.max(width - 220, 0),
    top: height * (0.2 + Math.random() * 0.5),
  }))[0];

  useRunOnMount(
    () =>
      Animated.sequence([
        Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver }),
        Animated.timing(fade, { toValue: 0, duration: 450, useNativeDriver }),
      ]),
    onDone
  );

  return (
    <Animated.Text
      style={[
        styles.ghost,
        {
          ...pos,
          opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }),
          transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [20, -20] }) }],
        },
      ]}
    >
      👻
    </Animated.Text>
  );
}

export function HalloweenOverlay() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [active, setActive] = useState<{ kind: Kind; id: number } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setReduceMotion(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    // Respect the OS setting -- the lightning flash in particular is a
    // photosensitivity risk.
    if (reduceMotion) return;
    const timer = setInterval(() => {
      if (busy.current) return;
      busy.current = true;
      setActive({ kind: KINDS[Math.floor(Math.random() * KINDS.length)], id: Date.now() });
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [reduceMotion]);

  if (!active || reduceMotion) return null;

  const onDone = () => {
    busy.current = false;
    setActive(null);
  };

  return (
    <View style={styles.overlay}>
      {active.kind === 'web' && <SpiderWeb key={active.id} onDone={onDone} />}
      {active.kind === 'lightning' && <Lightning key={active.id} onDone={onDone} />}
      {active.kind === 'ghost' && <Ghost key={active.id} onDone={onDone} />}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 1000 },
  spider: { position: 'absolute', top: 0, left: 0, fontSize: 44 },
  flash: { backgroundColor: '#E0E7FF' },
  ghost: { position: 'absolute', fontSize: 200 },
});
