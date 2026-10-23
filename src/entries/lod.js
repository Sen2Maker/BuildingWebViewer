import { initializeAppLinks } from '../shared/app-navigation.js';
import { startViewer } from '../shared/vite-startup.js';
startViewer(async () => { await import('../lod/app.js'); initializeAppLinks(); });
