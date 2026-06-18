# Daily Rental Request-to-Book and Payout Flow

## Purpose

This document defines the V1 daily rental flow for Roogo: request to book, owner approval, renter payment, check-in, checkout, completion, and owner payout availability.

The goal is to keep the flow simple, protect renters from paying for unavailable homes, reduce refund costs, and give owners a clear path to receive their money after a successful stay.

## Core Decision

For V1, all daily rentals use **Request to Book**.

There is no Instant Booking in the launch flow. Every owner must approve availability before the renter is asked to pay.

Owner payout availability is also simple:

> Owner funds become available only after checkout is complete and there is no active issue.

## Actors

| Actor | Role |
| --- | --- |
| Renter | Requests the booking, pays after approval, checks in, uses the property, checks out, and reports access or stay issues if needed. |
| Owner / Property Manager | Approves or declines booking requests, prepares the property, handles real-world access, and reports serious issues if needed. |
| Roogo | Tracks statuses, sends notifications, holds funds as pending, blocks payout when issues exist, and releases payout availability after completion. |
| Support / Staff | Handles unresolved access problems, refund cases, owner/renter disputes, and exceptional payout holds. |

## Money Rule

Funds should move through these states:

```text
Renter pays
-> Roogo / payment balance receives funds
-> Owner pending balance
-> Owner available balance after completed checkout
-> Owner payout
```

Owners can see the booking amount after payment, but it must be displayed as **Pending**, not available.

## Booking Statuses

| Status | Meaning |
| --- | --- |
| `requested` | Renter submitted a booking request. No payment has happened yet. |
| `request_declined` | Owner declined the request. |
| `request_expired` | Owner did not respond before the approval deadline. |
| `approved_awaiting_payment` | Owner approved the request. Renter must pay before the payment deadline. |
| `payment_expired` | Renter did not pay before the payment deadline. |
| `confirmed` | Renter paid successfully. Booking is locked in. Owner funds are pending. |
| `checkin_due` | Check-in time has arrived or is close. Renter should confirm access. |
| `checked_in` | Renter confirmed they got access, or support marked access as resolved. |
| `checkin_issue` | Renter reported they could not access the property, or another serious access issue exists. |
| `checkout_due` | Checkout time has arrived or passed. |
| `checkout_reported` | Renter confirmed they checked out. |
| `post_checkout_review` | Checkout happened, but the short issue window is still open. |
| `completed` | Stay is finished, checkout window passed, and no active issue exists. |
| `payout_available` | Owner funds moved from pending to available. |
| `payout_requested` | Owner requested payout. |
| `payout_paid` | Owner payout was sent. |
| `cancelled` | Booking was cancelled before or during the stay. |
| `refund_pending` | Refund is being reviewed or processed. |
| `refunded` | Renter refund was completed. |

## Recommended Timers

These should be configurable from the backend or admin settings.

| Timer | Recommended V1 Default | Purpose |
| --- | --- | --- |
| Owner approval deadline | 12 hours | Prevent renters from waiting too long after requesting a stay. |
| Urgent same-day approval deadline | 1-2 hours | Same-day stays need a faster owner response. |
| Renter payment deadline after approval | 2 hours | Creates urgency and prevents owners from holding dates indefinitely. |
| Check-in prompt time | At check-in time | Ask renter to confirm they got access. |
| Checkout prompt time | At checkout time | Ask renter to confirm they left. |
| Post-checkout issue window | 12 hours | Gives renter/owner time to report serious issues before payout is released. |

## Full Workflow

### 1. Renter Requests to Book

The renter chooses a property, dates, number of guests, and submits a booking request.

No payment is collected at this step.

System result:

- Booking status becomes `requested`.
- Owner receives a booking request notification.
- Renter receives a confirmation that the request was sent.
- The selected dates can be shown as temporarily requested, but should not be treated as fully paid or completed.

Renter notification:

> Booking request sent. The owner has until [deadline] to confirm availability.

Owner notification:

> New booking request for [Property Name], [dates]. Please approve or decline by [deadline].

### 2. Owner Approves or Declines

The owner reviews the request and chooses one:

- **Approve** if the property is available.
- **Decline** if the property is unavailable or the request cannot be accepted.

If declined:

- Booking status becomes `request_declined`.
- Renter is notified.
- No payment happens.

If expired:

- Booking status becomes `request_expired`.
- Renter is notified.
- No payment happens.

If approved:

- Booking status becomes `approved_awaiting_payment`.
- Renter receives a payment notification with a deadline.
- Owner is told the booking is not confirmed until payment is completed.

Renter notification after approval:

> Your booking was approved. Pay by [time] to confirm your stay.

Owner notification after approval:

> Approval sent. The booking will be confirmed once the renter pays by [time].

### 3. Renter Pays

The renter opens the payment link or payment screen and pays through the supported payment method.

The payment screen should include a visible countdown:

```text
Pay within 1h 59m to confirm this booking.
```

This is better than only using urgent wording because it clearly explains what will happen and when.

If payment succeeds:

