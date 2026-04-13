# PawaPay — Burkina Faso sandbox test numbers

Reference for QA and local development against PawaPay’s sandbox.  
Official documentation: [Test numbers](https://docs.pawapay.io/v2/docs/test_numbers) · [Providers](https://docs.pawapay.io/v2/docs/providers).

## Country and MSISDN format

- **Country code:** `226`
- **Full MSISDN:** `226` + **8 national digits** → `226XXXXXXXX` (11 characters including country code).

## Providers (Burkina Faso)

| Provider | PawaPay code | MSISDN pattern (after `226`) |
| -------- | ------------ | ---------------------------- |
| Moov     | `MOOV_BFA`   | `02…`                        |
| Orange   | `ORANGE_BFA` | `07…`                        |

Roogo maps the user’s wallet choice to these codes (e.g. `MOOV_MONEY` → `MOOV_BFA`, `ORANGE_MONEY` → `ORANGE_BFA`). The number you send must use the prefix that matches the selected provider for sandbox behaviour to be predictable.

## Moov (`MOOV_BFA`)

| MSISDN        | Simulated outcome      |
| ------------- | ---------------------- |
| `22602345678` | `COMPLETED`            |
| `22602345048` | `INSUFFICIENT_BALANCE` |
| `22602345068` | `UNSPECIFIED_FAILURE`  |
| `22602345138` | `SUBMITTED`            |

## Orange (`ORANGE_BFA`)

| MSISDN         | Simulated outcome      |
| -------------- | ---------------------- |
| `226 07345678` | `COMPLETED`            |
| `226 07345148` | `PAYMENT_NOT_APPROVED` |
| `226 07345128` | `SUBMITTED`            |

## Using these in Roogo

1. Choose **Moov** or **Orange** according to the test MSISDN prefix (`02` vs `07`).
2. The mobile app typically collects **8 digits**; [`app/api/payments/initiate/route.ts`](../app/api/payments/initiate/route.ts) normalises to `226` + eight digits before calling PawaPay.
3. **Orange Money:** when a pre-authorisation (OTP) code is required, follow your existing product flow; sandbox rules for outcomes still apply to the deposit once the request is accepted by PawaPay.

## Links

- [PawaPay v2 — Test numbers](https://docs.pawapay.io/v2/docs/test_numbers)
- [PawaPay v2 — Providers](https://docs.pawapay.io/v2/docs/providers)
