/**
 * Load Test Script for Face Register Demo
 * ========================================
 * Simulates concurrent login and face verification requests.
 *
 * Prerequisites:
 * 1. A running server (npm run dev)
 * 2. A test user in the database (see TEST_USER below)
 *
 * Usage:
 *   node test/load-test.js
 *   node test/load-test.js --users 50 --delay 100
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// --- Configuration ---
// IMPORTANT: Update these to match a real test user in your database
const TEST_USER = {
    email: 'farypor@gmail.com',
    password: 'Oporpor200956'
};

// A placeholder descriptor (128 floats, standard for face-api.js).
// Replace with a REAL descriptor from your test user for accurate pass/fail results.
const SAMPLE_DESCRIPTOR = new Array(128).fill(0).map(() => Math.random() * 0.1 - 0.05);

// --- Metrics ---
let loginSuccessCount = 0;
let loginFailCount = 0;
let verifySuccessCount = 0;
let verifyFailCount = 0;
const latencies = { login: [], verify: [] };

// --- Helpers ---
async function simulateLogin() {
    const start = Date.now();
    try {
        const res = await fetch(`${BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(TEST_USER)
        });
        const data = await res.json();
        const latency = Date.now() - start;
        latencies.login.push(latency);

        if (data.success) {
            loginSuccessCount++;
            // Extract session cookie for verify-face call (simplified, uses "cookie" header)
            const cookies = res.headers.get('set-cookie');
            return cookies;
        } else {
            loginFailCount++;
            return null;
        }
    } catch (e) {
        loginFailCount++;
        console.error('Login error:', e.message);
        return null;
    }
}

async function simulateVerifyFace(sessionCookie) {
    if (!sessionCookie) {
        verifyFailCount++;
        return;
    }
    const start = Date.now();
    try {
        const res = await fetch(`${BASE_URL}/api/verify-face`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': sessionCookie
            },
            body: JSON.stringify({ descriptor: SAMPLE_DESCRIPTOR })
        });
        const data = await res.json();
        const latency = Date.now() - start;
        latencies.verify.push(latency);

        if (data.success) {
            verifySuccessCount++;
        } else {
            verifyFailCount++;
        }
    } catch (e) {
        verifyFailCount++;
        console.error('Verify error:', e.message);
    }
}

// --- Main Runner ---
async function runTest(numUsers, delayMs) {
    console.log(`\n🚀 Starting Load Test: ${numUsers} users, ${delayMs}ms delay between batches\n`);
    console.log(`Target: ${BASE_URL}`);
    console.log(`Test User: ${TEST_USER.email}`);
    console.log('---');

    const startTime = Date.now();

    // Simulate users
    const promises = [];
    for (let i = 0; i < numUsers; i++) {
        const userTask = async () => {
            const cookie = await simulateLogin();
            await simulateVerifyFace(cookie);
        };
        promises.push(userTask());
        if (delayMs > 0 && i < numUsers - 1) {
            await new Promise(r => setTimeout(r, delayMs));
        }
    }

    await Promise.all(promises);

    const totalTime = Date.now() - startTime;

    // --- Report ---
    console.log('\n--- Load Test Results ---');
    console.log(`Total Duration: ${totalTime}ms`);
    console.log(`Users Simulated: ${numUsers}`);
    console.log('');
    console.log('📥 Login Endpoint:');
    console.log(`  ✅ Success: ${loginSuccessCount}`);
    console.log(`  ❌ Fail: ${loginFailCount}`);
    if (latencies.login.length > 0) {
        const avgLogin = (latencies.login.reduce((a, b) => a + b, 0) / latencies.login.length).toFixed(0);
        const maxLogin = Math.max(...latencies.login);
        console.log(`  ⏱️  Avg Latency: ${avgLogin}ms | Max: ${maxLogin}ms`);
    }
    console.log('');
    console.log('🤖 Verify-Face Endpoint:');
    console.log(`  ✅ Success: ${verifySuccessCount}`);
    console.log(`  ❌ Fail: ${verifyFailCount}`);
    if (latencies.verify.length > 0) {
        const avgVerify = (latencies.verify.reduce((a, b) => a + b, 0) / latencies.verify.length).toFixed(0);
        const maxVerify = Math.max(...latencies.verify);
        console.log(`  ⏱️  Avg Latency: ${avgVerify}ms | Max: ${maxVerify}ms`);
    }
    console.log('');

    // Determine overall health
    const failRate = (loginFailCount + verifyFailCount) / (numUsers * 2);
    if (failRate > 0.5) {
        console.log('⚠️ CRITICAL: High failure rate! Check server logs.');
    } else if (failRate > 0.1) {
        console.log('🟠 WARNING: Some failures detected.');
    } else {
        console.log('🟢 PASS: System appears stable.');
    }
}

// --- CLI Argument Parsing ---
const args = process.argv.slice(2);
let numUsers = 10;
let delayMs = 50;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--users' && args[i + 1]) {
        numUsers = parseInt(args[i + 1], 10);
    }
    if (args[i] === '--delay' && args[i + 1]) {
        delayMs = parseInt(args[i + 1], 10);
    }
}

runTest(numUsers, delayMs);
