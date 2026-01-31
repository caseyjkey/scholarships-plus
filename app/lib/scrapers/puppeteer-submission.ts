import puppeteer from 'puppeteer';
import { prisma } from '~/db.server';

interface SubmissionData {
  scholarshipId: string;
  portal: string;
  applicationUrl: string;
  fields: Record<string, string>;
}

interface SubmissionConfig {
  portal: 'nativeforward' | 'aises' | 'cobell';
  selectors: {
    [fieldName: string]: string;
  };
}

const SUBMISSION_CONFIGS: Record<string, SubmissionConfig> = {
  nativeforward: {
    portal: 'nativeforward',
    selectors: {
      firstName: '#firstName, [name="firstName"]',
      lastName: '#lastName, [name="lastName"]',
      email: '#email, [name="email"]',
      essay: '#essay, [name="essay"], textarea',
      submitButton: 'button[type="submit"], input[type="submit"]'
    }
  }
};

export class PuppeteerSubmitter {
  private browser?: puppeteer.Browser;
  private page?: puppeteer.Page;
  private config: SubmissionConfig;

  constructor(portal: string) {
    this.config = SUBMISSION_CONFIGS[portal];
    if (!this.config) {
      throw new Error(`Unknown portal: ${portal}`);
    }
  }

  async submit(userId: string, data: SubmissionData): Promise<{ success: boolean; message?: string; error?: string }> {
    const session = await prisma.portalSession.findUnique({
      where: {
        userId_portal: {
          userId,
          portal: this.config.portal
        }
      }
    });

    if (!session || new Date(session.expiresAt) < new Date()) {
      return {
        success: false,
        error: `No valid session for ${this.config.portal}. Please connect your account again.`
      };
    }

    try {
      this.browser = await puppeteer.launch({
        headless: true,
        defaultViewport: { width: 1280, height: 800 }
      });

      this.page = await this.browser.newPage();

      await this.page.setCookie(...session.cookies);

      if (session.localStorage) {
        await this.page.evaluate((data) => {
          for (const [key, value] of Object.entries(data)) {
            localStorage.setItem(key, value as string);
          }
        }, session.localStorage);
      }

      await this.page.goto(data.applicationUrl, {
        waitUntil: 'networkidle0'
      });

      const isLoggedIn = await this.page.evaluate(() => {
        return !document.querySelector('[href*="login"]');
      });

      if (!isLoggedIn) {
        await this.browser.close();
        return {
          success: false,
          error: 'Session expired. Please connect your account again.'
        };
      }

      for (const [fieldName, value] of Object.entries(data.fields)) {
        const selector = this.config.selectors[fieldName];
        if (!selector) {
          console.warn(`No selector found for field: ${fieldName}`);
          continue;
        }

        await this.page.waitForSelector(selector, { timeout: 5000 }).catch(() => {
          console.warn(`Field not found: ${fieldName} (${selector})`);
        });

        const input = await this.page.$(selector);
        if (input) {
          await input.evaluate((el, val) => {
            (el as HTMLInputElement | HTMLTextAreaElement).value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, value);
        }
      }

      const submitButton = await this.page.$(this.config.selectors.submitButton);
      if (submitButton) {
        await submitButton.click();
        await this.page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
      }

      const submitted = await this.page.evaluate(() => {
        return document.body.textContent?.includes('submitted') ||
               document.body.textContent?.includes('received') ||
               document.body.textContent?.includes('thank you');
      });

      await this.browser.close();

      if (submitted) {
        return {
          success: true,
          message: 'Application submitted successfully!'
        };
      } else {
        return {
          success: false,
          error: 'Submission could not be verified. Please check manually.'
        };
      }
    } catch (error) {
      await this.browser?.close();
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Submission failed'
      };
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
  }
}
