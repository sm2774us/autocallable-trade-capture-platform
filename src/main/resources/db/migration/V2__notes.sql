-- Flyway migration V2__notes.sql : booked autocallable notes (money in cents, barriers in bps)
CREATE SEQUENCE note_no START 1001;

CREATE TABLE note (
  id                    text        PRIMARY KEY,                -- e.g. N-1001
  underlying            text        NOT NULL,
  notional_cents        bigint      NOT NULL CHECK (notional_cents > 0),
  coupon_rate_bps       integer     NOT NULL CHECK (coupon_rate_bps BETWEEN 0 AND 10000),
  coupon_barrier_bps    integer     NOT NULL CHECK (coupon_barrier_bps > 0),
  autocall_barrier_bps  integer     NOT NULL CHECK (autocall_barrier_bps <= 20000),
  ki_barrier_bps        integer     NOT NULL CHECK (ki_barrier_bps > 0),
  booked_at             timestamptz NOT NULL DEFAULT now(),
  -- the term-sheet rule, enforced a second time by the database: KI < coupon <= autocall
  CONSTRAINT note_barrier_order CHECK (
    ki_barrier_bps < coupon_barrier_bps AND coupon_barrier_bps <= autocall_barrier_bps)
);

CREATE INDEX note_booked_at ON note (booked_at DESC);
