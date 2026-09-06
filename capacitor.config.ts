import type { CapacitorConfig } from '@capacitor/cli';

const isDev = process.env.CAP_DEV === '1';

const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'habit-coach',
  webDir: 'out',
  ...(isDev
    ? {
        server: {
          url: 'http://192.168.29.231:3000',
          cleartext: true,
        },
      }
    : {}),
};

export default config;
