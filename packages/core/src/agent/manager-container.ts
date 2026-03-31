/**
 * ManagerContainer — holds optional manager instances for the AssistantLoop.
 * Extracted to reduce field count in the main loop class.
 *
 * These are lazily initialized and may be null if the feature is disabled.
 */

import type { VoiceManager } from '../voice/voice-manager';
import type { AssistantManager } from '../identity/assistant-manager';
import type { IdentityManager } from '../identity/identity-manager';
import type { InboxManager } from '../inbox/inbox-manager';
import type { WalletManager } from '../wallet/wallet-manager';
import type { SecretsManager } from '../secrets/secrets-manager';
import type { JobManager } from '../connectors/job-manager';
import type { MessagesManager } from '../messages/messages-manager';
import type { WebhooksManager } from '../webhooks/manager';
import type { ChannelsManager } from '../channels/manager';
import type { PeopleManager } from '../people/manager';
import type { TelephonyManager } from '../telephony/manager';
import type { OrdersManager } from '../orders/manager';
import type { GlobalMemoryManager } from '../memory/global-manager';

export class ManagerContainer {
  voice: VoiceManager | null = null;
  assistant: AssistantManager | null = null;
  identity: IdentityManager | null = null;
  inbox: InboxManager | null = null;
  wallet: WalletManager | null = null;
  secrets: SecretsManager | null = null;
  job: JobManager | null = null;
  messages: MessagesManager | null = null;
  webhooks: WebhooksManager | null = null;
  channels: ChannelsManager | null = null;
  people: PeopleManager | null = null;
  telephony: TelephonyManager | null = null;
  orders: OrdersManager | null = null;
  memory: GlobalMemoryManager | null = null;
}
