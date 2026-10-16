# MyDatabase: the complete LSM-tree key-value store in one class.
#
# This file shows how the pieces fit together. The building blocks it uses (WriteAheadLog,
# Memtable, SSTable, BloomFilter, SparseIndex, EntryMerger) are assumed to exist; their full,
# runnable implementations live in codebases/python/lsm/.

from pathlib import Path

WAL_MAX_BYTES = 4 * 1024 * 1024
MEMTABLE_CAPACITY = 100_000
COMPACTION_TRIGGER = 4


class MyDatabase:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.memtable = Memtable(MEMTABLE_CAPACITY, LruEvictionPolicy())
        self.tables: list[SSTable] = []          # each has a BloomFilter and a SparseIndex
        self.wal: WriteAheadLog
        self._recover()

    # ------------------------------------------------------------- writes

    def put(self, key: str, value: Value) -> None:
        self._write(Entry.of(key, value))

    def delete(self, key: str) -> None:
        self._write(Entry.tombstone(key))         # SSTables are immutable, so a delete is a marker

    def _write(self, entry: Entry) -> None:
        self.wal.append_and_sync(entry)           # durable first: a crash after this loses nothing
        self.memtable.put_dirty(entry)            # newest value, never evicted until flushed
        if self.wal.size_bytes >= WAL_MAX_BYTES or self.memtable.is_full_of_dirty_entries():
            self._flush()

    # -------------------------------------------------------------- reads

    def get(self, key: str) -> Value | None:
        cached = self.memtable.get(key)           # dirty or clean, it is the newest value
        if cached is not None:
            return None if cached.is_tombstone() else cached.value
        for table in self._newest_first():        # first match wins, so the newest value wins
            if not table.bloom_filter.might_contain(key):
                continue                          # definitely absent: no disk read
            found = table.read_block(table.sparse_index.locate(key)).find(key)
            if found is None:
                continue                          # a Bloom filter false positive cost one block read
            self.memtable.put_clean(found)        # cache it; clean entries may be evicted
            return None if found.is_tombstone() else found.value
        return None

    # -------------------------------------------------------------- flush

    def _flush(self) -> None:
        dirty = self.memtable.dirty_entries_sorted_by_key()
        if not dirty:
            return
        # Blocks + sparse index + Bloom filter + footer, written to a temp file, fsynced, renamed.
        self.tables.append(SSTable.write_atomically(self.directory, self.wal.sequence, self.wal.sequence, dirty))
        self.memtable.mark_all_clean()            # entries stay in RAM as a cache
        flushed = self.wal
        self.wal = WriteAheadLog.create(self.directory, flushed.sequence + 1)
        flushed.close_and_delete()                # its data is now safely in the SSTable
        self._compact()

    # --------------------------------------------------------- compaction

    def _compact(self) -> None:
        while len(self.tables) >= COMPACTION_TRIGGER:
            older, newer = sorted(self.tables, key=lambda table: table.max_sequence)[:2]
            drop_tombstones = True                # the oldest table is in this merge: nothing older can resurrect a key
            merged = EntryMerger.merge(older.read_all(), newer.read_all(), drop_tombstones)  # newer wins on equal keys
            output = SSTable.write_atomically(self.directory, older.min_sequence, newer.max_sequence, merged)
            self.tables.remove(older)
            self.tables.remove(newer)
            older.delete()
            newer.delete()
            self.tables.append(output)

    # ----------------------------------------------------------- recovery

    def _recover(self) -> None:
        Storage.delete_temporary_files(self.directory)               # unfinished flushes or merges
        self.tables.extend(SSTable.open_all(self.directory))         # loads each sparse index and Bloom filter
        Storage.delete_tables_contained_in_others(self.directory, self.tables)  # inputs of a finished merge
        flushed_up_to = max((table.max_sequence for table in self.tables), default=0)
        WriteAheadLog.delete_covered_by(self.directory, flushed_up_to)  # already flushed before the crash

        unflushed = WriteAheadLog.open_latest(self.directory)
        if unflushed is not None:
            for entry in unflushed.replay_until_checksum_fails():    # torn tail is truncated
                self.memtable.put_dirty(entry)
        self.wal = unflushed or WriteAheadLog.create(self.directory, flushed_up_to + 1)

    def _newest_first(self) -> list[SSTable]:
        return sorted(self.tables, key=lambda table: table.max_sequence, reverse=True)

    def close(self) -> None:
        self.wal.close()


# ------------------------------------------------------------------- main

if __name__ == "__main__":
    db = MyDatabase(Path("data"))
    db.put("iphone11", Value.of(4.8))
    db.put("macbook", Value.of(4.9))
    db.put("macbook", Value.of("Apple"))          # values can change type: no schema
    db.put("airpods", Value.of(True))

    print(db.get("macbook"))                      # "Apple", served from the memtable
    db.delete("airpods")
    print(db.get("airpods"))                      # None, hidden by a tombstone
    db.close()
