package com.example.capture.spring;

import com.example.capture.core.NoteTerms;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** Persistence port for booked autocallable notes. */
public interface NoteStore {

  /**
   * A booked note.
   *
   * @param id note id such as {@code N-1001}
   * @param terms validated terms
   * @param bookedAt server time of booking
   */
  record Booked(String id, NoteTerms terms, Instant bookedAt) {}

  /**
   * Stores validated terms and allocates an id.
   *
   * @param terms the terms
   * @return the booked note
   */
  Booked book(NoteTerms terms);

  /**
   * Looks a note up.
   *
   * @param id note id
   * @return the note, or empty
   */
  Optional<Booked> find(String id);

  /**
   * Lists the most recently booked notes.
   *
   * @param limit maximum rows
   * @return newest first
   */
  List<Booked> recent(int limit);
}
