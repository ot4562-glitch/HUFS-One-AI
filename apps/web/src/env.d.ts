/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'synthetic' selects the in-browser synthetic demo client (dev only); anything else uses the real API. */
  readonly VITE_DEMO_TRANSPORT?: string;
}
