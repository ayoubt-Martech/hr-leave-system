/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEV_LOGIN?: string; // set to 'true' to enable dev login bypass
  readonly VITE_AUTO_LOGIN_EMAIL?: string; // set to silently dev-login as this email on boot — temporary demo use only
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
