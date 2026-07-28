/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAppController } from './app/controller';
import { AppLayout } from './app/layout';

export default function App() {
  const { s, chat, h } = useAppController();

  return <AppLayout s={s} chat={chat} h={h} />;
}
