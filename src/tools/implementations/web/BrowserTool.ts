/**
 * @fileoverview Browser Automation Tool for Claude Code Clone
 * 
 * This tool provides browser automation capabilities using Playwright:
 * - Navigate to URLs
 * - Click elements
 * - Type text into inputs
 * - Take screenshots
 * - Execute JavaScript
 * - Wait for elements or timeouts
 * - Scroll pages
 * - Extract text and attributes
 * 
 * @module BrowserTool
 * @version 1.0.0
 * @author Claude Code Clone
 */

import { z } from 'zod';
import { Tool, ToolCategory, PermissionLevel, ToolResult, ToolContext, ToolExecutionStatus, createToolError, ToolError } from '../../Tool';

// ============================================================================
// Input Schemas for Each Action
// ============================================================================

export const BrowserNavigateSchema = z.object({
  action: z.literal('navigate'),
  url: z.string().url().describe('URL to navigate to'),
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).optional().default('load')
    .describe('When to consider navigation complete'),
  timeout: z.number().int().min(1000).max(120000).optional().default(30000)
    .describe('Navigation timeout in milliseconds'),
}).describe('Navigate to a URL');

export const BrowserClickSchema = z.object({
  action: z.literal('click'),
  selector: z.string().min(1).describe('CSS selector or XPath for the element to click'),
  button: z.enum(['left', 'right', 'middle']).optional().default('left')
    .describe('Mouse button to use'),
  doubleClick: z.boolean().optional().default(false)
    .describe('Whether to double-click'),
  timeout: z.number().int().min(1000).max(60000).optional().default(10000)
    .describe('Timeout to wait for element in milliseconds'),
}).describe('Click an element on the page');

export const BrowserTypeSchema = z.object({
  action: z.literal('type'),
  selector: z.string().min(1).describe('CSS selector or XPath for the input element'),
  text: z.string().describe('Text to type'),
  clear: z.boolean().optional().default(true)
    .describe('Clear existing text before typing'),
  submit: z.boolean().optional().default(false)
    .describe('Press Enter after typing'),
  delay: z.number().int().min(0).max(1000).optional().default(0)
    .describe('Delay between keystrokes in milliseconds'),
  timeout: z.number().int().min(1000).max(60000).optional().default(10000)
    .describe('Timeout to wait for element in milliseconds'),
}).describe('Type text into an input element');

export const BrowserScreenshotSchema = z.object({
  action: z.literal('screenshot'),
  selector: z.string().optional()
    .describe('CSS selector for element to screenshot (omit for full page)'),
  fullPage: z.boolean().optional().default(false)
    .describe('Take full page screenshot'),
  format: z.enum(['png', 'jpeg']).optional().default('png')
    .describe('Image format'),
  quality: z.number().int().min(0).max(100).optional()
    .describe('JPEG quality (0-100, only for jpeg format)'),
  encoding: z.enum(['binary', 'base64']).optional().default('base64')
    .describe('Output encoding'),
  timeout: z.number().int().min(1000).max(60000).optional().default(10000)
    .describe('Timeout in milliseconds'),
}).describe('Take a screenshot of the page or element');

export const BrowserEvaluateSchema = z.object({
  action: z.literal('evaluate'),
  script: z.string().min(1).describe('JavaScript code to execute in the browser context'),
  args: z.array(z.unknown()).optional().default([])
    .describe('Arguments to pass to the script'),
  timeout: z.number().int().min(1000).max(60000).optional().default(30000)
    .describe('Script execution timeout in milliseconds'),
}).describe('Execute JavaScript in the browser context');

export const BrowserWaitSchema = z.object({
  action: z.literal('wait'),
  type: z.enum(['selector', 'time', 'function', 'navigation', 'networkidle']).default('time')
    .describe('What to wait for'),
  value: z.union([z.string(), z.number()]).optional()
    .describe('Value to wait for (selector string, time in ms, or function name)'),
  timeout: z.number().int().min(1000).max(120000).optional().default(30000)
    .describe('Maximum wait time in milliseconds'),
  visible: z.boolean().optional().default(true)
    .describe('Wait for element to be visible (for selector type)'),
}).describe('Wait for an element, time, or condition');

