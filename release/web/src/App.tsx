/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAppController } from './app/controller';
import { AppLayout } from './app/layout';
import { useEffect } from 'react';
import { initializeCortexModules } from '@/core/RegistryInitializer';

export default function App() {
  const { s, chat, h } = useAppController();

  useEffect(() => {
    initializeCortexModules().catch((err) => {
      console.error('[WEB] Failed to initialize cortex modules:', err);
    });
  }, []);

  return <AppLayout s={s} chat={chat} h={h} />;
}
