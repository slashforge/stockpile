import { useRouter } from "expo-router";
import AppIcon from "@/assets/icons/app-icon";
import { Box, Text, Button } from "@/components/ui/primitives";

export function WelcomePage() {
  const router = useRouter();

  const handleGetStarted = () => {
    router.push("/tutorial");
  };

  return (
    <Box flex background="base" p="lg" safeArea>
      <Box flex justifyContent="center" alignItems="center">
        <Box mb="lg" alignItems="center">
          <Box mb="lg">
            <AppIcon width={120} height={120} />
          </Box>

          <Text
            size="xxl"
            weight="bold"
            style={{ textAlign: "center", marginBottom: 16 }}
          >
            Welcome to Stockpile
          </Text>

          <Text
            size="lg"
            mode="subtle"
            style={{
              textAlign: "center",
              lineHeight: 24,
              paddingHorizontal: 16,
            }}
          >
            Your app, ready to build.
          </Text>
        </Box>
      </Box>

      <Box pb="md" alignItems="center">
        <Text
          size="xs"
          mode="subtle"
          style={{
            textAlign: "center",
            lineHeight: 18,
          }}
        >
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Text>
      </Box>

      <Box>
        <Button onPress={handleGetStarted} rounded="full" size="lg">
          <Button.Text weight="semibold">Get Started</Button.Text>
        </Button>
      </Box>
    </Box>
  );
}

export default WelcomePage;
