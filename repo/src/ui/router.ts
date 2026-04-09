import Home from './routes/Home.svelte';
import Trips from './routes/Trips.svelte';
import Configuration from './routes/Configuration.svelte';
import Questions from './routes/Questions.svelte';
import Messaging from './routes/Messaging.svelte';
import Wellness from './routes/Wellness.svelte';
import Review from './routes/Review.svelte';
import NotFound from './routes/NotFound.svelte';

export const routes = {
  '/': Home,
  '/trips': Trips,
  '/configuration': Configuration,
  '/questions': Questions,
  '/messaging': Messaging,
  '/wellness': Wellness,
  '/review': Review,
  '*': NotFound
};
