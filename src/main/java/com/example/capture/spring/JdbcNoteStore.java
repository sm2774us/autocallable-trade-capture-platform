package com.example.capture.spring;

import com.example.capture.core.NoteTerms;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** PostgreSQL implementation; barriers and money are stored as integers (bps and cents). */
@Component
public class JdbcNoteStore implements NoteStore {

  private static final String COLUMNS =
      "id, underlying, notional_cents, coupon_rate_bps, coupon_barrier_bps, "
          + "autocall_barrier_bps, ki_barrier_bps, booked_at";

  private static final RowMapper<Booked> MAPPER =
      (ResultSet rs, int row) -> {
        NoteTerms terms =
            new NoteTerms(
                rs.getString("underlying"),
                rs.getLong("notional_cents"),
                rs.getInt("coupon_rate_bps"),
                rs.getInt("coupon_barrier_bps"),
                rs.getInt("autocall_barrier_bps"),
                rs.getInt("ki_barrier_bps"));
        return new Booked(rs.getString("id"), terms, rs.getTimestamp("booked_at").toInstant());
      };

  private final JdbcTemplate jdbc;

  /**
   * Creates the store.
   *
   * @param jdbc Spring's JDBC helper
   */
  public JdbcNoteStore(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  @Transactional
  public Booked book(NoteTerms t) {
    Long next = jdbc.queryForObject("SELECT nextval('note_no')", Long.class);
    String id = "N-" + next;
    Timestamp bookedAt =
        jdbc.queryForObject(
            "INSERT INTO note (id, underlying, notional_cents, coupon_rate_bps, "
                + "coupon_barrier_bps, autocall_barrier_bps, ki_barrier_bps) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING booked_at",
            Timestamp.class,
            id,
            t.underlying(),
            t.notionalCents(),
            t.couponRateBps(),
            t.couponBarrierBps(),
            t.autocallBarrierBps(),
            t.kiBarrierBps());
    return new Booked(id, t, bookedAt.toInstant());
  }

  @Override
  public Optional<Booked> find(String id) {
    return jdbc.query("SELECT " + COLUMNS + " FROM note WHERE id = ?", MAPPER, id).stream()
        .findFirst();
  }

  @Override
  public List<Booked> recent(int limit) {
    return jdbc.query(
        "SELECT " + COLUMNS + " FROM note ORDER BY booked_at DESC, id DESC LIMIT ?", MAPPER, limit);
  }
}
