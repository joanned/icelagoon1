const puppeteer = require('puppeteer');
const https = require('https');
const path = require('path');

// Configuration
const SITES = [
  {
    name: 'www.icelagoon.com',
    url: 'https://www.icelagoon.com/adventure-tour/',
    targetDates: ['19', '20', '21', '16', '17', '18', '22', '23', '24', '25'],
    requiresModal: false
  },
  {
    name: 'icelagoon.is',
    url: 'https://icelagoon.is/tours/',
    targetDates: ['19', '20', '21', '22'],
    requiresModal: true,
    modalTrigger: 'Book now'
  }
];

const CHECK_INTERVAL = 60000 * 3; // 3 minutes in milliseconds

// Function to send Telegram notification
async function sendTelegramNotification(matches, siteName) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.log('Telegram configuration missing, skipping notification');
    return;
  }

  const hasDate20 = matches.some(match => match.date === '20');
  
  if (!hasDate20) {
    console.log('No date 20 found, skipping Telegram notification');
    return;
  }

  const siteUrl = SITES.find(s => s.name === siteName)?.url;
  
  const message = `🎉 *Ice Lagoon Date 20 Available!*

📍 *Site:* ${siteName}
🎯 *FOUND DATE 20 AVAILABLE!*

📅 *All Available Dates:*
${matches.map(match => `• Date: ${match.date} (${match.status})`).join('\n')}

🔗 [Book Now](${siteUrl})

⏰ ${new Date().toLocaleString()}`;

  const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const data = JSON.stringify({
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'Markdown',
    disable_web_page_preview: false
  });

  return new Promise((resolve, reject) => {
    const req = https.request(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    }, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ Telegram notification sent successfully!');
          resolve();
        } else {
          console.error('❌ Failed to send Telegram notification:', responseData);
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Telegram request error:', error.message);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

// Function to open modal if required
async function openModalIfNeeded(page, site) {
  if (site.requiresModal) {
    try {
      console.log(`[${new Date().toLocaleTimeString()}] Looking for "${site.modalTrigger}" button...`);
      
      // Wait for and click the "Book now" button
      await page.waitForSelector('button', { timeout: 10000 });
      
      const bookNowButton = await page.evaluateHandle((triggerText) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(button => button.textContent.trim().includes(triggerText));
      }, site.modalTrigger);
      
      if (bookNowButton.asElement()) {
        console.log(`[${new Date().toLocaleTimeString()}] Clicking "${site.modalTrigger}" button...`);
        await bookNowButton.asElement().click();
        
        // Wait for modal to appear
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log(`[${new Date().toLocaleTimeString()}] Modal should be open now`);
      } else {
        console.log(`[${new Date().toLocaleTimeString()}] "${site.modalTrigger}" button not found`);
        return false;
      }
    } catch (error) {
      console.log(`[${new Date().toLocaleTimeString()}] Error opening modal:`, error.message);
      return false;
    }
  }
  return true;
}

// Main monitoring function for a single site
async function checkSiteAvailability(site) {
  let browser;
  
  try {
    // Launch browser in headless mode for cloud
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set viewport and user agent to avoid detection
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log(`[${new Date().toLocaleTimeString()}] Loading ${site.name}...`);
    
    // Navigate to the page with longer timeout
    await page.goto(site.url, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    
    // Wait longer for dynamic content to load
    console.log(`[${new Date().toLocaleTimeString()}] Waiting for content to load...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Open modal if required (for icelagoon.is)
    const modalOpened = await openModalIfNeeded(page, site);
    if (!modalOpened && site.requiresModal) {
      console.log(`[${new Date().toLocaleTimeString()}] Failed to open modal for ${site.name}`);
      return [];
    }
    
    // Debug: Check if there are iframes
    const iframes = await page.$$('iframe');
    console.log(`[${new Date().toLocaleTimeString()}] Found ${iframes.length} iframe(s)`);
    
    // Try multiple strategies to find the calendar
    let matches = [];
    
    // Strategy 1: Check main page for calendar-widget
    try {
      const hasCalendarWidget = await page.$('#calendar-widget') !== null;
      
      if (hasCalendarWidget) {
        console.log(`[${new Date().toLocaleTimeString()}] Found calendar-widget in main page`);
        matches = await page.evaluate((targetDates) => {
          const calendarWidget = document.getElementById('calendar-widget');
          if (!calendarWidget) return [];
          
          const foundMatches = [];
          
          // Find all divs with data-testid="SellingOut" or "Available"
          const targetDivs = calendarWidget.querySelectorAll('[data-testid="SellingOut"], [data-testid="Available"]');
          
          targetDivs.forEach(div => {
            // Check all child divs for the target dates
            const childDivs = div.querySelectorAll('div');
            childDivs.forEach(child => {
              const text = child.textContent.trim();
              if (targetDates.includes(text)) {
                foundMatches.push({
                  date: text,
                  status: div.getAttribute('data-testid'),
                  fullText: div.textContent.trim()
                });
              }
            });
          });
          
          return foundMatches;
        }, site.targetDates);
      }
    } catch (e) {
      console.log(`[${new Date().toLocaleTimeString()}] Calendar not in main page`);
    }
    
    // Strategy 2: Check iframes
    if (matches.length === 0 && iframes.length > 0) {
      console.log(`[${new Date().toLocaleTimeString()}] Checking iframes...`);
      
      for (let i = 0; i < iframes.length; i++) {
        try {
          const frame = await iframes[i].contentFrame();
          if (!frame) continue;
          
          // Wait a bit for iframe content
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check if calendar exists in this iframe
          const hasCalendar = await frame.$('#calendar-widget') !== null;
          
          if (hasCalendar) {
            console.log(`[${new Date().toLocaleTimeString()}] Found calendar in iframe ${i + 1}`);
            
            matches = await frame.evaluate((targetDates) => {
              const calendarWidget = document.getElementById('calendar-widget');
              if (!calendarWidget) return [];
              
              const foundMatches = [];
              
              const targetDivs = calendarWidget.querySelectorAll('[data-testid="SellingOut"], [data-testid="Available"]');
              
              targetDivs.forEach(div => {
                const childDivs = div.querySelectorAll('div');
                childDivs.forEach(child => {
                  const text = child.textContent.trim();
                  if (targetDates.includes(text)) {
                    foundMatches.push({
                      date: text,
                      status: div.getAttribute('data-testid'),
                      fullText: div.textContent.trim()
                    });
                  }
                });
              });
              
              return foundMatches;
            }, site.targetDates);
            
            if (matches.length > 0) break;
          }
        } catch (e) {
          console.log(`[${new Date().toLocaleTimeString()}] Could not access iframe ${i + 1}`);
        }
      }
    }
    
    // Strategy 3: Look for the data-testid attributes anywhere on the page
    if (matches.length === 0) {
      console.log(`[${new Date().toLocaleTimeString()}] Searching entire page for availability indicators...`);
      
      matches = await page.evaluate((targetDates) => {
        const foundMatches = [];
        
        // Search entire document for elements with these data-testid values
        const targetDivs = document.querySelectorAll('[data-testid="SellingOut"], [data-testid="Available"]');
        
        console.log(`Found ${targetDivs.length} elements with target data-testid`);
        
        targetDivs.forEach(div => {
          // Check the element and all its descendants for target dates
          const text = div.textContent;
          targetDates.forEach(date => {
            if (text && text.includes(date)) {
              foundMatches.push({
                date: date,
                status: div.getAttribute('data-testid'),
                fullText: text.trim().substring(0, 200)
              });
            }
          });
        });
        
        return foundMatches;
      }, site.targetDates);
    }
    
    // Debug: Log page structure
    if (matches.length === 0) {
      const debugInfo = await page.evaluate(() => {
        const info = {
          hasCalendarWidget: document.getElementById('calendar-widget') !== null,
          sellingOutCount: document.querySelectorAll('[data-testid="SellingOut"]').length,
          availableCount: document.querySelectorAll('[data-testid="Available"]').length,
          allDataTestIds: [...new Set([...document.querySelectorAll('[data-testid]')].map(el => el.getAttribute('data-testid')))].slice(0, 10)
        };
        return info;
      });
      
      console.log(`[${new Date().toLocaleTimeString()}] Debug info:`, debugInfo);
    }
    
    // Process results
    if (matches.length > 0) {
      console.log(`\n🎉 FOUND MATCHING DATES ON ${site.name.toUpperCase()}! 🎉`);
      let hasDate20 = false;
      
      matches.forEach(match => {
        console.log(`  📅 Date: ${match.date}`);
        console.log(`  📊 Status: ${match.status}`);
        console.log(`  📝 Context: ${match.fullText.substring(0, 100)}...`);
        console.log('  ---');
        
        if (match.date === '20') {
          hasDate20 = true;
        }
      });
      
      // Send Telegram notification only if date 20 is found
      // if (hasDate20) {
        console.log('🔔 FOUND DATE 20 - Sending Telegram notification!');
        await sendTelegramNotification(matches, site.name);
      // }
      
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] No matching dates found on ${site.name} (${site.targetDates.join(', ')})`);
    }
    
    // Close browser after each check
    await browser.close();
    
    return matches;
    
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Error on ${site.name}:`, error.message);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Function to check all sites
async function checkAllSites() {
  const allMatches = [];
  
  for (const site of SITES) {
    console.log(`\n=== Checking ${site.name} ===`);
    const matches = await checkSiteAvailability(site);
    allMatches.push(...matches);
  }
  
  return allMatches;
}

// Main execution
async function main() {
  console.log('🚀 Ice Lagoon Cloud Monitor Started');
  SITES.forEach(site => {
    console.log(`📍 ${site.name}: ${site.url}`);
    console.log(`🔍 Looking for dates: ${site.targetDates.join(', ')}`);
  });
  console.log(`⏱️  Checking every ${CHECK_INTERVAL / 1000} seconds`);
  console.log(`📱 Telegram notifications: ${process.env.TELEGRAM_CHAT_ID ? 'Configured' : 'Not configured'}`);
  console.log('Press Ctrl+C to stop\n');
  
  // For cloud deployment, run once and exit (cron will restart)
  if (process.env.NODE_ENV === 'production') {
    await checkAllSites();
    process.exit(0);
  } else {
    // For local testing, run continuously
    await checkAllSites();
    setInterval(checkAllSites, CHECK_INTERVAL);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Monitoring stopped');
  process.exit(0);
});

// Start the monitor
main();