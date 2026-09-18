import React, { useRef, useState } from 'react';
import { Animated, Dimensions, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useSettings } from '../state/settings';
import { color, space, text, radius, icon } from '../theme/tokens';

const { width, height } = Dimensions.get('window');

const SLIDES = [
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

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { completeOnboarding } = useSettings();
  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const viewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems[0]) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      completeOnboarding();
    }
  };

  const renderItem = ({ item }: { item: typeof SLIDES[0] }) => {
    return (
      <View style={[styles.slide, { width }]}>
        <View style={[styles.imageContainer, item.id === '3' && styles.imageContainerRightFlush]}>
          <Image
            source={item.image}
            style={styles.image}
            contentFit="cover"
            transition={300}
          />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.description}>{item.description}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.carouselContainer}>
        <FlatList
          data={SLIDES}
          renderItem={renderItem}
          horizontal
          showsHorizontalScrollIndicator={false}
          pagingEnabled
          bounces={false}
          keyExtractor={(item) => item.id}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: false,
          })}
          onViewableItemsChanged={viewableItemsChanged}
          viewabilityConfig={viewConfig}
          scrollEventThrottle={32}
          ref={listRef}
        />
      </View>

      <View style={styles.bottomContainer}>
        <View style={styles.indicatorContainer}>
          {SLIDES.map((_, i) => {
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            
            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.2, 1, 0.2],
              extrapolate: 'clamp',
            });

            const dotScale = scrollX.interpolate({
              inputRange,
              outputRange: [0.8, 1, 0.8],
              extrapolate: 'clamp',
            });

            return (
              <Animated.View
                key={i.toString()}
                style={[
                  styles.dot,
                  {
                    opacity: dotOpacity,
                    transform: [{ scale: dotScale }],
                  },
                ]}
              />
            );
          })}
        </View>

        <Pressable 
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed
          ]} 
          onPress={handleNext}
        >
          <Text style={styles.buttonText}>
            {currentIndex === SLIDES.length - 1 ? 'GET STARTED' : 'NEXT'}
          </Text>
          {currentIndex !== SLIDES.length - 1 && (
            <ArrowRight size={icon.sm} color={color.inverseFg} strokeWidth={icon.strokeActive} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.bg,
  },
  carouselContainer: {
    flex: 1,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: {
    width: '100%',
    height: height * 0.5,
    paddingHorizontal: space[6],
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainerRightFlush: {
    paddingRight: 0,
    alignItems: 'flex-end',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    width: '100%',
    paddingHorizontal: space[8],
    marginTop: space[8],
    alignItems: 'center',
  },
  title: {
    ...text.title,
    color: color.fg,
    textAlign: 'center',
    marginBottom: space[4],
  },
  description: {
    ...text.body,
    color: color.fgMuted,
    textAlign: 'center',
    maxWidth: 320,
  },
  bottomContainer: {
    paddingHorizontal: space[6],
    paddingBottom: space[4],
    alignItems: 'center',
  },
  indicatorContainer: {
    flexDirection: 'row',
    marginBottom: space[8],
  },
  dot: {
    height: 8,
    width: 8,
    borderRadius: 4,
    backgroundColor: color.fg,
    marginHorizontal: space[1],
  },
  button: {
    backgroundColor: color.fg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space[4],
    paddingHorizontal: space[8],
    borderRadius: radius.md,
    width: '100%',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    ...text.label,
    color: color.inverseFg,
    marginRight: space[2],
  },
});

