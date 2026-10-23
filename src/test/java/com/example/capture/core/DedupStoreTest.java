package com.example.capture.core;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class DedupStoreTest {

  @Test
  void firstTimeIsTrueOnceThenFalse() {
    DedupStore store = new DedupStore(10);
    assertThat(store.firstTime("a")).isTrue();
    assertThat(store.firstTime("a")).isFalse();
  }

  @Test
  void containsDoesNotRecord() {
    DedupStore store = new DedupStore(10);
    assertThat(store.contains("a")).isFalse();
    assertThat(store.contains("a")).isFalse();
    assertThat(store.size()).isEqualTo(0);
  }

  /** The F-1 regression: a failed insert must not poison the retry. */
  @Test
  void keyRememberedOnlyAfterTheWorkSucceeded() {
    DedupStore store = new DedupStore(10);
    boolean attempt1 = !store.contains("t1"); // worker says: process it
    // ... insert throws here, remember() is never reached ...
    boolean attempt2 = !store.contains("t1"); // redelivery: must still be processed
    assertThat(attempt1).isTrue();
    assertThat(attempt2).isTrue();
    store.remember("t1"); // insert finally succeeded
    assertThat(store.contains("t1")).isTrue();
  }

  @Test
  void evictsTheOldestBeyondCapacity() {
    DedupStore store = new DedupStore(2);
    store.remember("a");
    store.remember("b");
    store.remember("c");
    assertThat(store.size()).isEqualTo(2);
    assertThat(store.contains("a")).isFalse();
    assertThat(store.contains("c")).isTrue();
  }
}
