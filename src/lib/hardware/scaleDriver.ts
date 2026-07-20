/**
 * Scale Driver
 * 
 * Serial communication driver for digital weighing scales.
 * Supports common protocols used by supermarket scales.
 * 
 * Protocols supported:
 * - Toledo (MT-SICS)
 * - CAS
 * - Mettler Toledo
 * - Generic ASCII
 */

// ============================================================================
// TYPES
// ============================================================================

export type ScaleProtocol = 'toledo' | 'cas' | 'mettler' | 'generic';

export interface ScaleConfig {
  port: string;              // COM3, /dev/ttyUSB0, etc.
  baudRate: number;          // Usually 9600
  protocol: ScaleProtocol;
  dataBits?: 7 | 8;
  parity?: 'none' | 'even' | 'odd';
  stopBits?: 1 | 2;
  timeout?: number;          // Read timeout in ms
}

export interface ScaleReading {
  weight: number;            // Weight in kg
  unit: 'kg' | 'lb' | 'g';
  stable: boolean;           // Is reading stable
  tare: number;              // Current tare value
  overload: boolean;         // Scale overloaded
  underload: boolean;        // Scale underloaded (negative)
  error: boolean;            // General error
  raw: string;               // Raw response string
  timestamp: Date;
}

export interface ScaleStatus {
  connected: boolean;
  lastReading: ScaleReading | null;
  lastError: string | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Partial<ScaleConfig> = {
  baudRate: 9600,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
  timeout: 1000,
};

// Protocol command strings
const COMMANDS: Record<ScaleProtocol, { read: string; tare: string; zero: string }> = {
  toledo: {
    read: 'S\r\n',
    tare: 'T\r\n',
    zero: 'Z\r\n',
  },
  cas: {
    read: 'W\r',
    tare: 'T\r',
    zero: 'Z\r',
  },
  mettler: {
    read: 'SI\r\n',
    tare: 'TA\r\n',
    zero: 'Z\r\n',
  },
  generic: {
    read: '\r\n',
    tare: 'T\r\n',
    zero: 'Z\r\n',
  },
};

// ============================================================================
// SCALE DRIVER CLASS
// ============================================================================

export class ScaleDriver {
  private config: ScaleConfig;
  private status: ScaleStatus;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private onReadingCallback: ((reading: ScaleReading) => void) | null = null;

  constructor(config: ScaleConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as ScaleConfig;
    this.status = {
      connected: false,
      lastReading: null,
      lastError: null,
    };
  }

  // ============================================================================
  // CONNECTION
  // ============================================================================

  /**
   * Connect to scale via Electron IPC
   */
  async connect(): Promise<boolean> {
    try {
      if (!window.electronAPI?.serialConnect) {
        console.warn('Serial API not available - running in browser mode');
        this.status.lastError = 'Serial API not available';
        return false;
      }

      const result = await window.electronAPI.serialConnect(
        this.config.port,
        this.config.baudRate
      );

      this.status.connected = result.success;
      if (!result.success) {
        this.status.lastError = result.error || 'Connection failed';
      }

      return result.success;
    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : 'Unknown error';
      return false;
    }
  }

  /**
   * Disconnect from scale
   */
  async disconnect(): Promise<void> {
    this.stopPolling();
    
    if (window.electronAPI?.serialDisconnect) {
      await window.electronAPI.serialDisconnect(this.config.port);
    }
    
    this.status.connected = false;
  }

  // ============================================================================
  // READING
  // ============================================================================

  /**
   * Request a single weight reading
   */
  async read(): Promise<ScaleReading | null> {
    if (!this.status.connected) {
      console.warn('Scale not connected');
      return null;
    }

    try {
      const command = COMMANDS[this.config.protocol].read;
      
      if (!window.electronAPI?.serialSend) {
        return this.getMockReading();
      }

      const response = await window.electronAPI.serialSend(
        this.config.port,
        command
      );

      if (!response.success || !response.data) {
        this.status.lastError = response.error || 'No data received';
        return null;
      }

      const reading = this.parseReading(response.data);
      this.status.lastReading = reading;
      
      return reading;
    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : 'Read failed';
      return null;
    }
  }

  /**
   * Start continuous polling
   */
  startPolling(intervalMs: number = 200, callback: (reading: ScaleReading) => void): void {
    this.onReadingCallback = callback;
    
    this.pollingInterval = setInterval(async () => {
      const reading = await this.read();
      if (reading && this.onReadingCallback) {
        this.onReadingCallback(reading);
      }
    }, intervalMs);
  }

