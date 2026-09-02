import effectRulesConfig from "@timmo001/oxlint-rules/configs/effect";

export default {
  extends: [effectRulesConfig],
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
