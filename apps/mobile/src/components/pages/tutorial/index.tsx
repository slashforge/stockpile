import React, { useRef, useCallback, useState, useEffect } from "react";
import { FlatList, Dimensions, View, StyleSheet as RNStyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  SharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

import { Box, Text, Button } from "@/components/ui/primitives";
import { useTheme } from "@/providers/theme-context";
import {
  InvoicingIllustration,
  WalletIllustration,
  SwapIllustration,
} from "./illustrations";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type FloatingChip = {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  position: { top?: number; bottom?: number; left?: number; right?: number };
  delay: number;
};

type TutorialSlide = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  illustration: "invoicing" | "wallet" | "swap";
  chips: FloatingChip[];
  gradientColors: {
    light: [string, string];
    dark: [string, string];
  };
  accentColor: {
    light: string;
    dark: string;
  };
};

const BG_GRADIENT_COLORS = {
  light: [
    { primary: "#E8F5E9", secondary: "#FFFFFC" },
    { primary: "#E3F2FD", secondary: "#FFFFFC" },
    { primary: "#F3E5F5", secondary: "#FFFFFC" },
  ],
  dark: [
    { primary: "#1B4332", secondary: "#0d0f12" },
    { primary: "#1A237E", secondary: "#0d0f12" },
    { primary: "#4A148C", secondary: "#0d0f12" },
  ],
};

function AnimatedBackground({
  scrollX,
  isDark,
}: {
  scrollX: SharedValue<number>;
  isDark: boolean;
}) {
  const colors = isDark ? BG_GRADIENT_COLORS.dark : BG_GRADIENT_COLORS.light;

  const gradient0Style = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [0, SCREEN_WIDTH, SCREEN_WIDTH * 2],
      [1, 0, 0],
      Extrapolation.CLAMP
    ),
  }));

  const gradient1Style = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [0, SCREEN_WIDTH, SCREEN_WIDTH * 2],
      [0, 1, 0],
      Extrapolation.CLAMP
    ),
  }));

  const gradient2Style = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [0, SCREEN_WIDTH, SCREEN_WIDTH * 2],
      [0, 0, 1],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <View style={bgStyles.container} pointerEvents="none">
      <Animated.View style={[bgStyles.gradientLayer, gradient0Style]}>
        <LinearGradient
          colors={[colors[0].primary, colors[0].secondary]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.6 }}
          style={bgStyles.gradient}
        />
      </Animated.View>
      <Animated.View style={[bgStyles.gradientLayer, gradient1Style]}>
        <LinearGradient
          colors={[colors[1].primary, colors[1].secondary]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.6 }}
          style={bgStyles.gradient}
        />
      </Animated.View>
      <Animated.View style={[bgStyles.gradientLayer, gradient2Style]}>
        <LinearGradient
          colors={[colors[2].primary, colors[2].secondary]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.6 }}
          style={bgStyles.gradient}
        />
      </Animated.View>
    </View>
  );
}

const bgStyles = RNStyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  gradientLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gradient: {
    flex: 1,
  },
});

