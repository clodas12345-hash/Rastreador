import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gkdmobility.rastreador',
  appName: 'GKD Rastreador',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
