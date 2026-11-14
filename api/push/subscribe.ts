/**
 * POST /api/push/subscribe — canonical push-subscribe endpoint.
 *
 * Alias of POST /api/subscribe: the POST handler is re-exported unchanged,
 * so both routes share one implementation (endpoint-hash deviceId, dedupe
 * by endpoint). See ../subscribe.ts for the contract.
 */

export { POST } from '../subscribe.js';
