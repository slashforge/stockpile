import { Box, Text } from "@/components/ui/primitives";

export default function HomeTab() {
  return (
    <Box flex center>
      <Text size="xl" weight="bold">Home</Text>
      <Text size="md" mode="subtle">Your home screen</Text>
    </Box>
  );
}
