package com.example.capture.spring;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Type-safe binding of the {@code capture.*} section of {@code application.yml}. A record keeps the
 * settings immutable and lets the application fail at startup, not at 3 a.m., on a typo.
 *
 * @param topic topic carrying normalized trades
 * @param deadLetterSuffix suffix appended to the topic name for the dead-letter topic
 * @param maxRetries retries before dead-lettering
 * @param retryInitialMillis first retry delay
 * @param retryMultiplier growth factor
 * @param retryMaxMillis cap on one delay
 * @param lagWarn per-partition lag that makes health WARN
 * @param lagCritical per-partition lag that makes health report DOWN
 */
@ConfigurationProperties(prefix = "capture")
public record CaptureProperties(
    String topic,
    String deadLetterSuffix,
    int maxRetries,
    long retryInitialMillis,
    double retryMultiplier,
    long retryMaxMillis,
    long lagWarn,
    long lagCritical) {}
