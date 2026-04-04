"use server";

import { chromium } from 'playwright-core';
import { resolveChromiumExecutablePath, shouldUseHeadedBrowser } from './chromium-path';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const SCRAPE_ERROR_MESSAGE = 'Gagal mengambil data X saat ini.';

interface ScrapeOptions {
  maxScrolls?: number;   // Batasi berapa kali scroll ke bawah
  minPosts?: number;     // Berhenti jika sudah mendapatkan jumlah post tertentu
  delayPerScroll?: number; // Jeda antar scroll (ms)
}

export async function scrape_x(username: string, options: ScrapeOptions = {}) {
  const { 
    maxScrolls = 8, 
    minPosts = 20, 
    delayPerScroll = 2000 
  } = options;

  console.log(`--- SCRAPE X: ${username} (Target: ${minPosts} posts) ---`);
  const executablePath = resolveChromiumExecutablePath();

  const browser = await chromium.launch({ 
    executablePath,
    headless: !shouldUseHeadedBrowser(),
    slowMo: shouldUseHeadedBrowser() ? 100 : 0,
  });

  const context = await browser.newContext({
    userAgent: USER_AGENT,
  });

  const page = await context.newPage();
  
  try {
    const targetUrl = `https://x.com/${username.replace('@', '')}`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    await page.waitForTimeout(3000);

    let currentPostsCount = 0;
    let scrollCount = 0;

    console.log("Memulai proses scrolling dinamis...");

    while (scrollCount < maxScrolls) {
      currentPostsCount = await page.locator('article[data-testid="tweet"]').count();
      console.log(`Scroll #${scrollCount + 1}: Menemukan ${currentPostsCount} tweet.`);

      if (currentPostsCount >= minPosts) {
        console.log(`Target ${minPosts} postingan tercapai.`);
        break;
      }

      // Lakukan Scroll
      await page.mouse.wheel(0, 800); 
      await page.waitForTimeout(delayPerScroll);
      scrollCount++;

      // Cek apakah ada tombol "Retry" atau "Something went wrong" (Proteksi X)
      const isError = await page.getByText('Something went wrong').isVisible();
      if (isError) {
        console.log("X membatasi konten (Rate Limit/Login required). Berhenti scroll.");
        break;
      }
    }

    // Ekstraksi Data
    const tweets = await page.evaluate(() => {
      const items = document.querySelectorAll('article[data-testid="tweet"]');
      return Array.from(items).map((item, index) => {
        const textElement = item.querySelector('[data-testid="tweetText"]');
        const linkElement = item.querySelector('a[href*="/status/"]');
        const text = textElement?.textContent || "";
        const link = linkElement?.getAttribute('href');
        
        return {
          id: link?.split('/').pop() || `x-${index}`,
          title: text.substring(0, 80) + (text.length > 80 ? "..." : ""),
          link: `https://x.com${link}`,
          content: text
        };
      });
    });

    // Filter duplikat (X sering me-render ulang elemen saat scroll)
    const uniqueTweets = Array.from(new Map(tweets.map(t => [t.id, t])).values());

    console.log(`Berhasil mengambil total ${uniqueTweets.length} tweet unik.`);
    return { channel: username, videos: uniqueTweets.slice(0, minPosts) };

  } catch (error: any) {
    console.error("Scrape Error:", error.message);
    return { error: SCRAPE_ERROR_MESSAGE };
  } finally {
    await browser.close();
  }
}
