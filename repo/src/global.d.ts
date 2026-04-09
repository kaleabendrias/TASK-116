/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: string;
  readonly VITE_TEST_MODE?: string;
  readonly VITE_LOCALE_DEFAULT?: string;
  readonly VITE_LOCALE_FALLBACK?: string;
  readonly VITE_STATIC_CONFIG_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