export const BrowserScrollSchema = z.object({
  action: z.literal('scroll'),
  direction: z.enum(['up', 'down', 'left', 'right', 'to']).default('down')
    .describe('Scroll direction'),
  amount: z.number().int().min(0).optional().default(500)
    .describe('Pixels to scroll (not used with "to" direction)'),
  selector: z.string().optional()
    .describe('Scroll to element matching this selector (for "to" direction)'),
  x: z.number().int().optional()
    .describe('X coordinate to scroll to (for "to" direction without selector)'),
  y: z.number().int().optional()
    .describe('Y coordinate to scroll to (for "to" direction without selector)'),
  smooth: z.boolean().optional().default(true)
    .describe('Use smooth scrolling'),
  timeout: z.number().int().min(1000).max(60000).optional().default(10000)
    .describe('Timeout to wait for element (if selector provided)'),
}).describe('Scroll the page');

export const BrowserGetTextSchema = z.object({
  action: z.literal('getText'),
  selector: z.string().min(1).describe('CSS selector for the element'),
  includeHidden: z.boolean().optional().default(false)
    .describe('Include hidden element text'),
  timeout: z.number().int().min(1000).max(60000).optional().default(10000)
    .describe('Timeout to wait for element in milliseconds'),
}).describe('Get text content of an element');

export const BrowserGetAttributeSchema = z.object({
  action: z.literal('getAttribute'),
  selector: z.string().min(1).describe('CSS selector for the element'),
  attribute: z.string().min(1).describe('Name of the attribute to get'),
  timeout: z.number().int().min(1000).max(60000).optional().default(10000)
    .describe('Timeout to wait for element in milliseconds'),
}).describe('Get an attribute value of an element');

// ============================================================================
// Union Input Schema
// ============================================================================

export const BrowserInputSchema = z.discriminatedUnion('action', [
  BrowserNavigateSchema,
  BrowserClickSchema,
  BrowserTypeSchema,
  BrowserScreenshotSchema,
  BrowserEvaluateSchema,
  BrowserWaitSchema,
  BrowserScrollSchema,
  BrowserGetTextSchema,
  BrowserGetAttributeSchema,
]).describe('Browser automation action to perform');

export type BrowserInput = z.infer<typeof BrowserInputSchema>;

// ============================================================================
// Output Schemas
// ============================================================================

export const BrowserNavigateOutputSchema = z.object({
  url: z.string().describe('Current page URL'),
  title: z.string().describe('Page title'),
  success: z.boolean().describe('Whether navigation succeeded'),
}).describe('Navigation result');

export const BrowserClickOutputSchema = z.object({
  success: z.boolean().describe('Whether click succeeded'),
  selector: z.string().describe('Selector that was clicked'),
}).describe('Click result');

export const BrowserTypeOutputSchema = z.object({
  success: z.boolean().describe('Whether typing succeeded'),
  selector: z.string().describe('Input selector'),
  text: z.string().describe('Text that was typed'),
}).describe('Type result');

export const BrowserScreenshotOutputSchema = z.object({
  success: z.boolean().describe('Whether screenshot succeeded'),
  data: z.string().optional().describe('Screenshot data (base64 or binary)'),
  format: z.string().describe('Image format'),
  width: z.number().int().optional().describe('Screenshot width'),
  height: z.number().int().optional().describe('Screenshot height'),
}).describe('Screenshot result');

export const BrowserEvaluateOutputSchema = z.object({
  success: z.boolean().describe('Whether script execution succeeded'),
  result: z.unknown().optional().describe('Script return value'),
  logs: z.array(z.object({
    type: z.enum(['log', 'error', 'warn', 'info']),
    message: z.string(),
  })).describe('Console logs captured during execution'),
}).describe('Evaluate result');

export const BrowserWaitOutputSchema = z.object({
  success: z.boolean().describe('Whether wait succeeded'),
  type: z.string().describe('Type of wait performed'),
  duration: z.number().describe('Actual wait duration in milliseconds'),
}).describe('Wait result');

export const BrowserScrollOutputSchema = z.object({
  success: z.boolean().describe('Whether scroll succeeded'),
  x: z.number().describe('Final scroll X position'),
  y: z.number().describe('Final scroll Y position'),
}).describe('Scroll result');

