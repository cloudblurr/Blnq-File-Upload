# Rampex API Docs

- Source: `https://rampex.io/api-docs`
- Scraped: `2026-05-17`
- Purpose: concise agent-friendly reference for Rampex integration work

## Overview

Rampex is a payment API and checkout platform for accepting crypto-linked card payments and settling payouts in USDC on Polygon. The docs emphasize:

- No KYB or merchant verification
- Instant payouts to a merchant-owned wallet
- Support for 25+ payment providers
- Public utility endpoints for provider status and fiat-to-crypto conversion
- Authenticated merchant endpoints for payment link management

## Authentication

Merchant API requests use an API key in the `X-API-Key` header.

```http
X-API-Key: your_api_key_here
```

Base API URL:

```text
https://api.rampex.io
```

Key management is done in the Rampex dashboard.

## Public Endpoints

### Wallet Encryption

Endpoint:

```http
GET /wallet.php?address={polygon_wallet}&callback={callback_url}
```

Purpose:

- Encrypts the payout wallet
- Returns tracking metadata for payment-link creation

Required query params:

- `address`: Polygon wallet address receiving USDC payouts
- `callback`: callback URL for payment notifications; must be on `rampex.io`

Response fields:

- `address_in`
- `polygon_address_in`
- `callback_url`
- `ipn_token`

Example:

```http
GET https://api.rampex.io/control/wallet.php?address=0x956207D1fbCcB3406D54c7331AEE7D83351558E1&callback=https%3A%2F%2Frampex.io%2Fpayment-link%2Finvoice.php%3Fpayment%3D1234567
```

Payment URL patterns after wallet encryption:

```text
https://checkout.rampex.io/pay.php?address={encrypted_address}&amount={amount}&provider=hosted&email={email}&currency={currency}
```

```text
https://checkout.rampex.io/process-payment.php?address={encrypted_address}&amount={amount}&provider={provider}&email={email}&currency={currency}
```

### Provider Status API

Endpoint:

```http
GET https://api.rampex.io/provider-status
```

Purpose:

- Lists provider availability
- Returns provider minimum amounts
- Cached for 5 minutes

Example response shape:

```json
[
  {
    "id": "stripe",
    "provider_name": "Stripe",
    "status": "active",
    "minimum_currency": "USD",
    "minimum_amount": 2
  }
]
```

Fields:

- `id`: provider identifier used when creating payment links
- `provider_name`: display name
- `status`: availability state
- `minimum_currency`: currency for the minimum amount
- `minimum_amount`: minimum order value

Status values:

- `active`: operational and accepting payments
- `redirected`: working through an alternate path
- `inactive`: unavailable

### Currency Conversion

Endpoint:

```http
GET /control/convert.php?from={currency}&value={amount}
```

Parameters:

- `from`: source fiat currency code, such as `USD`, `EUR`, or `GBP`
- `value`: amount to convert

Example:

```bash
curl "https://rampex.io/control/convert.php?from=EUR&value=50"
```

Example response:

```json
{
  "value_coin": "12.45"
}
```

## Merchant API

The Merchant API is authenticated and is used for payment-link management and payment status lookup.

### Validate API Key

Endpoint:

```http
POST /api-validate-key
```

Example:

```bash
curl -X POST "https://api.rampex.io/api-validate-key" \
  -H "X-API-Key: your_api_key_here"
```

Typical success response:

```json
{
  "valid": true,
  "merchant_id": "uuid-here",
  "key_name": "My Production Key",
  "business_name": "Acme Corp",
  "message": "API key is valid and active"
}
```

Typical error response:

```json
{
  "valid": false,
  "error": "API key is invalid or has been revoked"
}
```

### Create Payment Link

Endpoint:

```http
POST /api-create-payment-link
```

Purpose:

- Creates a new payment link
- Returns a payment URL and short link

Request body fields:

- `amount` required
- `currency` required
- `customer_email` required
- `description` optional
- `provider` optional; use `hosted` for multi-provider checkout
- `woo_store_url` optional
- `woo_order_id` optional
- `payment_url` optional return URL
- `ipn_token` optional verification token

Example payload:

```json
{
  "amount": 100.5,
  "currency": "USD",
  "customer_email": "user@example.com",
  "description": "Order #12345",
  "provider": "hosted"
}
```

### Get Payment Status

Endpoint:

```http
GET /api-get-payment-status?link_id={link_id}
```

Purpose:

- Returns the current status for a payment link

Required query param:

- `link_id`: unique identifier from link creation

### List Payment Links

Endpoint:

```http
GET /api-list-payment-links?status={status}&limit={limit}&offset={offset}
```

Parameters:

- `status` optional: `active`, `completed`, or `expired`
- `limit` optional: default `50`, max `100`
- `offset` optional: default `0`

Example:

```bash
curl -X GET "https://api.rampex.io/api-list-payment-links?status=completed&limit=20&offset=0" \
  -H "X-API-Key: your_api_key_here"
```

Example response fields include:

- `link_id`
- `redirect_url`
- `payment_url`
- `status`
- `amount`
- `received_amount`
- `currency`
- `customer_email`
- `description`
- `payout_amount`
- `payout_currency`
- `created_at`
- `paid_at`
- `source`
- `short_code`
- `short_url`

## WooCommerce Integration

Rampex provides a WooCommerce plugin that can:

