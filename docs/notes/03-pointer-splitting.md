# Stage 3: Splitting values with pointers

An attempt to keep in-place updates without corrupting the neighbouring record.

## The problem

In stage 2, a value that grows spills into the next record and destroys it.

## The change

When a new value doesn't fit its slot, **write what fits, then a pointer to where the rest is stored**. The remaining bytes go to free space elsewhere on the disk. It is a linked list, but stored on disk.

## Components

| Component | Lives in | Job |
|---|---|---|
| Data file | Disk | Records with fixed-size value slots |
| Pointer | Disk | A small address inside a slot that says "the rest of this value is over there" |
| Overflow area | Disk | Free space where spilled value bytes are written |

## How the operations work

### Update macbook to "Apple"

The slot is 4 bytes. Reserve the last 2 bytes for a pointer, which leaves 2 bytes for data.

1. Scan to macbook (offset 26) and find its value slot at 34–37.
2. Write `A p` into 34–35.
3. Write the remaining `p l e` into free space far from the record, say offset 60,000 (a 2-byte pointer can address up to 65,535).
4. Write a 2-byte pointer to that location into 36–37.

```
offset 26:  m a c b o o k : A p [→ 60000]  i p a d : [4.6 ]      ← ipad is untouched
offset 60000:  p l e
```

### Read macbook

1. Scan to macbook and read `A p`.
2. Hit the pointer and **seek** to offset 60,000, which is a random disk access, possibly on a different track.
3. Read `p l e` and combine the parts: "Apple".

A value that grows several times becomes a chain of pointers, with one seek per link.

## Trade-offs

| Gains | Costs |
|---|---|
| Neighbouring records are never overwritten | Reads follow pointers: one random seek per fragment |
| Updates can still be done "in place" | Values fragment across the disk over time |
| | Free-space management is needed for the overflow area |
| | Reads are still linear scans to find the key |

## Notes

> **Note:** a disk is optimised for **sequential** access. Reading the next block is cheap; seeking to an unrelated location costs a head movement on spinning disks and a separate request on SSDs. A design that turns one logical read into several scattered physical reads works against the hardware.

## Why the next stage

The root cause is **editing data in place**. Both the corruption (stage 2) and the fragmentation (stage 3) come from trying to rewrite a value where it already sits. The next stage stops doing that altogether.

## Revise

<details><summary>How does the pointer approach avoid corrupting ipad?</summary>

It never writes past macbook's slot. Bytes that don't fit go to a separate location, and the slot holds a pointer to them.
</details>

<details><summary>Why is this a poor fit for disks?</summary>

Reading a fragmented value needs a random seek per fragment, and disks are much slower at random access than sequential access.
</details>

<details><summary>Which earlier problem does this stage not solve at all?</summary>

Slow reads. Finding a key is still a linear scan of the file.
</details>

<details><summary>What do stages 2 and 3 have in common that the next stage removes?</summary>

They both edit existing data in place.
</details>

<details><summary>What happens to a value that grows several times under this scheme?</summary>

It becomes a chain of fragments linked by pointers, and each link costs another random seek to read.
</details>
