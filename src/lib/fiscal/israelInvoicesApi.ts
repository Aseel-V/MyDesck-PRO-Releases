/**
 * Israel Invoices Model API Client
 * 
 * Integration with רשות המסים (Israel Tax Authority) for:
 * - Real-time invoice reporting
 * - Allocation number (מספר הקצאה) generation
 * - Invoice cancellation
 * 
 * API Documentation: https://www.gov.il/he/service/invoices-model
 * 
 * IMPORTANT: Production use requires official API credentials.
 * This implementation includes sandbox mode for development.
 * 
 * NOTE: Table types will be recognized after running migrations and
 * regenerating Supabase types with: npx supabase gen types typescript
 */

import { supabase } from '../supabase';
import type { 
  FiscalDocument, 
  IsraelInvoicesConfig, 
  AllocationResponse,
  FiscalDocumentType,
} from '../../types/fiscal';

// ============================================================================
// TYPES
// ============================================================================

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

interface InvoiceReportPayload {
  invoice_type: number;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  vat_amount: number;
  customer_id?: string;
  customer_name?: string;
}

interface AllocationApiResponse {
  allocation_number?: string;
  status: string;
  message?: string;
  error_code?: string;
}

interface AllocationLogItem {
  id: string;
  document_id: string;
  document?: FiscalDocument;
  retry_count: number;
  status: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SANDBOX_BASE_URL = 'https://openapi-sandbox.taxes.gov.il';
const PRODUCTION_BASE_URL = 'https://openapi.taxes.gov.il';

// Invoice types per Israel Tax Authority
const INVOICE_TYPE_MAP: Record<FiscalDocumentType, number> = {
  receipt: 320,
  tax_invoice: 305,
  tax_invoice_receipt: 330,
  credit_note: 310,
  debit_note: 315,
};

// Use 'any' type for tables that don't exist in generated types yet
// After running migrations and `npx supabase gen types typescript`, remove these
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ============================================================================
// ISRAEL INVOICES CLIENT
// ============================================================================

export class IsraelInvoicesClient {
  private config: IsraelInvoicesConfig;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private refreshToken: string | null = null;

