"use server";

import { chromium } from 'playwright-core';
import { resolveChromiumExecutablePath, shouldUseHeadedBrowser } from './chromium-path';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const SCRAPE_ERROR_MESSAGE = 'Gagal mengambil data Instagram saat ini.';

export async function scrape_ig(username: string) {
  console.log(`\n--- [DEBUG START] SCRAPE IG: ${username} ---`);
  const executablePath = resolveChromiumExecutablePath();
  
  const browser = await chromium.launch({ 
    executablePath,
    headless: !shouldUseHeadedBrowser(),
    slowMo: shouldUseHeadedBrowser() ? 200 : 0,
  });

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 800 } 
  });

  const page = await context.newPage();
  
  try {
    const targetUrl = `https://www.instagram.com/${username.replace('@', '')}/`;
    console.log(`Navigasi ke: ${targetUrl}`);
    
    // Gunakan 'domcontentloaded' agar lebih cepat sampai ke halaman
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log("Menunggu render (5 detik)...");
    await page.waitForTimeout(5000);

    const title = await page.title();
    console.log(`Judul Halaman: ${title}`);

    const bodyText = await page.innerText('body');
    if (bodyText.includes("Log In") || bodyText.includes("Masuk") || bodyText.includes("Gunakan akun")) {
      console.log("⚠️ TERDETEKSI: Instagram memunculkan Login Wall. Post tidak akan muncul.");
    }

    const articleCount = await page.locator('article').count();
    const imgCount = await page.locator('article img').count();
    console.log(`Jumlah <article> ditemukan: ${articleCount}`);
    console.log(`Jumlah <img> di dalam article: ${imgCount}`);

    const posts = await page.evaluate(() => {
      const results: any[] = [];
      // Selector Instagram sering kali menggunakan role="link" untuk post
      const items = document.querySelectorAll('article img');
      const links = document.querySelectorAll('article a');

      items.forEach((img, index) => {
        const src = img.getAttribute('src');
        const alt = img.getAttribute('alt') || "";
        const link = links[index]?.getAttribute('href');

        if (src && src.startsWith('http')) {
          results.push({
            id: link?.replace(/\//g, '') || `ig-${index}`,
            title: alt.substring(0, 80) || "Instagram Post",
            link: link ? `https://www.instagram.com${link}` : "#",
            thumbnail: src
          });
        }
      });
      return results;
    });

    if (posts.length > 0) {
      console.log(`✅ SUCCESS: Berhasil ambil ${posts.length} post.`);
      // Debug post pertama
      console.log("Contoh Post 1:", posts[0]);
    } else {
      console.log("❌ FAILURE: List posts kosong.");
    }

    return { channel: username, videos: posts };

  } catch (error: any) {
    console.error("❌ CRITICAL ERROR:", error.message);
    return { error: SCRAPE_ERROR_MESSAGE };
  } finally {
    await browser.close();
    console.log("--- [DEBUG END] BROWSER CLOSED ---\n");
  }
}
