import "@testing-library/jest-dom";

/**
 * Pin the API base URL so tests assert against a stable host regardless of
 * the developer's .env.local.
 */
process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:5000/api";
