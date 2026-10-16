# Stage 0: Requirements

Every design decision in these notes is judged against five requirements. Before you look at any file format or data structure, fix these in your head. Each later stage exists because the previous design failed one of them.

## The five requirements

| # | Requirement | What it means in practice |
|---|---|---|
| 1 | **Fast reads** | Looking up a key should be as fast as we can make it. No specific number is promised. |
| 2 | **Fast writes** (the priority) | Inserting, updating or deleting a key should be cheap, even under a heavy, continuous stream of writes. |
| 3 | **Durability** | Once a write is acknowledged, a crash, restart or power cut must not lose it. |
| 4 | **Unstructured values** | There is no fixed schema. A key's value can be a number today and a string or a boolean tomorrow. |
| 5 | **A few petabytes** | The data set can grow beyond what one machine can hold, so the design must allow spreading data across machines. |

## Why writes come first

Reads have well-known escape hatches. If the same keys are read often, you keep a copy of them in memory (a **cache**) and most reads never touch the disk. Writes have no such shortcut: every write must eventually reach durable storage. So a design that makes writes cheap is harder to find, and it is the one this journey is optimising for. Reads get as fast as possible *without* sacrificing that.

## Why "a few petabytes" changes the design

A petabyte is 1,000 terabytes. Large single drives hold tens of terabytes, so a few petabytes can't sit on one disk, or even one server. This has two consequences you will see later:

- The data must be stored in pieces that can live on different machines.
- Anything we keep **per key in memory** (RAM) becomes a problem, because the number of keys can reach billions.

## Two facts about hardware used everywhere

1. **RAM is fast but volatile.** Reading RAM takes on the order of 100 nanoseconds, but its contents vanish when power is lost. It is also far smaller and more expensive per byte than disk.
2. **Disks are slow, durable, and much better at sequential access.** A spinning disk needs roughly 10 milliseconds to move its head to a random location (a *seek*), but once there it streams neighbouring bytes quickly. SSDs narrow the gap, but sequential I/O is still cheaper than scattered I/O. So **reading or writing adjacent bytes is cheap; jumping around is expensive.**

Almost every stage is a negotiation between these two facts and the five requirements.

## The scorecard

Each stage is rated against the five requirements:

| Mark | Meaning |
|---|---|
| **met** | The design satisfies this requirement. |
| **partial** | It works, but with a cost or a limit that will hurt at scale. |
| **unmet** | The design fails this requirement. |

## How to read the rest

The stages build on each other. Each note follows the same pattern:

1. The **problem** left by the previous stage.
2. The **change** that addresses it.
3. The **operations**, step by step, with a small worked example.
4. The **trade-offs**, meaning what got better and what got worse.
5. **Why the next stage** is needed.

The examples reuse one small data set of product ratings (`iphone11 = 4.8`, `macbook = 4.9`, and so on), so you can follow the same keys from the first file layout all the way to the final LSM tree.

## Revise

<details><summary>Which requirement is the priority, and why?</summary>

Fast writes. Reads can be accelerated with caching, but every write must eventually reach durable storage, so making writes cheap is the harder and more important problem.
</details>

<details><summary>Why does the petabyte requirement matter for in-memory structures?</summary>

Petabytes of data usually means billions of keys. Any structure that keeps one entry per key in RAM will eventually exceed the memory of a single machine.
</details>

<details><summary>What is the main performance property of disks that the design exploits?</summary>

Sequential access (touching neighbouring bytes) is much cheaper than random access (seeking to scattered locations).
</details>

<details><summary>What does durability require, concretely?</summary>

An acknowledged write must already be on non-volatile storage (disk), not only in RAM, so a crash or power loss can't erase it.
</details>

<details><summary>Why is "unstructured values" a challenge for storage layout?</summary>

If you don't know a value's type in advance, you don't know its size, and fixed-size layouts that rely on known sizes stop working.
</details>
