package com.example.capture.spring;

import com.example.capture.core.NoteTerms;
import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST surface for booking and reading autocallable notes. The browser validates first, but this
 * controller never trusts it: every request goes through {@link NoteTerms#parse}.
 */
@RestController
@RequestMapping("/api/notes")
public class NotesController {

  /**
   * Request and response body for the terms of a note. Numbers arrive as decimals, never doubles.
   *
   * @param underlying instrument identifier
   * @param notional notional in currency units
   * @param couponRate coupon per period as a fraction
   * @param couponBarrier coupon barrier in percent of initial
   * @param autocallBarrier autocall barrier in percent of initial
   * @param kiBarrier knock-in barrier in percent of initial
   */
  public record TermsDto(
      String underlying,
      BigDecimal notional,
      BigDecimal couponRate,
      BigDecimal couponBarrier,
      BigDecimal autocallBarrier,
      BigDecimal kiBarrier) {

    static TermsDto of(NoteTerms t) {
      return new TermsDto(
          t.underlying(),
          t.notional(),
          t.couponRate(),
          t.couponBarrier(),
          t.autocallBarrier(),
          t.kiBarrier());
    }
  }

  /**
   * One row of the booked-notes list.
   *
   * @param id note id
   * @param bookedAt booking time
   * @param terms the terms
   */
  public record NoteDto(String id, Instant bookedAt, TermsDto terms) {}

  /**
   * Response of a successful booking.
   *
   * @param id the new note id
   */
  public record BookedDto(String id) {}

  private final NoteStore store;

  /**
   * Creates the controller.
   *
   * @param store persistence port
   */
  public NotesController(NoteStore store) {
    this.store = store;
  }

  /**
   * Books a note.
   *
   * @param body the terms
   * @return 201 with the new id, or 422 (via the advice) listing every invalid field
   */
  @PostMapping
  public ResponseEntity<BookedDto> book(@RequestBody TermsDto body) {
    NoteTerms terms =
        NoteTerms.parse(
            body.underlying(),
            body.notional(),
            body.couponRate(),
            body.couponBarrier(),
            body.autocallBarrier(),
            body.kiBarrier());
    NoteStore.Booked booked = store.book(terms);
    return ResponseEntity.created(URI.create("/api/notes/" + booked.id() + "/terms"))
        .body(new BookedDto(booked.id()));
  }

  /**
   * Lists recently booked notes.
   *
   * @param limit maximum rows, clamped to 1..200
   * @return newest first
   */
  @GetMapping
  public List<NoteDto> list(@RequestParam(defaultValue = "50") int limit) {
    int bounded = Math.max(1, Math.min(200, limit));
    return store.recent(bounded).stream()
        .map(b -> new NoteDto(b.id(), b.bookedAt(), TermsDto.of(b.terms())))
        .toList();
  }

  /**
   * Reads the terms of one note.
   *
   * @param id note id
   * @return 200 with the terms, or 404
   */
  @GetMapping("/{id}/terms")
  public ResponseEntity<TermsDto> terms(@PathVariable String id) {
    return store
        .find(id)
        .map(b -> ResponseEntity.ok(TermsDto.of(b.terms())))
        .orElseGet(() -> ResponseEntity.notFound().build());
  }
}