- Create payment links automatically at checkout
- Sync payment status in real time
- Send customer email notifications

Setup flow:

1. Download the plugin from the dashboard
2. Upload it in WordPress
3. Configure API key and webhook secret
4. Enable the payment gateway in WooCommerce settings

Required configuration:

- API key
- Webhook secret
- Store URL

## Webhooks

Webhooks notify your app when payment status changes.

Webhook setup:

- Configure the webhook URL in dashboard settings
- Copy the webhook secret from the same area

Example webhook payload:

```json
{
  "event": "payment.completed",
  "payment_link_id": "abc-123",
  "link_id": "1736515200-abc123",
  "status": "completed",
  "amount": 100.5,
  "received_amount": 100.5,
  "currency": "USD",
  "customer_email": "customer@example.com",
  "description": "Order #12345",
  "transaction_hash": "0x...",
  "paid_at": "2025-01-10T12:15:30Z",
  "woo_order_id": "12345",
  "woo_store_url": "https://store.com"
}
```

Webhook events:

- `payment.completed`
- `payment.expired`

Retry strategy:

- Retry after 1 minute
- Then after 5 minutes
- Then after 30 minutes
- Then after 2 hours
- Then after 12 hours

Implementation notes:

- Verify signatures with HMAC-SHA256
- Return HTTP 200 quickly
- Move long-running work to background processing

## Custom Checkout API

This section powers branded checkout pages at `pay.rampex.io/{slug}` and does not require an API key.

Endpoint:

```http
POST /create-branded-payment
```

Request body includes:

- `slug` required
- `amount` required
- `currency` required
- `customer_email` required
- `description` optional
- `provider` optional
- `payment_url` optional

## Link Analytics

The analytics section describes tracking data for payment links:

- Click data
- Timestamp
- Hashed IP address
- Referrer URL
- Device type, browser, OS version
- Approximate country, region, and city
- Conversion status and completion time

Short links:

```text
https://rampex.io/pay/ABC123
```

Short links track clicks and redirect to the payment URL.

## Payment Providers

Static provider reference from the docs:

- `hosted` - multi-provider hosted checkout, min `$1`
- `stripe` - USD only, USA only, min `$2`
- `rampnetwork` - USD only, min `$4`
- `robinhood` - USD only, min `$5`
- `topper` - min `$10`
- `unlimit` - min `$10`
- `bitnovo` - min `$10`
- `simpleswap` - min `$10`
- `mercuryo` - min `$15`
- `revolut` - min `$15`
- `transak` - min `$15`
- `cryptix` - min `$15`
- `guardarian` - min `$20`
- `moonpay` - min `$20`
- `banxa` - min `$20`
- `alchemypay` - min `$20`
- `sardine` - min `$30`
- `particle` - min `$30`
- `wert` - min `$30`
- `simplex` - min `$50`
- `utorg` - min `$50`
- `transfi` - USD only, min `$70`
- `interac` - CAD only, min `$100`
- `upi` - INR only, min `$100`

The docs note that live provider availability and minimums can change, so the Provider Status API is the preferred source for runtime behavior.

## Supported Currencies

- `USD`
- `EUR`
- `CAD`
- `INR`
- `GBP`
- `AUD`

## Rate Limits

Documented limits per API key:

- Payment link creation: `100 req/min`
- Status checks: `300 req/min`
- List operations: `60 req/min`

Typical rate-limit headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1736515200
```

Guidance:

- Prefer webhooks over polling
- Use backoff for retries
- Cache link data locally when possible
- Paginate large result sets
- Respect reset headers

## Error Handling

HTTP status codes:

- `200` success
- `400` bad request
- `401` unauthorized
- `403` forbidden
- `404` not found
- `429` too many requests
- `500` internal server error

Error response shape:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description"
  }
}
```

Common error codes:

- `MISSING_API_KEY`
- `INVALID_API_KEY`
- `INACTIVE_API_KEY`
- `VALIDATION_ERROR`
- `NO_WALLET`
- `LINK_NOT_FOUND`
- `UNAUTHORIZED`

## Testing

Rampex is described as production-first, so the docs recommend:

- Test with small amounts
- Use separate test and production API keys
- Verify payment creation, webhook delivery, and order-state updates
- Check WooCommerce behavior on a staging site first

## Code Examples

The docs include example integrations in JavaScript, Python, and PHP. The JavaScript example flow is:

1. Call the wallet encryption endpoint
2. Build a payment URL from the returned encrypted wallet
3. Poll or check status using the IPN token

Example snippet:

```js
async function generatePaymentLink() {
  const walletAddress = "0x956207D1fbCcB3406D54c7331AEE7D83351558E1";
  const callback = encodeURIComponent("https://rampex.io/callback");

  const walletResponse = await fetch(
    `https://api.rampex.io/control/wallet.php?address=${walletAddress}&callback=${callback}`
  );
  const walletData = await walletResponse.json();

  const amount = 100;
  const email = encodeURIComponent("customer@example.com");
  const paymentUrl = `https://checkout.rampex.io/pay.php?address=${walletData.address_in}&amount=${amount}&provider=hosted&email=${email}&currency=USD`;

  return {
    paymentUrl,
    ipnToken: walletData.ipn_token
  };
}
```

## Support

Support email:

```text
support@rampex.io
```
