/** Entry point for `npm run server`. */
import { startSignalingServer } from './signaling';

const port = Number(process.env.PORT ?? 8787);
startSignalingServer(port);
console.log(`Limb Clash signaling server on ws://0.0.0.0:${port}`);
