-- 2027 majors + Signature Events, per the PGA Tour's official schedule
-- announcement (pgatour.com, 2026-08-26). Same 8 Signature Events as 2026.
-- Event names use ESPN's short-form style ("The Open", not "The Open
-- Championship") to match 2026's convention -- worth double-checking once
-- ESPN's 2027 schedule is actually live, in case any naming shifts.
insert into golf_scoring_events (season, event_name, tier) values
  ('2027', 'Masters Tournament', 'major'),
  ('2027', 'PGA Championship', 'major'),
  ('2027', 'U.S. Open', 'major'),
  ('2027', 'The Open', 'major'),
  ('2027', 'AT&T Pebble Beach Pro-Am', 'signature'),
  ('2027', 'The Genesis Invitational', 'signature'),
  ('2027', 'Arnold Palmer Invitational pres. by Mastercard', 'signature'),
  ('2027', 'RBC Heritage', 'signature'),
  ('2027', 'Cadillac Championship', 'signature'),
  ('2027', 'Truist Championship', 'signature'),
  ('2027', 'the Memorial Tournament pres. by Workday', 'signature'),
  ('2027', 'Travelers Championship', 'signature');