export const BrowserGetTextOutputSchema = z.object({
  success: z.boolean().describe('Whether text extraction succeeded'),
  text: z.string().describe('Extracted text content'),
  selector: z.string().describe('Element selector'),
}).describe('GetText result');

export const BrowserGetAttributeOutputSchema = z.object({
  success: z.boolean().describe('Whether attribute extraction succeeded'),
  value: z.string().optional().describe('Attribute value (undefined if not found)'),
  selector: z.string().describe('Element selector'),
  attribute: z.string().describe('Attribute name'),
}).describe('GetAttribute result');

// Union output type
export type BrowserOutput = 
  | z.infer<typeof BrowserNavigateOutputSchema>
  | z.infer<typeof BrowserClickOutputSchema>
  | z.infer<typeof BrowserTypeOutputSchema>
  | z.infer<typeof BrowserScreenshotOutputSchema>
  | z.infer<typeof BrowserEvaluateOutputSchema>
  | z.infer<typeof BrowserWaitOutputSchema>
  | z.infer<typeof BrowserScrollOutputSchema>
  | z.infer<typeof BrowserGetTextOutputSchema>
  | z.infer<typeof BrowserGetAttributeOutputSchema>;

// ============================================================================
// Browser Manager (Singleton Pattern)
// ============================================================================

interface BrowserSession {
  browser: unknown;
  context: unknown;
  page: unknown;
  createdAt: Date;
  lastUsedAt: Date;
}

class BrowserManager {
  private static instance: BrowserManager;
  private sessions: Map<string, BrowserSession> = new Map();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private playwright: any | null = null;

  private constructor() {}

  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getPlaywright(): Promise<any> {
    if (!this.playwright) {
      this.playwright = await import('playwright-core');
    }
    return this.playwright;
  }