- Booking status becomes `confirmed`.
- Owner pending balance is created or updated.
- Renter receives confirmation.
- Owner receives payment confirmation.

If payment fails:

- Booking remains `approved_awaiting_payment` until the deadline.
- Renter can retry payment.

If payment deadline passes:

- Booking status becomes `payment_expired`.
- Renter must request again if they still want the property.
- Owner is notified that the request expired unpaid.

Renter notification after payment:

> Payment received. Your stay at [Property Name] is confirmed for [dates].

Owner notification after payment:

> Booking confirmed. Payment was received and is pending until checkout is complete.

### 4. Before Check-In

Before check-in, Roogo should remind both sides.

Renter reminder:

> Your stay starts today at [check-in time]. Open Roogo when you arrive to confirm access.

Owner reminder:

> Guest check-in is today at [check-in time]. Please make sure access is ready.

The owner or property manager handles the real-world access method:

- in-person key handoff;
- lockbox;
- access code;
- security gate coordination;
- caretaker or property manager handoff.

Roogo should not try to manage every physical access detail in V1. The app should verify whether access succeeded.

### 5. Check-In

The purpose of check-in is to confirm that the renter actually got access to the property they paid for.

At check-in time, the renter gets two primary options:

- **I got access**
- **I need help**

If the renter taps **I got access**:

- Booking status becomes `checked_in`.
- Owner receives a notification that the renter confirmed access.
- Owner does not need to confirm unless there is a problem.

Renter notification / screen message:

> Access confirmed. Enjoy your stay.

Owner notification:

> Guest confirmed check-in at [Property Name]. Report a problem if this is incorrect.

If the renter taps **I need help**:

- Booking status becomes `checkin_issue`.
- Owner payout remains locked.
- Owner and support should be notified.
- The app should collect a short reason, such as:
  - cannot reach owner;
  - access code/key does not work;
  - property is not available;
  - property is not as described;
  - other issue.

Owner notification for access issue:

> The guest needs help checking in at [Property Name]. Please respond now.

Support notification:

> Check-in issue reported for booking [booking id]. Payout is locked until resolved.

Important V1 rule:

> Owner confirmation is not required for normal check-in. Owner action is only needed when there is a problem.

This prevents payouts and booking statuses from getting stuck because someone forgot to tap a button.

### 6. During the Stay

During the stay:

- renter can report a problem;
- owner can report a serious issue;
- owner payout remains pending;
- no payout is released during the stay.

Use friendly app wording instead of making every action sound like a legal dispute.

Recommended renter actions:

- **Report a problem**
- **Contact owner**
- **Contact support**

Recommended owner actions:

- **Message guest**
- **Report a serious issue**
- **Contact support**

Internally, serious reports can create an issue or dispute case, but the customer-facing language should stay calmer.

### 7. Checkout

The purpose of checkout is to confirm that the stay is ending and give both sides a short window to report serious issues before payout becomes available.

At checkout time, the renter gets:

- **I checked out**
- **I need help**
- **Report a problem**

If renter taps **I checked out**:

- Booking status becomes `checkout_reported`.
- Owner receives a checkout notification.
- The post-checkout issue window starts or continues.

Renter notification / screen message:

> Checkout confirmed. Thanks for using Roogo.

Owner notification:

> Guest reported checkout at [Property Name]. Report a serious issue by [deadline] if something is wrong.

If the renter does nothing:

- Checkout should still proceed automatically after the scheduled checkout time.
- Booking status becomes `post_checkout_review`.
- Owner receives a notification that checkout time passed.

Owner notification when renter does not manually confirm:

> Checkout time has passed for [Property Name]. Report a serious issue by [deadline] if needed.

Important V1 rule:

> Manual checkout confirmation is helpful, but it should not be required for completion.

### 8. Post-Checkout Review Window

After checkout, Roogo waits for the configured issue window, recommended at 12 hours.

During this window:

- owner can report that the guest did not leave;
- owner can report serious property issues;
- renter can report that checkout or the stay had a serious problem;
- support can pause completion if needed.

If no issue exists when the window ends:

- Booking status becomes `completed`.
- Owner pending balance becomes available.
- Booking status can also move to `payout_available`.

If an issue exists:

- Booking remains blocked from payout release.
- Support reviews the issue.
- Funds remain pending until the case is resolved.

Completion rule:

> A booking is completed when checkout time has passed, the post-checkout issue window has ended, and no active issue/refund case exists.

### 9. Payout Availability

After completion:

- owner funds move from pending to available;
- owner can request payout or receive payout according to the configured payout schedule;
- renter can receive final receipt / stay completion confirmation.

Owner notification:

> Your payout for [Property Name] is now available.

Renter notification:

> Stay completed. Your receipt is available in Roogo.

## Notification Matrix