const TUTORIAL_SLIDES: TutorialSlide[] = [
  {
    id: "1",
    title: "Everything Connected",
    subtitle: "FULL-STACK STARTER",
    description:
      "Mobile app, typed API, and landing page in one monorepo. Change a schema and the SDK updates with it.",
    illustration: "invoicing",
    chips: [
      {
        label: "Typed API",
        icon: "code",
        position: { top: 10, left: -20 },
        delay: 200,
      },
      {
        label: "Generated SDK",
        icon: "refresh-cw",
        position: { top: 60, right: -30 },
        delay: 400,
      },
      {
        label: "One Monorepo",
        icon: "layers",
        position: { bottom: 20, left: -15 },
        delay: 600,
      },
    ],
    gradientColors: {
      light: ["#E8F5E9", "#C8E6C9"],
      dark: ["#1B4332", "#2D6A4F"],
    },
    accentColor: {
      light: "#16A34A",
      dark: "#4ADE80",
    },
  },
  {
    id: "2",
    title: "Sign In With Email",
    subtitle: "AUTH BUILT IN",
    description:
      "Email one-time codes out of the box, secured with biometrics. No passwords, no extra setup.",
    illustration: "wallet",
    chips: [
      {
        label: "Biometrics",
        icon: "smartphone",
        position: { top: 20, right: -25 },
        delay: 200,
      },
      {
        label: "Email Login",
        icon: "mail",
        position: { top: 70, left: -20 },
        delay: 400,
      },
      {
        label: "Secure",
        icon: "lock",
        position: { bottom: 20, right: -20 },
        delay: 600,
      },
    ],
    gradientColors: {
      light: ["#E3F2FD", "#BBDEFB"],
      dark: ["#1A237E", "#283593"],
    },
    accentColor: {
      light: "#1976D2",
      dark: "#64B5F6",
    },
  },
  {
    id: "3",
    title: "Ship It Anywhere",
    subtitle: "DEPLOY IN MINUTES",
    description:
      "SST deploys your API and landing page to Cloudflare. EAS builds your app for both stores.",
    illustration: "swap",
    chips: [
      {
        label: "Cloudflare",
        icon: "cloud",
        position: { top: 15, left: -15 },
        delay: 200,
      },
      {
        label: "Fast Deploys",
        icon: "zap",
        position: { top: 60, right: -25 },
        delay: 400,
      },
      {
        label: "iOS + Android",
        icon: "smartphone",
        position: { bottom: 15, left: -20 },
        delay: 600,
      },
    ],
    gradientColors: {
      light: ["#F3E5F5", "#E1BEE7"],
      dark: ["#4A148C", "#6A1B9A"],
    },
    accentColor: {
      light: "#9C27B0",
      dark: "#CE93D8",
    },
  },
];

const ILLUSTRATION_MAP = {
  invoicing: InvoicingIllustration,
  wallet: WalletIllustration,
  swap: SwapIllustration,
} as const;

function FloatingChipView({
  chip,
  isActive,
  accentColor,
  isDark,
}: {
  chip: FloatingChip;
  isActive: boolean;
  accentColor: string;
  isDark: boolean;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);
  const floatY = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      opacity.value = withDelay(
        chip.delay,
        withTiming(1, { duration: 250, easing: Easing.out(Easing.ease) })
      );
      translateY.value = withDelay(
        chip.delay,
        withTiming(0, { duration: 250, easing: Easing.out(Easing.ease) })
      );
      floatY.value = withDelay(
        chip.delay + 250,
        withRepeat(
          withSequence(
            withTiming(-4, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
            withTiming(4, { duration: 1500, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        )
      );
    } else {
      cancelAnimation(opacity);
      cancelAnimation(translateY);
      cancelAnimation(floatY);
      opacity.value = withTiming(0, { duration: 150 });
      translateY.value = 8;
      floatY.value = 0;
    }
  }, [isActive]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value + floatY.value }],
  }));

  const chipBg = isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.92)";
  const chipBorder = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.06)";
  const textColor = isDark ? "#fafafa" : "#202329";

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          ...chip.position,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: chipBg,
          borderWidth: 1,
          borderColor: chipBorder,
          borderRadius: 20,
          paddingHorizontal: 14,
          paddingVertical: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.3 : 0.08,
          shadowRadius: 12,
          elevation: 4,
        },
        animStyle,
      ]}
    >
      <Feather name={chip.icon} size={14} color={accentColor} />
      <Text
        size="xs"
        weight="semibold"
        style={{ color: textColor, letterSpacing: 0.2 }}
      >
        {chip.label}
      </Text>
    </Animated.View>
  );
}

