import struct
from collections.abc import Callable
from pathlib import Path

from demo.narrator import Narrator
from demo.state_printer import StatePrinter
from lsm.entry.value import RawValue, Value
from lsm.store.lsm_store import LsmStore

# An absent key whose bits all happen to be set in a table's Bloom filter at chapter 7.
FALSE_POSITIVE_PROBE = "probe-069"
ABSENT_KEY = "nokia"


class Scenario:
    """The ten-chapter walkthrough shared by every language's demo."""

    def __init__(
        self,
        *,
        open_store: Callable[[], LsmStore],
        narrator: Narrator,
        printer: StatePrinter,
        data_directory: Path,
    ) -> None:
        self._open_store = open_store
        self._narrator = narrator
        self._printer = printer
        self._data_directory = data_directory
        self._store: LsmStore | None = None

    def run(self) -> None:
        self._opening_an_empty_store()
        self._first_writes()
        self._values_without_a_schema()
        self._inside_the_first_sstable()
        self._reads_served_from_memory()
        self._filling_the_cache()
        self._reads_that_reach_the_disk()
        self._deleting_a_key()
        self._compaction()
        self._crash_and_recovery()
        self._summary()

    @property
    def _open(self) -> LsmStore:
        if self._store is None:
            raise RuntimeError("No store is open.")
        return self._store

    def _opening_an_empty_store(self) -> None:
        self._narrator.chapter(1, "Opening an empty store", [
            "The store keeps everything in one data directory. Opening it first runs recovery, which finds nothing to recover in an empty directory, and then creates the first write-ahead log (WAL): an append-only file that every write reaches before anything else happens.",
            "Writing to the WAL first is what makes the store durable. Once a write is in the WAL and forced to disk, a crash can no longer lose it.",
        ])
        self._store = self._open_store()
        self._printer.print_snapshot(self._open.snapshot())

    def _first_writes(self) -> None:
        self._narrator.chapter(2, "First writes", [
            "Each put does two things: it appends a record to the WAL and forces it to disk, then stores the key in the memtable, an in-memory table of recent writes. The memtable entry is marked dirty, meaning its newest value so far exists only in the WAL.",
        ])
        self._put("iphone11", 4.8)
        self._put("iphone12", 4.7)
        self._put("macbook", 4.9)

        self._narrator.explain([
            "Here is the first WAL record, byte by byte. The checksum lets recovery detect a record that was only partly written when a crash happened; the length says where the next record starts.",
        ])
        wal_bytes = (self._data_directory / self._open.snapshot()["active_wal"]["name"]).read_bytes()
        (payload_length,) = struct.unpack_from(">I", wal_bytes, 4)
        self._printer.print_wal_record(wal_bytes[:8 + payload_length])
        self._printer.print_snapshot(self._open.snapshot())

    def _values_without_a_schema(self) -> None:
        self._narrator.chapter(3, "Values without a schema", [
            "Values carry their own type, so a key can switch from a number to a string. The update is appended to the WAL as a second macbook record; the first one is left untouched. The memtable, being a map, keeps only the newest value.",
        ])
        self._put("macbook", "Apple")
        self._printer.print_snapshot(self._open.snapshot())

        self._narrator.explain([
            "The next write pushes the WAL past its size limit, so the store flushes: it sorts the dirty entries by key, writes them to a new SSTable (a sorted, immutable file), marks them clean, starts a new WAL and deletes the old one. Clean entries stay in memory as a cache.",
        ])
        self._put("ipad", 4.6)
        self._printer.print_snapshot(self._open.snapshot())

    def _inside_the_first_sstable(self) -> None:
        self._narrator.chapter(4, "Inside the first SSTable", [
            "The table holds one entry per key, sorted by the bytes of the key, which is why ipad comes before iphone11. The stale macbook = 4.9 never reached it: only the memtable's newest value was written.",
            "Entries are packed into blocks of at most 64 bytes. The sparse index stores the first key and offset of each block, so a lookup reads exactly one block. The Bloom filter is a small bit array that can prove a key is absent without reading the disk at all.",
        ])
        self._printer.print_snapshot(self._open.snapshot())

    def _reads_served_from_memory(self) -> None:
        self._narrator.chapter(5, "Reads served from memory", [
            "A read checks the memtable first. Both keys are there as clean entries, so they are answered from memory with no disk access. Anything in the memtable is the newest value, because every write passes through it.",
        ])
        self._get("macbook")
        self._get("iphone11")

    def _filling_the_cache(self) -> None:
        self._narrator.chapter(6, "Filling the cache", [
            "The memtable has room for 6 entries. When a new key arrives and it is full, the eviction policy (least recently used here) removes a clean entry, one already saved in an SSTable. Dirty entries are never evicted: their newest value exists only in the WAL, so dropping them would make reads return stale data.",
            "Watch the eviction lines below, and the second flush when the WAL fills up again.",
        ])
        self._put("airpods", 4.5)
        self._put("watch", 4.4)
        self._put("pixel8", 4.3)
        self._put("galaxy", 4.2)
        self._put("kindle", 4.1)
        self._put("iphone12", 4.9)
        self._put("airpods", True)
        self._put("ipad", "M4")
        self._put("macbook", "M4 Pro")
        self._printer.print_snapshot(self._open.snapshot())

    def _reads_that_reach_the_disk(self) -> None:
        self._narrator.chapter(7, "Reads that reach the disk", [
            "watch was evicted from the memtable, so its read goes to disk. Tables are checked newest first, and the first match wins, which guarantees the newest value. For each table the Bloom filter is asked first; only on a \"maybe\" does the sparse index pick one block to read. A value found on disk is cached as a clean entry.",
        ])
        self._get("watch")

        self._narrator.explain([
            f"{ABSENT_KEY} was never written. Every table's Bloom filter rules it out, so the read finishes without touching the disk.",
        ])
        self._get(ABSENT_KEY)

        self._narrator.explain([
            f"{FALSE_POSITIVE_PROBE} was never written either, but in one table all of its Bloom filter bits happen to be set by other keys. That \"maybe\" is a false positive: it costs one block read before the read moves on.",
        ])
        self._get(FALSE_POSITIVE_PROBE)

    def _deleting_a_key(self) -> None:
        self._narrator.chapter(8, "Deleting a key", [
            "SSTables are immutable, so a delete can't remove watch from the table that holds it. Instead it writes a tombstone: an entry that means \"deleted\". The read finds the tombstone in the memtable first and reports the key as absent, so the older value on disk is never consulted.",
        ])
        self._delete("watch")
        self._get("watch")
        self._printer.print_snapshot(self._open.snapshot())

    def _compaction(self) -> None:
        self._narrator.chapter(9, "Compaction", [
            "Every flush adds a table, and the same key can live in several of them. When the table count reaches 3, the compactor merges the two oldest tables like merge sort: two pointers walk both sorted tables, and on equal keys the newer entry wins. The output is named by the range of WAL numbers it covers, so it still sorts as older than the tables it didn't absorb.",
            "A tombstone may be dropped only when the merge includes the oldest table, because then no older copy of the key can exist anywhere. The next write triggers a flush and the first merge.",
        ])
        self._put("pixel8", 4.4)

        self._narrator.explain([
            "Five more writes fill the WAL again. This time the merge includes the table holding the watch tombstone together with the oldest data, so both the old watch = 4.4 and its tombstone disappear for good.",
        ])
        self._put("kindle", "Paperwhite")
        self._put("galaxy", False)
        self._put("iphone11", 4.7)
        self._put("airpods", 4.6)
        self._put("ipad", 4.5)
        self._printer.print_snapshot(self._open.snapshot())
        self._get("watch")

    def _crash_and_recovery(self) -> None:
        self._narrator.chapter(10, "Crash and recovery", [
            "Two more writes, then the process \"crashes\": the store is abandoned without being closed, and 5 bytes of a half-written record are appended to the WAL, as if power failed in the middle of a write.",
        ])
        self._put("galaxy", 4.3)
        self._put("kindle", 4.2)
        wal_name = self._open.snapshot()["active_wal"]["name"]
        with open(self._data_directory / wal_name, "ab") as wal_file:
            wal_file.write(bytes([0x00, 0x00, 0x00, 0x2A, 0x00]))
        self._store = None

        self._narrator.explain([
            "A new store opens the same directory. Recovery removes unfinished temporary files, opens the tables, and replays the WAL. The torn record fails its checksum check, so the WAL is truncated just before it; that write was never acknowledged, so nothing promised is lost. The memtable comes back with only the dirty entries; the cache refills as keys are read.",
        ])
        self._store = self._open_store()
        self._printer.print_snapshot(self._open.snapshot())
        self._get("galaxy")
        self._get("macbook")
        self._get("watch")

    def _summary(self) -> None:
        self._narrator.chapter("—", "Summary", [
            "Fast writes: every write is one sequential WAL append plus one memory update; sorting, flushing and merging happen later, in bulk.",
            "Fast reads: recent and popular keys come from the memtable; otherwise each table costs a Bloom filter check in memory and at most one block read.",
            "Durability: the WAL is forced to disk before a write returns, tables are published by atomic rename, and recovery repairs torn writes.",
            "Unstructured values: every value carries its own type and length.",
            "Scale: data lives in immutable SSTables that can be copied to and spread across machines, with only a few bits per key and one index entry per block kept in memory.",
        ])
        self._open.close()

    def _put(self, key: str, raw: RawValue) -> None:
        value = Value.from_raw(raw)
        self._narrator.operation(f"put {key} = {value.display}")
        self._open.put(key, value)

    def _delete(self, key: str) -> None:
        self._narrator.operation(f"delete {key}")
        self._open.delete(key)

    def _get(self, key: str) -> None:
        self._narrator.operation(f"get {key}")
        value = self._open.get(key)
        self._narrator.result("not found" if value is None else value.display)
