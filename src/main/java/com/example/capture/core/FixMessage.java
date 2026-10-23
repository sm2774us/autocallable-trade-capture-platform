package com.example.capture.core;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** A parsed FIX tag=value message with checksum validation. */
public final class FixMessage {

  /** The FIX field delimiter (ASCII SOH). */
  public static final char SOH = '\u0001';

  private final Map<Integer, String> fields;

  private FixMessage(Map<Integer, String> fields) {
    this.fields = fields;
  }

  /**
   * Parses and validates a raw FIX message.
   *
   * @param raw message text using SOH delimiters, ending with the {@code 10=} checksum field
   * @return the parsed message
   * @throws IllegalArgumentException if a field is malformed or the checksum does not match
   */
  public static FixMessage parse(String raw) {
    int checksumStart = raw.lastIndexOf(SOH + "10=");
    if (checksumStart < 0) {
      throw new IllegalArgumentException("missing checksum field");
    }
    int body = checksumStart + 1;
    int expected = checksum(raw.substring(0, body));
    Map<Integer, String> parsed = new HashMap<>();
    for (String pair : raw.split(String.valueOf(SOH))) {
      int eq = pair.indexOf('=');
      if (eq <= 0) {
        throw new IllegalArgumentException("malformed field: " + pair);
      }
      parsed.put(Integer.parseInt(pair.substring(0, eq)), pair.substring(eq + 1));
    }
    int actual = Integer.parseInt(parsed.get(10));
    if (actual != expected) {
      throw new IllegalArgumentException("bad checksum: expected " + expected + " got " + actual);
    }
    return new FixMessage(parsed);
  }

  /**
   * Computes the FIX checksum: the byte sum of everything before the checksum field, modulo 256.
   *
   * @param bodyIncludingTrailingSoh text up to and including the delimiter before {@code 10=}
   * @return checksum in {@code [0, 255]}
   */
  public static int checksum(String bodyIncludingTrailingSoh) {
    int sum = 0;
    for (byte b : bodyIncludingTrailingSoh.getBytes(StandardCharsets.ISO_8859_1)) {
      sum += b & 0xff;
    }
    return sum % 256;
  }

  /**
   * Builds a message from tag/value pairs, computing BodyLength and CheckSum. Test helper.
   *
   * @param beginString FIX version, for example {@code FIX.4.4}
   * @param bodyFields ordered {@code tag=value} pairs after BodyLength and before CheckSum
   * @return the wire text
   */
  public static String build(String beginString, String... bodyFields) {
    StringBuilder body = new StringBuilder();
    for (String field : bodyFields) {
      body.append(field).append(SOH);
    }
    String head = "8=" + beginString + SOH + "9=" + body.length() + SOH;
    String withoutChecksum = head + body;
    return withoutChecksum + String.format("10=%03d%c", checksum(withoutChecksum), SOH);
  }

  /**
   * Returns a field value.
   *
   * @param tag FIX tag number
   * @return the value, or null if absent
   */
  public String get(int tag) {
    return fields.get(tag);
  }

  /**
   * Returns a mandatory field value.
   *
   * @param tag FIX tag number
   * @return the value
   * @throws IllegalArgumentException if the tag is absent
   */
  public String require(int tag) {
    String value = fields.get(tag);
    if (value == null) {
      throw new IllegalArgumentException("missing tag " + tag);
    }
    return value;
  }
}
