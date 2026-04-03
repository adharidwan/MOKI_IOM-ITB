# API Performance Next Steps

## Current State

Recent local measurements for `POST /api/v1/messages/whatsapp` show that the main latency regression has already been removed:

- Before Redis/BullMQ plus hot-path cleanup: roughly `1.0s-1.8s` for a fresh `202 Accepted`
- After API client cache: roughly `0.45s` for a fresh `202 Accepted`
- Current dominant synchronous cost: insert into `outbound_messages`

What this means:

- The old outbound worker polling design is no longer the main issue
- Redis and BullMQ are not the bottleneck
- API client lookup was the biggest bottleneck and is now largely solved by caching
- The remaining cost is mostly the Supabase/Postgres write used as the outbound delivery ledger

At this point, the API is already in a materially better state. The next work should be judged against real product needs, not optimization instinct.

## Recommended Target

Reasonable latency target for this endpoint:

- Good enough: `300ms-600ms`
- Strong: `150ms-300ms`
- Aggressive: `<150ms`

Given the current result of about `450ms`, the endpoint is already inside a reasonable operational range for an external queueing API.

## Recommended Plan

### Option 1: Keep The Current Design And Measure In Production First

This is the default recommendation.

Work:

- Keep the current Redis-backed API client cache
- Keep the non-blocking `touchApiClientLastUsedAt(...)`
- Keep the lighter ledger insert path that avoids `select('*').single()`
- Measure production p50 / p95 / p99 request latency for at least a few days

Expected result:

- No further engineering risk
- Current latency likely remains around `350ms-700ms` depending on Supabase network conditions
- You get real evidence before making the design more complex

Trade-offs:

- You keep paying the ledger write cost on every accepted request
- p95 may still spike if Supabase write latency spikes

When this is enough:

- API traffic is still moderate
- User experience is acceptable
- The business value of saving another `100ms-300ms` is low

### Option 2: Move The Ledger Write Off The Critical Path

This is the next strongest optimization if lower API latency is actually required.

Idea:

- Return `202` after Redis idempotency completion and BullMQ enqueue succeed
- Write the `outbound_messages` ledger entry asynchronously after acceptance, or from the worker side

Why this helps:

- The current dominant synchronous cost is the ledger insert
- Removing that insert from the request path should cut a large part of the remaining latency

Expected result:

- Fresh request latency could drop from about `450ms` to around `80ms-200ms`
- Replay requests could stay very fast as long as auth cache is warm

Trade-offs:

- More complicated consistency model
- Accepted request and DB ledger row are no longer created in one synchronous flow
- If async ledger persistence fails, you may temporarily lose observability/history unless you add repair logic
- Control/reporting features that depend on DB rows may lag slightly behind real queue acceptance

Things to consider before doing this:

- Is `outbound_messages` primarily for observability, or is it still used by product logic?
- Can you tolerate eventual consistency for accepted-but-not-yet-written messages?
- Do you need a reconciliation job to backfill missing ledger rows?

Implementation shapes:

- App accepts request, enqueues BullMQ job, returns `202`, then best-effort persists ledger row
- Worker creates or upserts ledger row when it starts processing the job
- Separate background consumer persists ledger rows from a Redis stream or another BullMQ queue

My view:

- This is the highest-impact next optimization
- It should only be done if you explicitly want sub-`200ms` API responses

### Option 3: Reduce The Cost Of The Ledger Write Instead Of Moving It

This is a lower-risk middle ground.

Idea:

- Keep the synchronous ledger insert
- Optimize the DB write path itself

Possible work:

- Review indexes on `outbound_messages`
- Remove unused uniqueness or secondary indexes if they are no longer needed
- Check whether row-level triggers, policies, or default expressions are adding write cost
- Check whether Supabase network path or region placement is the real source of latency
- Consider batching non-essential updates elsewhere instead of on insert

Expected result:

- Possible reduction from roughly `400ms` to `200ms-300ms`
- Lower risk than moving the ledger off-path

Trade-offs:

- Gains may be modest
- You may spend time tuning DB structure for a write that is still fundamentally on the critical path

Things to consider:

- If the latency is mostly network RTT to Supabase, index tuning alone may not help much
- If the table grows quickly, index cost may get worse over time

My view:

- Good second choice if you want improvement without changing consistency semantics
- Less payoff than Option 2, but safer

### Option 4: Add A Short-Lived In-Process Cache In Front Of Redis For API Client Lookup

This is a small optimization, not a strategic one.

Idea:

- Cache `api_clients` by `key_prefix` in process memory for a short TTL, for example `15s-60s`
- Redis remains the shared cache; memory cache is only a near-cache

Expected result:

- Small improvement on warm paths
- Probably saves only a few milliseconds now that Redis cache already works

Trade-offs:

- Extra cache invalidation path
- More moving parts for little gain

My view:

- Not worth doing now
- The major auth bottleneck has already been solved

### Option 5: Reconsider Whether The Ledger Needs To Be Written For Every Accepted API Request

This is a product and observability question, not just a technical one.

Idea:

- Keep detailed DB history only for terminal states, failures, or audit-relevant messages
- Store less for routine accepted requests

Expected result:

- Potentially significant reduction in DB write pressure
- Lower storage and index growth over time

Trade-offs:

- You lose some immediate historical visibility
- Admin tooling and analytics may need redesign

Things to consider:

- Do operators actually inspect every accepted row?
- Is the ledger needed for compliance, support, or only debugging?
- Would aggregated metrics plus failed-message history be enough?

My view:

- Potentially very effective
- Requires product agreement, not just engineering approval

## Expected Outcomes By Option

| Option | Latency Expectation | Risk | Complexity | Recommendation |
| --- | --- | --- | --- | --- |
| 1. Keep current design, measure first | `350ms-700ms` | Low | Low | Recommended now |
| 2. Move ledger off critical path | `80ms-200ms` | Medium-High | High | Best performance payoff |
| 3. Optimize ledger write path | `200ms-300ms` | Medium | Medium | Good conservative next step |
| 4. Add in-process auth near-cache | Small gain | Low-Medium | Medium | Not necessary now |
| 5. Reduce ledger usage/product scope | Potentially large | Medium | Medium-High | Valuable if product agrees |

## What Might Make Further Optimization Unnecessary

Further optimization may not be necessary if:

- The endpoint is only used for low to moderate traffic
- The user-facing experience is dominated by WhatsApp delivery time, not API acceptance time
- Operational simplicity is more important than shaving another `200ms`
- The current `~450ms` is already good enough for integrations

In many messaging systems, the real user-perceived delay is downstream delivery, not the `202 Accepted` response. If the API already responds in under half a second and the message reaches WhatsApp promptly, additional work may have little business value.

## What Might Justify Further Optimization

Further optimization is justified if:

- This API becomes high-volume
- External integrators expect near-instant acknowledgement
- You need better p95 / p99 under load
- Supabase write latency becomes unstable
- You plan to scale the API aggressively and want to reduce database dependency on the hot path

## Decision Criteria

Before changing the design again, answer these questions:

1. Is the current `~450ms` actually causing a product problem?
2. Is the business asking for faster acknowledgement, or is this mainly an engineering preference?
3. Is observability in `outbound_messages` required immediately at acceptance time?
4. Would eventual consistency for the ledger be acceptable?
5. Are you optimizing for median latency, or for p95/p99 under load?

## Recommendation

Recommended immediate path:

1. Keep the current implementation.
2. Measure production latency distribution for fresh requests and replays.
3. If latency is still a real issue, choose one of these:
   - choose Option 3 if you want lower risk and smaller gains
   - choose Option 2 if you want a meaningful jump and accept added complexity

My engineering judgment:

- The current state is already good enough for many internal and moderate-volume external messaging use cases.
- The next optimization only makes sense if you explicitly want sub-`200ms` API acknowledgements or better tail latency under load.
- If that is not a concrete requirement, stop here and spend time on reliability, observability, and failure recovery instead.
