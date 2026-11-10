// app.json is the config; this only adjusts it for the local test build
// (eas.json profile "local-test"), which talks to a backend on this Mac over
// plain http (10.0.2.2 from the emulator) — release builds keep cleartext off.
module.exports = ({ config }) => {
  if (process.env.LOCAL_TEST_BUILD !== '1') return config;
  const plugins = (config.plugins ?? []).filter((p) => (Array.isArray(p) ? p[0] : p) !== 'expo-build-properties');
  plugins.push(['expo-build-properties', { android: { usesCleartextTraffic: true } }]);
  return { ...config, name: `${config.name} (lokal)`, plugins };
};
