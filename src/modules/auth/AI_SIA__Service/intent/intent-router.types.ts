import { SIAChatMessage } from '../context/conversation-summary.service';

export type SafioIntent =
    | 'general'
    | 'camera'
    | 'face-id'
    | 'fall-detection'
    | 'account'
    | 'troubleshooting'
    | 'architecture';

export type { SIAChatMessage };
