package com.example.capture.core;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Bounded, in-memory recently-seen set. It is the first line of defence against redelivery; the
 * database's unique constraint remains the source of truth.
 */
public final class DedupStore {

  private final Map<String, Boolean> seen;

  /**
   * Creates a store that remembers at most {@code capacity} keys, evicting the least recently
   * inserted.
   *
   * @param capacity maximum remembered keys, positive
   */
  public DedupStore(int capacity) {
    this.seen =
        new LinkedHashMap<>(16, 0.75f, false) {
          @Override
          protected boolean removeEldestEntry(Map.Entry<String, Boolean> eldest) {
            return size() > capacity;
          }
        };
  }

  /**
   * Records a key and reports whether it was new.
   *
   * @param key idempotency key
   * @return true if the key had not been seen (process it), false if it is a duplicate
   */
  public synchronized boolean firstTime(String key) {
    return seen.put(key, Boolean.TRUE) == null;
  }

  /**
   * Reports whether a key is remembered, without recording it. Pair with {@link #remember} so a key
   * is stored only after the work it guards has succeeded.
   *
   * @param key idempotency key
   * @return true if the key was remembered
   */
  public synchronized boolean contains(String key) {
    return seen.containsKey(key);
  }

  /**
   * Remembers a key. Call this <em>after</em> the guarded work (the database insert) succeeded.
   *
   * @param key idempotency key
   */
  public synchronized void remember(String key) {
    seen.put(key, Boolean.TRUE);
  }

  /**
   * Returns how many keys are currently remembered.
   *
   * @return current size
   */
  public synchronized int size() {
    return seen.size();
  }
}
