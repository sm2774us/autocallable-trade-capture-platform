package com.example.capture.core;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class NoteTermsTest {

  private static BigDecimal d(String text) {
    return new BigDecimal(text);
  }

  private static NoteTerms ok() {
    return NoteTerms.parse("AAPL", d("1000000"), d("0.02"), d("70"), d("100"), d("60"));
  }

  private static List<String> fields(Runnable action) {
    try {
      action.run();
    } catch (NoteTerms.Invalid e) {
      return e.errors().stream().map(NoteTerms.FieldError::field).toList();
    }
    return List.of();
  }

  @Test
  void validTermsAreStoredInFixedPoint() {
    NoteTerms terms = ok();
    assertThat(terms.notionalCents()).isEqualTo(100_000_000L);
    assertThat(terms.couponRateBps()).isEqualTo(200);
    assertThat(terms.couponBarrierBps()).isEqualTo(7000);
    assertThat(terms.autocallBarrierBps()).isEqualTo(10000);
    assertThat(terms.kiBarrierBps()).isEqualTo(6000);
  }

  @Test
  void roundTripsBackToDecimals() {
    NoteTerms terms = ok();
    assertThat(terms.notional().toPlainString()).isEqualTo("1000000.00");
    assertThat(terms.couponRate().toPlainString()).isEqualTo("0.0200");
    assertThat(terms.kiBarrier().toPlainString()).isEqualTo("60.00");
  }

  @Test
  void kiMustBeBelowCoupon() {
    List<String> bad =
        fields(() -> NoteTerms.parse("AAPL", d("1000"), d("0.02"), d("70"), d("100"), d("70")));
    assertThat(bad).containsExactly("kiBarrier");
  }

  @Test
  void couponMayEqualAutocallButNotExceedIt() {
    NoteTerms equal = NoteTerms.parse("AAPL", d("1000"), d("0.02"), d("100"), d("100"), d("60"));
    assertThat(equal.couponBarrierBps()).isEqualTo(10000);
    List<String> bad =
        fields(() -> NoteTerms.parse("AAPL", d("1000"), d("0.02"), d("101"), d("100"), d("60")));
    assertThat(bad).containsExactly("couponBarrier");
  }

  @Test
  void collectsEveryErrorNotJustTheFirst() {
    List<String> bad =
        fields(() -> NoteTerms.parse("a b", d("-1"), d("2"), d("0"), d("500"), d("0")));
    assertThat(bad).containsExactly("underlying", "notional", "couponRate", "couponBarrier", "autocallBarrier", "kiBarrier");
  }

  @Test
  void rejectsTooManyDecimals() {
    assertThat(fields(() -> NoteTerms.parse("AAPL", d("1000.001"), d("0.02"), d("70"), d("100"), d("60"))))
        .containsExactly("notional");
    assertThat(fields(() -> NoteTerms.parse("AAPL", d("1000"), d("0.02"), d("70.005"), d("100"), d("60"))))
        .containsExactly("couponBarrier");
  }

  @Test
  void enforcesTheNotionalCeiling() {
    assertThat(fields(() -> NoteTerms.parse("AAPL", d("1000000001"), d("0.02"), d("70"), d("100"), d("60"))))
        .containsExactly("notional");
    NoteTerms atLimit = NoteTerms.parse("AAPL", d("1000000000"), d("0.02"), d("70"), d("100"), d("60"));
    assertThat(atLimit.notionalCents()).isEqualTo(100_000_000_000L);
  }

  @Test
  void nullsAreErrorsNotExceptions() {
    assertThatThrownBy(() -> NoteTerms.parse(null, null, null, null, null, null))
        .isInstanceOf(NoteTerms.Invalid.class);
  }

  @Test
  void underlyingAcceptsClassSharesAndIndexes() {
    assertThat(NoteTerms.parse("BRK.B", d("1000"), d("0.02"), d("70"), d("100"), d("60")).underlying())
        .isEqualTo("BRK.B");
    assertThat(fields(() -> NoteTerms.parse("aapl", d("1000"), d("0.02"), d("70"), d("100"), d("60"))))
        .containsExactly("underlying");
  }
}