  async getOrCreateSession(sessionId: string): Promise<BrowserSession> {
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      const playwright = await this.getPlaywright();
      
      // Launch browser with security settings
      const browser = await playwright.chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      });

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York',
        bypassCSP: false,
      });

      const page = await context.newPage();

      // Set default timeout
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);

      session = {
        browser,
        context,
        page,
        createdAt: new Date(),
        lastUsedAt: new Date(),
      };

      this.sessions.set(sessionId, session);
    } else {
      session.lastUsedAt = new Date();
    }

    return session;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (session.browser as any).close();
      } catch {
        // Ignore close errors
      }
      this.sessions.delete(sessionId);
    }
  }

  async closeAllSessions(): Promise<void> {
    const promises = Array.from(this.sessions.keys()).map(id => this.closeSession(id));
    await Promise.all(promises);
  }

  getSessionCount(): number {
    return this.sessions.size;
  }
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class BrowserTool extends Tool {
  public readonly name = 'browser';
  public readonly description = 'Browser automation using Playwright - navigate, click, type, screenshot, evaluate JS, wait, scroll, and extract data from web pages';
  public readonly documentation = `
## Browser Tool

Automates browser interactions using Playwright:
- Navigate to URLs
- Click elements
- Type text into inputs
- Take screenshots
- Execute JavaScript
- Wait for elements or conditions
- Scroll pages
- Extract text and attributes

### Actions

#### navigate
Navigate to a URL.
\`\`\`json
{
  "action": "navigate",
  "url": "https://example.com",
  "waitUntil": "load"
}
\`\`\`

#### click
Click an element.
\`\`\`json
{
  "action": "click",
  "selector": "#submit-button",
  "button": "left"
}
\`\`\`

#### type
Type text into an input field.
\`\`\`json
{
  "action": "type",
  "selector": "#username",
  "text": "john_doe",
  "clear": true,
  "submit": false
}
\`\`\`

#### screenshot
Take a screenshot.
\`\`\`json
{
  "action": "screenshot",
  "fullPage": true,
  "format": "png",
  "encoding": "base64"
}
\`\`\`

#### evaluate
Execute JavaScript in the browser context.
\`\`\`json
{
  "action": "evaluate",
  "script": "document.title"
}
\`\`\`

#### wait
Wait for an element, time, or condition.
\`\`\`json
{
  "action": "wait",
  "type": "selector",
  "value": "#loading-complete"
}
\`\`\`

#### scroll
Scroll the page.
\`\`\`json
{
  "action": "scroll",
  "direction": "down",
  "amount": 500
}
\`\`\`

#### getText
Get text content of an element.
\`\`\`json
{
  "action": "getText",
  "selector": "h1"
}
\`\`\`

#### getAttribute
Get an attribute value of an element.
\`\`\`json
{
  "action": "getAttribute",
  "selector": "a.link",
  "attribute": "href"
}
\`\`\`

### Session Management

The tool maintains a browser session per execution context. Sessions are automatically cleaned up when the tool is destroyed.
`;
  public readonly category = ToolCategory.WEB;
  public readonly permissionLevel = PermissionLevel.ASK; // Browser automation requires user approval
  public readonly inputSchema = BrowserInputSchema;
  public readonly outputSchema = z.any() as z.ZodType<unknown>; // Union output schema
  public readonly tags = ['browser', 'playwright', 'automation', 'web', 'scraping', 'screenshot'];
  public readonly examples = [
    { 
      description: 'Navigate to a website', 
      input: { action: 'navigate', url: 'https://example.com' } 
    },
    { 
      description: 'Click a button', 
      input: { action: 'click', selector: '#submit' } 
    },
    { 
      description: 'Type in a form', 
      input: { action: 'type', selector: '#search', text: 'query', submit: true } 
    },
    { 
      description: 'Take a screenshot', 
      input: { action: 'screenshot', fullPage: true } 
    },
    { 
      description: 'Execute JavaScript', 
      input: { action: 'evaluate', script: 'document.querySelectorAll("a").length' } 
    },
  ];

  private browserManager = BrowserManager.getInstance();

  protected async executeImpl(input: BrowserInput, context: ToolContext): Promise<ToolResult> {
    const startedAt = new Date();
    const sessionId = context.sessionId || 'default';

    try {
      const session = await this.browserManager.getOrCreateSession(sessionId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const page = session.page as any;

      let result: BrowserOutput;

      switch (input.action) {
        case 'navigate':
          result = await this.handleNavigate(page, input);
          break;
        case 'click':
          result = await this.handleClick(page, input);
          break;
        case 'type':
          result = await this.handleType(page, input);
          break;
        case 'screenshot':
          result = await this.handleScreenshot(page, input);
          break;
        case 'evaluate':
          result = await this.handleEvaluate(page, input);
          break;
        case 'wait':
          result = await this.handleWait(page, input);
          break;
        case 'scroll':
          result = await this.handleScroll(page, input);
          break;
        case 'getText':
          result = await this.handleGetText(page, input);
          break;
        case 'getAttribute':
          result = await this.handleGetAttribute(page, input);
          break;
        default:
          throw new Error(`Unknown action: ${(input as { action: string }).action}`);
      }

      const output = this.formatOutput(input.action, result);
      return this.createSuccessResult(startedAt, result, output);

    } catch (error) {
      // Handle Playwright-specific errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('timeout')) {
        return this.createErrorResult(startedAt, createToolError(
          'TIMEOUT',
          `Operation timed out: ${errorMessage}`,
          { suggestion: 'Try increasing the timeout value' }
        ));
      }
      
      if (errorMessage.includes('selector') || errorMessage.includes('element')) {
        return this.createErrorResult(startedAt, createToolError(
          'ELEMENT_NOT_FOUND',
          `Element not found: ${errorMessage}`,
          { suggestion: 'Check if the selector is correct and the element exists' }
        ));
      }

      return this.createErrorResult(startedAt, createToolError(
        'BROWSER_ERROR',
        errorMessage,
        { retryable: true }
      ));
    }
  }

  // ============================================================================
  // Action Handlers
  // ============================================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleNavigate(page: any, input: z.infer<typeof BrowserNavigateSchema>): Promise<z.infer<typeof BrowserNavigateOutputSchema>> {
    const response = await page.goto(input.url, {
      waitUntil: input.waitUntil,
      timeout: input.timeout,
    });

    // Small delay to ensure page is stable
    await new Promise(resolve => setTimeout(resolve, 500));

    return {
      url: response?.url() || input.url,
      title: await (response?.title() || Promise.resolve('')),
      success: true,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleClick(page: any, input: z.infer<typeof BrowserClickSchema>): Promise<z.infer<typeof BrowserClickOutputSchema>> {
    await page.click(input.selector, {
      button: input.button,
      doubleClick: input.doubleClick,
      timeout: input.timeout,
    });

    return {
      success: true,
      selector: input.selector,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleType(page: any, input: z.infer<typeof BrowserTypeSchema>): Promise<z.infer<typeof BrowserTypeOutputSchema>> {
    if (input.clear) {
      await page.fill(input.selector, input.text, { timeout: input.timeout });
    } else {
      await page.type(input.selector, input.text, { 
        delay: input.delay,
        timeout: input.timeout,
      });
    }

    if (input.submit) {
      await page.press(input.selector, 'Enter', { timeout: input.timeout });
    }

    return {
      success: true,
      selector: input.selector,
      text: input.text,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleScreenshot(page: any, input: z.infer<typeof BrowserScreenshotSchema>): Promise<z.infer<typeof BrowserScreenshotOutputSchema>> {
    const screenshotOptions: { 
      fullPage?: boolean; 
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type?: any; 
      quality?: number; 
      encoding?: string; 
      timeout?: number;
      element?: string;
    } = {
      fullPage: input.fullPage,
      type: input.format,
      encoding: input.encoding,
      timeout: input.timeout,
    };

    if (input.format === 'jpeg' && input.quality !== undefined) {
      screenshotOptions.quality = input.quality;
    }

    if (input.selector) {
      screenshotOptions.element = input.selector;
    }

    const screenshot = await page.screenshot(screenshotOptions);
    const data = typeof screenshot === 'string' ? screenshot : screenshot.toString('base64');

    return {
      success: true,
      data: input.encoding === 'base64' ? `data:image/${input.format};base64,${data}` : data,
      format: input.format,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleEvaluate(page: any, input: z.infer<typeof BrowserEvaluateSchema>): Promise<z.infer<typeof BrowserEvaluateOutputSchema>> {
    const logs: Array<{ type: 'log' | 'error' | 'warn' | 'info'; message: string }> = [];

    // Wrap script to capture logs
    const wrappedScript = `
      (async () => {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        const originalInfo = console.info;
        const logs = [];
        
        console.log = (...args) => { logs.push({ type: 'log', message: args.join(' ') }); originalLog.apply(console, args); };
        console.error = (...args) => { logs.push({ type: 'error', message: args.join(' ') }); originalError.apply(console, args); };
        console.warn = (...args) => { logs.push({ type: 'warn', message: args.join(' ') }); originalWarn.apply(console, args); };
        console.info = (...args) => { logs.push({ type: 'info', message: args.join(' ') }); originalInfo.apply(console, args); };
        
        try {
          const result = await (${input.script})(...arguments);
          return { result, logs };
        } catch (e) {
          return { error: e.message, logs };
        }
      })()
    `;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evalResult = await page.evaluate(wrappedScript, input.args) as any;

    if (evalResult && typeof evalResult === 'object' && 'error' in evalResult) {
      throw new Error(String(evalResult.error));
    }

    return {
      success: true,
      result: evalResult && typeof evalResult === 'object' ? evalResult.result : evalResult,
      logs: evalResult && typeof evalResult === 'object' && 'logs' in evalResult ? evalResult.logs : logs,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleWait(page: any, input: z.infer<typeof BrowserWaitSchema>): Promise<z.infer<typeof BrowserWaitOutputSchema>> {
    const startTime = Date.now();

    switch (input.type) {
      case 'selector':
        if (typeof input.value !== 'string') {
          throw new Error('Selector wait requires a string value');
        }
        await page.waitForSelector(input.value, {
          timeout: input.timeout,
          visible: input.visible,
        });
        break;
      case 'time':
        await page.waitForTimeout(typeof input.value === 'number' ? input.value : 1000);
        break;
      case 'navigation':
        await page.waitForLoadState('networkidle', { timeout: input.timeout });
        break;
      case 'networkidle':
        await page.waitForLoadState('networkidle', { timeout: input.timeout });
        break;
      default:
        throw new Error(`Unknown wait type: ${input.type}`);
    }

    return {
      success: true,
      type: input.type,
      duration: Date.now() - startTime,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleScroll(page: any, input: z.infer<typeof BrowserScrollSchema>): Promise<z.infer<typeof BrowserScrollOutputSchema>> {
    if (input.direction === 'to' && input.selector) {
      // Scroll element into view
      const element = await page.$(input.selector);
      if (element) {
        await element.scrollIntoViewIfNeeded();
      }
    } else {
      // Use evaluate for scrolling
      const scrollScript = (direction: string, amount: number, smooth: boolean) => {
        const behavior = smooth ? 'smooth' : 'auto';
        switch (direction) {
          case 'up':
            window.scrollBy({ top: -amount, behavior });
            break;
          case 'down':
            window.scrollBy({ top: amount, behavior });
            break;
          case 'left':
            window.scrollBy({ left: -amount, behavior });
            break;
          case 'right':
            window.scrollBy({ left: amount, behavior });
            break;
          case 'to':
            window.scrollTo({ top: (input.y || 0), left: (input.x || 0), behavior });
            break;
        }
        return { x: window.scrollX, y: window.scrollY };
      };
      await page.evaluate(scrollScript, input.direction, input.amount, input.smooth);
    }

    // Get final scroll position
    const position = await page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY,
    }));

    return {
      success: true,
      x: position.x,
      y: position.y,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleGetText(page: any, input: z.infer<typeof BrowserGetTextSchema>): Promise<z.infer<typeof BrowserGetTextOutputSchema>> {
    const text = await page.evaluate((selector: string) => {
      const el = document.querySelector(selector);
      if (el) {
        return el.textContent || '';
      }
      return '';
    }, input.selector);

    return {
      success: true,
      text: text.trim(),
      selector: input.selector,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleGetAttribute(page: any, input: z.infer<typeof BrowserGetAttributeSchema>): Promise<z.infer<typeof BrowserGetAttributeOutputSchema>> {
    const value = await page.evaluate((selector: string, attr: string) => {
      const el = document.querySelector(selector);
      if (el) {
        return el.getAttribute(attr);
      }
      return null;
    }, input.selector, input.attribute);

    return {
      success: true,
      value: value || undefined,
      selector: input.selector,
      attribute: input.attribute,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  protected async validateContext(): Promise<{ valid: boolean; errors?: string[] }> {
    return { valid: true };
  }

  private formatOutput(action: string, result: BrowserOutput): string {
    const parts: string[] = [];
    parts.push(`🌐 Browser: ${action}`);
    
    if ('url' in result) {
      parts.push(`URL: ${result.url}`);
    }
    if ('title' in result && result.title) {
      parts.push(`Title: ${result.title}`);
    }
    if ('selector' in result) {
      parts.push(`Selector: ${result.selector}`);
    }
    if ('text' in result && typeof result.text === 'string') {
      parts.push(`Text: ${result.text.substring(0, 200)}${result.text.length > 200 ? '...' : ''}`);
    }
    if ('value' in result) {
      parts.push(`Value: ${result.value || '(not set)'}`);
    }
    if ('x' in result && 'y' in result && action === 'scroll') {
      parts.push(`Position: (${result.x}, ${result.y})`);
    }
    if ('duration' in result) {
      parts.push(`Duration: ${result.duration}ms`);
    }
    if ('result' in result && result.result !== undefined) {
      const resultStr = JSON.stringify(result.result, null, 2);
      parts.push(`Result: ${resultStr.substring(0, 500)}${resultStr.length > 500 ? '...' : ''}`);
    }
    if ('data' in result && result.data) {
      parts.push(`Screenshot: ${result.data.substring(0, 50)}... (${result.data.length} chars)`);
    }

    return parts.join('\n');
  }

  private createSuccessResult(startedAt: Date, data: BrowserOutput, output: string): ToolResult {
    return {
      executionId: `${this.name}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      status: ToolExecutionStatus.SUCCESS,
      toolName: this.name,
      startedAt,
      completedAt: new Date(),
      duration: Date.now() - startedAt.getTime(),
      success: true,
      data,
      output,
    };
  }

  private createErrorResult(startedAt: Date, error: ToolError): ToolResult {
    return {
      executionId: `${this.name}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      status: ToolExecutionStatus.FAILURE,
      toolName: this.name,
      startedAt,
      completedAt: new Date(),
      duration: Date.now() - startedAt.getTime(),
      success: false,
      error,
    };
  }

  // Cleanup browser sessions
  async cleanup(): Promise<void> {
    await this.browserManager.closeAllSessions();
  }
}

export default BrowserTool;
