# Stage 2: A naive key-value file

The first attempt at unstructured storage: keep the "bytes side by side" idea from relational tables, but store **key-value pairs** whose keys can be any length.

## The problem

Relational layouts need a fixed schema. We want something closer to a hash map or a JSON object, where a key maps to a value of any type.

## The change

Store each record as raw bytes in one file:

```
key bytes | separator ":" (1 byte) | value
```

To keep things simple at this stage, every value is a rating stored as a **4-byte float**. Keys are lower-case strings of any length, one byte per character.

## Components

| Component | Lives in | Job |
|---|---|---|
| Data file | Disk | Records stored back to back |
| Separator byte | Disk | Marks where a key ends and its value begins |

## How the operations work

Four records produce this byte strip (each value occupies 4 bytes, shown as `[4.8 ]`):

```
offset:  0                12 13               25 26             37 38       46
         i p h o n e 1 1 : [4.8 ] i p h o n e 1 2 : [4.7 ] m a c b o o k : [4.9 ] i p a d : [4.6 ]
record:  iphone11 (13 bytes)       iphone12 (13 bytes)       macbook (12 bytes)      ipad (9 bytes)
```

`macbook` is 7 bytes and `iphone11` is 8 bytes, so **records have different lengths**.

### Read macbook

1. Start at offset 0. Read bytes until the separator: the key is `iphone11`. Not a match.
2. Skip the 4 value bytes. You can only do this because you have just found where the key ended.
3. Read the next key byte by byte: `iphone12`. Not a match. Skip 4 bytes.
4. Read the next key: `macbook`. Match. Return the 4 bytes at offsets 34–37.

Unlike the relational table, you **can't jump to the next record**: its start depends on the length of the key you haven't read yet. Every read is a linear, byte-by-byte scan, O(total bytes).

### Insert airpods = 4.5

Append `airpods:` plus 4 bytes at offset 47. Appending is cheap.

### Update macbook to "Apple": the layout breaks

The value is changing type, from a number to a string. "Apple" needs 5 bytes, but macbook's value slot has only 4.

1. Find macbook by scanning (as above). Its value slot is offsets 34–37.
2. Write `A p p l` into 34–37.
3. Write `e` into offset 38, **which is the first byte of the next record, `ipad`**.

```
before:  ... m a c b o o k : [4.9 ] i p a d : [4.6 ]
after:   ... m a c b o o k : A p p l e p a d : [4.6 ]
                                     ^ offset 38 overwritten: the key "ipad" is now "epad"
```

The file is now corrupt: a scan will never find `ipad` again.

## Trade-offs

| Gains | Costs |
|---|---|
| Keys of any length | No way to jump between records; reads are linear scans |
| Appends are cheap | A value that grows overwrites the next record |
| Simple format | Updates that change type or size are impossible in place |

## Notes

> **Note:** 4-byte floats are used here only to keep the byte strip short. The real engines in `codebases/` store numbers as 8-byte doubles and record every value's type and length explicitly.

## Why the next stage

Two failures: slow linear reads, and updates that corrupt their neighbours. The next stage tries to fix the corruption first, by never writing past a value's slot.

## Revise

<details><summary>Why can't the scan jump from one record to the next?</summary>

Keys have different lengths, so the start of the next record is only known after reading the current key up to its separator.
</details>

<details><summary>What exactly goes wrong when macbook becomes "Apple"?</summary>

"Apple" is 5 bytes but the slot holds 4, so the 5th byte overwrites offset 38, the first byte of the following record `ipad`, corrupting its key.
</details>

<details><summary>What is the time complexity of a read in this layout?</summary>

Linear in the size of the file, because every byte before the matching record may need to be examined.
</details>

<details><summary>Which operation is still cheap here?</summary>

Inserting a brand-new key at the end of the file (an append).
</details>

<details><summary>Why did this layout work for relational tables but not here?</summary>

Relational rows have a fixed size because the schema fixes every column's size. Here keys and values vary in length, so record boundaries can't be computed.
</details>
