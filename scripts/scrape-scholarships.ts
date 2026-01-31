#!/usr/bin/env npx tsx
/**
 * Scholarship Indexing Script (DEVELOPER ONLY)
 *
 * Usage:
 *   npx tsx scripts/scrape-scholarships.ts nativeforward
 *   npx tsx scripts/scrape-scholarships.ts aises
 *   npx tsx scripts/scrape-scholarships.ts cobell
 *
 * This script:
 * 1. Launches visible browser
 * 2. Waits for developer to manually log in
 * 3. Captures session cookies
 * 4. Scrapes all scholarships from portal
 * 5. Stores in database
 */

import puppeteer from 'puppeteer';
import { prisma } from '../app/db.server';

interface ScrapedScholarship {
  title: string;
  description: string;
  amount?: number;
  deadline: Date;
  requirements: string[];
  applicationUrl: string;
  sourceUrl: string;
}

interface ScraperConfig {
  portal: 'nativeforward' | 'aises' | 'cobell';
  loginUrl: string;
  scholarshipsUrl: string;
  selectors: {
    scholarshipCard: string;
    title: string;
    description?: string;
    amount?: string;
    deadline?: string;
    requirements?: string;
    applicationLink?: string;
  };
}

const SCRAPER_CONFIGS: Record<string, ScraperConfig> = {
  nativeforward: {
    portal: 'nativeforward',
    loginUrl: 'https://www.nativeforward.org/student-center',
    scholarshipsUrl: 'https://www.nativeforward.org/scholarship-finder',
    selectors: {
      scholarshipCard: '.scholarship-card, [class*="scholarship"]',
      title: 'h3, h4, .title',
      description: '.description, .summary',
      amount: '.amount, .award',
      deadline: '.deadline, .due-date',
      requirements: '.requirements, .criteria',
      applicationLink: 'a[href*="apply"], a[href*="application"]'
    }
  },
  aises: {
    portal: 'aises',
    loginUrl: 'https://www.aises.org/login',
    scholarshipsUrl: 'https://www.aises.org/scholarships',
    selectors: {
      scholarshipCard: '.scholarship-item, [class*="scholarship"]',
      title: 'h3, h4, .title',
      description: '.description, .summary',
      amount: '.amount, .award-amount',
      deadline: '.deadline, .due-date',
      requirements: '.requirements, .criteria'
    }
  },
  cobell: {
    portal: 'cobell',
    loginUrl: 'https://cobellscholar.org/login',
    scholarshipsUrl: 'https://cobellscholar.org/scholarships',
    selectors: {
      scholarshipCard: '.scholarship, [class*="scholarship"]',
      title: 'h2, h3, .title',
      description: '.description, .about',
      amount: '.amount',
      deadline: '.deadline, .due-date',
      requirements: '.requirements'
    }
  }
};

class ScholarshipScraper {
  private browser?: puppeteer.Browser;
  private page?: puppeteer.Page;
  private config: ScraperConfig;

  constructor(portal: string) {
    this.config = SCRAPER_CONFIGS[portal];
    if (!this.config) {
      throw new Error(`Unknown portal: ${portal}`);
    }
  }

