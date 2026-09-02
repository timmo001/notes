import recommendedEffect from "@timmo001/oxlint-rules/configs/recommended-effect";

export default {
  extends: [recommendedEffect],
  ignorePatterns: [
    ".agent/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".continue/**",
    ".cursor/**",
    ".gemini/**",
    ".opencode/**",
    ".opencode-daemon/**",
    ".pi/**",
    ".roo/**",
    ".windsurf/**",
  ],
};