| Moment | Renter Notification | Owner Notification | Notes |
| --- | --- | --- | --- |
| Request submitted | Request sent. Owner has until [deadline] to respond. | New booking request. Approve or decline by [deadline]. | No payment yet. |
| Request approved | Approved. Pay by [time] to confirm. | Approval sent. Waiting for renter payment. | Include countdown in app. |
| Request declined | Request declined. No payment was made. | Request declined. | Offer renter other listings. |
| Request expired | Request expired. No payment was made. | Request expired because no response was submitted. | Could affect owner reliability later. |
| Payment started | Complete payment to confirm your stay. | No notification needed yet. | Avoid noise until payment succeeds/fails. |
| Payment failed | Payment failed. Try again before [time]. | No notification needed unless final expiry. | Keep retry available. |
| Payment succeeded | Payment received. Booking confirmed. | Booking confirmed. Payment is pending until checkout completion. | Owner cannot withdraw yet. |
| Payment expired | Payment deadline passed. Request again if still interested. | Booking request expired unpaid. | Dates can be released. |
| Check-in reminder | Your stay starts today at [time]. Confirm access when you arrive. | Guest check-in is today at [time]. Make sure access is ready. | Send same day. |
| Renter confirms access | Access confirmed. Enjoy your stay. | Guest confirmed check-in. Report a problem if incorrect. | No owner confirmation required. |
| Renter needs help checking in | We notified the owner/support. | Guest needs help checking in. Please respond now. | Payout locked. |
| Checkout reminder | Checkout is today at [time]. Confirm after you leave. | Guest checkout is today at [time]. | Optional same-day reminder. |
| Renter confirms checkout | Checkout confirmed. | Guest reported checkout. Report serious issue by [deadline]. | Starts/continues issue window. |
| Checkout time passed | Please confirm checkout or report a problem. | Checkout time passed. Report serious issue by [deadline]. | Booking can auto-progress. |
| Issue reported | We received your report. Support will review. | Issue reported. Payout is paused until resolved. | Use only when needed. |
| Booking completed | Stay completed. Receipt is available. | Payout for this stay is now available. | No active issue. |
| Payout sent | No renter notification needed. | Payout sent to your account. | Owner-only money event. |

## Urgency Guidance

Use urgency around renter payment, but keep it clear and respectful.

Best approach:

- show a visible countdown on the payment screen;
- include the payment deadline in push/email/SMS notifications;
- explain that the booking is not confirmed until payment is completed;
- release the dates when the payment deadline expires.

Recommended wording:

> Your booking was approved. Pay by 6:30 PM to confirm your stay.

Avoid wording that feels manipulative:

> Hurry now or you will lose everything.

The urgency should come from a real operational rule: the owner cannot hold dates forever without payment.

## Issue and Payout Hold Rules

Payout remains pending if any of these are true:

- renter reports a check-in access issue;
- renter reports a serious stay problem;
- owner reports that the guest did not leave;
- owner reports a serious checkout issue;
- support opens a refund or dispute case;
- payment is not fully settled;
- booking was cancelled or refund is pending.

Payout can become available only when:

- booking is `completed`;
- checkout time has passed;
- post-checkout issue window has ended;
- no active issue exists;
- no refund case exists.

## Product Principles

1. **Payment happens after owner approval.**
   This reduces refunds caused by unavailable properties.

2. **Owner money is visible but pending.**
   Owners should understand that payment was received, but it is not withdrawable until checkout is complete.

3. **Renter check-in confirms access.**
   The most important protection for renters is confirming that they actually got into the property.

4. **Owner confirmation is not required for every normal step.**
   Owners should receive notifications and have a way to report problems, but normal bookings should not get stuck waiting for owner taps.

5. **Checkout can auto-complete.**
   Manual checkout confirmation is useful, but the system should complete the stay after checkout time plus the issue window when no problem is reported.

6. **Use "Report a problem" more than "Dispute" in the UI.**
   "Dispute" can be an internal case type. Customer-facing language should feel calmer and easier to understand.

7. **Keep V1 operationally simple.**
   Instant Booking, owner trust tiers, GPS proof, photo proof, and smart locks can be added later if real usage shows the need.

## V1 Build Checklist

- [ ] Add daily rental booking request creation.
- [ ] Add owner approve/decline actions.
- [ ] Add approval and payment deadlines.
- [ ] Add renter payment flow after owner approval.
- [ ] Add pending owner balance after successful payment.
- [ ] Add check-in reminder and renter access confirmation.
- [ ] Add check-in issue reporting and payout lock.
- [ ] Add checkout reminder and renter checkout confirmation.
- [ ] Add automatic post-checkout review window.
- [ ] Add completion job that releases owner funds when no issue exists.
- [ ] Add payout availability notification.
- [ ] Add staff/support view for blocked bookings and payout holds.
- [ ] Add notification templates for every lifecycle event.

## Future Enhancements

These are intentionally not required for V1:

- Instant Booking for highly trusted owners.
- GPS-based check-in confirmation.
- Photo proof at check-in or checkout.
- Smart lock / access-code integration.
- Owner reliability scores.
- Automated penalties for owner-caused cancellations.
- Different payout timing by owner trust level.

These can be added later after Roogo has enough real booking data to know where the actual risk is.
