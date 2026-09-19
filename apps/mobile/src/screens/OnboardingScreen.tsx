import { useCallback, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, useWindowDimensions, View, ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight } from '../components/icons';
import { Image } from 'expo-image';
import { Text } from '../components/primitives';
import { useSettings } from '../state/settings';
import { color, icon, radius, space } from '../theme/tokens';

type Slide = { id: string; image: number; title: string; description: string };

/** Bundled, monochrome artwork: no network requests during onboarding. */
const SLIDES: Slide[] = [
  {
    id: '1',
    image: require('../../assets/onboarding/elephant.jpg'),
    title: 'See the bigger picture.',
    description: 'Stay focused on the CM news that matters, without the noise.',
  },
  {
    id: '2',
    image: require('../../assets/onboarding/tiger.jpg'),
    title: 'News. Focused.',
    description: 'Discover relevant stories related to Tamilnadu Government gathered from across the web, all in one place.',
  },
  {
    id: '3',
    image: require('../../assets/onboarding/lion.jpg'),
    title: 'Stay informed.',
    description: 'Follow important developments of the state, explore the stories behind them, and read from the original sources.',
  },
];

const VIEWABILITY = { viewAreaCoveragePercentThreshold: 50 };

/**
 * Three-slide introduction shown until completed (persisted in settings). Paging dots animate
 * on the native thread; slide width follows the window, so rotation and foldables work.
 */
export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { completeOnboarding } = useSettings();
  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList<Slide>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const last = currentIndex === SLIDES.length - 1;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<Slide>[] }) => {
    const index = viewableItems[0]?.index;
    if (typeof index === 'number') setCurrentIndex(index);
  }).current;

  const handleNext = () => {
    if (last) completeOnboarding();
    else listRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
  };

  const renderItem = useCallback(
    ({ item }: { item: Slide }) => (
      <View style={[styles.slide, { width }]} accessible accessibilityLabel={`${item.title} ${item.description}`}>
        <View style={[styles.imageContainer, { height: height * 0.5 }, item.id === '3' && styles.imageContainerRightFlush]}>
          <Image source={item.image} style={styles.image} contentFit="cover" transition={300} accessible={false} />
        </View>
        <View style={styles.textContainer}>
          <Text variant="title" style={styles.title} accessibilityRole="header">
            {item.title}
          </Text>
          <Text variant="body" tone="muted" style={styles.description}>
            {item.description}
          </Text>
        </View>
      </View>
    ),
    [width, height],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.carouselContainer}>
        <Animated.FlatList
          ref={listRef}
          data={SLIDES}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABILITY}
        />
      </View>

      <View style={styles.bottomContainer}>
        <View style={styles.indicatorContainer} accessibilityLabel={`Page ${currentIndex + 1} of ${SLIDES.length}`}>
          {SLIDES.map((slide, i) => {
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            const opacity = scrollX.interpolate({ inputRange, outputRange: [0.2, 1, 0.2], extrapolate: 'clamp' });
            const scale = scrollX.interpolate({ inputRange, outputRange: [0.8, 1, 0.8], extrapolate: 'clamp' });
            return <Animated.View key={slide.id} style={[styles.dot, { opacity, transform: [{ scale }] }]} />;
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={last ? 'Get started' : 'Next'}
          onPress={handleNext}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text variant="label" tone="inverse" style={styles.buttonText}>
            {last ? 'GET STARTED' : 'NEXT'}
          </Text>
          {!last ? <ArrowRight size={icon.sm} color={color.inverseFg} strokeWidth={icon.strokeActive} /> : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg },
  carouselContainer: { flex: 1 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageContainer: { width: '100%', paddingHorizontal: space[6], alignItems: 'center', justifyContent: 'center' },
  imageContainerRightFlush: { paddingRight: 0, alignItems: 'flex-end' },
  image: { width: '100%', height: '100%' },
  textContainer: { width: '100%', paddingHorizontal: space[8], marginTop: space[8], alignItems: 'center' },
  title: { textAlign: 'center', marginBottom: space[4] },
  description: { textAlign: 'center', maxWidth: 320 },
  bottomContainer: { paddingHorizontal: space[6], paddingBottom: space[4], alignItems: 'center' },
  indicatorContainer: { flexDirection: 'row', marginBottom: space[8] },
  dot: { height: 8, width: 8, borderRadius: 4, backgroundColor: color.fg, marginHorizontal: space[1] },
  button: {
    backgroundColor: color.fg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: space[8],
    borderRadius: radius.md,
    width: '100%',
    maxWidth: 480,
  },
  buttonPressed: { opacity: 0.8 },
  buttonText: { marginRight: space[2] },
});
