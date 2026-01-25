# Test Scripts

This folder contains scripts for testing the Face Register Demo application.

## `load-test.js`

A simple Node.js script to simulate concurrent users logging in and verifying faces.

### Prerequisites

1.  **Ensure the development server is running**:
    ```bash
    npm run dev
    ```
2.  **Create a Test User**: You need a user account in MongoDB with a valid password and a face descriptor registered.
    - Update the `TEST_USER` credentials in `load-test.js`.
    - For accurate face verification tests, replace `SAMPLE_DESCRIPTOR` with the actual descriptor value from the test user in the database.

### Usage

```bash
# Run with defaults (10 users, 50ms delay)
node test/load-test.js

# Run with 50 concurrent users and no delay (burst test)
node test/load-test.js --users 50 --delay 0

# Run a sustained load of 100 users with 100ms stagger
node test/load-test.js --users 100 --delay 100
```

### Output

The script prints a simple report to the console showing:
- Success/Failure counts for `/api/login` and `/api/verify-face`.
- Average and Max latency for each endpoint.
- An overall health indicator (`PASS`, `WARNING`, `CRITICAL`).
