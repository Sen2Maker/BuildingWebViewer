import { initializeAppLinks } from '../shared/app-navigation.js';
import { startViewer } from '../shared/vite-startup.js';
startViewer(async () => { await import('../cloud/cloud-app.js'); initializeAppLinks(); });
