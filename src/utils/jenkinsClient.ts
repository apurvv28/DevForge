/* eslint-disable n/no-unsupported-features/node-builtins */
import { logger } from './logger';

export interface JenkinsClientOptions {
  url: string;
  username: string;
  apiToken: string;
}

interface CrumbResponse {
  crumb: string;
  crumbRequestField: string;
}

/**
 * Lightweight Jenkins REST API client using Node's built-in fetch.
 *
 * Supports:
 *  - CSRF crumb retrieval
 *  - Job creation (POST /createItem)
 *  - Job config update (POST /job/<name>/config.xml)
 *  - Build trigger (POST /job/<name>/build)
 *  - Job existence check (GET /job/<name>/api/json)
 */
export class JenkinsClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private crumb: CrumbResponse | null = null;

  constructor(options: JenkinsClientOptions) {
    // Normalize URL: strip trailing slash
    this.baseUrl = options.url.replace(/\/+$/, '');
    const credentials = Buffer.from(`${options.username}:${options.apiToken}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  /**
   * Fetch a CSRF crumb from the Jenkins crumb issuer.
   * Returns null if crumb issuer is disabled (older Jenkins or crumb disabled).
   */
  async getCrumb(): Promise<CrumbResponse | null> {
    try {
      const res = await fetch(`${this.baseUrl}/crumbIssuer/api/json`, {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
        },
      });

      if (!res.ok) {
        // Crumb issuer may be disabled — not an error
        return null;
      }

      const data = (await res.json()) as CrumbResponse;
      this.crumb = data;
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Check if a job with the given name already exists.
   */
  async jobExists(name: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/job/${encodeURIComponent(name)}/api/json`, {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
          ...this.crumbHeaders(),
        },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Create a new Jenkins pipeline job.
   * @returns true on success, false on failure
   */
  async createJob(name: string, configXml: string): Promise<boolean> {
    await this.ensureCrumb();

    const res = await fetch(`${this.baseUrl}/createItem?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/xml',
        ...this.crumbHeaders(),
      },
      body: configXml,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn(`Failed to create job "${name}": ${res.status} ${res.statusText} — ${body}`);
      return false;
    }

    return true;
  }

  /**
   * Update an existing Jenkins pipeline job's configuration.
   * @returns true on success, false on failure
   */
  async updateJob(name: string, configXml: string): Promise<boolean> {
    await this.ensureCrumb();

    const res = await fetch(`${this.baseUrl}/job/${encodeURIComponent(name)}/config.xml`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/xml',
        ...this.crumbHeaders(),
      },
      body: configXml,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn(`Failed to update job "${name}": ${res.status} ${res.statusText} — ${body}`);
      return false;
    }

    return true;
  }

  /**
   * Trigger a build for the given job.
   * @returns true on success, false on failure
   */
  async triggerBuild(name: string): Promise<boolean> {
    await this.ensureCrumb();

    const res = await fetch(`${this.baseUrl}/job/${encodeURIComponent(name)}/build`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        ...this.crumbHeaders(),
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn(
        `Failed to trigger build for "${name}": ${res.status} ${res.statusText} — ${body}`,
      );
      return false;
    }

    return true;
  }

  // ── private helpers ──────────────────────────────────────────────────

  private async ensureCrumb(): Promise<void> {
    if (!this.crumb) {
      await this.getCrumb();
    }
  }

  private crumbHeaders(): Record<string, string> {
    if (!this.crumb) return {};
    return { [this.crumb.crumbRequestField]: this.crumb.crumb };
  }
}
