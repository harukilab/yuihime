import { CortexModule, ModuleType } from '../include/types';

/**
 * Financial Module: Tracks donations, bits, and virtual currency.
 * Essential for VTuber monetization and audience engagement rewards.
 */
export const FinancialModule: CortexModule = {
  metadata: {
    id: 'financial-module',
    name: 'Balance & Donation',
    description: 'Tracks stream revenue, donations, and audience loyalty points.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    phase: 'PHASE 1: AGGREGATION',
    order: 3
  },
  run: async (input: string, state: any, context: any) => {
    // Basic logic to detect if the input is a donation event
    const isDonation = input.toLowerCase().includes('donated') || 
                       input.toLowerCase().includes('gifted') ||
                       context.eventType === 'DONATION';

    if (isDonation) {
      console.log('[FINANCE] Donation detected. Updating session balance...');
      // In a real app, this would update a database.
      // For now, we decorate the context.
      return {
        ...context,
        finance: {
          lastAmount: context.amount || 0,
          currency: context.currency || 'USD',
          totalSession: (context.finance?.totalSession || 0) + (context.amount || 0)
        }
      };
    }

    return context;
  }
};
