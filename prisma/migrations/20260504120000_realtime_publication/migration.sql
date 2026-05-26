-- Adds the Application table to the supabase_realtime publication so that
-- INSERT/UPDATE/DELETE events are broadcast to subscribed clients.
--
-- Only Application is added here. Adding all tables (or other tables) would
-- broadcast every row change across the portal to every connected client,
-- regardless of whether they care — wasteful and a potential data-exposure
-- vector if a client subscribes broadly. Application is the only table the
-- dashboard needs to react to in real time (new submissions appearing without
-- a manual refresh). Other tables can be added in dedicated migrations when
-- a real-time use case exists for them.

ALTER PUBLICATION supabase_realtime ADD TABLE "Application";
