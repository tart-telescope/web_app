const puppeteer = require("puppeteer");

async function testConsole() {
  console.log("Starting Puppeteer test...");

  const browser = await puppeteer.launch({
    headless: true, // Set to true for headless mode
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  // Capture console messages
  page.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();

    switch (type) {
    case "error": {
      console.log(`❌ CONSOLE ERROR: ${text}`);
    
    break;
    }
    case "warning": 
    case "warn": {
      console.log(`⚠️  CONSOLE WARNING: ${text}`);
    
    break;
    }
    case "log": {
      console.log(`ℹ️  CONSOLE LOG: ${text}`);
    
    break;
    }
    default: {
      console.log(`📝 CONSOLE ${type.toUpperCase()}: ${text}`);
    }
    }
  });

  // Capture uncaught exceptions
  page.on("pageerror", (err) => {
    console.log(`💥 PAGE ERROR: ${err.message}`);
  });

  // Capture network failures
  page.on("requestfailed", (req) => {
    console.log(`🌐 NETWORK FAILED: ${req.failure().errorText} ${req.url()}`);
  });

  try {
    console.log("Navigating to localhost:3000...");
    await page.goto("http://localhost:3000", {
      waitUntil: "networkidle2",
      timeout: 30_000,
    });

    console.log("Page loaded, waiting for any async operations...");
    await page.waitForTimeout(5000);

    console.log("✅ Test completed successfully");
  } catch (error) {
    console.log(`❌ Test failed: ${error.message}`);
  } finally {
    await browser.close();
  }
}

// Run the test
testConsole().catch(console.error);
