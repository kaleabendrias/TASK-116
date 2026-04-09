export interface RuntimeConfig {
  appMode: string;
  testMode: boolean;
  localeDefault: string;
  localeFallback: string;
  staticConfigPath: string;
}

export function runtimeConfig(): RuntimeConfig {
  return {
    appMode: import.meta.env.VITE_APP_MODE ?? 'development',
    testMode: (import.meta.env.VITE_TEST_MODE ?? 'false') === 'true',
    localeDefault: import.meta.env.VITE_LOCALE_DEFAULT ?? 'en-US',
    localeFallback: import.meta.env.VITE_LOCALE_FALLBACK ?? 'en',
    staticConfigPath: import.meta.env.VITE_STATIC_CONFIG_PATH ?? '/config'
  };
}
