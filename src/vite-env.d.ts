/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEV_LOGIN?: string; // set to 'true' to enable dev login bypass
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
