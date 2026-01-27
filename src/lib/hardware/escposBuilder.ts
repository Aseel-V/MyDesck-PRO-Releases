/**
 * ESC/POS Command Builder
 * 
 * Builds ESC/POS command sequences for thermal receipt printers.
 * Compatible with most Epson-compatible thermal printers (58mm, 80mm).
 * 
 * Used for:
 * - Receipt printing
 * - Kitchen tickets
 * - Cash drawer kick
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

// Text alignment
export const ALIGN_LEFT = 0;
export const ALIGN_CENTER = 1;
export const ALIGN_RIGHT = 2;

// Text size
export const SIZE_NORMAL = 0x00;
export const SIZE_DOUBLE_WIDTH = 0x10;
export const SIZE_DOUBLE_HEIGHT = 0x01;
export const SIZE_DOUBLE_BOTH = 0x11;

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Reverse Hebrew text for RTL printing on thermal printers
 * Keeps English/Numbers valid (LTR)
 */
export function reverseHebrew(text: string): string {
  // Check if contains Hebrew
  if (!/[\u0590-\u05FF]/.test(text)) {
    return text;
  }

  // Split by spaces to preserve word order if needed, OR just full reverse?
  // Thermal printers usually print characters left-to-right.
  // For "שלום123" we want "123םולש" or "321םולש"?
  // Usually "Shalom 123" -> "123 molahS" on the paper creates "Shalom 123" if reading RTL?
  // No, thermal printers print line by line.
  // If I send "ABC", it prints "A", then "B", then "C".
  // If I want to read "שלום" (Right to Left), I need the printer to print "ש" on the right.
  // But standard printers start at the left margin.
  // If I align RIGHT, it starts at the right margin but prints "ש", then "ל" to the right of it? No.
  // Alignment only affects the starting X position. The character direction is still font-based.
  // Most thermal printers don't support true RTL. They just print chars.
  // So to read "שלום", I need to print "ם", then "ו", then "ל", then "ש".
  // So "שלום" becomes "םולש".
  // What about "Milk 3%"? -> "%3 kliM" ?
  // Yes, simplistic reversal.

  return text.split('').reverse().join('');
}

// ============================================================================
// TYPES
// ============================================================================

export interface PrinterConfig {
  paperWidth: 58 | 80;   // Paper width in mm
  encoding: 'cp862' | 'utf8' | 'windows-1255';
  cutAfterPrint: boolean;
  openDrawer: boolean;
}

export type TextAlign = 'left' | 'center' | 'right';
export type TextSize = 'normal' | 'double-width' | 'double-height' | 'double';

// ============================================================================
// ESC/POS BUILDER CLASS
// ============================================================================

export class ESCPOSBuilder {
  private commands: number[] = [];
  private config: PrinterConfig;

  constructor(config: Partial<PrinterConfig> = {}) {
    this.config = {
      paperWidth: config.paperWidth || 80,
      encoding: config.encoding || 'cp862',
      cutAfterPrint: config.cutAfterPrint !== false,
      openDrawer: config.openDrawer || false,
    };
    
    // Initialize printer
    this.initialize();
  }

  // ============================================================================
  // BASIC COMMANDS
  // ============================================================================

  /**
   * Initialize printer (reset to default state)
   */
  initialize(): this {
    this.commands.push(ESC, 0x40); // ESC @
    return this;
  }