  constructor(config: IsraelInvoicesConfig) {
    this.config = config;
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  /**
   * Get API base URL based on mode
   */
  private getBaseUrl(): string {
    return this.config.testMode ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL;
  }

  /**
   * Authenticate and get access token
   */
  async authenticate(): Promise<boolean> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          scope: 'invoices',
        }),
      });

      if (!response.ok) {
        console.error('Authentication failed:', response.status, response.statusText);
        return false;
      }

      const data: TokenResponse = await response.json();
      
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token || null;
      this.tokenExpiry = new Date(Date.now() + (data.expires_in * 1000) - 60000); // 1 min buffer
      
      return true;
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  }

  /**
   * Ensure valid access token
   */
  private async ensureAuthenticated(): Promise<boolean> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return true;
    }
    
    // Try refresh token first
    if (this.refreshToken) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) return true;
    }
    
    // Full authentication
    return this.authenticate();
  }

  /**
   * Refresh access token
   */
  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const response = await fetch(`${this.getBaseUrl()}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.refreshToken,
        }),
      });

      if (!response.ok) {
        return false;
      }

      const data: TokenResponse = await response.json();
      
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token || this.refreshToken;
      this.tokenExpiry = new Date(Date.now() + (data.expires_in * 1000) - 60000);
      
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // INVOICE REPORTING
  // ============================================================================

  /**
   * Report an invoice to the Tax Authority
   */
  async reportInvoice(document: FiscalDocument): Promise<AllocationResponse> {
    // Check if reporting is needed
    if (!document.requiresAllocation && document.totalAmount < 2500000) {
      return {
        success: true,
        allocationNumber: undefined,
      };
    }

    // Ensure authenticated
    if (!await this.ensureAuthenticated()) {
      return {
        success: false,
        error: 'Authentication failed',
        errorCode: 'AUTH_FAILED',
      };
    }

    // Prepare payload
    const payload: InvoiceReportPayload = {
      invoice_type: INVOICE_TYPE_MAP[document.documentType],
      invoice_number: document.fullDocumentNumber,
      invoice_date: new Date(document.createdAt).toISOString().split('T')[0],
      total_amount: document.totalAmount / 100, // Convert agorot to NIS
      vat_amount: document.vatAmount / 100,
      customer_id: document.customer?.idNumber,
      customer_name: document.customer?.name,
    };

    try {
      // Log the request
      await this.logRequest(document.businessId, document.id, payload);

      const response = await fetch(`${this.getBaseUrl()}/v1/invoices/report`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'X-Tax-File-Number': this.config.taxFileNumber,
        },
        body: JSON.stringify(payload),
      });

      const data: AllocationApiResponse = await response.json();

      if (response.ok && data.allocation_number) {
        // Update document with allocation number
        await this.updateDocumentAllocation(
          document.id, 
          data.allocation_number, 
          'success'
        );

        // Log success
        await this.logResponse(document.businessId, document.id, data, 'success');

        return {
          success: true,
          allocationNumber: data.allocation_number,
          timestamp: new Date().toISOString(),
        };
      } else {
        // Log failure
        await this.logResponse(document.businessId, document.id, data, 'failed');

        return {
          success: false,
          error: data.message || 'Unknown error',
          errorCode: data.error_code,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Network error';
      
      // Queue for retry
      await this.queueForRetry(document);
      
      return {
        success: false,
        error: errorMsg,
        errorCode: 'NETWORK_ERROR',
      };
    }
  }

  /**
   * Get status of a previously reported invoice
   */
  async getInvoiceStatus(allocationNumber: string): Promise<{ status: string; details?: Record<string, unknown> }> {
    if (!await this.ensureAuthenticated()) {
      return { status: 'error', details: { error: 'Authentication failed' } };
    }

    try {
      const response = await fetch(`${this.getBaseUrl()}/v1/invoices/${allocationNumber}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'X-Tax-File-Number': this.config.taxFileNumber,
        },
      });

      const data = await response.json();
      
      return {
        status: response.ok ? 'active' : 'unknown',
        details: data,
      };
    } catch (error) {
      return { 
        status: 'error', 
        details: { error: error instanceof Error ? error.message : 'Unknown' } 
      };
    }
  }

  /**
   * Cancel a reported invoice
   */
  async cancelInvoice(
    allocationNumber: string, 
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!await this.ensureAuthenticated()) {
      return { success: false, error: 'Authentication failed' };
    }

    try {
      const response = await fetch(`${this.getBaseUrl()}/v1/invoices/${allocationNumber}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'X-Tax-File-Number': this.config.taxFileNumber,
        },
        body: JSON.stringify({ reason }),
      });

      if (response.ok) {
        return { success: true };
      } else {
        const data = await response.json();
        return { success: false, error: data.message || 'Cancellation failed' };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Network error' 
      };
    }
  }

  // ============================================================================
  // OFFLINE QUEUE
  // ============================================================================

  /**
   * Queue a document for retry when offline
   */
  private async queueForRetry(document: FiscalDocument): Promise<void> {
    await db
      .from('allocation_numbers_log')
      .insert({
        business_id: document.businessId,
        document_id: document.id,
        status: 'pending',
        retry_count: 0,
      });

    await this.updateDocumentAllocation(document.id, null, 'pending');
  }

  /**
   * Process queued invoices (call periodically)
   */
  async processQueue(_businessId: string): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    // Get pending items
    const { data: pendingItems } = await db
      .from('allocation_numbers_log')
      .select('*, document:fiscal_documents(*)')
      .eq('business_id', _businessId)
      .eq('status', 'pending')
      .lt('retry_count', 5)
      .order('requested_at', { ascending: true })
      .limit(10);

    if (!pendingItems || pendingItems.length === 0) {
      return { processed: 0, failed: 0 };
    }

    for (const item of pendingItems as AllocationLogItem[]) {
      if (!item.document) continue;

      // Increment retry count
      await db
        .from('allocation_numbers_log')
        .update({ retry_count: item.retry_count + 1 })
        .eq('id', item.id);

      // Try to report
      const result = await this.reportInvoice(item.document);

      if (result.success) {
        await db
          .from('allocation_numbers_log')
          .update({ 
            status: 'success',
            allocation_number: result.allocationNumber,
            completed_at: new Date().toISOString(),
          })
          .eq('id', item.id);
        processed++;
      } else {
        if (item.retry_count >= 4) {
          await db
            .from('allocation_numbers_log')
            .update({ 
              status: 'failed',
              error_message: result.error,
            })
            .eq('id', item.id);
          failed++;
        }
      }
    }

    return { processed, failed };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async updateDocumentAllocation(
    documentId: string, 
    allocationNumber: string | null, 
    status: string
  ): Promise<void> {
    await db
      .from('fiscal_documents')
      .update({
        allocation_number: allocationNumber,
        allocation_status: status,
        ...(allocationNumber ? { allocation_received_at: new Date().toISOString() } : {}),
      })
      .eq('id', documentId);
  }

  private async logRequest(
    businessId: string, 
    documentId: string, 
    payload: InvoiceReportPayload
  ): Promise<void> {
    await db
      .from('allocation_numbers_log')
      .insert({
        business_id: businessId,
        document_id: documentId,
        request_payload: payload,
        status: 'pending',
      });
  }

  private async logResponse(
    _businessId: string,
    documentId: string,
    response: AllocationApiResponse,
    status: string
  ): Promise<void> {
    await db
      .from('allocation_numbers_log')
      .update({
        response_payload: response,
        allocation_number: response.allocation_number,
        status,
        completed_at: new Date().toISOString(),
        error_message: response.message,
      })
      .eq('document_id', documentId)
      .eq('status', 'pending');
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create Israel Invoices API client
 */
export function createIsraelInvoicesClient(config: IsraelInvoicesConfig): IsraelInvoicesClient {
  return new IsraelInvoicesClient(config);
}

/**
 * Create client from environment variables (for convenience)
 */
export function createIsraelInvoicesClientFromEnv(): IsraelInvoicesClient | null {
  const clientId = import.meta.env.VITE_ISRAEL_INVOICES_CLIENT_ID;
  const clientSecret = import.meta.env.VITE_ISRAEL_INVOICES_CLIENT_SECRET;
  const taxFileNumber = import.meta.env.VITE_TAX_FILE_NUMBER;
  const testMode = import.meta.env.VITE_ISRAEL_INVOICES_TEST_MODE !== 'false';

  if (!clientId || !clientSecret || !taxFileNumber) {
    console.warn('Israel Invoices API credentials not configured');
    return null;
  }

  return new IsraelInvoicesClient({
    apiBaseUrl: testMode ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL,
    clientId,
    clientSecret,
    taxFileNumber,
    testMode,
  });
}
