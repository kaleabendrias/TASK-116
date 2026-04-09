import App from './ui/App.svelte';
import './ui/styles/global.css';

const target = document.getElementById('app');
if (!target) throw new Error('Mount element #app missing');

const app = new App({ target });
export default app;