  /**
   * Launch visible browser and capture admin session
   * DEVELOPER manually logs in, we capture the session
   */
  async oneTimeAdminLogin(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1280, height: 800 }
    });

    this.page = await this.browser.newPage();

    console.log(`Opening ${this.config.portal} login page...`);
    await this.page.goto(this.config.loginUrl, {
      waitUntil: 'networkidle2'
    });

    console.log('Please log in manually in the browser window...');
    console.log('Waiting for successful login (up to 5 minutes)...');

    await this.page.waitForNavigation({
      waitUntil: 'networkidle0',
      timeout: 300000
    }).catch(() => {
      console.log('No navigation detected, checking if logged in...');
    });

    const cookies = await this.page.cookies();
    const localStorage = await this.page.evaluate(() => {
      const data: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          data[key] = localStorage.getItem(key)!;
        }
      }
      return data;
    });

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.adminPortalSession.upsert({
      where: { portal: this.config.portal },
      update: {
        cookies,
        localStorage,
        lastValid: new Date(),
        expiresAt
      },
      create: {
        portal: this.config.portal,
        cookies,
        localStorage,
        lastValid: new Date(),
        expiresAt
      }
    });

    console.log('Admin session captured successfully!');
  }

  /**
   * Load stored admin session and scrape scholarships
   */
  async scrapeWithAdminSession(): Promise<ScrapedScholarship[]> {
    const session = await prisma.adminPortalSession.findUnique({
      where: { portal: this.config.portal }
    });

    if (!session || new Date(session.expiresAt) < new Date()) {
      throw new Error(`No valid admin session for ${this.config.portal}. Please run login again.`);
    }

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

    console.log(`Navigating to ${this.config.scholarshipsUrl}...`);
    await this.page.goto(this.config.scholarshipsUrl, {
      waitUntil: 'networkidle0'
    });

    const isLoggedIn = await this.page.evaluate(() => {
      return !document.querySelector('[href*="login"]');
    });

    if (!isLoggedIn) {
      await this.browser.close();
      throw new Error(`Admin session expired for ${this.config.portal}. Please login again.`);
    }

    console.log('Extracting scholarship data...');
    const scholarships = await this.extractScholarships();

    await prisma.adminPortalSession.update({
      where: { portal: this.config.portal },
      data: { lastValid: new Date() }
    });

    await this.browser.close();

    return scholarships;
  }

  /**
   * Extract scholarship data from page
   */
  private async extractScholarships(): Promise<ScrapedScholarship[]> {
    const scholarships = await this.page.evaluate((config) => {
      const results: any[] = [];
      const cards = document.querySelectorAll(config.scholarshipCard);

      cards.forEach(card => {
        const titleEl = card.querySelector(config.title);
        const title = titleEl?.textContent?.trim();

        if (title) {
          results.push({
            title,
            description: card.querySelector(config.description || '.description')?.textContent?.trim() || '',
            amount: card.querySelector(config.amount || '.amount')?.textContent?.trim() || '',
            deadline: card.querySelector(config.deadline || '.deadline')?.textContent?.trim() || '',
            requirements: Array.from(card.querySelectorAll(config.requirements || '.requirements'))
              .map(r => r.textContent?.trim())
              .filter(Boolean),
            applicationUrl: card.querySelector(config.applicationLink || 'a[href*="apply"]')?.getAttribute('href') || '',
            sourceUrl: window.location.href
          });
        }
      });

      return results;
    }, this.config.selectors);

    return scholarships.map(s => ({
      ...s,
      source: this.config.portal
    }));
  }

  async close(): Promise<void> {
    await this.browser?.close();
  }
}

// CLI
async function main() {
  const portal = process.argv[2];

  if (!portal || !SCRAPER_CONFIGS[portal]) {
    console.error('Usage: npx tsx scripts/scrape-scholarships.ts <nativeforward|aises|cobell>');
    process.exit(1);
  }

  const scraper = new ScholarshipScraper(portal);

  try {
    const existingSession = await prisma.adminPortalSession.findUnique({
      where: { portal }
    });

    if (!existingSession || new Date(existingSession.expiresAt) < new Date()) {
      console.log('No valid session found. Starting login flow...');
      await scraper.oneTimeAdminLogin();
    }

    console.log('Starting scholarship scrape...');
    const scholarships = await scraper.scrapeWithAdminSession();

    console.log(`Found ${scholarships.length} scholarships. Storing in database...`);

    for (const scholarship of scholarships) {
      await prisma.scrapedScholarship.upsert({
        where: {
          id: scholarship.sourceUrl
        },
        update: {
          title: scholarship.title,
          description: scholarship.description,
          amount: scholarship.amount ? parseFloat(scholarship.amount) : null,
          deadline: new Date(scholarship.deadline),
          requirements: { requirements: scholarship.requirements },
          applicationUrl: scholarship.applicationUrl,
          updatedAt: new Date()
        },
        create: {
          portal: scholarship.source,
          title: scholarship.title,
          description: scholarship.description,
          amount: scholarship.amount ? parseFloat(scholarship.amount) : null,
          deadline: new Date(scholarship.deadline),
          requirements: { requirements: scholarship.requirements },
          applicationUrl: scholarship.applicationUrl,
          sourceUrl: scholarship.sourceUrl
        }
      });
    }

    console.log(`Successfully stored ${scholarships.length} scholarships!`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await scraper.close();
    await prisma.$disconnect();
  }
}

main();
