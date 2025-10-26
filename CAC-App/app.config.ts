import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const plugins = (config.plugins ?? []).filter((entry) => {
    if (typeof entry === 'string') {
      return entry !== 'react-native-maps';
    }
    if (Array.isArray(entry) && entry.length > 0 && typeof entry[0] === 'string') {
      return entry[0] !== 'react-native-maps';
    }
    return true;
  });

  return {
    ...config,
    name: config.name ?? 'cac-app',
    slug: config.slug ?? 'cac-app',
    scheme: config.scheme ?? 'freshbay',
    version: config.version ?? '1.0.0',
    plugins,
  };
};