function TutorialCard({
  item,
  index,
  scrollX,
}: {
  item: TutorialSlide;
  index: number;
  scrollX: SharedValue<number>;
}) {
  const { currentTheme } = useTheme();
  const isDark = currentTheme === "dark";
  const accentColor = isDark ? item.accentColor.dark : item.accentColor.light;

  const [isActive, setIsActive] = useState(index === 0);

  const cardAnimStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];
    const scale = interpolate(scrollX.value, inputRange, [0.85, 1, 0.85], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0, 1, 0], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });

  const contentAnimStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];
    const translateY = interpolate(scrollX.value, inputRange, [40, 0, 40], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0, 1, 0], Extrapolation.CLAMP);
    return { transform: [{ translateY }], opacity };
  });

  useEffect(() => {
    const checkActive = () => {
      const currentPage = Math.round(scrollX.value / SCREEN_WIDTH);
      setIsActive(currentPage === index);
    };
    const interval = setInterval(checkActive, 100);
    return () => clearInterval(interval);
  }, [index, scrollX]);

  const IllustrationComponent = ILLUSTRATION_MAP[item.illustration];

  return (
    <View style={cardStyles.container}>
      <Animated.View style={[cardStyles.illustrationSection, cardAnimStyle]}>
        <IllustrationComponent isDark={isDark} />

        {item.chips.map((chip, i) => (
          <FloatingChipView
            key={i}
            chip={chip}
            isActive={isActive}
            accentColor={accentColor}
            isDark={isDark}
          />
        ))}
      </Animated.View>

      <Animated.View style={[cardStyles.textSection, contentAnimStyle]}>
        <Text
          size="xs"
          weight="bold"
          style={{
            textTransform: "uppercase",
            letterSpacing: 2,
            marginBottom: 12,
            color: accentColor,
          }}
        >
          {item.subtitle}
        </Text>
        <Text
          size="xxl"
          weight="bold"
          style={{ textAlign: "center", marginBottom: 16 }}
        >
          {item.title}
        </Text>
        <Text
          size="md"
          mode="subtle"
          style={{ textAlign: "center", lineHeight: 24, paddingHorizontal: 8 }}
        >
          {item.description}
        </Text>
      </Animated.View>
    </View>
  );
}

const cardStyles = RNStyleSheet.create({
  container: {
    flex: 1,
    width: SCREEN_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 120,
  },
  illustrationSection: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
    paddingHorizontal: 40,
  },
  textSection: {
    paddingHorizontal: 40,
    alignItems: "center",
  },
});

function PaginationDot({
  index,
  scrollX,
  isDark,
}: {
  index: number;
  scrollX: SharedValue<number>;
  isDark: boolean;
}) {
  const dotColor = isDark ? "#fafafa" : "#202329";

  const dotStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];
    return {
      width: interpolate(scrollX.value, inputRange, [8, 24, 8], Extrapolation.CLAMP),
      opacity: interpolate(scrollX.value, inputRange, [0.3, 1, 0.3], Extrapolation.CLAMP),
    };
  });

  return (
    <Animated.View
      style={[
        { height: 8, borderRadius: 4, marginHorizontal: 4, backgroundColor: dotColor },
        dotStyle,
      ]}
    />
  );
}

export function TutorialPage() {
  const router = useRouter();
  const { currentTheme } = useTheme();
  const isDark = currentTheme === "dark";
  const flatListRef = useRef<FlatList<TutorialSlide>>(null);
  const scrollX = useSharedValue(0);
  const [currentIndex, setCurrentIndex] = useState(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const handleNext = useCallback(() => {
    if (currentIndex < TUTORIAL_SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
      setCurrentIndex(currentIndex + 1);
    } else {
      handleFinish();
    }
  }, [currentIndex]);

  const handleFinish = useCallback(() => {
    router.replace("/auth");
  }, [router]);

  const isLastSlide = currentIndex === TUTORIAL_SLIDES.length - 1;

  return (
    <Box flex background="base">
      <AnimatedBackground scrollX={scrollX} isDark={isDark} />

      <Animated.FlatList
        ref={flatListRef as any}
        data={TUTORIAL_SLIDES}
        renderItem={({ item, index }) => (
          <TutorialCard item={item} index={index} scrollX={scrollX} />
        )}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(event) => {
          const newIndex = Math.round(
            event.nativeEvent.contentOffset.x / SCREEN_WIDTH
          );
          setCurrentIndex(newIndex);
        }}
        bounces={false}
        style={{ zIndex: 1 }}
      />

      <Box
        style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}
        safeAreaTop
        p="lg"
        direction="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <Box style={{ width: 60 }} />
        <Box direction="row" gap="xs">
          {TUTORIAL_SLIDES.map((_, i) => (
            <PaginationDot key={i} index={i} scrollX={scrollX} isDark={isDark} />
          ))}
        </Box>
        <Button
          variant="ghost"
          size="sm"
          onPress={handleFinish}
          style={{ width: 60, alignItems: "flex-end" }}
        >
          <Button.Text size="sm" mode="subtle" weight="semibold">
            Skip
          </Button.Text>
        </Button>
      </Box>

      <Box
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10 }}
        safeAreaBottom
        p="lg"
      >
        <Button size="lg" rounded="full" onPress={handleNext}>
          <Button.Text weight="semibold">
            {isLastSlide ? "Get Started" : "Next"}
          </Button.Text>
        </Button>
      </Box>
    </Box>
  );
}

export default TutorialPage;