  /**
   * Add line feed (new line)
   */
  lineFeed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) {
      this.commands.push(LF);
    }
    return this;
  }

  /**
   * Set text alignment
   */
  align(alignment: TextAlign): this {
    const alignCode = alignment === 'center' ? ALIGN_CENTER 
                    : alignment === 'right' ? ALIGN_RIGHT 
                    : ALIGN_LEFT;
    this.commands.push(ESC, 0x61, alignCode); // ESC a n
    return this;
  }

  /**
   * Set text size
   */
  setSize(size: TextSize): this {
    let sizeCode: number;
    switch (size) {
      case 'double-width':
        sizeCode = SIZE_DOUBLE_WIDTH;
        break;
      case 'double-height':
        sizeCode = SIZE_DOUBLE_HEIGHT;
        break;
      case 'double':
        sizeCode = SIZE_DOUBLE_BOTH;
        break;
      default:
        sizeCode = SIZE_NORMAL;
    }
    this.commands.push(GS, 0x21, sizeCode); // GS ! n
    return this;
  }

  /**
   * Set bold on/off
   */
  bold(on: boolean = true): this {
    this.commands.push(ESC, 0x45, on ? 1 : 0); // ESC E n
    return this;
  }

  /**
   * Set underline on/off
   */
  underline(on: boolean = true): this {
    this.commands.push(ESC, 0x2D, on ? 1 : 0); // ESC - n
    return this;
  }

  /**
   * Set inverse (white on black) on/off
   */
  inverse(on: boolean = true): this {
    this.commands.push(GS, 0x42, on ? 1 : 0); // GS B n
    return this;
  }

  // ============================================================================
  // TEXT OUTPUT
  // ============================================================================

  /**
   * Print text (automatically converts to appropriate encoding)
   */
  text(content: string): this {
    const bytes = this.encodeText(content);
    this.commands.push(...bytes);
    return this;
  }

  /**
   * Print text and line feed
   */
  textLn(content: string): this {
    return this.text(content).lineFeed();
  }

  /**
   * Print centered text
   */
  centerText(content: string): this {
    return this.align('center').textLn(content).align('left');
  }

  /**
   * Print right-aligned text
   */
  rightText(content: string): this {
    return this.align('right').textLn(content).align('left');
  }

  /**
   * Print two-column text (left and right aligned)
   */
  twoColumn(left: string, right: string): this {
    const maxWidth = this.getCharWidth();
    const padding = maxWidth - left.length - right.length;
    
    if (padding > 0) {
      this.text(left + ' '.repeat(padding) + right);
    } else {
      // Truncate left side if too long
      const truncLeft = left.substring(0, maxWidth - right.length - 1);
      this.text(truncLeft + ' ' + right);
    }
    
    return this.lineFeed();
  }

  /**
   * Print a horizontal line
   */
  horizontalLine(char: string = '-'): this {
    const width = this.getCharWidth();
    return this.textLn(char.repeat(width));
  }

  /**
   * Print dashed line
   */
  dashedLine(): this {
    return this.horizontalLine('-');
  }

  /**
   * Print double line
   */
  doubleLine(): this {
    return this.horizontalLine('=');
  }

  // ============================================================================
  // FORMATTING
  // ============================================================================

  /**
   * Print formatted currency amount
   */
  currency(amount: number, symbol: string = '₪'): string {
    return `${symbol}${amount.toFixed(2)}`;
  }

  /**
   * Start a section with title
   */
  section(title: string): this {
    return this.dashedLine()
               .bold(true)
               .centerText(title)
               .bold(false)
               .dashedLine();
  }

  /**
   * Print item line with price
   */
  itemLine(description: string, price: string): this {
    return this.twoColumn(description, price);
  }

  // ============================================================================
  // BARCODE
  // ============================================================================

  /**
   * Print barcode
   * @param data Barcode data
   * @param type Barcode type (default: CODE128)
   */
  barcode(data: string, type: 'EAN13' | 'CODE128' = 'CODE128'): this {
    // Set barcode height
    this.commands.push(GS, 0x68, 80); // GS h n (height = 80 dots)
    
    // Set barcode width
    this.commands.push(GS, 0x77, 2); // GS w n (width = 2)
    
    // Set HRI (Human Readable Interpretation) position
    this.commands.push(GS, 0x48, 2); // GS H n (below barcode)
    
    // Print barcode
    if (type === 'EAN13') {
      this.commands.push(GS, 0x6B, 2); // GS k m (EAN13)
    } else {
      this.commands.push(GS, 0x6B, 73, data.length); // GS k m n (CODE128)
    }
    
    const bytes = this.encodeText(data);
    this.commands.push(...bytes, 0x00);
    
    return this.lineFeed();
  }

  /**
   * Print QR code
   */
  qrCode(data: string, size: number = 6): this {
    // QR Code: Select model
    this.commands.push(GS, 0x28, 0x6B, 4, 0, 49, 65, 50, 0);
    
    // QR Code: Set size
    this.commands.push(GS, 0x28, 0x6B, 3, 0, 49, 67, size);
    
    // QR Code: Set error correction level (M)
    this.commands.push(GS, 0x28, 0x6B, 3, 0, 49, 69, 48);
    
    // QR Code: Store data
    const dataBytes = this.encodeText(data);
    const dataLen = dataBytes.length + 3;
    this.commands.push(
      GS, 0x28, 0x6B,
      dataLen & 0xFF, (dataLen >> 8) & 0xFF,
      49, 80, 48,
      ...dataBytes
    );
    
    // QR Code: Print
    this.commands.push(GS, 0x28, 0x6B, 3, 0, 49, 81, 48);
    
    return this.lineFeed();
  }

  // ============================================================================
  // SPECIAL COMMANDS
  // ============================================================================

  /**
   * Cut paper
   * @param partial If true, partial cut; if false, full cut
   */
  cut(partial: boolean = true): this {
    this.lineFeed(3);
    this.commands.push(GS, 0x56, partial ? 1 : 0); // GS V m
    return this;
  }

  /**
   * Open cash drawer
   * @param pin Drawer connector pin (1 or 2)
   */
  openDrawer(pin: 1 | 2 = 1): this {
    const pinCode = pin === 1 ? 0x00 : 0x01;
    // ESC p m t1 t2 (pulse signal)
    this.commands.push(ESC, 0x70, pinCode, 0x19, 0xFA);
    return this;
  }

  /**
   * Print and feed paper
   */
  feedAndCut(): this {
    return this.lineFeed(5).cut();
  }

  // ============================================================================
  // BUILD & OUTPUT
  // ============================================================================

  /**
   * Build final command buffer
   */
  build(): Uint8Array {
    // Add drawer command if configured
    if (this.config.openDrawer) {
      this.openDrawer();
    }
    
    // Add cut command if configured
    if (this.config.cutAfterPrint) {
      this.cut();
    }
    
    return new Uint8Array(this.commands);
  }

  /**
   * Build as base64 string (for IPC transfer)
   */
  buildBase64(): string {
    const buffer = this.build();
    // Convert to base64
    let binary = '';
    for (let i = 0; i < buffer.length; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }

  /**
   * Build as hex string (for debugging)
   */
  buildHex(): string {
    const buffer = this.build();
    return Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Get character width based on paper size
   */
  private getCharWidth(): number {
    return this.config.paperWidth === 80 ? 48 : 32;
  }

  /**
   * Encode text to bytes
   * For Hebrew, use code page 862 or UTF-8
   */
  private encodeText(text: string): number[] {
    const bytes: number[] = [];
    
    // Set code page for Hebrew (CP862)
    if (this.config.encoding === 'cp862') {
      bytes.push(ESC, 0x74, 36); // ESC t 36 (Code page 862 - Hebrew)
    }
    
    // Simple encoding - works for ASCII/Hebrew mix
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 128) {
        bytes.push(code);
      } else if (code >= 0x05D0 && code <= 0x05EA) {
        // Hebrew Unicode to CP862
        bytes.push(code - 0x05D0 + 0x80);
      } else {
        // Unknown character - use placeholder
        bytes.push(0x3F); // ?
      }
    }
    
    return bytes;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create new ESC/POS builder
 */
export function createESCPOSBuilder(config?: Partial<PrinterConfig>): ESCPOSBuilder {
  return new ESCPOSBuilder(config);
}

// ============================================================================
// QUICK TEMPLATES
// ============================================================================

/**
 * Generate drawer kick command only
 */
export function getDrawerKickCommand(): Uint8Array {
  return new ESCPOSBuilder({ cutAfterPrint: false, openDrawer: true }).build();
}

/**
 * Generate beep command
 */
export function getBeepCommand(): Uint8Array {
  const builder = new ESCPOSBuilder({ cutAfterPrint: false });
  // ESC B n t (beep n times, t duration)
  builder['commands'].push(ESC, 0x42, 3, 5);
  return builder.build();
}
