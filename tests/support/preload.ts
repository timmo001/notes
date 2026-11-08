// Git config passed in the environment, such as the url.insteadOf rewrites a
// CI runner or Upkeep's worker sets, would change what the fixture repositories
// report, so tests only see the config their own fixtures write.
for (const key of Object.keys(process.env)) {
  if (/^GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)$/.test(key))
    delete process.env[key];
}
