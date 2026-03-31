/**
 * PendingContext — holds all pending context injection fields
 * for the AssistantLoop. Extracted to reduce field count in the loop class.
 */
export class PendingContext {
  injection: string | null = null;
  messages: string | null = null;
  webhooks: string | null = null;
  channels: string | null = null;
  telephony: string | null = null;
  orders: string | null = null;
  memory: string | null = null;
  tasks: string | null = null;
  sessions: string | null = null;

  /** Clear the main injection field */
  clearInjection(): void {
    this.injection = null;
  }

  /** Clear all context fields */
  clearAll(): void {
    this.injection = null;
    this.messages = null;
    this.webhooks = null;
    this.channels = null;
    this.telephony = null;
    this.orders = null;
    this.memory = null;
    this.tasks = null;
    this.sessions = null;
  }

  /** Collect all non-null context strings into an array */
  collectAll(): string[] {
    const result: string[] = [];
    if (this.injection) result.push(this.injection);
    if (this.messages) result.push(this.messages);
    if (this.webhooks) result.push(this.webhooks);
    if (this.channels) result.push(this.channels);
    if (this.telephony) result.push(this.telephony);
    if (this.orders) result.push(this.orders);
    if (this.memory) result.push(this.memory);
    if (this.tasks) result.push(this.tasks);
    if (this.sessions) result.push(this.sessions);
    return result;
  }
}
