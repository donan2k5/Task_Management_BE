import { Injectable, Logger } from '@nestjs/common';
import { CalendarProvider, ProviderRegistry } from './provider.interface';

/**
 * Provider Registry Service
 *
 * Manages all registered calendar providers.
 * Automatically discovers and registers providers.
 */
@Injectable()
export class ProviderRegistryService {
  private readonly logger = new Logger(ProviderRegistryService.name);
  private readonly providers: ProviderRegistry = new Map();

  /**
   * Register a new provider
   */
  register(provider: CalendarProvider): void {
    const id = provider.config.id;
    if (this.providers.has(id)) {
      this.logger.warn(`Provider ${id} already registered, overwriting...`);
    }
    this.providers.set(id, provider);
    this.logger.log(`Registered provider: ${provider.config.name}`);
  }

  /**
   * Get provider by ID
   */
  get(providerId: string): CalendarProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get all registered providers
   */
  getAll(): CalendarProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get provider configs (for frontend)
   */
  getConfigs(): Array<{
    id: string;
    name: string;
    icon: string;
    color: string;
    description: string;
  }> {
    return this.getAll().map((p) => p.config);
  }

  /**
   * Check if provider exists
   */
  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  /**
   * Get connected providers for a user
   */
  async getConnectedProviders(userId: string): Promise<CalendarProvider[]> {
    const connected: CalendarProvider[] = [];

    for (const provider of this.providers.values()) {
      try {
        const isConnected = await provider.isConnected(userId);
        if (isConnected) {
          connected.push(provider);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to check connection for ${provider.config.id}: ${error}`,
        );
      }
    }

    return connected;
  }
}
