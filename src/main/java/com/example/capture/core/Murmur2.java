package com.example.capture.core;

import java.nio.charset.StandardCharsets;

/**
 * Re-implementation of the hash that Kafka's default partitioner applies to a record key. Knowing
 * it lets a team predict which partition a key lands on and reason about hot partitions.
 */
public final class Murmur2 {

  private static final int SEED = 0x9747b28c;
  private static final int M = 0x5bd1e995;
  private static final int R = 24;

  private Murmur2() {}

  /**
   * Computes the 32-bit murmur2 hash used by Kafka.
   *
   * @param data key bytes
   * @return the signed 32-bit hash
   */
  public static int hash(byte[] data) {
    int length = data.length;
    int h = SEED ^ length;
    int blocks = length / 4;
    for (int i = 0; i < blocks; i++) {
      int i4 = i * 4;
      int k =
          (data[i4] & 0xff)
              + ((data[i4 + 1] & 0xff) << 8)
              + ((data[i4 + 2] & 0xff) << 16)
              + ((data[i4 + 3] & 0xff) << 24);
      k *= M;
      k ^= k >>> R;
      k *= M;
      h *= M;
      h ^= k;
    }
    int tail = length & ~3;
    int remaining = length % 4;
    if (remaining >= 3) {
      h ^= (data[tail + 2] & 0xff) << 16;
    }
    if (remaining >= 2) {
      h ^= (data[tail + 1] & 0xff) << 8;
    }
    if (remaining >= 1) {
      h ^= data[tail] & 0xff;
      h *= M;
    }
    h ^= h >>> 13;
    h *= M;
    h ^= h >>> 15;
    return h;
  }

  /**
   * Maps a key to a partition the way the default partitioner does.
   *
   * @param key record key
   * @param partitions number of partitions in the topic, positive
   * @return partition index in {@code [0, partitions)}
   */
  public static int partitionFor(String key, int partitions) {
    int positive = hash(key.getBytes(StandardCharsets.UTF_8)) & 0x7fffffff;
    return positive % partitions;
  }
}
