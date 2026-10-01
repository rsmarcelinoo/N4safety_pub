/**
 * SOS FEATURE TYPES
 *
 * SOSStatus drives the UI state machine in the SOS screen.
 * SOSEvent is the payload dispatched to active circles on trigger.
 *
 * Multi-Agent Note: Import from here. Do not redefine these locally.
 */

import type { Coordinates } from './location';

export type SOSStatus = 'idle' | 'armed' | 'triggered' | 'cancelled';

export interface SOSEvent {
  id: string;
  triggeredAt: string;
  cancelledAt?: string;
  coords: Coordinates | null;
  circleIds: string[];
}
