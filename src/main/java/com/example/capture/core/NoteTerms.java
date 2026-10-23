package com.example.capture.core;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * The five key terms of an autocallable note plus its underlying, validated and held in fixed
 * point: money in cents, rates and barriers in basis points. Nothing here is a {@code double}.
 *
 * <p>Rules mirror the browser's pre-trade checks so the server never trusts the client:
 * {@code 0 < KI < couponBarrier <= autocallBarrier <= 200 %}, coupon rate in {@code [0, 1]}.
 *
 * @param underlying instrument identifier, upper-case
 * @param notionalCents notional in hundredths of the currency unit
 * @param couponRateBps coupon per period in basis points (0.02 = 200 bps)
 * @param couponBarrierBps coupon barrier in basis points of initial level (70 % = 7000)
 * @param autocallBarrierBps autocall barrier in basis points of initial level
 * @param kiBarrierBps knock-in barrier in basis points of initial level
 */
public record NoteTerms(
    String underlying,
    long notionalCents,
    int couponRateBps,
    int couponBarrierBps,
    int autocallBarrierBps,
    int kiBarrierBps) {

  /** Hard upper bound on notional, in currency units. */
  public static final long MAX_NOTIONAL = 1_000_000_000L;

  private static final Pattern UNDERLYING = Pattern.compile("[A-Z0-9][A-Z0-9.\\-]{0,11}");
  private static final BigDecimal MAX_BARRIER_PERCENT = BigDecimal.valueOf(200);

  /**
   * A single validation failure.
   *
   * @param field name of the offending JSON field
   * @param message human-readable explanation
   */
  public record FieldError(String field, String message) {}

  /** Thrown by {@link #parse} with every problem found, not just the first. */
  public static final class Invalid extends RuntimeException {
    private static final long serialVersionUID = 1L;
    private final transient List<FieldError> errors;

    Invalid(List<FieldError> errors) {
      super(errors.size() + " validation error(s): " + errors);
      this.errors = List.copyOf(errors);
    }

    /**
     * Returns the failures.
     *
     * @return immutable list, never empty
     */
    public List<FieldError> errors() {
      return errors;
    }
  }

  /**
   * Validates decimal inputs and converts them to fixed point.
   *
   * @param underlying instrument identifier
   * @param notional notional in currency units, at most 2 decimals
   * @param couponRate coupon per period as a fraction in {@code [0,1]}, at most 4 decimals
   * @param couponBarrier coupon barrier in percent, at most 2 decimals
   * @param autocallBarrier autocall barrier in percent, at most 2 decimals
   * @param kiBarrier knock-in barrier in percent, at most 2 decimals
   * @return the validated terms
   * @throws Invalid listing every failed rule
   */
  public static NoteTerms parse(
      String underlying,
      BigDecimal notional,
      BigDecimal couponRate,
      BigDecimal couponBarrier,
      BigDecimal autocallBarrier,
      BigDecimal kiBarrier) {
    List<FieldError> errors = new ArrayList<>();
    if (underlying == null || !UNDERLYING.matcher(underlying).matches()) {
      errors.add(new FieldError("underlying", "underlying must be 1-12 chars of A-Z 0-9 . -"));
    }
    long cents = 0;
    if (notional == null || notional.signum() <= 0) {
      errors.add(new FieldError("notional", "notional must be positive"));
    } else if (notional.compareTo(BigDecimal.valueOf(MAX_NOTIONAL)) > 0) {
      errors.add(new FieldError("notional", "notional exceeds the hard limit of 1,000,000,000"));
    } else {
      cents = exact("notional", notional, 2, errors);
    }
    int rate = 0;
    if (couponRate == null || couponRate.signum() < 0 || couponRate.compareTo(BigDecimal.ONE) > 0) {
      errors.add(new FieldError("couponRate", "couponRate must be a fraction between 0 and 1"));
    } else {
      rate = (int) exact("couponRate", couponRate, 4, errors);
    }
    int coupon = barrier("couponBarrier", couponBarrier, errors);
    int autocall = barrier("autocallBarrier", autocallBarrier, errors);
    int knockIn = barrier("kiBarrier", kiBarrier, errors);
    if (errors.isEmpty()) {
      if (knockIn >= coupon) {
        errors.add(new FieldError("kiBarrier", "KI barrier must be below the coupon barrier"));
      }
      if (coupon > autocall) {
        errors.add(
            new FieldError("couponBarrier", "Coupon barrier cannot exceed autocall barrier"));
      }
    }
    if (!errors.isEmpty()) {
      throw new Invalid(errors);
    }
    return new NoteTerms(underlying, cents, rate, coupon, autocall, knockIn);
  }

  private static int barrier(String field, BigDecimal percent, List<FieldError> errors) {
    if (percent == null || percent.signum() <= 0 || percent.compareTo(MAX_BARRIER_PERCENT) > 0) {
      errors.add(new FieldError(field, field + " must be above 0 and at most 200 percent"));
      return 0;
    }
    return (int) exact(field, percent, 2, errors);
  }

  private static long exact(
      String field, BigDecimal value, int decimals, List<FieldError> errors) {
    try {
      return value.movePointRight(decimals).longValueExact();
    } catch (ArithmeticException e) {
      errors.add(new FieldError(field, field + " allows at most " + decimals + " decimal places"));
      return 0;
    }
  }

  /**
   * Returns the notional as a decimal.
   *
   * @return notional in currency units
   */
  public BigDecimal notional() {
    return BigDecimal.valueOf(notionalCents, 2);
  }

  /**
   * Returns the coupon rate as a fraction.
   *
   * @return for example 0.0200
   */
  public BigDecimal couponRate() {
    return BigDecimal.valueOf(couponRateBps, 4);
  }

  /**
   * Returns the coupon barrier in percent.
   *
   * @return for example 70.00
   */
  public BigDecimal couponBarrier() {
    return BigDecimal.valueOf(couponBarrierBps, 2);
  }

  /**
   * Returns the autocall barrier in percent.
   *
   * @return for example 100.00
   */
  public BigDecimal autocallBarrier() {
    return BigDecimal.valueOf(autocallBarrierBps, 2);
  }

  /**
   * Returns the knock-in barrier in percent.
   *
   * @return for example 60.00
   */
  public BigDecimal kiBarrier() {
    return BigDecimal.valueOf(kiBarrierBps, 2);
  }
}
