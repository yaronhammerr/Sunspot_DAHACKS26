import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const comments = sqliteTable("viewpoint_comments", {
  id: text("id").primaryKey(),
  viewpointId: text("viewpoint_id").notNull(),
  visitorId: text("visitor_id").notNull(),
  displayName: text("display_name").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
}, table => [index("comments_viewpoint_time").on(table.viewpointId, table.createdAt), index("comments_visitor_time").on(table.visitorId, table.createdAt)]);

export const ratings = sqliteTable("viewpoint_ratings", {
  viewpointId: text("viewpoint_id").notNull(),
  visitorId: text("visitor_id").notNull(),
  stars: integer("stars").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, table => [primaryKey({ columns: [table.viewpointId, table.visitorId] })]);