  /**
   * Stop continuous polling
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.onReadingCallback = null;
  }

  // ============================================================================
  // COMMANDS
  // ============================================================================

  /**
   * Send tare command
   */
  async tare(): Promise<boolean> {
    if (!this.status.connected) return false;

    try {
      const command = COMMANDS[this.config.protocol].tare;
      
      if (!window.electronAPI?.serialSend) {
        return true; // Mock success
      }

      const response = await window.electronAPI.serialSend(
        this.config.port,
        command
      );

      return response.success;
    } catch {
      return false;
    }
  }

  /**
   * Send zero command
   */
  async zero(): Promise<boolean> {
    if (!this.status.connected) return false;

    try {
      const command = COMMANDS[this.config.protocol].zero;
      
      if (!window.electronAPI?.serialSend) {
        return true; // Mock success
      }

      const response = await window.electronAPI.serialSend(
        this.config.port,
        command
      );

      return response.success;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // STATUS
  // ============================================================================

  /**
   * Get current status
   */
  getStatus(): ScaleStatus {
    return { ...this.status };
  }

  /**
   * Get last reading
   */
  getLastReading(): ScaleReading | null {
    return this.status.lastReading;
  }

  // ============================================================================
  // PARSING
  // ============================================================================

  /**
   * Parse scale response based on protocol
   */
  private parseReading(raw: string): ScaleReading {
    const timestamp = new Date();
    
    let weight = 0;
    let unit: 'kg' | 'lb' | 'g' = 'kg';
    let stable = true;
    const tare = 0; // Current tare value
    let overload = false;
    let underload = false;
    let error = false;

    try {
      switch (this.config.protocol) {
        case 'toledo': {
          // Toledo format: "ST,GS,  0.000kg"
          // or "US,GS,  0.000kg" (unstable)
          stable = !raw.startsWith('US');
          const toledoMatch = raw.match(/([+-]?\d+\.?\d*)\s*(kg|lb|g)/i);
          if (toledoMatch) {
            weight = parseFloat(toledoMatch[1]);
            unit = toledoMatch[2].toLowerCase() as 'kg' | 'lb' | 'g';
          }
          break;
        }

        case 'cas': {
          // CAS format: "ST  0.000 KG"
          stable = raw.includes('ST');
          const casMatch = raw.match(/([+-]?\d+\.?\d*)\s*(KG|LB|G)/i);
          if (casMatch) {
            weight = parseFloat(casMatch[1]);
            unit = casMatch[2].toLowerCase() as 'kg' | 'lb' | 'g';
          }
          break;
        }

        case 'mettler': {
          // Mettler format: "S S   0.000 kg"
          // First S = stable, second S = positive
          stable = !raw.includes('SD') && !raw.includes('D');
          const mettlerMatch = raw.match(/([+-]?\d+\.?\d*)\s*(kg|lb|g)/i);
          if (mettlerMatch) {
            weight = parseFloat(mettlerMatch[1]);
            unit = mettlerMatch[2].toLowerCase() as 'kg' | 'lb' | 'g';
          }
          break;
        }

        default: {
          // Generic: try to extract any number
          const genericMatch = raw.match(/([+-]?\d+\.?\d*)/);
          if (genericMatch) {
             weight = parseFloat(genericMatch[1]);
          }
        }
      }

      // Check for overload/underload indicators
      overload = raw.includes('OL') || raw.includes('OVER');
      underload = weight < 0;
      error = raw.includes('ER') || raw.includes('ERROR');

    } catch {
      error = true;
    }

    return {
      weight,
      unit,
      stable,
      tare,
      overload,
      underload,
      error,
      raw,
      timestamp,
    };
  }

  /**
   * Get mock reading for development/testing
   */
  private getMockReading(): ScaleReading {
    return {
      weight: Math.random() * 5,
      unit: 'kg',
      stable: Math.random() > 0.2,
      tare: 0,
      overload: false,
      underload: false,
      error: false,
      raw: 'MOCK',
      timestamp: new Date(),
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a new scale driver instance
 */
export function createScaleDriver(config: ScaleConfig): ScaleDriver {
  return new ScaleDriver(config);
}

/**
 * List available serial ports (via Electron IPC)
 */
export async function listSerialPorts(): Promise<string[]> {
  if (!window.electronAPI?.serialListPorts) {
    console.warn('Serial API not available');
    return [];
  }

  const ports = await window.electronAPI.serialListPorts();
  return ports.map((p: { path: string }) => p.path);
}
