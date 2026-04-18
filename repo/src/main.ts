import App from './ui/App.svelte';
import './ui/styles/global.css';
import { ensureSeedUsers } from './seed/seedUsers';

// Seed demo users on first launch (fire-and-forget; errors are swallowed internally)
ensureSeedUsers();

const target = document.getElementById('app');
if (!target) throw new Error('Mount element #app missing');

const app = new App({ target });
export default app;
